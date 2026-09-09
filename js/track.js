import { firebaseConfig, usaFirebase } from "./config.js?v=76";
import { permiteMedicion } from "./cookies.js?v=76";

const KEY = firebaseConfig.apiKey;
const PROJ = firebaseConfig.projectId;
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJ}/databases/(default)/documents`;
const LS_ID = "dm_track_id";
const SS_SES = "dm_track_ses";
const LS_PEND = "dm_track_pend";
const VIDA_SESION = 3 * 3600e3;   // 3 h: aguanta el viaje a Mercado Pago y la vuelta
const MAX_EVENTOS = 120;          // los que se guardan en la nube (los últimos)
const INACTIVO_MS = 45000;        // sin tocar nada 45 s = ya no está mirando
const LATIDO_MS = 2000;           // cada cuánto se suma tiempo activo

let ident = null;
let ses = null;
let enVuelo = false;
let pendientes = (() => {         // eventos que faltan por subir; sobreviven el cambio de página
  try { return JSON.parse(localStorage.getItem("dm_track_pend") || "[]"); } catch { return []; }
})();
let sucio = false;
let ultimaAccion = Date.now();
let ultimoTic = Date.now();
let fallos = 0;
let productoAbierto = null;       // { id, nombre, equipo, categoria }

/* ============ identidad anónima ============ */
async function pedirAnonimo() {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true })
  });
  if (!r.ok) throw new Error("anon");
  const d = await r.json();
  return { uid: d.localId, idToken: d.idToken, refreshToken: d.refreshToken, exp: Date.now() + 3300e3 };
}

async function refrescar(refreshToken) {
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${KEY}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  });
  if (!r.ok) throw new Error("refresh");
  const d = await r.json();
  return { uid: d.user_id, idToken: d.id_token, refreshToken: d.refresh_token, exp: Date.now() + 3300e3 };
}

async function identidad() {
  if (ident && ident.exp > Date.now()) return ident;
  let guardada = null;
  try { guardada = JSON.parse(localStorage.getItem(LS_ID) || "null"); } catch { }
  try {
    ident = guardada?.refreshToken
      ? (guardada.exp > Date.now() ? guardada : await refrescar(guardada.refreshToken))
      : await pedirAnonimo();
  } catch {
    ident = await pedirAnonimo();
  }
  localStorage.setItem(LS_ID, JSON.stringify(ident));
  return ident;
}

/* ============ sesión ============ */
const nuevoId = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pagina = () => location.pathname.split("/").pop() || "index.html";

function dispositivo() {
  const w = window.innerWidth;
  if (w < 768) return "movil";
  if (w < 1100) return "tablet";
  return "escritorio";
}

function origen() {
  const u = new URLSearchParams(location.search);
  const utm = u.get("utm_source");
  if (utm) return utm.toLowerCase().slice(0, 30);
  if (u.get("fbclid")) return "facebook";
  const r = document.referrer || "";
  if (!r) return "directo";
  try {
    const h = new URL(r).hostname.replace("www.", "");
    if (h.includes(location.hostname)) return "interno";
    if (h.includes("instagram")) return "instagram";
    if (h.includes("facebook") || h.includes("fb.")) return "facebook";
    if (h.includes("google")) return "google";
    if (h.includes("t.co") || h.includes("twitter") || h.includes("x.com")) return "x";
    if (h.includes("whatsapp") || h.includes("wa.me")) return "whatsapp";
    if (h.includes("tiktok")) return "tiktok";
    return h.slice(0, 30);
  } catch { return "directo"; }
}

function leerGuardada() {
  /* primero localStorage (sobrevive salir a pagar y volver), luego sessionStorage por compatibilidad */
  for (const almacen of [localStorage, sessionStorage]) {
    try {
      const g = JSON.parse(almacen.getItem(SS_SES) || "null");
      if (g && g.id && (!g.ultimoUso || Date.now() - g.ultimoUso < VIDA_SESION)) return g;
    } catch { }
  }
  return null;
}

function cargarSesion() {
  try {
    const g = leerGuardada();
    if (g && g.id) {
      g.productos = g.productos || {};
      g.paginas = g.paginas || [];
      g.tallas = g.tallas || [];
      return g;
    }
  } catch { }
  return {
    id: nuevoId(),
    inicio: new Date().toISOString(),
    dispositivo: dispositivo(),
    origen: origen(),
    entrada: pagina(),
    paginas: [],
    productos: {},
    busquedas: [],
    sinResultado: [],
    tallas: [],
    segundos: 0,          // tiempo ACTIVO (con la pestaña visible y la persona haciendo algo)
    compro: false,
    clienteUid: "",
    clienteEmail: "",
    nombreCliente: "",    // el nombre que escribió al comprar
    refPedido: ""         // referencia del pedido: con esto el panel lo cruza con las ventas
  };
}

const guardarPendientes = () => {
  try { localStorage.setItem(LS_PEND, JSON.stringify(pendientes.slice(-MAX_EVENTOS))); } catch { }
};

const guardarLocal = () => {
  try {
    ses.ultimoUso = Date.now();
    localStorage.setItem(SS_SES, JSON.stringify(ses));
    sessionStorage.setItem(SS_SES, JSON.stringify(ses));
  } catch { }
};

/* ============ reloj de tiempo activo ============ */
function activo() {
  return document.visibilityState === "visible" && (Date.now() - ultimaAccion) < INACTIVO_MS;
}

function tic() {
  const ahora = Date.now();
  const delta = Math.round((ahora - ultimoTic) / 1000);
  ultimoTic = ahora;
  if (!ses || delta <= 0 || !activo()) return;
  ses.segundos += delta;
  if (productoAbierto) {
    const p = ses.productos[productoAbierto.id];
    if (p) p.segundos += delta;
  }
  sucio = true;
  guardarLocal();
}

["mousemove", "keydown", "scroll", "click", "touchstart", "pointerdown"].forEach(ev =>
  window.addEventListener(ev, () => { ultimaAccion = Date.now(); }, { passive: true, capture: true }));

/* ============ Firestore ============ */
function val(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } };
  return { stringValue: String(v) };
}

function resumenSesion(uid) {
  const prods = Object.entries(ses.productos);
  const masVisto = prods.slice().sort((a, b) => b[1].segundos - a[1].segundos)[0];
  return {
    uid,
    inicio: ses.inicio,
    fin: new Date().toISOString(),
    duracion: ses.segundos,
    dispositivo: ses.dispositivo,
    origen: ses.origen,
    entrada: ses.entrada,
    paginas: ses.paginas.length,
    compro: ses.compro,
    compraPorConfirmar: !!ses.compraPorConfirmar,
    clienteUid: ses.clienteUid || "",
    clienteEmail: ses.clienteEmail || "",
    nombreCliente: ses.nombreCliente || "",
    refPedido: ses.refPedido || "",
    vistos: prods.length,
    alCarrito: prods.filter(([, p]) => p.carrito).length,
    favorito: masVisto ? masVisto[1].nombre : "",
    busquedas: ses.busquedas.slice(-25),
    sinResultado: ses.sinResultado.slice(-25),
    tallas: ses.tallas.slice(-25),
    productos: ses.productos
  };
}

/** Manda solo lo que cambió: el resumen (chico) + los eventos nuevos como append. */
async function enviar(keepalive = false) {
  if (!usaFirebase || enVuelo || !permiteMedicion()) return;
  if (!sucio && !pendientes.length) return;
  enVuelo = true;
  const loteEventos = pendientes.slice(0, 60);
  try {
    const id = await identidad();
    const campos = resumenSesion(id.uid);
    const write = {
      update: {
        name: `projects/${PROJ}/databases/(default)/documents/sesiones/${ses.id}`,
        fields: Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, val(v)]))
      },
      updateMask: { fieldPaths: Object.keys(campos) }
    };
    if (loteEventos.length) {
      write.updateTransforms = [{
        fieldPath: "eventos",
        appendMissingElements: { values: loteEventos.map(val) }
      }];
    }
    const r = await fetch(`${DOCS}:commit?key=${KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${id.idToken}` },
      body: JSON.stringify({ writes: [write] }),
      keepalive
    });
    if (r.ok) {
      pendientes = pendientes.slice(loteEventos.length);
      guardarPendientes();
      sucio = false;
      fallos = 0;
    } else if (r.status === 403 || r.status === 401) {
      /* el documento pertenece a otra identidad (se borró el registro, se limpió el navegador,
         caducó el token…). Se arranca una sesión nueva para no perder la visita. */
      fallos++;
      if (fallos <= 2) {
        ident = null;
        localStorage.removeItem(LS_ID);
        ses.id = nuevoId();
        guardarLocal();
        enVuelo = false;
        return enviar(keepalive);
      }
    }
  } catch { /* el tracking nunca debe romper la tienda */ }
  enVuelo = false;
}

/* ============ API ============ */
export function track(evento, datos = {}) {
  if (!ses) return;
  const e = { e: evento, t: new Date().toISOString(), pg: pagina(), ...datos };
  pendientes.push(e);
  if (pendientes.length > MAX_EVENTOS) pendientes = pendientes.slice(-MAX_EVENTOS);
  if (evento === "busqueda" && datos.texto) ses.busquedas.push(String(datos.texto).slice(0, 80));
  if (evento === "busqueda_sin_resultado" && datos.texto) ses.sinResultado.push(String(datos.texto).slice(0, 80));
  if (evento === "filtro_sin_resultado" && datos.filtros) {
    const fuera = ["orden", "sub", "categoria"];
    const txt = Object.entries(datos.filtros)
      .filter(([k, v]) => !fuera.includes(k) && v && v !== "Todas" && v !== "Todos")
      .map(([, v]) => v).join(" ");
    if (txt) ses.sinResultado.push(txt.slice(0, 80));
  }
  if (evento === "filtro" && datos.campo === "talla" && datos.valor && datos.valor !== "Todas") ses.tallas.push(String(datos.valor));
  /* la talla que eligen dentro de la ficha vale igual que la que filtran en el catálogo */
  if ((evento === "elige_talla" || evento === "cambia_talla") && datos.talla && datos.talla !== datos.antes) ses.tallas.push(String(datos.talla));
  /* todo lo que le preguntan al asistente, haya habido resultados o no */
  if (evento === "asesor" && datos.pregunta) ses.busquedas.push(String(datos.pregunta).slice(0, 80));
  if (evento === "compra") { ses.compro = true; ses.compraPorConfirmar = !!datos.porConfirmar; }
  if (evento === "sale_a_pagar") ses.pagando = Date.now();
  /* El cliente casi nunca regresa de Mercado Pago (hay que darle "Volver al sitio" y nadie lo hace),
     así que la compra no se puede marcar al volver. Guardamos su nombre y la referencia del pedido:
     el panel cruza esa referencia con las ventas registradas y sabe si pagó, haya regresado o no. */
  if (datos.cliente) ses.nombreCliente = String(datos.cliente).slice(0, 60);
  if (datos.ref) ses.refPedido = String(datos.ref).slice(0, 40);
  sucio = true;
  guardarLocal();
  guardarPendientes();
  if (pendientes.length >= 15) enviar();
}

/** Abre la ficha de un producto: cuenta UNA vista por sesión y arranca su cronómetro. */
export function trackProducto(p) {
  if (!ses || !p || !p.id) return;
  const id = p.id;
  const prev = ses.productos[id] || { nombre: "", vistas: 0, segundos: 0, carrito: false, comprado: false };
  prev.vistas += 1;
  if (p.nombre) prev.nombre = p.nombre;
  if (p.equipo) prev.equipo = p.equipo;
  if (p.categoria) prev.categoria = p.categoria;
  ses.productos[id] = prev;
  productoAbierto = { id };
  ultimoTic = Date.now();
  sucio = true;
  guardarLocal();
}

export function cerrarProducto() {
  tic();
  productoAbierto = null;
}

export function marcarProducto(id, campo) {
  if (!ses) return;
  if (!ses.productos[id]) ses.productos[id] = { nombre: "", vistas: 0, segundos: 0, carrito: false, comprado: false };
  ses.productos[id][campo] = true;
  sucio = true;
  guardarLocal();
  enviar();
}

export function setCliente(uid, email) {
  if (!ses) return;
  const cambioDeCuenta = ses.clienteUid && uid && ses.clienteUid !== uid;
  const cerroSesion = ses.clienteUid && !uid;
  if (cambioDeCuenta || cerroSesion) {
    /* otra persona en el mismo teléfono: se cierra la visita anterior y se abre una nueva,
       para que el registro de cada quien no se mezcle */
    enviar(true);
    const antes = ses;
    ses = {
      id: nuevoId(),
      inicio: new Date().toISOString(),
      dispositivo: antes.dispositivo,
      origen: "interno",
      entrada: pagina(),
      paginas: [pagina()],
      productos: {}, busquedas: [], sinResultado: [], tallas: [],
      segundos: 0, compro: false, clienteUid: "", clienteEmail: "", nombreCliente: "", refPedido: ""
    };
    pendientes = [];
    guardarPendientes();
  }
  ses.clienteUid = uid || "";
  ses.clienteEmail = email || "";
  sucio = true;
  guardarLocal();
  enviar();
}

/* ============ arranque ============ */
ses = cargarSesion();
ses.saliendo = false;          // cada página arranca limpia: irse es lo último que pasa
ses.interno = 0;
if (!ses.paginas.includes(pagina())) ses.paginas.push(pagina());
guardarLocal();
/* en producto.html no registramos "entró a una ficha": el evento "Abrió <jersey>"
   ya lo cuenta y con nombre. Así no salen líneas repetidas. */
if (pagina() !== "producto.html") track("pagina", { url: pagina() });

/* ¿viene de regreso de Mercado Pago? el resultado viene en la dirección */
(function volviendoDePago() {
  const u = new URLSearchParams(location.search);
  const estado = u.get("collection_status") || u.get("status");
  if (!estado) return;
  const idPago = u.get("payment_id") || u.get("collection_id") || "";
  if (ses.ultimoPagoVisto === idPago + estado) return;
  ses.ultimoPagoVisto = idPago + estado;
  ses.pagando = 0;
  ses.saliendo = false;
  track("vuelve_de_pago", { estado, idPago });
  if (estado === "approved") track("compra", { idPago, via: "tarjeta" });
  guardarLocal();
  enviar();
})();

setInterval(tic, LATIDO_MS);
setInterval(() => enviar(), 20000);
/* primer envío rápido: si alguien entra y se va en 10 s, la visita igual queda registrada */
setTimeout(() => enviar(), 3500);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { tic(); enviar(true); }
  else { ultimoTic = Date.now(); ultimaAccion = Date.now(); }
});
window.addEventListener("pagehide", () => { tic(); enviar(true); });

/* dentro de la misma página: lo que no se ve en el "entró a" */
document.addEventListener("click", e => {
  const b = e.target.closest("a, button");
  if (!b) return;
  if (b.id === "checkout") track("va_a_pagar", {});
  /* cambiar de página dentro de la tienda no es irse */
  const href = b.getAttribute && b.getAttribute("href");
  if (href && !href.startsWith("#") && !/^https?:/i.test(href)) {
    ses.interno = Date.now();
    guardarLocal();
  }
}, true);

/* al salir: si no compró, queda registrado que se fue */
window.addEventListener("pagehide", () => {
  const seFueAPagar = ses && ses.pagando && (Date.now() - ses.pagando) < 90000;
  const cambioDePagina = ses && ses.interno && (Date.now() - ses.interno) < 3000;
  if (ses && !ses.compro && !ses.saliendo && !seFueAPagar && !cambioDePagina) {
    ses.saliendo = true;
    const conCarrito = Object.values(ses.productos).some(p => p.carrito);
    track("salida", { conCarrito });
  }
});

window.dmTrack = { track, trackProducto, cerrarProducto, marcarProducto, setCliente };
