/* Lo que la gente pide y todavía no hay.
   Vive en las páginas de "Próximamente" y dentro del asistente.
   Escribe directo a Firestore: la regla deja crear a cualquiera pero solo el
   dueño puede leer, y ahí mismo se valida el tope de 200 caracteres. */

import { firebaseConfig } from "./config.js?v=76";

const PROJ = firebaseConfig.projectId;
const KEY = firebaseConfig.apiKey;
const URL = `https://firestore.googleapis.com/v1/projects/${PROJ}/databases/(default)/documents/sugerencias?key=${KEY}`;

const LS_ENVIOS = "dm_sug_envios";
const LIMITE = 3;              // por persona
const VENTANA = 10 * 60 * 1000; // cada 10 minutos

/* Freno del lado del navegador para que nadie mande veinte seguidas por juego.
   No es seguridad de verdad (eso vive en la regla de Firestore), es cortesía. */
function puedeMandar() {
  try {
    const previos = JSON.parse(localStorage.getItem(LS_ENVIOS) || "[]")
      .filter(t => Date.now() - t < VENTANA);
    localStorage.setItem(LS_ENVIOS, JSON.stringify(previos));
    return previos.length < LIMITE;
  } catch { return true; }
}

function anotarEnvio() {
  try {
    const previos = JSON.parse(localStorage.getItem(LS_ENVIOS) || "[]").filter(t => Date.now() - t < VENTANA);
    previos.push(Date.now());
    localStorage.setItem(LS_ENVIOS, JSON.stringify(previos));
  } catch { }
}

export async function mandarSugerencia({ texto, nombre = "", tel = "", deporte = "" }) {
  const limpio = String(texto || "").trim().slice(0, 200);
  if (limpio.length < 3) throw new Error("corto");
  if (!puedeMandar()) throw new Error("muchos");
  /* solo los dígitos: la gente lo escribe con espacios, guiones y paréntesis */
  const soloNum = String(tel || "").replace(/\D/g, "").slice(0, 15);

  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        texto: { stringValue: limpio },
        nombre: { stringValue: String(nombre || "").trim().slice(0, 60) },
        tel: { stringValue: soloNum },
        deporte: { stringValue: String(deporte || "") },
        fecha: { stringValue: new Date().toISOString() },
        atendida: { booleanValue: false }
      }
    })
  });
  if (!r.ok) throw new Error("firestore");
  anotarEnvio();
  return true;
}

/* Conecta cualquier formulario que tenga la forma de arriba. Se usa igual en las
   páginas de Próximamente y en la tarjeta que pinta el asistente. */
export function conectarFormulario(form) {
  if (!form || form.dataset.listo) return;
  form.dataset.listo = "1";
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const msg = form.querySelector(".sug__msg");
    const texto = form.querySelector("[name=texto]")?.value || "";
    const nombre = form.querySelector("[name=nombre]")?.value || "";
    const tel = form.querySelector("[name=tel]")?.value || "";
    msg.className = "sug__msg";
    if (texto.trim().length < 3) { msg.textContent = "Escribe qué jersey te gustaría."; msg.classList.add("sug__msg--mal"); return; }
    /* el teléfono es opcional, pero si lo ponen tiene que estar completo:
       un número a medias no sirve para avisarle y le hace perder el tiempo al dueño */
    const soloNum = tel.replace(/\D/g, "");
    if (soloNum && soloNum.length < 10) { msg.textContent = "Ese WhatsApp está incompleto. Son 10 dígitos, o déjalo vacío."; msg.classList.add("sug__msg--mal"); return; }
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      await mandarSugerencia({ texto, nombre, tel, deporte: form.dataset.deporte || "" });
      form.querySelector(".sug__campos")?.remove();
      msg.innerHTML = soloNum
        ? "¡Gracias! Ya quedó anotado.<br><span>Si lo conseguimos, te escribimos por WhatsApp.</span>"
        : "¡Gracias! Ya quedó anotado.<br><span>Si lo conseguimos, lo verás aquí pronto.</span>";
      msg.classList.add("sug__msg--bien");
      btn.remove();
      form.querySelectorAll(".sug__in, .sug__lb").forEach(el => el.remove());
    } catch (err) {
      const m = String(err.message);
      msg.textContent = m === "muchos"
        ? "Ya mandaste varias seguidas. Inténtalo en un rato."
        : "No se pudo enviar. Revisa tu internet e inténtalo otra vez.";
      msg.classList.add("sug__msg--mal");
      btn.disabled = false; btn.textContent = "Enviar";
    }
  });
}

/* HTML de la tarjeta que el asistente pinta dentro del chat */
export function tarjetaSugerenciaHTML(deporte) {
  /* En basket y americano no hay catálogo todavía; en futbol sí lo hay pero puede
     faltar ese jersey en concreto. El texto tiene que decir cada cosa. */
  const AYUDA = {
    basket: "Todavía no tenemos jerseys de basketball. Dinos cuál buscas y lo tomamos en cuenta.",
    americano: "Todavía no tenemos jerseys de futbol americano. Dinos cuál buscas y lo tomamos en cuenta."
  }[deporte] || "Ese no lo tenemos ahorita. Dinos cuál te gustaría y lo tomamos en cuenta para el próximo surtido.";
  const EJ = {
    basket: "Ej. jersey Lakers de Kobe",
    americano: "Ej. playera Chiefs 2010"
  }[deporte] || "Ej. jersey del Cruz Azul 2024";
  return `<form class="sug sug--chat" data-deporte="${deporte}" autocomplete="off">
    <b class="sug__t">¿Cuál jersey te gustaría que trajéramos?</b>
    <p class="sug__ayuda">${AYUDA}</p>
    <input class="sug__in" name="texto" maxlength="200" placeholder="${EJ}" required>
    <input class="sug__in" name="nombre" maxlength="60" placeholder="Tu nombre (opcional)">
    <input class="sug__in" name="tel" inputmode="tel" maxlength="20" placeholder="Tu WhatsApp (opcional, para avisarte)">
    <button class="btn sug__btn" type="submit">Enviar</button>
    <p class="sug__msg" role="status"></p>
  </form>`;
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("form.sug").forEach(conectarFormulario);
});
if (document.readyState !== "loading") document.querySelectorAll("form.sug").forEach(conectarFormulario);
