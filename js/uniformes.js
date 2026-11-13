import { db } from "./db.js?v=126";
import { UNIFORMES_WEBHOOK, WHATSAPP_NUMERO } from "./config.js?v=126";
import { track } from "./track.js?v=126";

const $ = s => document.querySelector(s);
const form = $("#uniForm");
if (form) {
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("#uniGo");
    const msg = $("#uniMsg");
    const datos = {
      nombre: $("#uniNombre").value.trim(),
      telefono: $("#uniTel").value.trim(),
      equipo: $("#uniEquipo").value.trim(),
      cantidad: $("#uniCantidad").value.trim(),
      deporte: $("#uniDeporte").value,
      notas: $("#uniNotas").value.trim()
    };
    if (!datos.nombre || !datos.telefono) {
      msg.style.color = "#ff6b6b";
      msg.textContent = "Necesitamos tu nombre y tu teléfono.";
      return;
    }
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Enviando…";
    msg.style.color = "var(--accent)";
    msg.textContent = "";

    let guardado = false;
    try { await db.solicitarUniformes(datos); guardado = true; } catch { }
    try {
      await fetch(UNIFORMES_WEBHOOK, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos)
      });
    } catch { }

    track("cotizacion_uniformes", { deporte: datos.deporte, cantidad: datos.cantidad });

    if (guardado) {
      msg.textContent = "¡Listo! Te contactamos por WhatsApp con tu cotización.";
      form.reset();
    } else {
      const txt = encodeURIComponent(
        `Hola, quiero cotizar uniformes.\nNombre: ${datos.nombre}\nEquipo: ${datos.equipo || "-"}\nCantidad: ${datos.cantidad || "-"}\nDeporte: ${datos.deporte}\n${datos.notas || ""}`
      );
      msg.innerHTML = `No se pudo enviar. <a href="https://wa.me/${WHATSAPP_NUMERO}?text=${txt}" target="_blank" rel="noopener" style="text-decoration:underline">Mándalo por WhatsApp</a>.`;
    }
    btn.disabled = false;
    btn.textContent = original;
  });
}
