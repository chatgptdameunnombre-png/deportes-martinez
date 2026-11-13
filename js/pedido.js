import { NEGOCIO } from "./config.js?v=127";
import { db } from "./db.js?v=127";

const $ = s => document.querySelector(s);
const ICONO_WA = `<svg viewBox="0 0 24 24" width="32" height="32" fill="#e8b923" aria-label="WhatsApp"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.04 21.5h-.01a9.43 9.43 0 0 1-4.8-1.32l-.35-.2-3.57.94.95-3.48-.22-.36a9.4 9.4 0 0 1-1.45-5.02c0-5.2 4.24-9.44 9.46-9.44a9.4 9.4 0 0 1 6.68 2.77 9.38 9.38 0 0 1 2.76 6.68c0 5.21-4.24 9.44-9.45 9.44zm8.04-17.48A11.3 11.3 0 0 0 12.04.7C5.77.7.67 5.8.67 12.06c0 2 .52 3.96 1.52 5.68L.57 23.65l6.04-1.58a11.3 11.3 0 0 0 5.42 1.38h.01c6.26 0 11.36-5.1 11.36-11.36 0-3.03-1.18-5.89-3.32-8.03z"/></svg>`;
const esc = t => String(t ?? "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

const u = new URLSearchParams(location.search);
const estado = u.get("collection_status") || u.get("status") || "";
let ultimo = null;
try { ultimo = JSON.parse(localStorage.getItem("dm_ultimo_pedido") || "null"); } catch { }
const limpio = x => (x && x !== "null" ? x : "");
const ref = limpio(u.get("external_reference")) || limpio(u.get("ref"));
const datos = ultimo && ultimo.ref === ref ? ultimo : null;

const aprobado = estado === "approved";
const pendienteMP = ["pending", "in_process"].includes(estado);
const fallo = !aprobado && !pendienteMP;

if (aprobado && datos) { try { localStorage.removeItem("dm_cart"); } catch { } }

function rutaMapa() {
  const q = (String(NEGOCIO.mapa || "").split("q=")[1] || "").split("&")[0];
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${q}` : NEGOCIO.mapa;
}

/* El link de regreso de Mercado Pago lo puede escribir cualquiera, así que la
   página solo dice "recibimos tu pago" si la venta ya existe en la base. */
let confirmado = false;
let vuelta = 0;

async function confirmar(user) {
  const mia = ++vuelta;
  if (!user || !user.uid || !ref || fallo) return;
  for (let i = 0; i < 6 && !confirmado; i++) {
    const ventas = await db.misCompras(user.uid).catch(() => []);
    if (mia !== vuelta) return;
    confirmado = ventas.some(v => (v.folio === ref || v.ref === ref) && ["pagada", "entregada"].includes(v.estado));
    if (confirmado) { pintar(user); return; }
    await new Promise(r => setTimeout(r, 3000));
  }
}

function pintar(user) {
  const cont = $("#pedido");
  if (!cont) return;
  const enRevision = !confirmado;

  if (!ref || fallo) {
    cont.innerHTML = `
      <div class="pd-caja">
        <div class="pd-icono pd-icono--mal">✕</div>
        <h1 class="pd-titulo">${ref ? "No se completó el pago" : "No encontramos tu pedido"}</h1>
        <p class="pd-sub">${ref
          ? "No se te cobró nada. Tu carrito sigue guardado para que lo intentes otra vez."
          : "Si ya pagaste y no ves tu número de pedido, llámanos y te ayudamos."}</p>
        <div class="pd-acciones">
          <a class="btn-cta" href="futbol.html">Volver a la tienda</a>
          <a class="pd-btn" href="tel:+52${NEGOCIO.telefono.replace(/\D/g, "")}">Llamar al ${esc(NEGOCIO.telefono)}</a>
        </div>
      </div>`;
    return;
  }

  const tienda = !!datos && datos.entrega !== "domicilio";
  const entregaTxt = datos ? (tienda ? "Recoges en tienda" : "Envío a domicilio") : "";
  const invitado = datos ? datos.invitado : !user;
  const productos = (datos?.productos || []).map(p => `
    <li><b>${esc(p.title)}</b><span>${p.qty > 1 ? `${p.qty} piezas · ` : ""}${p.talla ? `Talla ${esc(p.talla)}` : ""}</span></li>`).join("");
  let cat = [];
  try { cat = JSON.parse(localStorage.getItem("dm_catalogo_v1") || "[]"); } catch { }
  const fotoDe = p => {
    if (p.img) return p.img;
    const im = (Array.isArray(cat) ? cat.find(x => x.id === p.id) : null)?.imagen || "";
    return /^data:/.test(im) ? "" : im;
  };
  const filas = (datos?.productos || []).map(p => ({ ...p, img: fotoDe(p) })).map(p => `
    <div class="pd-mini__fila">
      ${p.img ? `<img class="pd-mini__foto" src="${esc(p.img)}" alt="" loading="lazy">` : `<span class="pd-mini__foto pd-mini__foto--vacia">👕</span>`}
      <span><b>${p.qty > 1 ? p.qty + "x " : ""}${esc(p.title).replace(/(\d{4}-\d{2,4})/g, '<span class="pd-nw">$1</span>')}</b>${p.talla ? `<small>Talla ${esc(p.talla)}</small>` : ""}</span>
    </div>`).join("");

  if (aprobado && (datos || confirmado)) cont.innerHTML = `
    <div class="pd-caja pd-caja--ok">
      <h1 class="pd-ok"><span class="pd-ok__i">✓</span>Compra completada</h1>

      <div class="pd-info">
        <div class="pd-info__folio">
          <span><span class="pd-info__k">Número de pedido</span><b class="pd-info__ref">${esc(ref)}</b></span>
          <button class="pd-folio__cp" id="pdCopiar" type="button">Copiar</button>
        </div>
        ${filas}
        ${entregaTxt || !invitado ? `<div class="pd-info__entrega">
          <span>${entregaTxt}</span>
          ${invitado ? "" : `<a class="pd-info__seguir" href="cuenta.html">Seguir mi pedido →</a>`}
        </div>` : ""}
      </div>

      <div class="pd-wa">${ICONO_WA}<span>Te vamos a mandar un WhatsApp con toda la info de tu pedido.</span></div>

      <div class="pd-acciones">
        ${tienda ? `<a class="btn-cta" href="${rutaMapa()}" target="_blank" rel="noopener">📍 Cómo llegar a la tienda</a>` : ""}
        <a class="pd-btn" href="futbol.html">Seguir viendo jerseys</a>
      </div>

      ${invitado ? `<p class="pd-final">Guarda tu número de pedido <b class="pd-nw">${esc(ref)}</b>: solo lo vas a tener aquí y en el mensaje de WhatsApp.</p>` : ""}
    </div>`;
  else cont.innerHTML = `
    <div class="pd-caja">
      <div class="pd-icono ${enRevision ? "pd-icono--espera" : ""}">${enRevision ? "⏳" : "✓"}</div>
      <h1 class="pd-titulo">${enRevision ? "Tu pago está en revisión" : "¡Listo, recibimos tu pago!"}</h1>
      <p class="pd-sub">${enRevision
        ? (aprobado ? "Estamos confirmando tu pago con Mercado Pago. Si ya pagaste, en unos minutos aparece en tu cuenta." : "Mercado Pago nos avisa en cuanto se acredite. Tu jersey ya está apartado.")
        : tienda ? "Tu jersey ya está apartado. Te esperamos en la tienda." : "Ya estamos preparando tu envío."}</p>

      <div class="pd-folio">
        <span class="pd-folio__k">Tu número de pedido</span>
        <b class="pd-folio__v">${esc(ref)}</b>
        <button class="pd-folio__cp" id="pdCopiar" type="button">Copiar</button>
      </div>

      ${invitado
        ? `<p class="pd-aviso"><b>Guarda este número.</b> Cópialo o tómale captura: como compraste sin cuenta, no lo vas a poder ver después en la página. Si tienes cualquier duda, llámanos y dinos tu número de pedido.</p>`
        : `<p class="pd-nota">Puedes seguir tu pedido paso a paso en tu cuenta.</p>`}

      ${productos ? `<ul class="pd-lista">${productos}</ul>` : ""}

      ${entregaTxt ? `<div class="pd-entrega">
        <span class="pd-entrega__k">${entregaTxt}</span>
        <span class="pd-entrega__v">${tienda
          ? `Tel. ${esc(NEGOCIO.telefono)}${NEGOCIO.telefono2 ? ` · ${esc(NEGOCIO.telefono2)}` : ""}`
          : "Te avisamos cuando salga."}</span>
      </div>` : ""}

      <div class="pd-acciones">
        ${tienda ? `<a class="btn-cta" href="${rutaMapa()}" target="_blank" rel="noopener">📍 Cómo llegar a la tienda</a>` : ""}
        ${invitado ? "" : `<a class="pd-btn" href="cuenta.html">Ver mis pedidos</a>`}
        <a class="pd-btn" href="futbol.html">Seguir viendo jerseys</a>
      </div>
    </div>`;

  $("#pdCopiar").onclick = async () => {
    try {
      await navigator.clipboard.writeText(ref);
      $("#pdCopiar").textContent = "¡Copiado!";
      setTimeout(() => { const b = $("#pdCopiar"); if (b) b.textContent = "Copiar"; }, 1600);
    } catch { }
  };
}

pintar(db.usuarioAhora?.() || null);
db.onAuth(user => { confirmado = false; pintar(user); confirmar(user); });
