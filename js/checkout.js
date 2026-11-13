import { AVISO_WEBHOOK, CANCELAR_WEBHOOK, COBRO_WEBHOOK, PEDIDO_WEBHOOK, ENVIO_DOMICILIO, WHATSAPP_NUMERO, NEGOCIO } from "./config.js?v=133";
const authListo = import("./auth.js?v=133");
const dbListo = import("./db.js?v=133").then(m => m.db);
const abrirLogin = (...a) => authListo.then(m => m.abrirLogin(...a));
let db = null;
import { esMayorista as soyMayorista } from "./mayoreo.js?v=133";
import { track } from "./track.js?v=133";
import { campoTelefono, conectarTelefono, leerTelefono } from "./telefono.js?v=133";
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
  const resumen = apartados.map(p => `${p.qty}x ${p.title}${p.talla ? " (talla " + p.talla + ")" : ""}`).join(", ");
  const entregaTxt = entrega === "domicilio" ? `Entrega a domicilio: ${direccion || ""}` : "Recoge en tienda";
  const descTxt = desc ? `\nDescuento mayoreo -10%: -${money(desc)}` : "";
  track("transferencia", { ref, total: totalFinal, cliente: cliente || "" });
  const waMsg = encodeURIComponent(`Hola, hice mi pedido en la web (ref ${ref}).\nProductos: ${resumen}${descTxt}\nTotal: ${money(totalFinal)}\n${entregaTxt}\nAquí está mi comprobante de la transferencia.`);
  const waLink = `https://wa.me/${WHATSAPP_NUMERO}?text=${waMsg}`;
  const ov = document.createElement("div");
  ov.id = "trOverlay";
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px";
  const caja = "background:#0f0f12;border:1px solid #26262e;border-radius:18px;max-width:440px;width:100%;padding:24px;font-family:inherit;color:#f4f4f5;max-height:92vh;overflow:auto";
  const ICONO_WA = `<svg viewBox="0 0 24 24" width="26" height="26" fill="#e8b923" aria-label="WhatsApp"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.04 21.5h-.01a9.43 9.43 0 0 1-4.8-1.32l-.35-.2-3.57.94.95-3.48-.22-.36a9.4 9.4 0 0 1-1.45-5.02c0-5.2 4.24-9.44 9.46-9.44a9.4 9.4 0 0 1 6.68 2.77 9.38 9.38 0 0 1 2.76 6.68c0 5.21-4.24 9.44-9.45 9.44zm8.04-17.48A11.3 11.3 0 0 0 12.04.7C5.77.7.67 5.8.67 12.06c0 2 .52 3.96 1.52 5.68L.57 23.65l6.04-1.58a11.3 11.3 0 0 0 5.42 1.38h.01c6.26 0 11.36-5.1 11.36-11.36 0-3.03-1.18-5.89-3.32-8.03z"/></svg>`;
  const oro = "display:block;width:100%;text-align:center;background:linear-gradient(135deg,#e8b923,#f7d154);color:#1a1405;border:none;border-radius:12px;padding:15px;font-weight:800;font-size:17px;text-decoration:none;cursor:pointer;font-family:inherit";
  const fila = (k, v) => `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:8px"><span style="color:#9a9aa2;font-size:15.5px">${k}</span>${v}</div>`;
  const cab = t => `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h3 style="margin:0;font-size:24px;font-weight:800">${t}</h3><button id="trClose" style="background:none;border:none;color:#9a9aa2;font-size:24px;cursor:pointer;line-height:1">✕</button></div>`;
  const pedidoNum = `<div style="display:flex;justify-content:space-between;align-items:baseline"><span style="color:#9a9aa2;font-size:15.5px">Número de pedido</span><b style="font-size:22px;letter-spacing:.06em;white-space:nowrap">${ref}</b></div>`;
  const banco = CLABE_TRANSFERENCIA ? `
        ${fila("Banco", `<b>${BANCO_TRANSFERENCIA}</b>`)}
        ${fila("Beneficiario", `<b style="text-align:right">${BENEFICIARIO_TRANSFERENCIA}</b>`)}
        <div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center"><span style="color:#9a9aa2;font-size:15.5px">CLABE</span><button id="trCopy" style="background:#26262c;border:none;color:#e8b923;border-radius:8px;padding:4px 10px;font-size:14px;cursor:pointer">Copiar</button></div><b style="display:block;margin-top:6px;font-size:clamp(17px,5.2vw,21px);letter-spacing:.5px;white-space:nowrap">${CLABE_TRANSFERENCIA}</b></div>` : "";
  const datosBanco = `
      <div style="background:#0e0e11;border:1px solid #2a2a32;border-radius:12px;padding:14px 14px 6px;margin-bottom:16px">
        ${banco}
        ${fila("Monto", `<b style="color:#e8b923;font-size:21px">${money(totalFinal)}</b>`)}
      </div>`;
  const paso1 = `
    <div style="${caja}">
      ${cab("Paga por transferencia")}
      <p style="margin:0 0 14px;font-size:15.5px;line-height:1.5;color:#9a9aa2">Transfiere el monto a esta cuenta. Te apartamos tu playera 2 horas para que transfieras; al dar «Ya transferí» te la guardamos 48 horas. Si te equivocaste, cierra con la ✕ y se cancela.</p>
      ${datosBanco}
      <p style="margin:0 0 10px;font-size:17px;line-height:1.45;color:#f4f4f5;font-weight:700">Una vez terminada la transferencia, da clic aquí:</p>
      <button type="button" id="trYa" style="${oro}">Ya transferí</button>
    </div>`;
  const paso2 = `
    <div style="${caja}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h3 style="margin:0;display:flex;align-items:center;gap:12px;font-size:26px;font-weight:800;color:#e8b923"><span style="width:40px;height:40px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:20px;background:#2a2109;color:#f7d154;border:1px solid #4a3f18">✓</span>¡Gracias por tu compra!</h3><button id="trClose" style="background:none;border:none;color:#9a9aa2;font-size:24px;cursor:pointer;line-height:1">✕</button></div>
      <div style="display:flex;align-items:center;gap:10px;margin:0 0 16px;font-size:15.5px;line-height:1.5;color:#c9c9cf">${ICONO_WA}<span>Te mandamos un WhatsApp con toda la información de tu pedido.</span></div>
      <p style="margin:0 0 12px;font-size:18px;line-height:1.45;color:#f4f4f5;font-weight:700">Mándanos tu comprobante al <span style="color:#e8b923;white-space:nowrap">${NEGOCIO.telefono}</span> o da clic aquí:</p>
      <a href="${waLink}" target="_blank" rel="noopener" style="${oro};margin-bottom:14px">Enviar comprobante</a>
      <div style="background:#0e0e11;border:1px solid #2a2a32;border-radius:12px;padding:14px;margin-bottom:12px">
        ${fila("Tu pedido", `<b style="text-align:right;max-width:60%">${escH(resumen)}</b>`)}
        ${fila("Monto", `<b style="color:#e8b923;font-size:21px">${money(totalFinal)}</b>`)}
        ${pedidoNum}
      </div>
      <p style="margin:0 0 4px;font-size:14.5px;line-height:1.5;color:#9a9aa2">Cuando confirmemos tu pago te avisamos por WhatsApp. Si en 48 horas no recibimos el comprobante, liberamos la playera.</p>
      ${entrega === "domicilio" ? "" : `<a href="${rutaMapa()}" target="_blank" rel="noopener" style="display:block;text-align:center;margin-top:10px;border:1px solid #2e2e38;color:#f4f4f5;border-radius:12px;padding:13px;font-weight:700;font-size:16px;text-decoration:none">📍 Cómo llegar a la tienda</a>`}
      <p style="margin:14px 0 0;font-size:15px;line-height:1.55;color:${invitado ? "#f7d154" : "#9a9aa2"}">${invitado
        ? `Guarda tu número de pedido <b>${ref}</b>: solo lo vas a tener aquí y en el mensaje de WhatsApp.`
        : `Puedes seguir tu pedido paso a paso en <a href="cuenta.html" style="color:#e8b923">Mi cuenta</a>.`}</p>
    </div>`;
  let paso = 1;
  const q = s => ov.querySelector(s);
  const cerrar = () => {
    track("transferencia_fin", { ref, total: totalFinal, paso });
    track("compra", { via: "transferencia", porConfirmar: true, ref, total: totalFinal });
    ov.remove();
  };
  const cancelar = async () => {
    if (!confirm(`¿Cancelar el pedido ${ref}? La playera vuelve a la tienda y puedes hacerlo otra vez.\n\nSi ya transferiste, mejor da clic en «Ya transferí».`)) return;
    const x = q("#trClose");
    x.disabled = true;
    const idToken = await dbListo.then(d => d.token()).catch(() => null);
    const res = await fetch(CANCELAR_WEBHOOK, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, idToken })
    }).then(x => x.json()).catch(() => ({ ok: false, motivo: "red" }));
    if (res.ok) {
      track("transferencia_cancelada_cliente", { ref });
      ov.remove();
      const a = aviso(`Listo, cancelamos el pedido ${ref} y la playera volvió a la tienda. Ya puedes hacerlo otra vez.`);
      a.style.cursor = "pointer"; a.onclick = () => a.remove(); setTimeout(() => a.remove(), 6000);
      return;
    }
    x.disabled = false;
    alert(res.motivo === "ya no se puede" ? "Este pedido ya no se puede cancelar desde aquí. Escríbenos por WhatsApp." : "No se pudo cancelar. Revisa tu internet e inténtalo otra vez.");
  };
  const pintar = () => {
    ov.innerHTML = paso === 1 ? paso1 : paso2;
    q("#trClose").onclick = paso === 1 ? cancelar : cerrar;
    const btnCopy = q("#trCopy");
    if (btnCopy) btnCopy.onclick = () => {
      navigator.clipboard?.writeText(CLABE_TRANSFERENCIA.replace(/\s/g, ""));
      btnCopy.textContent = "Copiado ✓";
    };
    if (paso === 2) {
      ov.querySelector('a[href*="wa.me"]')?.addEventListener("click", () => track("comprobante_whatsapp", { ref, total: totalFinal }));
      return;
    }
    q("#trYa").onclick = async () => {
      if (!confirm("¿Ya hiciste la transferencia? Después de esto ya no se puede cancelar el pedido desde la página.")) return;
      const btn = q("#trYa");
      btn.disabled = true; btn.textContent = "Avisando…";
      const idToken = await dbListo.then(d => d.token()).catch(() => null);
      const listo = await fetch(AVISO_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "transferi", id: r.id, idToken }) })
        .then(x => x.ok ? x.json() : null).then(x => !!(x && x.ok)).catch(() => false);
      if (!listo) {
        btn.disabled = false; btn.textContent = "Ya transferí";
        alert("No pudimos avisar a la tienda. Revisa tu internet y vuelve a dar clic en «Ya transferí». Tu playera sigue apartada.");
        return;
      }
      track("ya_transferi", { ref, total: totalFinal });
      paso = 2;
      pintar();
    };
  };
  ov.addEventListener("click", e => { if (e.target === ov && paso === 2) cerrar(); });
  document.body.appendChild(ov);
  pintar();
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
        ${campoTelefono("dTel", inpBase())}
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
    const pre = { dNombre: perfil.nombre, dCalle: perfil.calle, dCol: perfil.colonia, dCP: perfil.cp, dCiudad: perfil.ciudad, dEstado: perfil.estado, dRef: perfil.referencias };
    for (const [id, v] of Object.entries(pre)) { const el = $("#" + id); if (v && el) el.value = v; }
  }
  conectarTelefono(ov, "dTel", perfil?.telefono || "");
  const cerrar = () => { ov.remove(); if (onCancel) onCancel(); };
  $("#dirClose").onclick = cerrar;
  ov.addEventListener("click", e => { if (e.target === ov) cerrar(); });
  $("#dGo").onclick = () => {
    const v = id => { const el = $("#" + id); return el ? el.value.trim() : ""; };
    const nombre = v("dNombre"), lt = leerTelefono(ov, "dTel"), tel = lt.valor;
    if (!nombre) { $("#dErr").textContent = "Pon tu nombre."; return; }
    if (!lt.ok) { $("#dErr").textContent = lt.error; return; }
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
