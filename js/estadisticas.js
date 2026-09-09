import { firebaseConfig } from "./config.js?v=76";

const $ = s => document.querySelector(s);
const PROJ = firebaseConfig.projectId;
const KEY = firebaseConfig.apiKey;
const RAIZ = `https://firestore.googleapis.com/v1/projects/${PROJ}/databases/(default)/documents`;

/* Campos ligeros: se pide TODO menos `eventos`, que es lo pesado.
   El detalle de una visita se baja solo cuando el dueño la abre. */
const CAMPOS = ["inicio", "fin", "duracion", "dispositivo", "origen", "entrada", "paginas",
  "compro", "compraPorConfirmar", "clienteEmail", "vistos", "alCarrito", "favorito", "busquedas", "sinResultado", "tallas", "productos",
  "nombreCliente", "refPedido"];

let sesiones = [];
let cargando = false;
let bd = null;
/* referencia de pedido -> venta. Se llena al cargar y sirve para saber quien pago de verdad. */
let ventasPorRef = new Map();
/* id de producto -> foto, para el jersey mas visto. Se pide una sola vez por sesion. */
let fotos = new Map();

/* El cliente casi nunca regresa de Mercado Pago, asi que no podemos marcar la compra "al volver".
   Cruzamos la referencia que la visita guardo al salir a pagar contra las ventas registradas:
   si hay venta, esta persona compro — haya regresado o no. */
function cruzarConVentas(lista) {
  for (const s of lista) {
    const v = s.refPedido ? ventasPorRef.get(s.refPedido) : null;
    if (!v) continue;
    s.venta = v;
    s.compro = true;
    s.compraPorConfirmar = v.estado === "por_cobrar";
    if (!s.nombreCliente && v.cliente) s.nombreCliente = v.cliente;
  }
}

/* ---------------- helpers ---------------- */
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const esc = t => String(t ?? "").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
const money = n => "$" + Number(n || 0).toLocaleString("es-MX");

function tiempo(seg) {
  seg = Math.round(Number(seg) || 0);
  if (seg < 60) return seg + "s";
  const m = Math.floor(seg / 60);
  if (m < 60) return m + "m " + (seg % 60) + "s";
  return Math.floor(m / 60) + "h " + (m % 60) + "m";
}

function hora12(iso) {
  const d = new Date(iso || 0);
  if (!d.getTime()) return "";
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function hace(iso) {
  const t = new Date(iso || 0).getTime();
  if (!t) return "—";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "ahorita";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

/* ---------------- conversión Firestore ---------------- */
function fsVal(v) {
  if (!v || typeof v !== "object") return v;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fsVal);
  if ("mapValue" in v) return fsFields(v.mapValue.fields || {});
  return undefined;
}
const fsFields = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, fsVal(v)]));

async function bajarSesiones(dias) {
  const token = await bd.token();
  if (!token) throw new Error("inicia sesión otra vez");
  const desde = dias === "todo" ? "2020-01-01" : new Date(Date.now() - Number(dias) * 86400e3).toISOString();
  const query = {
    structuredQuery: {
      from: [{ collectionId: "sesiones" }],
      select: { fields: CAMPOS.map(f => ({ fieldPath: f })) },
      where: { fieldFilter: { field: { fieldPath: "inicio" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: desde } } },
      orderBy: [{ field: { fieldPath: "inicio" }, direction: "DESCENDING" }],
      limit: 500
    }
  };
  const r = await fetch(`${RAIZ}:runQuery?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(query)
  });
  if (!r.ok) throw new Error("no se pudo leer (" + r.status + ")");
  const data = await r.json();
  return (data || []).filter(x => x.document)
    .map(x => ({ id: x.document.name.split("/").pop(), ...fsFields(x.document.fields || {}) }));
}

async function bajarEventos(id) {
  const token = await bd.token();
  const r = await fetch(`${RAIZ}/sesiones/${id}?key=${KEY}&mask.fieldPaths=eventos`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return [];
  const d = await r.json();
  return fsVal(d.fields?.eventos) || [];
}

/* ---------------- cálculo ---------------- */
function resumen(list) {
  const r = {
    visitas: list.length, personas: new Set(), segundos: 0,
    vieron: 0, carrito: 0, compraron: 0, rebotes: 0,
    productos: {}, faltantes: {}, busquedas: {}, tallas: {}, origenes: {}, dispositivos: {}
  };
  for (const s of list) {
    r.personas.add(s.clienteEmail || s.id);
    r.segundos += Number(s.duracion || 0);
    const prods = s.productos || {};
    const claves = Object.keys(prods);
    if (claves.length) r.vieron++;
    if (claves.some(k => prods[k].carrito)) r.carrito++;
    if (s.compro) r.compraron++;
    if (!claves.length && Number(s.duracion || 0) < 10) r.rebotes++;
    const APARATO = { movil: "Teléfono", tablet: "Tablet", escritorio: "Computadora" };
    const ap = APARATO[s.dispositivo] || "Otro";
    r.dispositivos[ap] = (r.dispositivos[ap] || 0) + 1;
    for (const [id, d] of Object.entries(prods)) {
      const p = r.productos[id] || { id, nombre: d.nombre || id, personas: 0, vistas: 0, segundos: 0, carrito: 0, equipo: d.equipo || "" };
      p.personas += 1;
      p.vistas += Number(d.vistas || 0);
      p.segundos += Number(d.segundos || 0);
      if (d.carrito) p.carrito += 1;
      if (d.nombre) p.nombre = d.nombre;
      r.productos[id] = p;
    }
    (s.sinResultado || []).forEach(t => { r.faltantes[t] = (r.faltantes[t] || 0) + 1; });
    (s.busquedas || []).forEach(t => { r.busquedas[t] = (r.busquedas[t] || 0) + 1; });
    (s.tallas || []).forEach(t => { r.tallas[t] = (r.tallas[t] || 0) + 1; });
  }
  r.personas = r.personas.size;
  return r;
}

/* ---------------- cada acción, contada en español ---------------- */
const PAGINA = {
  "index.html": "al home", "": "al home",
  "futbol.html": "a playeras de futbol", "basket.html": "a playeras de basketball",
  "americano.html": "a playeras de americano", "producto.html": "a una playera",
  "cuenta.html": "a su cuenta", "legales.html": "a los términos"
};
const ENTREGA = { tienda: "recoger en tienda", domicilio: "envío a domicilio" };
const PAGO = { tarjeta: "tarjeta", transferencia: "transferencia" };

export function paso(ev) {
  const h = hora12(ev.t);
  const n = ev.nombre ? esc(ev.nombre) : "";
  const frase = (() => {
    switch (ev.e) {
      case "pagina": return `Entró ${PAGINA[ev.url] || "a " + esc(ev.url || "la tienda")}`;
      case "navega": return "";
      case "ver_producto": return `Abrió <b>${n}</b>`;
      case "ver_foto": return "Vio otra foto del jersey";
      case "elige_talla": return `Eligió la talla <b>${esc(ev.talla)}</b>`;
      case "cambia_talla": return ev.antes === ev.talla ? "" : `Cambió de la talla ${esc(ev.antes)} a la <b>${esc(ev.talla)}</b>`;
      case "personalizacion": return ev.activada ? "Activó ponerle nombre y número" : "Quitó lo del nombre y número";
      case "agregar_carrito": return `Puso <b>${n}</b>${ev.talla ? " talla " + esc(ev.talla) : ""} en el carrito${ev.personalizado ? " (con nombre y número)" : ""}`;
      case "carrito_abrir": return "Abrió el carrito";
      case "carrito_cerrar": return "Cerró el carrito";
      case "carrito_quitar": return `Quitó <b>${n}</b> del carrito`;
      case "carrito_cantidad": return `Cambió la cantidad a ${esc(ev.cantidad)}`;
      case "elige_entrega": return `Eligió ${ENTREGA[ev.entrega] || esc(ev.entrega)}`;
      case "elige_pago": return `Eligió pagar con ${PAGO[ev.metodo] || esc(ev.metodo)}`;
      case "filtros_abrir": return "Abrió los filtros";
      case "filtro": return `Filtró por ${esc(ev.campoTxt || ev.campo)}: <b>${esc(ev.valor)}</b>`;
      case "filtro_sin_resultado": return "Con esos filtros no le salió nada";
      case "asesor_abrir": return "Abrió el asistente";
      case "asesor_cerrar": return "Cerró el asistente";
      case "asesor": return `Le preguntó al asistente: “${esc(ev.pregunta)}”${ev.resultados ? ` (le mostró ${ev.resultados})` : " (no encontró nada)"}`;
      case "checkout": case "va_a_pagar": case "comprar_directo": return "Se fue a pagar";
      case "transferencia": return "Vio los datos para transferir";
      case "transferencia_fin": return "Terminó la transferencia (seguramente mandó su comprobante)";
      case "pago_mercadopago": return "Eligió pagar con tarjeta";
      case "sale_a_pagar": return `Salió a <b>${esc(ev.proveedor || "pagar")}</b> para pagar`;
      case "vuelve_de_pago": {
        const est = { approved: "el pago salió bien ✅", pending: "el pago quedó pendiente", in_process: "el pago quedó en revisión", rejected: "el pago fue rechazado ❌", failure: "el pago falló ❌" };
        return `Volvió de Mercado Pago: ${est[ev.estado] || esc(ev.estado)}`;
      }
      case "comprobante_whatsapp": return "Se fue a WhatsApp a mandar su comprobante de transferencia";
      case "compra": return ev.porConfirmar
        ? `<b>Compró por transferencia</b> — falta que confirmes el comprobante`
        : `<b>Compró</b>${ev.via ? " con " + esc(ev.via) : ""}`;
      case "salida": return ev.conCarrito ? "Se fue dejando cosas en el carrito" : "Se fue sin comprar";
      default: return "";
    }
  })();
  return frase ? `<span class="st-hora">${h}</span> ${frase}` : "";
}

/* dos veces lo mismo seguido (recargó, o el aviso se mandó dos veces) = una sola línea */
function sinRepetidos(lista) {
  const fuera = [];
  let anterior = "";
  /* los avisos llegan por lotes y no siempre en orden: se acomodan por hora */
  const ordenada = lista.slice().sort((a, b) => String(a.t || "").localeCompare(String(b.t || "")));
  /* "se fue" solo la última vez: cambiar de página también dispara el aviso y
     salían tres o cuatro salidas en medio del recorrido, como si se hubiera ido
     y vuelto. La que cuenta es la del final. */
  const ultimaSalida = ordenada.reduce((idx, ev, i) => ev.e === "salida" ? i : idx, -1);
  for (const [i, ev] of ordenada.entries()) {
    if (ev.e === "salida" && i !== ultimaSalida) continue;
    const linea = paso(ev);
    if (!linea) continue;
    const cuerpo = linea.replace(/<span class="st-hora">.*?<\/span> /, "");
    if (cuerpo === anterior) continue;
    anterior = cuerpo;
    fuera.push(linea);
  }
  return fuera;
}

/* ---------------- pintado ---------------- */
function tarjeta(num, txt, pie) {
  return `<div class="stat">
    <div class="n">${num}</div>
    <div class="l">${txt}</div>
    ${pie ? `<div class="st-pie">${pie}</div>` : ""}
  </div>`;
}

function barra(valor, max, texto, tono = "oro") {
  const w = max ? Math.max(2, Math.round((valor / max) * 100)) : 0;
  return `<div class="st-barra">
    <div class="st-barra__riel"><div class="st-barra__fill st-barra__fill--${tono}" style="width:${w}%"></div></div>
    <span class="st-barra__txt">${texto}</span>
  </div>`;
}

/* Encabezado tipo cubo: titulo grande, sin parrafo de explicacion.
   `ayuda` queda opcional y solo se usa donde de verdad hace falta. */
function bloque(titulo, cuerpo, id, ayuda) {
  return `<section class="st-bloque"${id ? ` id="${id}" data-sub="${id}"` : ""}>
    <div class="st-cubo"><h3 class="st-cubo__h">${titulo}</h3></div>
    ${ayuda ? `<p class="st-bloque__ayuda">${ayuda}</p>` : ""}
    ${cuerpo}
  </section>`;
}

function vacio(txt) {
  return `<p class="st-vacio">${txt}</p>`;
}

function embudo(r) {
  const pasos = [
    ["Entraron a la tienda", r.visitas, "azul"],
    ["Abrieron un jersey", r.vieron, "morado"],
    ["Lo pusieron en el carrito", r.carrito, "oro"],
    ["Compraron", r.compraron, "verde"]
  ];
  return `<div class="st-embudo">${pasos.map(([txt, n, tono]) => `
    <div class="st-embudo__fila">
      <span class="st-embudo__paso">${txt}</span>
      ${barra(n, r.visitas, `${n} · ${pct(n, r.visitas)}%`, tono)}
    </div>`).join("")}</div>`;
}

/* El mas visto se ve en grande con su foto; del 2do en adelante, una tabla compacta.
   Asi el dueno ve de un vistazo cual es su jersey estrella. */
function foto(id) {
  const src = fotos.get(id);
  return src
    ? `<img src="${src}" alt="" loading="lazy">`
    : `<span class="st-sinfoto">👕</span>`;
}

function podio(prods) {
  if (!prods.length) return vacio("Todavía nadie ha abierto un jersey.");
  const [uno, ...resto] = prods;
  const cabeza = `
    <div class="st-top1">
      <div class="st-top1__foto">${foto(uno.id)}<span class="st-top1__medalla">1</span></div>
      <div class="st-top1__info">
        <div class="st-top1__nombre">${esc(uno.nombre)}</div>
        ${uno.equipo ? `<div class="st-top1__equipo">${esc(uno.equipo)}</div>` : ""}
        <div class="st-top1__nums">
          <div><b>${uno.personas}</b><span>${uno.personas === 1 ? "persona lo vio" : "personas lo vieron"}</span></div>
          <div><b>${tiempo(uno.segundos / Math.max(1, uno.personas))}</b><span>viéndolo</span></div>
          <div><b class="${uno.carrito ? "st-ok" : "st-mal"}">${uno.carrito}</b><span>al carrito</span></div>
        </div>
      </div>
    </div>`;
  if (!resto.length) return cabeza;
  const filas = resto.map((p, i) => `
    <div class="st-fila">
      <span class="st-fila__n">${i + 2}</span>
      <span class="st-fila__foto">${foto(p.id)}</span>
      <span class="st-fila__nombre">${esc(p.nombre)}${p.equipo ? `<small>${esc(p.equipo)}</small>` : ""}</span>
      <span class="st-fila__datos">
        <span class="st-fila__dato"><b>${p.personas}</b> vieron</span>
        <span class="st-fila__dato">${tiempo(p.segundos / Math.max(1, p.personas))}</span>
        <span class="st-fila__dato ${p.carrito ? "st-ok" : "st-mal"}"><b>${p.carrito}</b> carrito</span>
      </span>
    </div>`).join("");
  return cabeza + `<div class="st-tabla">${filas}</div>`;
}

/* Dos cubos grandes con su icono: de un golpe se ve si le entran del telefono o de la compu. */
/* Dibujados a mano: no existe emoji de tablet (el 📋 es un portapapeles de anotar)
   y mezclar emojis de distintos estilos se ve desparejo — cada uno con su color y su trazo.
   Con SVG los tres comparten grosor y toman el dorado de la marca. */
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONO_APARATO = {
  "Teléfono":    svg(`<rect x="6.5" y="2" width="11" height="20" rx="2.5"/><line x1="10.5" y1="18.7" x2="13.5" y2="18.7"/>`),
  "Computadora": svg(`<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><line x1="1" y1="20" x2="23" y2="20"/>`),
  "Tablet":      svg(`<rect x="4" y="2" width="16" height="20" rx="2.5"/><line x1="10" y1="18.6" x2="14" y2="18.6"/>`),
  "Otro":        svg(`<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16.5" x2="12" y2="20"/>`)
};

function cubosAparatos(obj, total) {
  const e = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  if (!e.length) return vacio("Sin visitas todavía.");
  return `<div class="st-aparatos">${e.map(([nombre, n]) => `
    <div class="st-aparato">
      <span class="st-aparato__ico">${ICONO_APARATO[nombre] || ICONO_APARATO["Otro"]}</span>
      <span class="st-aparato__pct">${pct(n, total)}%</span>
      <span class="st-aparato__nombre">${esc(nombre)}</span>
      <span class="st-aparato__n">${n} ${n === 1 ? "visita" : "visitas"}</span>
    </div>`).join("")}</div>`;
}

/* Tallas mencionadas en lo que le escriben al asistente ("tienen la del madrid en M?").
   Es distinto de las tallas que la gente elige con el dedo en el catalogo. */
const TALLAS_TXT = ["3XL", "2XL", "XXXL", "XXL", "XL", "S", "M", "L"];

function tallasDelAgente(busquedas) {
  const out = {};
  for (const [texto, veces] of Object.entries(busquedas)) {
    const t = " " + String(texto).toUpperCase().replace(/[^A-Z0-9]+/g, " ") + " ";
    for (const talla of TALLAS_TXT) {
      if (t.includes(" " + talla + " ") || t.includes(" TALLA " + talla + " ")) {
        const norm = talla === "XXL" ? "2XL" : talla === "XXXL" ? "3XL" : talla;
        out[norm] = (out[norm] || 0) + veces;
        break;   // solo la primera talla que aparezca, de mayor a menor
      }
    }
  }
  return out;
}

/* separa lo que es pedir un jersey de lo que es una duda del negocio */
const PALABRAS_DUDA = ["apartar", "aparto", "aparta", "envio", "envío", "envian", "envían", "mandan", "manda",
  "pagar", "pago", "pagos", "tarjeta", "transferencia", "meses", "msi", "credito", "crédito",
  "garantia", "garantía", "cambio", "cambios", "devolucion", "devolución", "devuelvo",
  "horario", "horarios", "abren", "cierran", "donde", "dónde", "cuando", "cuándo", "como", "cómo",
  "puedo", "pueden", "aceptan", "hacen", "tardan", "tarda", "llega", "llegan", "factura",
  "direccion", "dirección", "sucursal", "tienda", "telefono", "teléfono", "whatsapp",
  "original", "originales", "personalizar", "personalizacion", "personalización", "nombre y numero"];

function esDuda(texto) {
  const t = " " + String(texto).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") + " ";
  return PALABRAS_DUDA.some(w => t.includes(" " + w.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
}

function chips(pares) {
  if (!pares.length) return null;
  return `<div class="st-chips">${pares.map(([t, n]) => `
    <span class="st-chip">${esc(t)} <b>×${n}</b></span>`).join("")}</div>`;
}

function listaBarras(obj, total) {
  const e = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!e.length) return vacio("Sin datos todavía.");
  const max = e[0][1];
  return `<div class="st-lista">${e.map(([t, n]) => `
    <div class="st-lista__fila">
      <span class="st-lista__et">${esc(t)}</span>
      ${barra(n, max, `${n} · ${pct(n, total)}%`, "azul")}
    </div>`).join("")}</div>`;
}

function visitas(list) {
  if (!list.length) return vacio("Todavía no hay visitas en este periodo.");
  return `<div class="st-visitas">${list.slice(0, 30).map(s => {
    const clase = s.compro ? (s.compraPorConfirmar ? "porconfirmar" : "compro") : (s.alCarrito ? "carrito" : (s.vistos ? "miro" : "paso"));
    let etiqueta = { compro: "Compró", porconfirmar: "Compró · por confirmar", carrito: "Dejó el carrito", miro: "Miró jerseys", paso: "Solo pasó" }[clase];
    if (s.venta) etiqueta = s.venta.estado === "por_cobrar"
      ? `Compró · falta que pague ${money(s.venta.total)}`
      : `Compró y pagó ${money(s.venta.total)}`;
    return `<details class="st-visita">
      <summary class="st-visita__cab">
        <span class="st-visita__cuando">${hace(s.inicio)}</span>
        <span class="st-visita__quien">${esc(s.nombreCliente || s.clienteEmail || "Visitante")}${s.venta?.folio ? `<span class="st-visita__vio"> · pedido ${esc(s.venta.folio)}</span>` : ""}${s.favorito ? `<span class="st-visita__vio"> · vio ${esc(s.favorito)}</span>` : ""}</span>
        <span class="st-visita__tiempo">${tiempo(s.duracion)} · ${esc(s.dispositivo || "")}</span>
        <span class="st-tag st-tag--${clase}">${etiqueta}</span>
      </summary>
      <div class="st-visita__cuerpo">
        Llegó de <b>${esc(s.origen || "directo")}</b> · entró por <b>${esc(s.entrada || "index.html")}</b> · vio ${s.vistos || 0} jersey(s)
        ${(s.busquedas || []).length ? `<br>Buscó: ${(s.busquedas || []).map(esc).join(", ")}` : ""}
        <div class="st-visita__acciones">
          <button class="btn btn--ghost" data-ver="${s.id}">Ver qué hizo paso a paso</button>
          <button class="btn btn--danger" data-borrar-visita="${s.id}">Borrar esta visita</button>
        </div>
      </div>
    </details>`;
  }).join("")}</div>`;
}

export function pintarLista(list) {
  const cont = $("#estadBody");
  if (!cont) return;
  const r = resumen(list);
  pintarAsistente(r);
  const prods = Object.values(r.productos);
  const top = prods.slice().sort((a, b) => b.personas - a.personas || b.segundos - a.segundos).slice(0, 8);
  const orden = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const sinNada = orden(r.faltantes);
  const pedidos = sinNada.filter(([t]) => !esDuda(t)).slice(0, 12);
  const dudasSet = new Map(sinNada.filter(([t]) => esDuda(t)));
  const otrasSet = new Map();
  for (const [t, n] of orden(r.busquedas)) {
    if (dudasSet.has(t)) continue;
    if (esDuda(t)) dudasSet.set(t, n);
    else if (!r.faltantes[t]) otrasSet.set(t, n);
  }
  const dudas = [...dudasSet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const otras = [...otrasSet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  cont.innerHTML = `
    <div class="stat-row st-tarjetas">
      ${tarjeta(r.visitas, "Visitas", `${r.personas} ${r.personas === 1 ? "persona" : "personas"} distintas`)}
      ${tarjeta(tiempo(r.visitas ? r.segundos / r.visitas : 0), "Se quedan en promedio", "solo el tiempo que están activos")}
      ${tarjeta(r.carrito, "Llenaron el carrito", `${pct(r.carrito, r.visitas)}% de las visitas`)}
      ${tarjeta(r.compraron, "Compras", r.visitas ? `${pct(r.compraron, r.visitas)}% de las visitas` : "")}
    </div>

    ${bloque("Por dónde se sale la gente", embudo(r), "embudo")}

    ${bloque("Los jerseys que más miran", podio(top), "vistos")}

    ${bloque("Tallas que más eligen",
      Object.keys(r.tallas).length ? listaBarras(r.tallas, r.visitas) : vacio("Todavía nadie ha elegido talla."), "tallas")}

    ${bloque("Desde qué aparato entran", cubosAparatos(r.dispositivos, r.visitas), "aparatos")}

    ${bloque("Visita por visita", visitas(list), "detalle", "Abre cualquiera para ver, paso a paso, qué hizo esa persona.")}
  `;
}

/* Seccion propia en la barra lateral: todo lo que la gente le escribe al asistente.
   Sin subtitulos: cada bloque se explica con su titulo. */
function pintarAsistente(r) {
  const cont = $("#asistenteBody");
  if (!cont) return;
  const orden = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const sinNada = orden(r.faltantes);
  const pedidos = sinNada.filter(([t]) => !esDuda(t)).slice(0, 12);
  const dudasSet = new Map(sinNada.filter(([t]) => esDuda(t)));
  const otrasSet = new Map();
  for (const [t, n] of orden(r.busquedas)) {
    if (dudasSet.has(t)) continue;
    if (esDuda(t)) dudasSet.set(t, n);
    else if (!r.faltantes[t]) otrasSet.set(t, n);
  }
  const dudas = [...dudasSet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const otras = [...otrasSet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const tallasIA = tallasDelAgente(r.busquedas);

  cont.innerHTML = `
    ${bloque("Te lo pidieron y no lo tienes",
      chips(pedidos) || vacio("Nadie ha buscado un jersey que no tengas."), "piden")}

    ${bloque("Dudas sobre tu tienda",
      chips(dudas) || vacio("Todavía nadie ha preguntado nada de la tienda."), "dudas")}

    ${bloque("Otras búsquedas",
      chips(otras) || vacio("Sin búsquedas todavía."), "otras")}

    ${bloque("Tallas que le preguntan al agente",
      Object.keys(tallasIA).length ? listaBarras(tallasIA, Object.values(tallasIA).reduce((a, b) => a + b, 0))
        : vacio("Todavía nadie le ha preguntado por una talla."), "tallasia")}
  `;
}

export async function pintarEstadisticas(db) {
  bd = db;
  const cont = $("#estadBody");
  if (!cont) return;
  if (cargando) return;
  cargando = true;
  cont.innerHTML = `<p class="st-cargando">Cargando…</p>`;
  const dias = $("#estadRango")?.value || "30";
  try {
    sesiones = await bajarSesiones(dias);
    try {
      const ventas = await bd.listarVentas();
      ventasPorRef = new Map();
      for (const v of ventas) { if (v.ref) ventasPorRef.set(v.ref, v); }
    } catch { ventasPorRef = new Map(); }
    if (!fotos.size) {
      try {
        for (const p of await bd.productosParaFoto()) { if (p.imagen) fotos.set(p.id, p.imagen); }
      } catch { /* sin fotos se pinta el icono */ }
    }
    cruzarConVentas(sesiones);
    pintarLista(sesiones);
    const sello = $("#estadSello");
    if (sello) sello.textContent = `${sesiones.length} visitas · actualizado ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
  } catch (e) {
    cont.innerHTML = `<p class="st-error">No se pudieron leer las estadísticas: ${esc(e.message)}</p>`;
  }
  cargando = false;
}

document.addEventListener("change", e => {
  if (e.target.id === "estadRango" && bd) pintarEstadisticas(bd);
});

/* al borrar el historial de alguien, el panel se refresca solo */
document.addEventListener("panel:recargar-estadisticas", () => { if (bd) pintarEstadisticas(bd); });

document.addEventListener("click", async e => {
  if (e.target.id === "estadRefrescar" && bd) { pintarEstadisticas(bd); return; }

  /* borrar una visita suelta del registro */
  const bor = e.target.closest("[data-borrar-visita]");
  if (bor) {
    const id = bor.dataset.borrarVisita;
    if (!confirm("¿Borrar esta visita del registro?\n\nSe va todo lo que hizo esa persona en esa visita. Esto no se puede deshacer.")) return;
    bor.disabled = true;
    bor.textContent = "Borrando…";
    try {
      await bd.borrarSesion(id);
      sesiones = sesiones.filter(x => x.id !== id);
      pintarLista(sesiones);
      const sello = $("#estadSello");
      if (sello) sello.textContent = `${sesiones.length} visitas · actualizado ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
    } catch (err) {
      bor.disabled = false;
      bor.textContent = "Borrar esta visita";
      const m = String(err?.code || err?.message || "");
      alert(m.includes("permission") || m.includes("PERMISSION")
        ? "Falta el permiso de borrado en la base de datos."
        : "No se pudo borrar la visita.");
    }
    return;
  }

  const b = e.target.closest("[data-ver]");
  if (!b) return;
  b.disabled = true;
  b.textContent = "Cargando…";
  const eventos = await bajarEventos(b.dataset.ver);
  const cont = b.closest(".st-visita__cuerpo") || b.parentElement;
  b.remove();
  cont.innerHTML += eventos.length
    ? `<ul class="st-pasos">${sinRepetidos(eventos).map(t => `<li>${t}</li>`).join("")}</ul>`
    : `<p class="st-vacio">Sin detalle guardado.</p>`;
});
