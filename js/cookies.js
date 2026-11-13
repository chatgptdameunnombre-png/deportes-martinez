const KEY = "dm_medicion";

function guardar(v) {
  try { localStorage.setItem(KEY, v); } catch { }
}

/* Quien no quiera que se mida su visita lo puede desactivar desde los términos
   (legales.html): ahí vive el botón, el aviso de inicio solo confirma. */
export function apagarMedicion() {
  guardar("no");
  for (const k of ["dm_track_id", "dm_track_ses", "dm_track_pend"]) {
    try { localStorage.removeItem(k); } catch { }
    try { sessionStorage.removeItem(k); } catch { }
  }
  window.dispatchEvent(new Event("dm-medicion-off"));
}
export function prenderMedicion() { guardar("si"); }

export function permiteMedicion() {
  try { return localStorage.getItem(KEY) !== "no"; } catch { return true; }
}

function mostrar() {
  let elegido = null;
  try { elegido = localStorage.getItem(KEY); } catch { }
  if (elegido) return;
  const b = document.createElement("div");
  b.id = "ckBanner";
  /* sube por encima del botón del asistente, que vive en la esquina de abajo */
  b.style.cssText = "position:fixed;left:16px;right:16px;bottom:92px;z-index:9998;background:#0f0f12;border:1px solid #26262e;border-radius:16px;padding:16px 18px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;box-shadow:0 20px 50px rgba(0,0,0,.5);max-width:720px;margin:0 auto";
  b.innerHTML = `
    <p style="flex:1;min-width:240px;margin:0;font-size:13.5px;color:#c0c0c4;line-height:1.55">
      Guardamos tu carrito y medimos de forma anónima qué jerseys se ven más. Si empiezas un pedido o entras a tu cuenta, tu nombre y tu pedido quedan ligados a tu visita. Si sigues navegando, estás de acuerdo. <a href="legales.html#datos" style="color:#e8b923;text-decoration:underline;white-space:nowrap">Cómo lo usamos</a>
    </p>
    <div style="display:flex;gap:8px">
      <button id="ckSi" style="background:#e8b923;border:none;color:#1a1405;border-radius:10px;padding:10px 22px;font-weight:700;font-size:13.5px;cursor:pointer">Entendido</button>
    </div>`;
  document.body.appendChild(b);
  b.querySelector("#ckSi").onclick = () => { guardar("si"); b.remove(); vigia.disconnect(); };
  const hayModal = () => !!document.querySelector(".aviso-modal");
  const ajustar = () => { b.style.display = hayModal() ? "none" : "flex"; };
  const vigia = new MutationObserver(ajustar);
  vigia.observe(document.body, { childList: true });
  ajustar();

  /* Se queda mientras la persona esté en la página, para que alcance a leerlo.
     Solo se toma como aceptado cuando se va a otra parte del sitio (toca un
     enlace): así no le vuelve a salir en cada página. Con el scroll NO se cierra,
     porque se iba en dos segundos y nadie alcanzaba a verlo. */
  const aceptarNavegando = () => { guardar("si"); b.remove(); limpiar(); vigia.disconnect(); };
  const alClickEnlace = e => { if (e.target.closest("a[href]") && !e.target.closest(".aviso-modal") && b.style.display !== "none") aceptarNavegando(); };
  function limpiar() { document.removeEventListener("click", alClickEnlace, true); }
  document.addEventListener("click", alClickEnlace, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mostrar);
else mostrar();
