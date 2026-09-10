import { COBRO_WEBHOOK, PEDIDO_WEBHOOK, ENVIO_DOMICILIO, WHATSAPP_NUMERO } from "./config.js?v=76";
import { db } from "./db.js?v=76";
import { esMayorista as soyMayorista } from "./mayoreo.js?v=76";
import { track } from "./track.js?v=76";

const money = n => "$" + Number(n).toLocaleString("es-MX");

/* Folio del pedido: 6 caracteres al azar, sin letras que se confundan.
   Es lo que el cliente enseña como comprobante y lo que el dueño busca en el panel. */
function nuevoFolio() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let f = "";
  for (let i = 0; i < 6; i++) f += abc[Math.floor(Math.random() * abc.length)];
  return "DM-" + f;
}

/* DATOS DE MUESTRA para la presentación: el modal se ve completo pero nadie puede
   transferir a una cuenta ajena por error. Los 3 primeros dígitos son el código real
   de BBVA (012) y el resto es un patrón que no corresponde a ninguna cuenta.
   ⚠️ Cambiar por la CLABE real de Daniel antes de recibir clientes de verdad. */
const CLABE_TRANSFERENCIA = "012 320 00112233445 8";
const BANCO_TRANSFERENCIA = "BBVA México";
const BENEFICIARIO_TRANSFERENCIA = "Deportes Martínez";

let user = null, perfil = null;
db.onAuth(async u => {
  user = u;
  perfil = u ? await db.getPerfil(u.uid).catch(() => null) : null;
});

export function iniciarPago({ items, productos, entrega, promo, onError }) {
  abrirModal(entrega, datos => enviarPago({ items, productos, entrega, promo, ...datos }, onError), onError);
}

function enviarPago(payload, onError) {
  /* Una sola referencia para todo el pedido: la genera el navegador, el servidor la usa como
     external_reference en Mercado Pago y la venta la guarda. Asi el registro de visitas puede
     cruzarla con la venta y saber si esta persona pago, aunque nunca regrese de Mercado Pago. */
  const ref = nuevoFolio();
  track("pago_mercadopago", { entrega: payload.entrega, items: (payload.items || []).length, ref, cliente: payload.cliente || "" });
  fetch(COBRO_WEBHOOK, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, uid: user?.uid || "", folio: ref, ref })
  }).then(r => r.json()).then(d => {
    if (d.link) {
      track("sale_a_pagar", { proveedor: "Mercado Pago", ref, cliente: payload.cliente || "" });
      setTimeout(() => { window.location.href = d.link; }, 220);
      return;
    }
    throw new Error("sin link");
  }).catch(() => { if (onError) onError(); });
}

export function iniciarTransferencia({ productos, entrega, total, promo, onError }) {
  abrirModal(entrega, datos => mostrarClabe({ productos, entrega, total, ...datos }), onError);
}

/* Deja el pedido registrado como "por cobrar": aparta el stock y le avisa al dueño.
   Si el cliente nunca paga, el dueño lo cancela en el panel y el stock regresa. */
function registrarPedido({ productos, entrega, total, cliente, telefono, direccion, ref }) {
  return fetch(PEDIDO_WEBHOOK, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      metodo: "transferencia",
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
  }).then(r => r.json()).catch(() => null);
}

function mostrarClabe({ productos, entrega, total, cliente, telefono, direccion }) {
  if (document.getElementById("trOverlay")) return;
  const ref = nuevoFolio();
  registrarPedido({ productos, entrega, total, cliente, telefono, direccion, ref });
  const desc = 0;
  const totalFinal = total - desc;
  const resumen = (productos || []).map(p => `${p.qty}x ${p.title}${p.talla ? " (T " + p.talla + ")" : ""}`).join(", ");
  const entregaTxt = entrega === "domicilio" ? `Entrega a domicilio: ${direccion || ""}` : "Recoge en tienda";
  const descTxt = desc ? `\nDescuento mayoreo -10%: -${money(desc)}` : "";
  track("transferencia", { ref, total: totalFinal, cliente: cliente || "" });
  const waMsg = encodeURIComponent(`Hola, hice mi pedido en la web (ref ${ref}).\nProductos: ${resumen}${descTxt}\nTotal: ${money(totalFinal)}\n${entregaTxt}\n¿Me pasan los datos para pagar?`);
  const waLink = `https://wa.me/${WHATSAPP_NUMERO}?text=${waMsg}`;
  const ov = document.createElement("div");
  ov.id = "trOverlay";
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px";
  ov.innerHTML = `
    <div style="background:#0f0f12;border:1px solid #26262e;border-radius:18px;max-width:440px;width:100%;padding:24px;font-family:inherit;color:#f4f4f5;max-height:92vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <h3 style="margin:0;font-size:19px;font-weight:800">Paga por transferencia</h3>
        <button id="trClose" style="background:none;border:none;color:#9a9aa2;font-size:22px;cursor:pointer;line-height:1">✕</button>
      </div>
      <p style="margin:0 0 16px;font-size:13px;color:#9a9aa2">${CLABE_TRANSFERENCIA
        ? "Transfiere a esta cuenta y mándanos tu comprobante por WhatsApp. Apartamos tu jersey en cuanto confirmes el pago."
        : "Manda tu pedido por WhatsApp y te pasamos los datos para transferir. Apartamos tu jersey en cuanto confirmes el pago."}</p>
      <div style="background:#0e0e11;border:1px solid #2a2a32;border-radius:12px;padding:14px;margin-bottom:14px">
        ${CLABE_TRANSFERENCIA ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#9a9aa2;font-size:13px">Banco</span><b>${BANCO_TRANSFERENCIA}</b></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#9a9aa2;font-size:13px">Beneficiario</span><b style="text-align:right">${BENEFICIARIO_TRANSFERENCIA}</b></div>
        <div style="margin-bottom:8px"><span style="color:#9a9aa2;font-size:13px">CLABE</span><div style="display:flex;align-items:center;gap:8px;margin-top:4px"><b id="trClabe" style="font-size:18px;letter-spacing:1px">${CLABE_TRANSFERENCIA}</b><button id="trCopy" style="background:#26262c;border:none;color:#e8b923;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer">Copiar</button></div></div>` : ""}
        <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#9a9aa2;font-size:13px">Tu pedido</span><b style="text-align:right;max-width:60%">${resumen}</b></div>
        ${desc
          ? `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><span style="color:#e8b923;font-size:13px;font-weight:700">Precio mayorista −10%</span><span><s style="color:#7a7a82;font-size:14px;margin-right:8px">${money(total)}</s><b style="color:#e8b923;font-size:20px">${money(totalFinal)}</b></span></div>`
          : `<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#9a9aa2;font-size:13px">Monto</span><b style="color:#e8b923;font-size:18px">${money(totalFinal)}</b></div>`}
        <div style="display:flex;justify-content:space-between"><span style="color:#9a9aa2;font-size:13px">Referencia</span><b>${ref}</b></div>
      </div>
      <a href="${waLink}" target="_blank" rel="noopener" style="display:block;text-align:center;background:linear-gradient(135deg,#e8b923,#f7d154);color:#1a1405;border-radius:12px;padding:14px;font-weight:800;font-size:15px;text-decoration:none">Enviar comprobante por WhatsApp</a>
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

function abrirModal(entrega, onConfirm, onCancel) {
  const aDomicilio = entrega === "domicilio";
  if (document.getElementById("dirOverlay")) return;
  const ov = document.createElement("div");
  ov.id = "dirOverlay";
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px";
  ov.innerHTML = `
    <div style="background:#0f0f12;border:1px solid #26262e;border-radius:18px;max-width:440px;width:100%;padding:24px;font-family:inherit;color:#f4f4f5;max-height:92vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <h3 style="margin:0;font-size:19px;font-weight:800">${aDomicilio ? "¿A dónde te lo enviamos?" : "¿Quién recoge el pedido?"}</h3>
        <button id="dirClose" style="background:none;border:none;color:#9a9aa2;font-size:22px;cursor:pointer;line-height:1">✕</button>
      </div>
      <p style="margin:0 0 16px;font-size:13px;color:#9a9aa2">${aDomicilio
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
        <div id="dErr" style="color:#ff6b6b;font-size:12.5px;min-height:16px"></div>
        <button id="dGo" style="background:#e8b923;color:#1a1405;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:15px;cursor:pointer;letter-spacing:.3px">Continuar al pago</button>
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
    const soloDigitos = tel.replace(/\D/g, "");
    if (!nombre || soloDigitos.length < 10) { $("#dErr").textContent = "Pon tu nombre y un teléfono de 10 dígitos."; return; }
    const calle = v("dCalle"), col = v("dCol"), cp = v("dCP"), ciudad = v("dCiudad"), estado = v("dEstado"), ref = v("dRef");
    if (aDomicilio && (!calle || !col || !cp || !ciudad || !estado)) { $("#dErr").textContent = "Completa calle, colonia, C.P., ciudad y estado."; return; }
    const direccion = aDomicilio ? `${calle}, Col. ${col}, ${ciudad}, ${estado}, C.P. ${cp}${ref ? " (" + ref + ")" : ""}` : "";
    if (user) {
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
function inpBase() { return "width:100%;padding:12px 14px;border-radius:11px;border:1px solid #2a2a32;background:#0b0b0e;color:#f4f4f5;font-size:14px;outline:none;box-sizing:border-box"; }
function inpS() { return inpBase(); }
