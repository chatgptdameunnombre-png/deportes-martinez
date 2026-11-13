import { db } from "./db.js?v=131";
import { WHATSAPP_NUMERO, BORRAR_CUENTA_WEBHOOK } from "./config.js?v=131";
import { campoTelefono, conectarTelefono, ponerTelefono, leerTelefono } from "./telefono.js?v=131";
const cajaTel = document.getElementById("fTelCaja");
if (cajaTel) { cajaTel.innerHTML = campoTelefono("fTel", "padding:12px 14px;border-radius:11px;border:1px solid #2a2a30;background:#0e0e11;color:#f4f4f5;font-size:16px;outline:none;box-sizing:border-box"); conectarTelefono(document, "fTel"); }
const escH = t => String(t ?? "").replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));
const escC = t => String(t ?? "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

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
    set("fNombre", p.nombre); ponerTelefono(document, "fTel", p.telefono || ""); set("fCalle", p.calle); set("fNac", p.nacimiento);
    set("fCol", p.colonia); set("fCP", p.cp); set("fCiudad", p.ciudad);
    set("fEstado", p.estado); set("fRef", p.referencias);
    pistaDatos(p);
    avisoNacimiento(p);
  } catch (_) {}
}

function avisoNacimiento(p) {
  const el = document.getElementById("mcFaltaNac");
  if (el) el.hidden = !!(p && p.nacimiento);
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
  por_cobrar: { txt: "Falta tu pago", color: "#f7d154", nota: "Ya te apartamos el jersey. En cuanto recibamos el pago te lo confirmamos." },
  pagada: { txt: "Pagado", color: "#4f8fd6", nota: "" },
  entregada: { txt: "Entregado", color: "#7fd18b", nota: "" },
  cancelada: { txt: "Cancelado", color: "#ff9b9b", nota: `Este pedido se canceló. Si fue un error, <a href="https://wa.me/${WHATSAPP_NUMERO}" target="_blank" rel="noopener" style="color:#e8b923;font-weight:700;text-decoration:underline">escríbenos por WhatsApp</a>.` }
};

function estadoDe(v) {
  const base = PASOS[v.estado] || PASOS.pagada;
  if (v.estado === "por_cobrar" && v.metodo && !["transferencia", "tarjeta"].includes(v.metodo)) return { ...base, txt: "Falta pagar tu ficha", nota: `Ya te apartamos el jersey. Paga tu ficha de ${String(v.metodo).toUpperCase()} antes de que venza; en cuanto Mercado Pago lo confirme te avisamos por WhatsApp.` };
  if (v.estado === "por_cobrar" && v.avisoTransferencia) return { ...base, txt: "Validando pago", nota: "Ya te apartamos el jersey. Estamos validando tu transferencia y te avisamos por WhatsApp en cuanto se confirme." };
  if (v.estado === "entregada" && v.entrega === "domicilio") return { ...base, txt: "Enviado" };
  return base;
}

function cuando(iso, conHora) {
  const d = new Date(iso || 0);
  if (!d.getTime()) return "";
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const fecha = `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
  return conHora ? `${fecha} · ${d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}` : fecha;
}

const dinero = n => "$" + Number(n || 0).toLocaleString("es-MX");

function barraPasos(v) {
  if (v.estado === "cancelada") return "";
  const casa = v.entrega === "domicilio";
  const pagoOk = v.estado !== "por_cobrar";
  const fin = v.estado === "entregada";
  const fPago = pagoOk ? (v.confirmada || v.fechaISO || "") : "";
  const pasos = casa
    ? [["Pagado", fPago], ["Apartado", fPago], ["Preparando tu envío", fPago], ["Ya lo enviamos", v.entregada || ""]]
    : [["Pagado", fPago], ["Apartado", fPago], ["Listo para recoger", fPago], ["Entregado", v.entregada || ""]];
  const hechos = [pagoOk, pagoOk, pagoOk, fin];
  const ahora = hechos.indexOf(false);
  return `<ol class="mc-pasos">${pasos.map(([t, f], i) => {
    const cls = hechos[i] ? "hecho" : (i === ahora ? "ahora" : "");
    const fecha = hechos[i] ? cuando(f, true) : (i === ahora ? (i === 0 ? (v.avisoTransferencia ? "Validando pago" : "Esperando tu pago") : (casa ? "Lo estamos preparando" : "Te esperamos")) : "Pendiente");
    return `<li class="mc-paso ${cls}"><span class="mc-paso__bola">${hechos[i] ? "✓" : i + 1}</span><span class="mc-paso__txt">${t}</span><span class="mc-paso__fecha">${fecha}</span></li>`;
  }).join("")}</ol>`;
}

function notaDe(v) {
  const p = PASOS[v.estado] || {};
  if (p.nota) return p.nota;
  const casa = v.entrega === "domicilio";
  if (v.estado === "pagada") return casa ? "Ya recibimos tu pago. Estamos preparando tu envío." : "Ya recibimos tu pago y tu jersey está listo. Pasa por él cuando quieras.";
  if (v.estado === "entregada") return casa ? "Ya enviamos tu pedido. ¡Gracias por tu compra!" : "Ya lo recogiste. ¡Gracias por tu compra!";
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
      return p && p.imagen ? `<img class="mc-foto" src="${escH(p.imagen)}" alt="">` : `<div class="mc-foto mc-foto--vacia"></div>`;
    };
    cont.innerHTML = compras.map(v => {
      const e = estadoDe(v);
      let lineas = [];
      try { lineas = JSON.parse(v.lineas || "[]"); } catch { }
      const jerseys = lineas.length
        ? lineas.map(l => `<div class="mc-jersey">
            ${foto(l.id)}
            <div>
              <b>${escC(l.nombre || l.id)}</b>
              <div class="mc-tags">
                ${l.qty > 1 ? `<span class="mc-tag">${Number(l.qty) || 1} piezas</span>` : ""}
                ${l.talla ? `<span class="mc-tag">Talla ${escC(l.talla)}</span>` : ""}
                ${l.perso ? `<span class="mc-tag mc-tag--oro">${escC(l.perso)}</span>` : ""}
              </div>
            </div>
          </div>`).join("")
        : `<div class="mc-jersey"><div><b>${escC(v.productos || "")}</b></div></div>`;
      const nota = notaDe(v);
      return `<article class="mc-card">
        <header class="mc-card__top">
          <span class="mc-estado" style="color:${e.color};border-color:${e.color}44;background:${e.color}14">${e.txt}</span>
          <span class="mc-fecha">${escC(cuando(v.fechaISO) || v.fecha || "")}</span>
          ${v.prueba ? `<span class="mc-tag">prueba</span>` : ""}
        </header>
        ${jerseys}
        ${barraPasos(v)}
        ${nota ? `<p class="mc-nota">${nota}</p>` : ""}
        <div class="mc-folio">
          <span class="mc-folio__k">Número de pedido</span>
          <b class="mc-folio__v">${escC(v.folio || v.id)}</b>
          <button class="mc-folio__cp" data-folio="${escC(v.folio || v.id)}">Copiar</button>
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
  const lt = leerTelefono(document, "fTel");
  if (!lt.ok && !lt.vacio) { const m = $("#cuentaMsg"); m.style.color = "#ff6b6b"; m.textContent = lt.error; return; }
  const data = {
    nombre: val("fNombre"), telefono: lt.valor, nacimiento: val("fNac"), calle: val("fCalle"),
    colonia: val("fCol"), cp: val("fCP"), ciudad: val("fCiudad"), estado: val("fEstado"),
    referencias: val("fRef"), email: user.email, actualizado: new Date().toISOString()
  };
  const btn = $("#cuentaGuardar"); btn.disabled = true; const o = btn.textContent; btn.textContent = "Guardando…";
  const msg = $("#cuentaMsg"); msg.textContent = ""; msg.style.color = "#e8b923";
  try {
    await db.guardarPerfil(user.uid, data);
    avisoNacimiento(data);
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

$("#cuentaBorrarDatos")?.addEventListener("click", async () => {
  if (!user) return;
  if (!confirm("¿Borrar tus datos guardados?\n\nTus pedidos no se borran. La próxima vez que compres te volvemos a pedir nombre y teléfono.")) return;
  const msg = $("#cuentaMsg"); msg.textContent = "";
  try {
    await db.borrarDatosPerfil(user.uid);
    ["fNombre", "fTel", "fCalle", "fCol", "fCP", "fCiudad", "fEstado", "fRef"].forEach(id => { const el = $("#" + id); if (el) el.value = ""; });
    pistaDatos(null);
    msg.style.color = "#e8b923"; msg.textContent = "✓ Borramos tus datos guardados.";
  } catch {
    msg.style.color = "#ff6b6b"; msg.textContent = "No se pudieron borrar. Intenta de nuevo.";
  }
});

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

/* ---------- borrar la cuenta ---------- */
const $b = id => document.getElementById(id);

$b("cuentaBorrar")?.addEventListener("click", () => {
  $b("cuentaBorrarCaja").hidden = false;
  $b("cuentaBorrar").hidden = true;
  $b("cuentaBorrarTxt").focus();
});

$b("cuentaBorrarNo")?.addEventListener("click", () => {
  $b("cuentaBorrarCaja").hidden = true;
  $b("cuentaBorrar").hidden = false;
  $b("cuentaBorrarTxt").value = "";
  $b("cuentaBorrarMsg").textContent = "";
});

$b("cuentaBorrarOk")?.addEventListener("click", async () => {
  const msg = $b("cuentaBorrarMsg");
  msg.style.color = "#ff9b9b";
  if (!user) { msg.textContent = "Entra a tu cuenta para poder borrarla."; return; }
  if ($b("cuentaBorrarTxt").value.trim().toUpperCase() !== "BORRAR") {
    msg.textContent = "Escribe BORRAR para confirmar."; return;
  }
  const btn = $b("cuentaBorrarOk");
  btn.disabled = true; btn.textContent = "Borrando…";
  msg.style.color = "#a8a8b0"; msg.textContent = "Borrando tus datos…";
  try {
    const token = await db.token();
    const r = await fetch(BORRAR_CUENTA_WEBHOOK, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token })
    }).then(x => x.json());
    if (!r || r.ok !== true) throw new Error(r?.motivo || "error");
    msg.style.color = "#7fd18b";
    msg.textContent = "Listo, borramos tu cuenta y tus datos. Te llevamos a la tienda.";
    try { await db.logout(); } catch (_) { }
    setTimeout(() => { window.location.replace("index.html"); }, 2500);
  } catch (err) {
    btn.disabled = false; btn.textContent = "Sí, borrar mi cuenta";
    msg.style.color = "#ff6b6b";
    msg.textContent = "No se pudo borrar. Vuelve a entrar a tu cuenta e intenta otra vez, o escríbenos.";
  }
});
