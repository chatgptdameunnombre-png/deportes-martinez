/* Menú del panel. Una sección a la vez: la barra lateral queda fija en computadora
   y se esconde tras las tres rayitas en teléfono. */

const $ = s => document.querySelector(s);

const SECCIONES = {
  ventas: { sel: "#secVentas", titulo: "Ventas" },
  productos: { sel: "#secProductos", titulo: "Mis jerseys" },
  visitas: { sel: "#estad", titulo: "Estadísticas" },
  asistente: { sel: "#secAsistente", titulo: "Asistente" },
  piden: { sel: "#secPiden", titulo: "Lo que piden" },
  promos: { sel: "#secPromos", titulo: "Códigos de descuento" },
  cuentas: { sel: "#secCuentas", titulo: "Cuentas de clientes" }
};

const LS_SEC = "dm_panel_sec";
const esAncho = () => window.matchMedia("(min-width: 1000px)").matches;

export function mostrarSeccion(sec) {
  if (!SECCIONES[sec]) sec = "ventas";

  for (const [k, s] of Object.entries(SECCIONES)) {
    const el = $(s.sel);
    if (el) el.hidden = k !== sec;
  }
  document.querySelectorAll(".pnav__item").forEach(b => b.classList.toggle("on", b.dataset.sec === sec));
  const t = $("#secTitulo");
  if (t) t.textContent = SECCIONES[sec].titulo;

  try { localStorage.setItem(LS_SEC, sec); } catch { }
  if (!esAncho()) cerrarNav();
  window.scrollTo({ top: 0, behavior: "instant" });

  if (sec === "cuentas") document.dispatchEvent(new CustomEvent("panel:cuentas"));
  document.dispatchEvent(new CustomEvent("panel:seccion", { detail: { sec } }));
}

function abrirNav() {
  $("#pnav")?.classList.add("abierta");
  const f = $("#pnavFondo"); if (f) f.hidden = false;
  $("#pnavBtn")?.classList.add("on");
}

function cerrarNav() {
  $("#pnav")?.classList.remove("abierta");
  const f = $("#pnavFondo"); if (f) f.hidden = true;
  $("#pnavBtn")?.classList.remove("on");
}

function conectar() {
  $("#pnavBtn")?.addEventListener("click", () =>
    ($("#pnav")?.classList.contains("abierta") ? cerrarNav() : abrirNav()));
  $("#pnavFondo")?.addEventListener("click", cerrarNav);

  document.querySelectorAll(".pnav__item").forEach(b => {
    if (!b.dataset.sec) return;
    b.addEventListener("click", () => {
      if (b.dataset.sec === "agregar") {
        mostrarSeccion("productos");
        document.dispatchEvent(new CustomEvent("panel:nuevo"));
        return;
      }
      mostrarSeccion(b.dataset.sec);
    });
  });

  document.addEventListener("keydown", e => { if (e.key === "Escape") cerrarNav(); });
  window.addEventListener("resize", () => { if (esAncho()) cerrarNav(); });

  let guardada = "ventas";
  try { guardada = localStorage.getItem(LS_SEC) || "ventas"; } catch { }
  mostrarSeccion(guardada);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", conectar);
else conectar();
