import { firebaseConfig, CUENTA_SISTEMA, KIKI_EMAIL } from "./config.js?v=141";

const IDT = "https://identitytoolkit.googleapis.com/v1/accounts";
const $ = s => document.querySelector(s);
let db = null, correo = "", forzada = false;

const reglas = c => ({ largo: c.length >= 8, mayus: /[A-ZÁÉÍÓÚÑ]/.test(c), num: /\d/.test(c) });

async function pedir(ruta, cuerpo) {
  const r = await fetch(`${IDT}:${ruta}?key=${firebaseConfig.apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || ruta);
  return j;
}

function abrir(obligada) {
  forzada = !!obligada;
  $(".clave-caja").classList.toggle("forzada", forzada);
  $("#claveTtl").textContent = forzada ? "Elige tu contraseña" : "Cambiar contraseña";
  $("#claveSub").textContent = forzada
    ? "Es tu primera vez en el panel. Cambia la contraseña que te dimos por una que solo tú sepas."
    : "Primero escribe la de hoy y luego la nueva.";
  $("#claveActLbl").textContent = forzada ? "Contraseña que te dimos" : "Tu contraseña de hoy";
  ["claveAct", "claveNueva", "claveOtra"].forEach(id => { $("#" + id).value = ""; });
  $("#claveErr").hidden = true;
  revisar();
  $("#claveOv").classList.add("open");
  setTimeout(() => $("#claveAct").focus(), 60);
}

function cerrar() {
  if (forzada) return;
  $("#claveOv").classList.remove("open");
}

function revisar() {
  const r = reglas($("#claveNueva").value);
  document.querySelectorAll("#claveReglas li").forEach(li => li.classList.toggle("ok", !!r[li.dataset.r]));
  $("#claveGuardar").disabled = !($("#claveAct").value && r.largo && r.mayus && r.num && $("#claveOtra").value);
}

function error(t) { $("#claveErr").textContent = t; $("#claveErr").hidden = false; }

async function guardar() {
  const act = $("#claveAct").value, nueva = $("#claveNueva").value, otra = $("#claveOtra").value;
  $("#claveErr").hidden = true;
  if (nueva !== otra) return error("Las dos contraseñas nuevas no son iguales.");
  if (nueva === act) return error("La nueva tiene que ser distinta a la de hoy.");
  if (nueva.toLowerCase().includes(correo.split("@")[0])) return error("No uses tu correo dentro de la contraseña.");
  const btn = $("#claveGuardar");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    const d = await pedir("signInWithPassword", { email: correo, password: act, returnSecureToken: true }).catch(() => { throw new Error("actual"); });
    await pedir("update", { idToken: d.idToken, password: nueva, returnSecureToken: true });
    forzada = false;
    $("#claveOv").classList.remove("open");
    const sigue = await db.login(correo, nueva).then(() => true, () => false);
    if (!sigue) {
      alert("Tu contraseña ya cambió. Entra otra vez con la nueva.");
      await db.logout().catch(() => {});
      location.replace("admin.html");
      return;
    }
    alert("Listo, ya tienes tu contraseña nueva.");
  } catch (e) {
    const m = String(e.message || "");
    if (m === "actual" || /INVALID_PASSWORD|INVALID_LOGIN/.test(m)) error("La contraseña de hoy no es correcta.");
    else if (/WEAK_PASSWORD/.test(m)) error("Esa contraseña es muy débil. Prueba otra más larga.");
    else if (/TOO_MANY/.test(m)) error("Demasiados intentos. Espera unos minutos.");
    else error("No se pudo guardar. Inténtalo otra vez.");
  }
  btn.textContent = "Guardar mi contraseña";
  revisar();
}

export async function iniciarClave(base, user) {
  db = base;
  correo = (user.email || "").toLowerCase();
  if (correo === CUENTA_SISTEMA) return;
  $("#pnavClave").hidden = false;
  $("#pnavClave").onclick = () => abrir(false);
  $("#claveCerrar").onclick = cerrar;
  $("#claveCancelar").onclick = cerrar;
  ["claveAct", "claveNueva", "claveOtra"].forEach(id => $("#" + id).addEventListener("input", revisar));
  $("#claveGuardar").onclick = guardar;
  if (correo === KIKI_EMAIL) return;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const d = await pedir("lookup", { idToken: await db.token() });
      const u = (d.users || [])[0] || {};
      const creada = +u.createdAt || 0, cambiada = +u.passwordUpdatedAt || 0;
      if (creada && Math.abs(cambiada - creada) < 60000) abrir(true);
      return;
    } catch (_) {
      await new Promise(r => setTimeout(r, 2000 * (intento + 1)));
    }
  }
}
