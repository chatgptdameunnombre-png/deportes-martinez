import { db } from "./db.js?v=76";

const OWNER_EMAILS = ["admindeportesmartinez@gmail.com"];
const esDueno = u => !!u && OWNER_EMAILS.includes((u.email || "").toLowerCase());

const $ = s => document.querySelector(s);
let user = null;

function set(id, v) { const e = $("#" + id); if (e && v != null) e.value = v; }
function val(id) { return ($("#" + id).value || "").trim(); }

function render() {
  $("#cuentaOut").style.display = user ? "none" : "";
  $("#cuentaIn").style.display = user ? "" : "none";
  if (user) $("#cuentaEmail").textContent = user.email;
  const panelBtn = $("#cuentaPanel");
  if (panelBtn) panelBtn.style.display = esDueno(user) ? "" : "none";
}

async function loadPerfil(uid) {
  try {
    const p = await db.getPerfil(uid);
    if (!p) return;
    set("fNombre", p.nombre); set("fTel", p.telefono); set("fCalle", p.calle);
    set("fCol", p.colonia); set("fCP", p.cp); set("fCiudad", p.ciudad);
    set("fEstado", p.estado); set("fRef", p.referencias);
    pistaDatos(p);
  } catch (_) {}
}

function pistaDatos(p) {
  const el = document.getElementById("mcPista");
  if (!el) return;
  const listo = p && p.nombre && p.telefono && p.calle;
  el.textContent = listo ? "ya los tienes guardados" : "te faltan datos";
  el.style.color = listo ? "#8a8a92" : "#f7d154";
}

function asentar(u) {
  if (user && u && user.uid === u.uid) return;
  user = u;
  render();
  if (u) { loadPerfil(u.uid); pintarCompras(u.uid); }
}

db.onAuth(u => asentar(u));

/* Igual que en auth.js: en Safari el aviso de Firebase puede no llegar, así que
   se revisa un par de veces si ya hay sesión puesta. */
let intentos = 0;
const revisar = setInterval(() => {
  intentos++;
  const u = db.usuarioAhora?.();
  if (u && !user) asentar(u);
  if (intentos >= 6 || (u && user)) clearInterval(revisar);
}, 700);

/* ---------- mis pedidos ---------- */
const PASOS = {
  por_cobrar: { n: 1, txt: "Falta tu pago", color: "#f7d154", nota: "Ya te apartamos el jersey. En cuanto recibamos el pago te lo confirmamos." },
  pagada: { n: 2, txt: "Pagado", color: "#4f8fd6", nota: "" },
  entregada: { n: 3, txt: "Listo", color: "#b9b9c2", nota: "" },
  cancelada: { n: 0, txt: "Cancelado", color: "#ff9b9b", nota: "Este pedido se canceló. Si fue un error, escríbenos." }
};

function cuando(iso) {
  const d = new Date(iso || 0);
  if (!d.getTime()) return "";
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
}

const dinero = n => "$" + Number(n || 0).toLocaleString("es-MX");

/* Los tres pasos del pedido, con el actual marcado. Se entiende de un vistazo
   sin leer nada: 1 pagar, 2 preparar, 3 recibir. */
function barraPasos(v) {
  if (v.estado === "cancelada") return "";
  const paso = (PASOS[v.estado] || PASOS.pagada).n;
  const nombres = ["Pagar", v.entrega === "domicilio" ? "Enviar" : "Apartar", v.entrega === "domicilio" ? "Recibir" : "Recoger"];
  return `<div class="mc-pasos">${nombres.map((t, i) => {
    const n = i + 1;
    const cls = n < paso ? "hecho" : (n === paso ? "ahora" : "");
    return `<div class="mc-paso ${cls}"><span class="mc-paso__bola">${n < paso ? "✓" : n}</span><span>${t}</span></div>`;
  }).join("")}</div>`;
}

function notaDe(v) {
  const p = PASOS[v.estado] || {};
  if (p.nota) return p.nota;
  if (v.estado === "pagada") {
    return v.entrega === "domicilio"
      ? "Ya recibimos tu pago. Estamos preparando tu envío."
      : "Ya recibimos tu pago. Tu jersey está apartado, pasa por él cuando quieras.";
  }
  if (v.estado === "entregada") {
    return v.entrega === "domicilio" ? "Tu pedido se envió. ¡Gracias por tu compra!" : "Ya lo recogiste. ¡Gracias por tu compra!";
  }
  return "";
}

async function pintarCompras(uid) {
  const cont = document.getElementById("misCompras");
  if (!cont) return;
  try {
    const compras = await db.misCompras(uid);
    if (!compras.length) {
      cont.innerHTML = `<div class="mc-vacio">
        <b>Todavía no has pedido nada</b>
        <p>Cuando hagas tu primer pedido, aquí lo vas a poder seguir paso a paso.</p>
        <a href="futbol.html" class="btn-cta" style="display:inline-block;margin-top:4px">Ver jerseys</a>
      </div>`;
      return;
    }
    const prods = await db.productosParaFoto?.().catch(() => []) || [];
    const foto = id => {
      const p = prods.find(x => x.id === id);
      return p && p.imagen ? `<img class="mc-foto" src="${p.imagen}" alt="">` : `<div class="mc-foto mc-foto--vacia"></div>`;
    };
    cont.innerHTML = compras.map(v => {
      const e = PASOS[v.estado] || PASOS.pagada;
      let lineas = [];
      try { lineas = JSON.parse(v.lineas || "[]"); } catch { }
      const jerseys = lineas.length
        ? lineas.map(l => `<div class="mc-jersey">
            ${foto(l.id)}
            <div>
              <b>${l.nombre || l.id}</b>
              <div class="mc-tags">
                ${l.qty > 1 ? `<span class="mc-tag">${l.qty} piezas</span>` : ""}
                ${l.talla ? `<span class="mc-tag">Talla ${l.talla}</span>` : ""}
                ${l.perso ? `<span class="mc-tag mc-tag--oro">${l.perso}</span>` : ""}
              </div>
            </div>
          </div>`).join("")
        : `<div class="mc-jersey"><div><b>${v.productos || ""}</b></div></div>`;
      const nota = notaDe(v);
      return `<article class="mc-card">
        <header class="mc-card__top">
          <span class="mc-estado" style="color:${e.color};border-color:${e.color}44;background:${e.color}14">${e.txt}</span>
          <span class="mc-fecha">${cuando(v.fechaISO) || v.fecha || ""}</span>
          ${v.prueba ? `<span class="mc-tag">prueba</span>` : ""}
        </header>
        ${jerseys}
        ${barraPasos(v)}
        ${nota ? `<p class="mc-nota">${nota}</p>` : ""}
        <div class="mc-folio">
          <span class="mc-folio__k">Número de pedido</span>
          <b class="mc-folio__v">${v.folio || v.id}</b>
          <button class="mc-folio__cp" data-folio="${v.folio || v.id}">Copiar</button>
        </div>
        <footer class="mc-card__pie">
          <span>${v.entrega === "domicilio" ? "Envío a domicilio" : "Recoges en tienda"}</span>
          <b>${dinero(v.total)}</b>
        </footer>
      </article>`;
    }).join("");
  } catch (e) {
    cont.innerHTML = `<p class="mc-vacio">No se pudieron cargar tus pedidos. Recarga la página.</p>`;
  }
}

$("#cuentaEntrar")?.addEventListener("click", () => document.getElementById("authBtn")?.click());

$("#cuentaGuardar")?.addEventListener("click", async () => {
  if (!user) return;
  const data = {
    nombre: val("fNombre"), telefono: val("fTel"), calle: val("fCalle"),
    colonia: val("fCol"), cp: val("fCP"), ciudad: val("fCiudad"), estado: val("fEstado"),
    referencias: val("fRef"), email: user.email, actualizado: new Date().toISOString()
  };
  const btn = $("#cuentaGuardar"); btn.disabled = true; const o = btn.textContent; btn.textContent = "Guardando…";
  const msg = $("#cuentaMsg"); msg.textContent = ""; msg.style.color = "#e8b923";
  try {
    await db.guardarPerfil(user.uid, data);
    msg.textContent = "✓ Datos guardados.";
  } catch (err) {
    msg.style.color = "#ff6b6b";
    msg.textContent = (err?.code || "").includes("permission")
      ? "No se pudo guardar (permisos de Firestore). Avísale a soporte."
      : "No se pudo guardar. Intenta de nuevo.";
  }
  btn.disabled = false; btn.textContent = o;
});

$("#cuentaSalir")?.addEventListener("click", async () => { await db.logout(); });

/* copiar el número de pedido para mandarlo por WhatsApp */
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-folio]");
  if (!b) return;
  try {
    await navigator.clipboard.writeText(b.dataset.folio);
    const antes = b.textContent;
    b.textContent = "¡Copiado!";
    setTimeout(() => { b.textContent = antes; }, 1600);
  } catch { }
});
