/* Ojo para ver la contraseña y límite amistoso de intentos, para todos los logins
   de la tienda (modal de clientes, admin.html y prueba-venta.html).
   El límite es por correo y por navegador: después de 5 fallos seguidos pide
   esperar 1 min, luego 2, 4… hasta 15. Los fallos se olvidan tras 1 hora sin
   intentos. Firebase además frena los abusos en su servidor. */

const LLAVE = "dm_intentos";
const OLVIDO_MS = 60 * 60000;

const OJO_ABIERTO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const OJO_TACHADO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.9 9.9 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

const lee = () => { try { return JSON.parse(localStorage.getItem(LLAVE) || "{}") || {}; } catch { return {}; } };
const guarda = v => { try { localStorage.setItem(LLAVE, JSON.stringify(v)); } catch { } };
const clave = correo => String(correo || "").trim().toLowerCase() || "_";

function registro(correo) {
  const todo = lee();
  const r = todo[clave(correo)];
  if (!r || typeof r !== "object" || Date.now() - (r.ultimo || 0) > OLVIDO_MS) return { n: 0, hasta: 0, ultimo: 0 };
  return r;
}

export function esperaRestante(correo) {
  const s = Math.ceil(((registro(correo).hasta || 0) - Date.now()) / 1000);
  return s > 0 ? s : 0;
}

export function anotaFallo(correo, codigo = "") {
  const todo = lee();
  const r = registro(correo);
  const n = r.n + 1;
  let hasta = n >= 5 ? Date.now() + Math.min(15, 2 ** (n - 5)) * 60000 : 0;
  if (String(codigo).includes("too-many-requests")) hasta = Math.max(hasta, Date.now() + 60000);
  todo[clave(correo)] = { n, hasta, ultimo: Date.now() };
  guarda(todo);
}

export function limpiaFallos(correo) {
  const todo = lee();
  delete todo[clave(correo)];
  guarda(todo);
}

export const esFalloDeClave = codigo => /invalid-credential|wrong-password|user-not-found|too-many-requests/.test(String(codigo || ""));

export const textoEspera = s => s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`;

export function ponOjo(input) {
  if (!input || input.dataset.ojo) return;
  input.dataset.ojo = "1";
  const caja = document.createElement("span");
  caja.style.cssText = "position:relative;display:block";
  input.parentNode.insertBefore(caja, input);
  caja.appendChild(input);
  input.style.paddingRight = "50px";
  input.style.width = "100%";
  input.style.boxSizing = "border-box";
  const b = document.createElement("button");
  b.type = "button";
  b.setAttribute("aria-pressed", "false");
  b.setAttribute("aria-label", "Mostrar contraseña");
  b.innerHTML = OJO_TACHADO;
  b.style.cssText = "position:absolute;top:50%;right:6px;transform:translateY(-50%);width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:none;border-radius:9px;background:transparent;color:#9a9aa2;cursor:pointer;padding:0;-webkit-tap-highlight-color:transparent";
  b.addEventListener("mousedown", e => e.preventDefault());
  b.addEventListener("click", () => {
    const ver = input.type === "password";
    input.type = ver ? "text" : "password";
    b.innerHTML = ver ? OJO_ABIERTO : OJO_TACHADO;
    b.style.color = ver ? "var(--accent,#e8b923)" : "#9a9aa2";
    b.setAttribute("aria-pressed", ver ? "true" : "false");
    b.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña");
  });
  caja.appendChild(b);
}
