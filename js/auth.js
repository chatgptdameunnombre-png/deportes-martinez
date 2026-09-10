import { db } from "./db.js?v=76";

const OWNER_EMAILS = ["admindeportesmartinez@gmail.com"];
const esDueno = u => !!u && OWNER_EMAILS.includes((u.email || "").toLowerCase());
let currentUser = null;

const el = (s, r = document) => r.querySelector(s);

function injectStyles() {
  if (document.getElementById("authCss")) return;
  const st = document.createElement("style");
  st.id = "authCss";
  st.textContent = `
  #authBtn{display:inline-flex;align-items:center;gap:7px;margin-left:24px;padding:8px 14px;border:1px solid #2f2f36;border-radius:999px;background:#17171b;color:#f4f4f5;font-family:var(--mono,monospace);font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;white-space:nowrap;transition:border-color .2s,color .2s}
  #authBtn:hover{border-color:var(--accent,#e8b923);color:var(--accent,#e8b923)}
  #authBtn svg{width:15px;height:15px}
  #navHam{display:none;align-items:center;justify-content:center;margin-left:auto;width:44px;height:40px;border:1px solid #2f2f36;border-radius:10px;background:#17171b;cursor:pointer;color:#f4f4f5;padding:0}
  #navHam span,#navHam span::before,#navHam span::after{display:block;width:18px;height:2px;background:currentColor;border-radius:2px}
  #navHam span{position:relative}
  #navHam span::before,#navHam span::after{content:"";position:absolute;left:0}
  #navHam span::before{top:-6px}#navHam span::after{top:6px}
  #navMenuOv{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;opacity:0;pointer-events:none;transition:opacity .25s}
  #navMenuOv.open{opacity:1;pointer-events:auto}
  #navMenu{position:fixed;top:0;right:0;bottom:0;width:80%;max-width:320px;background:#141416;border-left:1px solid #26262c;z-index:10001;transform:translateX(100%);transition:transform .25s ease;display:flex;flex-direction:column;padding:18px 20px}
  #navMenu.open{transform:none}
  #navMenu .nav-close{align-self:flex-end;font-size:26px;line-height:1;color:#9a9aa2;background:none;border:none;cursor:pointer;margin-bottom:4px}
  #navMenu a,#navMenu button.nav-item{display:block;width:100%;text-align:left;padding:15px 2px;color:#f4f4f5;font-family:var(--mono,monospace);font-size:14px;letter-spacing:.06em;text-transform:uppercase;border:none;background:none;border-bottom:1px solid #1e1e22;cursor:pointer}
  #navMenu a:active,#navMenu a:hover,#navMenu button.nav-item:hover{color:var(--accent,#e8b923)}
  #navMenu .nav-acc{margin-top:auto;border-top:1px solid #26262c;padding-top:8px}
  #navMenu .nav-acc .nav-item{color:var(--accent,#e8b923);font-weight:700}
  @media(max-width:720px){#authBtn{display:none}#navHam{display:inline-flex}}
  #authOv{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px}
  #authCard{background:#141416;border:1px solid #26262c;border-radius:18px;max-width:400px;width:100%;padding:26px;font-family:inherit;color:#f4f4f5;max-height:92vh;overflow:auto}
  #authCard h3{margin:0;font-size:20px;font-weight:800}
  .authTabs{display:flex;gap:6px;background:#0e0e11;border:1px solid #26262c;border-radius:12px;padding:4px;margin:16px 0 18px}
  .authTab{flex:1;padding:9px;border:none;border-radius:9px;background:none;color:#9a9aa2;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
  .authTab.on{background:linear-gradient(180deg,#f7d154,#c9911f);color:#1a1405}
  .authInp{width:100%;padding:12px 14px;border-radius:11px;border:1px solid #2a2a30;background:#0e0e11;color:#f4f4f5;font-size:16px;outline:none;box-sizing:border-box;margin-bottom:10px}
  .authInp:focus{border-color:var(--accent,#e8b923)}
  .authGo{width:100%;background:linear-gradient(180deg,#f7d154,#c9911f);color:#1a1405;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:15px;cursor:pointer;letter-spacing:.3px}
  .authGo:disabled{opacity:.6;cursor:default}
  .authErr{color:#ff6b6b;font-size:12.5px;min-height:16px;margin:2px 0 8px}
  .authMsg{color:#e8b923;font-size:12.5px;min-height:16px;margin:2px 0 8px}
  .authLink{background:none;border:none;color:#9a9aa2;font-size:12.5px;cursor:pointer;text-decoration:underline;padding:0;font-family:inherit}
  .authFoot{text-align:center;margin-top:14px}`;
  document.head.appendChild(st);
}

function icon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>`;
}

function nombreCorto(u) {
  const base = (u.nombre || u.email || "").trim();
  const first = base.split(/[@\s]/)[0] || "cuenta";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function injectButton() {
  const host = el(".hdr__in");
  if (!host || document.getElementById("authBtn")) return;
  const b = document.createElement("button");
  b.id = "authBtn";
  b.type = "button";
  host.appendChild(b);
  b.addEventListener("click", () => {
    if (!currentUser) { openModal("login"); return; }
    window.location.href = "cuenta.html";
  });
  updateButton();
}

function updateButton() {
  const b = document.getElementById("authBtn");
  if (b) {
    b.innerHTML = currentUser
      ? `${icon()}<span class="authLbl">Mi cuenta</span>`
      : `${icon()}<span class="authLbl">Entrar</span>`;
  }
  updateMenuAuth();
}

function cerrarMenu() {
  document.getElementById("navMenuOv")?.classList.remove("open");
  document.getElementById("navMenu")?.classList.remove("open");
}

function buildNav() {
  const host = el(".hdr__in");
  if (!host || document.getElementById("navHam")) return;
  const ham = document.createElement("button");
  ham.id = "navHam"; ham.type = "button"; ham.setAttribute("aria-label", "Menú");
  ham.innerHTML = "<span></span>";
  host.appendChild(ham);

  const ov = document.createElement("div"); ov.id = "navMenuOv";
  const panel = document.createElement("aside"); panel.id = "navMenu";
  const links = Array.from(document.querySelectorAll(".hdr .nav a"))
    .map(a => `<a href="${a.getAttribute("href")}">${a.textContent.trim()}</a>`).join("");
  panel.innerHTML = `<button class="nav-close" type="button" aria-label="Cerrar">✕</button>${links}<div class="nav-acc" id="navAcc"></div>`;
  document.body.appendChild(ov);
  document.body.appendChild(panel);

  ham.addEventListener("click", () => { ov.classList.add("open"); panel.classList.add("open"); });
  ov.addEventListener("click", cerrarMenu);
  panel.querySelector(".nav-close").addEventListener("click", cerrarMenu);
  panel.querySelectorAll("a").forEach(a => a.addEventListener("click", cerrarMenu));
  updateMenuAuth();
}

function updateMenuAuth() {
  const acc = document.getElementById("navAcc");
  if (!acc) return;
  acc.innerHTML = "";
  if (!currentUser) {
    const b = document.createElement("button");
    b.className = "nav-item"; b.type = "button"; b.textContent = "Entrar / Crear cuenta";
    b.onclick = () => { cerrarMenu(); openModal("login"); };
    acc.appendChild(b);
  } else {
    const a = document.createElement("a");
    a.href = "cuenta.html"; a.className = "nav-item"; a.textContent = "Mi cuenta";
    acc.appendChild(a);
    const b = document.createElement("button");
    b.className = "nav-item"; b.type = "button"; b.textContent = "Cerrar sesión";
    b.onclick = async () => { cerrarMenu(); await db.logout(); };
    acc.appendChild(b);
  }
}

function traducirError(err) {
  const c = err?.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found"))
    return "Correo o contraseña incorrectos.";
  if (c.includes("email-already-in-use")) return "Ese correo ya tiene una cuenta. Inicia sesión.";
  if (c.includes("weak-password")) return "La contraseña debe tener al menos 6 caracteres.";
  if (c.includes("invalid-email")) return "El correo no es válido.";
  if (c.includes("too-many-requests")) return "Demasiados intentos. Espera un momento.";
  if (c.includes("unauthorized-domain")) return "Dominio no autorizado en Firebase.";
  if (c.includes("network-request-failed")) return "Sin conexión. Revisa tu internet.";
  return "No se pudo completar. Intenta de nuevo.";
}

function openModal(mode) {
  if (document.getElementById("authOv")) return;
  const ov = document.createElement("div");
  ov.id = "authOv";
  ov.innerHTML = `
    <div id="authCard">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>Tu cuenta</h3>
        <button id="authX" style="background:none;border:none;color:#9a9aa2;font-size:22px;cursor:pointer;line-height:1">✕</button>
      </div>
      <div class="authTabs">
        <button class="authTab" data-m="login">Entrar</button>
        <button class="authTab" data-m="register">Crear cuenta</button>
      </div>
      <p id="authSub" style="margin:-6px 0 14px;font-size:13px;color:#9a9aa2"></p>
      <input id="authEmail" class="authInp" type="email" placeholder="Correo" autocomplete="email"
             inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false">
      <input id="authPass" class="authInp" type="password" placeholder="Contraseña" autocomplete="current-password"
             autocapitalize="none" autocorrect="off" spellcheck="false">
      <div class="authErr" id="authErr"></div>
      <div class="authMsg" id="authMsg"></div>
      <button class="authGo" id="authGo">Entrar</button>
    </div>`;
  document.body.appendChild(ov);
  const q = s => ov.querySelector(s);
  const cerrar = () => ov.remove();
  q("#authX").onclick = cerrar;
  ov.addEventListener("click", e => { if (e.target === ov) cerrar(); });

  let m = mode;
  const setMode = nuevo => {
    m = nuevo;
    ov.querySelectorAll(".authTab").forEach(t => t.classList.toggle("on", t.dataset.m === m));
    q("#authErr").textContent = ""; q("#authMsg").textContent = "";
    q("#authPass").style.display = "";
    q("#authPass").setAttribute("autocomplete", m === "login" ? "current-password" : "new-password");
    if (m === "login") { q("#authSub").textContent = "Entra para guardar tu dirección y comprar más rápido."; q("#authGo").textContent = "Entrar"; }
    else { q("#authSub").textContent = "Crea tu cuenta con correo y contraseña."; q("#authGo").textContent = "Crear cuenta"; }
  };
  ov.querySelectorAll(".authTab").forEach(t => t.onclick = () => setMode(t.dataset.m));
  setMode(mode);

  q("#authGo").onclick = async () => {
    /* el trim de la contraseña es a propósito: en el teléfono el teclado y el
       autocompletado meten un espacio al final y la cuenta "no entra" sin decir por qué */
    const email = q("#authEmail").value.trim().toLowerCase(), pass = q("#authPass").value.trim();
    q("#authErr").textContent = ""; q("#authMsg").textContent = "";
    if (!email || !pass) { q("#authErr").textContent = "Completa correo y contraseña."; return; }
    if (m === "register" && pass.length < 6) { q("#authErr").textContent = "La contraseña necesita al menos 6 letras o números."; return; }
    const btn = q("#authGo"); btn.disabled = true; const orig = btn.textContent; btn.textContent = "Un momento…";
    try {
      let cred = null;
      if (m === "login") {
        cred = await db.login(email, pass);
      } else {
        cred = await db.registrar(email, pass);
        const uid = cred?.user?.uid;
        if (uid) { try { await db.guardarPerfil(uid, { email, creado: new Date().toISOString() }); } catch (_) {} }
      }
      /* No se espera el aviso de Firebase para pintar la interfaz.
         En Safari de iPhone ese aviso a veces tarda o no llega, y la persona se
         quedaba viendo "Iniciar sesión" aunque su cuenta ya estuviera creada. */
      aplicarUsuario(cred?.user
        ? { email: cred.user.email, uid: cred.user.uid }
        : (db.usuarioAhora?.() || { email, uid: "" }));
      cerrar();
    } catch (err) {
      q("#authErr").textContent = traducirError(err);
      btn.disabled = false; btn.textContent = orig;
    }
  };
}

function init() { injectButton(); buildNav(); }
injectStyles();
if (document.querySelector(".hdr__in")) init();
else document.addEventListener("DOMContentLoaded", init);
/* Un solo lugar donde se asienta quién está dentro: lo usa el aviso de Firebase
   y también el propio modal en cuanto el login responde. */
function aplicarUsuario(u) {
  currentUser = u;
  updateButton();
  import("./track.js?v=76").then(t => t.setCliente(u?.uid || "", u?.email || "")).catch(() => {});
}

db.onAuth(u => aplicarUsuario(u));

/* Red de seguridad para Safari: si el aviso de Firebase no llegó pero la sesión
   sí está puesta, se pinta igual. Se revisa un par de veces y se deja de insistir. */
let intentos = 0;
const revisar = setInterval(() => {
  intentos++;
  const u = db.usuarioAhora?.();
  if (u && !currentUser) aplicarUsuario(u);
  if (intentos >= 6 || (u && currentUser)) clearInterval(revisar);
}, 700);

export { currentUser };
