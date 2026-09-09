import { db } from "./db.js?v=76";

const $ = s => document.querySelector(s);

db.onAuth(user => {
  if (user) window.location.replace("panel.html");
});

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("#loginBtn");
  btn.disabled = true; btn.textContent = "Entrando…"; $("#loginErr").textContent = "";
  try {
    await db.login($("#email").value, $("#pass").value);
    window.location.replace("panel.html");
  } catch (err) {
    $("#loginErr").textContent = traducirError(err);
    btn.disabled = false; btn.textContent = "Entrar";
  }
});

function traducirError(err) {
  const c = err?.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found"))
    return "Correo o contraseña incorrectos.";
  if (c.includes("invalid-email")) return "El correo no es válido.";
  if (c.includes("too-many-requests")) return "Demasiados intentos. Espera un momento.";
  if (c.includes("unauthorized-domain"))
    return "Este dominio no está autorizado en Firebase (Authentication → Settings → Authorized domains).";
  if (c.includes("network-request-failed")) return "Sin conexión. Revisa tu internet.";
  return (err?.message || "No se pudo entrar.") + (c ? ` (${c})` : "");
}
