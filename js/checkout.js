import { COBRO_WEBHOOK, PEDIDO_WEBHOOK, ENVIO_DOMICILIO, WHATSAPP_NUMERO, NEGOCIO } from "./config.js?v=123";
const authListo = import("./auth.js?v=123");
const dbListo = import("./db.js?v=123").then(m => m.db);
const abrirLogin = (...a) => authListo.then(m => m.abrirLogin(...a));
let db = null;
import { esMayorista as soyMayorista } from "./mayoreo.js?v=123";
import { track } from "./track.js?v=123";
const escH = t => String(t ?? "").replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));

const money = n => "$" + Number(n).toLocaleString("es-MX");

/* Folio del pedido: 6 caracteres al azar, sin letras que se confundan.
   Es lo que el cliente enseña como comprobante y lo que el dueño busca en el panel. */
function nuevoFolio() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let f = "";
  for (let i = 0; i < 6; i++) f += abc[Math.floor(Math.random() * abc.length)];
  return "DM-" + f;
}

const CLABE_TRANSFERENCIA = "722 969 07099512872 1";
const BANCO_TRANSFERENCIA = "Mercado Pago W";
const BENEFICIARIO_TRANSFERENCIA = "Jose Daniel Martinez Velez";
const AVISO_WHATSAPP = false;

let user = null, perfil = null;
dbListo.then(d => {
  db = d;
  d.onAuth(async u => {
    user = u;
    perfil = u ? await d.getPerfil(u.uid).catch(() => null) : null;
  });
}).catch(() => {});

export function iniciarPago({ items, productos, entrega, promo, onError }) {
  pedirDatos(entrega, datos => enviarPago({ items, productos, entrega, promo, ...datos }, onError), onError);
}

function enviarPago(payload, onError) {
  /* Una sola referencia para todo el pedido: la genera el navegador, el servidor la usa como
     external_reference en Mercado Pago y la venta la guarda. Asi el registro de visitas puede
     cruzarla con la venta y saber si esta persona pago, aunque nunca regrese de Mercado Pago. */
  const ref = nuevoFolio();
  const { invitado, ...cuerpo } = payload;
  guardarUltimo(ref, payload);
  const av = aviso("Te llevamos a Mercado Pago…");
  track("pago_mercadopago", { entrega: payload.entrega, items: (payload.items || []).length, ref, cliente: payload.cliente || "" });
  dbListo.then(d => d.token()).catch(() => null).then(idToken => fetch(COBRO_WEBHOOK, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...cuerpo, uid: user?.uid || "", idToken: idToken || "", folio: ref, ref, regreso: new URL("pedido.html", location.href).href })
  })).then(r => r.json()).then(d => {
    if (d.link) {
      track("sale_a_pagar", { proveedor: "Mercado Pago", ref, cliente: payload.cliente || "" });
      setTimeout(() => { window.location.href = d.link; }, 220);
      return;
    }
    throw new Error("sin link");
  }).catch(() => { av.remove(); if (onError) onError(); });
}

export function iniciarTransferencia(args) {
  const { productos, entrega, total, onError } = args;
  if (args.promo) {
    const a = aviso("Los códigos de descuento solo aplican pagando con tarjeta. Quita el código o elige tarjeta.");
    a.style.cursor = "pointer"; a.onclick = () => a.remove();
    setTimeout(() => a.remove(), 6000);
    return;
  }
  if (!user) {
    const a = aviso("Para pagar por transferencia entra a tu cuenta o crea una. Así apartamos tus jerseys a tu nombre por 48 horas.");
    setTimeout(() => a.remove(), 6000);
    abrirLogin("login", nuevo => {
      const ahora = db?.usuarioAhora?.();
      user = ahora && ahora.uid ? ahora : nuevo;
      perfil = null;
      if (user) iniciarTransferencia(args);
    });
    return;
  }
  pedirDatos(entrega, datos => mostrarClabe({ productos, entrega, total, ...datos }), onError);
}

/* Deja el pedido registrado como "por cobrar": aparta el stock y le avisa al dueño.
   Si el cliente nunca paga, el dueño lo cancela en el panel y el stock regresa. */
async function registrarPedido({ productos, entrega, total, cliente, telefono, direccion, ref }) {
  const idToken = await dbListo.then(d => d.token()).catch(() => null);
  if (!idToken) return { skip: "sin sesion" };
  return fetch(PEDIDO_WEBHOOK, {
    method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
    body: JSON.stringify({
      metodo: "transferencia",
      idToken,
      ref,
      folio: ref,
      total,
      productos: (productos || []).map(p => ({ id: p.id, qty: p.qty, talla: p.talla || "", perso: p.perso || null })),
      uid: user?.uid || "",
      correo: user?.email || "",
      metadata: {
        entrega,
        cliente: cliente || perfil?.nombre || "",
        telefono: telefono || perfil?.telefono || "",
        direccion: direccion || "",
        correo: user?.email || ""
      }
    })
  }).then(r => r.ok ? r.json() : { skip: "servidor" }).catch(() => ({ skip: "red" }));
}

async function mostrarClabe({ productos, entrega, total, cliente, telefono, direccion, invitado }) {
  if (document.getElementById("trOverlay") || mostrarClabe.enCurso) return;
  mostrarClabe.enCurso = true;
  const av = aviso("Registrando tu pedido…");
  const intento = nuevoFolio();
  const r = await registrarPedido({ productos, entrega, total, cliente, telefono, direccion, ref: intento });
  av.remove();
  mostrarClabe.enCurso = false;
  if (!r || r.venta !== true) {
    const motivo = (r && r.skip) || "";
    const MOTIVOS = {
      "red": "No nos pudimos conectar. Revisa tu internet y vuelve a intentarlo. No se apartó nada.",
      "sin sesion": "Tu sesión se cerró. Vuelve a entrar a tu cuenta e inténtalo otra vez. No se apartó nada.",
      "sin existencias": "Ya no hay existencias de lo que pediste en esa talla. No se apartó nada.",
      "demasiados pedidos sin pagar": "Ya tienes 3 pedidos por transferencia sin pagar. Paga o espera a que venzan para hacer otro.",
      "sin productos": "Tu carrito está vacío.",
    };
    const err = aviso(MOTIVOS[motivo] || `No pudimos registrar tu pedido. No se apartó nada. Escríbenos por WhatsApp al ${NEGOCIO.telefono} y te ayudamos.`);
    err.style.cursor = "pointer";
    err.onclick = () => err.remove();
    setTimeout(() => err.remove(), 6000);
    return;
  }
  const ref = String(r.id || intento).replace(/^TR-/, "");
  const desc = 0;
  const totalFinal = Number(r.total) > 0 ? Number(r.total) : total - desc;
  const apartados = Array.isArray(r.lineas) && r.lineas.length
    ? r.lineas.map(l => ({ qty: l.qty, title: l.nombre, talla: l.talla }))
    : (productos || []);
  const resumen = apartados.map(p => `${p.qty}x ${p.title}${p.talla ? " (T " + p.talla + ")" : ""}`).join(", ");
  const entregaTxt = entrega === "domicilio" ? `Entrega a domicilio: ${direccion || ""}` : "Recoge en tienda";
  const descTxt = desc ? `\nDescuento mayoreo -10%: -${money(desc)}` : "";
  track("transferencia", { ref, total: totalFinal, cliente: cliente || "" });
  const waMsg = encodeURIComponent(`Hola, hice mi pedido en la web (ref ${ref}).\nProductos: ${resumen}${descTxt}\nTotal: ${money(totalFinal)}\n${entregaTxt}\nAquí está mi comprobante de la transferencia.`);
  const waLink = `https://wa.me/${WHATSAPP_NUMERO}?text=${waMsg}`;
  const ov = document.createElement("div");
  ov.id = "trOverlay";
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px";
  ov.innerHTML = `
    <div style="background:#0f0f12;border:1px solid #26262e;border-radius:18px;max-width:440px;width:100%;padding:24px;font-family:inherit;color:#f4f4f5;max-height:92vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <h3 style="margin:0;font-size:24px;font-weight:800">Paga por transferencia</h3>
        <button id="trClose" style="background:none;border:none;color:#9a9aa2;font-size:24px;cursor:pointer;line-height:1">✕</button>
      </div>
      <p style="margin:0 0 12px;font-size:15.5px;color:#9a9aa2">${CLABE_TRANSFERENCIA
        ? `Cuando transfieras, mándanos tu comprobante al <b style="color:#f4f4f5">${NEGOCIO.telefono}</b> o da clic aquí:`
        : "Ya te apartamos tu jersey por 48 horas. Manda tu pedido por WhatsApp y te pasamos los datos para transferir."}</p>
      <a href="${waLink}" target="_blank" rel="noopener" style="display:block;text-align:center;background:linear-gradient(135deg,#e8b923,#f7d154);color:#1a1405;border-radius:12px;padding:14px;font-weight:800;font-size:17px;text-decoration:none;margin-bottom:12px">Abrir WhatsApp</a>
      ${CLABE_TRANSFERENCIA ? `<p style="margin:0 0 16px;font-size:15.5px;color:#9a9aa2">Apartamos tu playera por 48 horas; si no recibimos el comprobante en ese tiempo, la liberamos.</p>` : ""}
      <div style="background:#0e0e11;border:1px solid #2a2a32;border-radius:12px;padding:14px;margin-bottom:14px">
        ${CLABE_TRANSFERENCIA ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#9a9aa2;font-size:15.5px">Banco</span><b>${BANCO_TRANSFERENCIA}</b></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#9a9aa2;font-size:15.5px">Beneficiario</span><b style="text-align:right">${BENEFICIARIO_TRANSFERENCIA}</b></div>
        <div style="margin-bottom:8px"><span style="color:#9a9aa2;font-size:15.5px">CLABE</span><div style="display:flex;align-items:center;gap:8px;margin-top:4px"><b id="trClabe" style="font-size:21px;letter-spacing:1px">${CLABE_TRANSFERENCIA}</b><button id="trCopy" style="background:#26262c;border:none;color:#e8b923;border-radius:8px;padding:4px 10px;font-size:14px;cursor:pointer">Copiar</button></div></div>` : ""}
        <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#9a9aa2;font-size:15.5px">Tu pedido</span><b style="text-align:right;max-width:60%">${escH(resumen)}</b></div>
        ${desc
          ? `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><span style="color:#e8b923;font-size:15.5px;font-weight:700">Precio mayorista −10%</span><span><s style="color:#7a7a82;font-size:16px;margin-right:8px">${money(total)}</s><b style="color:#e8b923;font-size:23px">${money(totalFinal)}</b></span></div>`
          : `<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#9a9aa2;font-size:15.5px">Monto</span><b style="color:#e8b923;font-size:21px">${money(totalFinal)}</b></div>`}
        <div style="display:flex;justify-content:space-between"><span style="color:#9a9aa2;font-size:15.5px">Número de pedido</span><b style="font-size:24px;letter-spacing:.06em">${ref}</b></div>
      </div>
      ${AVISO_WHATSAPP ? `<div style="margin-top:14px;background:#0e0e11;border:1px solid #2a2a32;border-radius:12px;padding:12px 14px;font-size:15px;line-height:1.55;color:#c9c9cf">💬 Te vamos a mandar un WhatsApp${telefono ? ` al <b style="color:#f4f4f5">${String(telefono).replace(/[^\d +()-]/g, "")}</b>` : ""} con todos los datos de tu pedido.<br>¿Dudas? Escríbenos al <a href="https://wa.me/${WHATSAPP_NUMERO}" target="_blank" rel="noopener" style="color:#e8b923;font-weight:700;text-decoration:none">${NEGOCIO.telefono}</a>.</div>` : ""}
      ${entrega === "domicilio" ? "" : `<a href="${rutaMapa()}" target="_blank" rel="noopener" style="display:block;text-align:center;margin-top:10px;border:1px solid #2e2e38;color:#f4f4f5;border-radius:12px;padding:13px;font-weight:700;font-size:16px;text-decoration:none">📍 Cómo llegar a la tienda</a>`}
      <p style="margin:14px 0 0;font-size:15px;line-height:1.55;color:${invitado ? "#f7d154" : "#9a9aa2"}">${invitado
        ? `Guarda tu número de pedido <b>${ref}</b>: cópialo o tómale captura. Como compraste sin cuenta, no lo vas a poder ver después en la página.`
        : `Puedes seguir tu pedido paso a paso en <a href="cuenta.html" style="color:#e8b923">Mi cuenta</a>.`}</p>
    </div>`;
  document.body.appendChild(ov);
  const q = s => ov.querySelector(s);
  /* al cerrar el modal damos por terminada la transferencia: el cliente ya vio los datos
     y se fue a pagar/mandar su comprobante. Queda como venta POR CONFIRMAR. */
  const cerrar = () => {
    track("transferencia_fin", { ref, total: totalFinal });
    track("compra", { via: "transferencia", porConfirmar: true, ref, total: totalFinal });
    ov.remove();
  };
  q("#trClose").onclick = cerrar;
  ov.addEventListener("click", e => { if (e.target === ov) cerrar(); });
  ov.querySelector('a[href*="wa.me"]')?.addEventListener("click", () => {
    track("comprobante_whatsapp", { ref, total: totalFinal });
  });
  const btnCopy = q("#trCopy");
  if (btnCopy) btnCopy.onclick = () => {
    navigator.clipboard?.writeText(CLABE_TRANSFERENCIA.replace(/\s/g, ""));
    btnCopy.textContent = "Copiado ✓";
  };
}

function rutaMapa() {
  const q = (String(NEGOCIO.mapa || "").split("q=")[1] || "").split("&")[0];
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${q}` : NEGOCIO.mapa;
}

function aviso(txt) {
  const d = document.createElement("div");
  d.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);z-index:9999;display:flex;align-items:center;justify-content:center;color:#f4f4f5;font-weight:800;font-size:16px;padding:20px;text-align:center";
  d.textContent = txt;
  document.body.appendChild(d);
  return d;
}

function guardarUltimo(ref, payload) {
  let cat = [];
  try { cat = JSON.parse(localStorage.getItem("dm_catalogo_v1") || "[]"); } catch { }
  const fotoDe = id => {
    const im = (Array.isArray(cat) ? cat.find(x => x.id === id) : null)?.imagen || "";
    return /^data:/.test(im) ? "" : im;
  };
  try {
    localStorage.setItem("dm_ultimo_pedido", JSON.stringify({
      ref,
      entrega: payload.entrega,
      invitado: !!payload.invitado,
      productos: (payload.productos || []).map(p => ({ id: p.id, title: p.title, talla: p.talla || "", qty: p.qty, img: fotoDe(p.id) })),
      fecha: new Date().toISOString()
    }));
  } catch { }
}

function telValido(raw) {
  const s = String(raw || "").trim();
  let d = s.replace(/\D/g, "");
  if (s.startsWith("+") || s.startsWith("00")) {
    if (s.startsWith("00")) d = d.slice(2);
    if (!d.startsWith("52")) return d.length >= 8 && d.length <= 15;
    d = d.slice(2);
    if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
    return d.length === 10;
  }
  return d.length === 10 || (d.length === 12 && d.startsWith("52")) || (d.length === 13 && d.startsWith("521"));
}

function datosCompletos(p, entrega) {
  if (!p || !p.nombre || !telValido(p.telefono)) return false;
  if (entrega === "domicilio" && !(p.calle && p.colonia && p.cp && p.ciudad && p.estado)) return false;
  return true;
}

function direccionDe(p) {
  return `${p.calle}, Col. ${p.colonia}, ${p.ciudad}, ${p.estado}, C.P. ${p.cp}${p.referencias ? " (" + p.referencias + ")" : ""}`;
}

async function pedirDatos(entrega, onConfirm, onCancel) {
  const u = user || db?.usuarioAhora?.();
  if (u && u.uid) {
    user = u;
    if (!perfil) perfil = await db.getPerfil(u.uid).catch(() => null);
    if (datosCompletos(perfil, entrega)) {
      onConfirm({ cliente: perfil.nombre, telefono: perfil.telefono, direccion: entrega === "domicilio" ? direccionDe(perfil) : "", invitado: false });
      return;
    }
    abrirModal(entrega, d => onConfirm({ ...d, invitado: false }), onCancel);
    return;
  }
  elegirModo(modo => {
    if (modo === "invitado") {
      abrirModal(entrega, d => onConfirm({ ...d, invitado: true }), onCancel);
      return;
    }
    abrirLogin("login", nuevo => {
      const ahora = db?.usuarioAhora?.();
      user = ahora && ahora.uid ? ahora : nuevo;
      perfil = null;
      pedirDatos(entrega, onConfirm, onCancel);
    });
  });
}

function elegirModo(onElegir) {
  if (document.getElementById("modoOverlay")) return;
  const ov = document.createElement("div");
  ov.id = "modoOverlay";
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px";
  const opcion = "display:block;width:100%;text-align:left;background:#15151a;border:1px solid #2a2a32;border-radius:14px;padding:15px 16px;margin-top:10px;color:#f4f4f5;cursor:pointer;font-family:inherit";
  ov.innerHTML = `
    <div style="background:#0f0f12;border:1px solid #26262e;border-radius:18px;max-width:440px;width:100%;padding:24px;font-family:inherit;color:#f4f4f5;max-height:92vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <h3 style="margin:0;font-size:24px;font-weight:800">¿Cómo quieres comprar?</h3>
        <button id="modoClose" style="background:none;border:none;color:#9a9aa2;font-size:24px;cursor:pointer;line-height:1">✕</button>
      </div>
      <p style="margin:0 0 6px;font-size:15.5px;color:#9a9aa2">Elige una opción para seguir con tu pedido.</p>
      <button type="button" data-modo="cuenta" style="${opcion}">
        <b style="display:block;font-size:17px;margin-bottom:4px;color:#e8b923">Con mi cuenta</b>
        <span style="font-size:15.5px;color:#b8b8c0;line-height:1.5">Entra o crea tu cuenta. Tus datos se guardan y sigues tu pedido paso a paso.</span>
      </button>
      <button type="button" data-modo="invitado" style="${opcion}">
        <b style="display:block;font-size:17px;margin-bottom:4px">Sin cuenta</b>
        <span style="font-size:15.5px;color:#b8b8c0;line-height:1.5">Solo tu nombre y teléfono. Al final te damos tu número de pedido; guárdalo, porque sin cuenta no lo vas a poder ver después.</span>
      </button>
    </div>`;
  document.body.appendChild(ov);
  const cerrar = () => ov.remove();
  ov.querySelector("#modoClose").onclick = cerrar;
  ov.addEventListener("click", e => {
    if (e.target === ov) { cerrar(); return; }
    const b = e.target.closest("[data-modo]");
    if (!b) return;
    track("elige_modo_compra", { modo: b.dataset.modo });
    cerrar();
    onElegir(b.dataset.modo);
  });
}

function abrirModal(entrega, onConfirm, onCancel) {
  const aDomicilio = entrega === "domicilio";
  if (document.getElementById("dirOverlay")) return;
  const ov = document.createElement("div");
  ov.id = "dirOverlay";
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px";
  ov.innerHTML = `
    <div style="background:#0f0f12;border:1px solid #26262e;border-radius:18px;max-width:440px;width:100%;padding:24px;font-family:inherit;color:#f4f4f5;max-height:92vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <h3 style="margin:0;font-size:24px;font-weight:800">${aDomicilio ? "¿A dónde te lo enviamos?" : "¿Quién recoge el pedido?"}</h3>
        <button id="dirClose" style="background:none;border:none;color:#9a9aa2;font-size:24px;cursor:pointer;line-height:1">✕</button>
      </div>
      <p style="margin:0 0 16px;font-size:15.5px;color:#9a9aa2">${aDomicilio
        ? (perfil ? "Envío a domicilio (+" + money(ENVIO_DOMICILIO) + "). Revisa que tus datos estén bien y confirma." : "Envío a domicilio (+" + money(ENVIO_DOMICILIO) + "). Llena tus datos para la entrega.")
        : "Recoges en la tienda. Necesitamos tu nombre y teléfono para avisarte cuando esté listo."}</p>
      <div style="display:flex;flex-direction:column;gap:10px">
        <input id="dNombre" placeholder="Nombre completo" ${inp()}>
        <input id="dTel" placeholder="Teléfono" inputmode="tel" ${inp()}>
        ${aDomicilio ? `
        <input id="dCalle" placeholder="Calle y número" ${inp()}>
        <div style="display:flex;gap:10px">
          <input id="dCol" placeholder="Colonia" ${inp()} style="flex:2;${inpS()}">
          <input id="dCP" placeholder="C.P." inputmode="numeric" ${inp()} style="flex:1;${inpS()}">
        </div>
        <div style="display:flex;gap:10px">
          <input id="dCiudad" placeholder="Ciudad" ${inp()} style="flex:1;${inpS()}">
          <input id="dEstado" placeholder="Estado" ${inp()} style="flex:1;${inpS()}">
        </div>
        <input id="dRef" placeholder="Referencias (opcional)" ${inp()}>` : ""}
        ${user ? `<label style="display:flex;align-items:center;gap:10px;font-size:15.5px;color:#d8d8de;cursor:pointer;margin-top:2px;line-height:1.4"><input type="checkbox" id="dGuardar" style="width:20px;height:20px;flex:0 0 auto;accent-color:#e8b923"> Guardar mis datos para la próxima compra</label>` : ""}
        <div id="dErr" style="color:#ff6b6b;font-size:15px;min-height:16px"></div>
        <button id="dGo" style="background:#e8b923;color:#1a1405;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:17px;cursor:pointer;letter-spacing:.3px">Continuar al pago</button>
        <p style="margin:10px 0 0;font-size:12.5px;color:#8a8a92;line-height:1.5">Te mandamos la confirmación y los avisos de tu pedido por WhatsApp a este número. Usamos tus datos para registrar, cobrar y entregar tu pedido. <a href="legales.html#privacidad" target="_blank" rel="noopener" style="color:#e8b923">Aviso de privacidad</a></p>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const $ = s => ov.querySelector(s);
  if (perfil) {
    const pre = { dNombre: perfil.nombre, dTel: perfil.telefono, dCalle: perfil.calle, dCol: perfil.colonia, dCP: perfil.cp, dCiudad: perfil.ciudad, dEstado: perfil.estado, dRef: perfil.referencias };
    for (const [id, v] of Object.entries(pre)) { const el = $("#" + id); if (v && el) el.value = v; }
  }
  const cerrar = () => { ov.remove(); if (onCancel) onCancel(); };
  $("#dirClose").onclick = cerrar;
  ov.addEventListener("click", e => { if (e.target === ov) cerrar(); });
  $("#dGo").onclick = () => {
    const v = id => { const el = $("#" + id); return el ? el.value.trim() : ""; };
    const nombre = v("dNombre"), tel = v("dTel");
    if (!nombre || !telValido(tel)) { $("#dErr").textContent = "Pon tu nombre y tu WhatsApp: 10 dígitos, o con + y la lada si es de otro país."; return; }
    const calle = v("dCalle"), col = v("dCol"), cp = v("dCP"), ciudad = v("dCiudad"), estado = v("dEstado"), ref = v("dRef");
    if (aDomicilio && (!calle || !col || !cp || !ciudad || !estado)) { $("#dErr").textContent = "Completa calle, colonia, C.P., ciudad y estado."; return; }
    const direccion = aDomicilio ? `${calle}, Col. ${col}, ${ciudad}, ${estado}, C.P. ${cp}${ref ? " (" + ref + ")" : ""}` : "";
    if (user && $("#dGuardar")?.checked) {
      const guardar = { nombre, telefono: tel, email: user.email, actualizado: new Date().toISOString() };
      if (aDomicilio) Object.assign(guardar, { calle, colonia: col, cp, ciudad, estado, referencias: ref });
      db.guardarPerfil(user.uid, guardar).catch(() => {});
    }
    $("#dGo").disabled = true; $("#dGo").textContent = "Generando pago…";
    ov.remove();
    onConfirm({ cliente: nombre, telefono: tel, direccion });
  };
}

function inp() { return `style="${inpBase()}"`; }
function inpBase() { return "width:100%;padding:12px 14px;border-radius:11px;border:1px solid #2a2a32;background:#0b0b0e;color:#f4f4f5;font-size:16px;outline:none;box-sizing:border-box"; }
function inpS() { return inpBase(); }
