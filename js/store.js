import { db, MODO } from "./db.js?v=76";
import { setProductos, initCart, enCarrito } from "./cart.js?v=76";
import { tieneTallas, stockTotal, precioDesde, preciosVarian, etiquetaStock, tallasDisponibles } from "./tallas.js?v=76";
import { onMayoreo, precioHTML } from "./mayoreo.js?v=76";
import { track } from "./track.js?v=76";

const $ = s => document.querySelector(s);
const CAT = document.querySelector("#catalogo")?.dataset.categoria || null;
const base = () => productos.filter(p => p.categoria === CAT);

let productos = [];
let io;
let panelListo = false;
const qs = new URLSearchParams(location.search);
let f = {
  sub: qs.get("version") || "Todas",
  liga: qs.get("liga") || "Todas",
  equipo: qs.get("equipo") || "Todos",
  temporada: "Todas",
  marca: qs.get("marca") || "Todas",
  talla: "Todas",
  orden: "rel"
};

const badge = document.createElement("div");
badge.className = "mode-badge mode-badge--" + (MODO === "nube" ? "nube" : "demo");
badge.textContent = MODO === "nube" ? "● En la nube (Firebase)" : "● Modo demo (local)";
document.body.appendChild(badge);

if (MODO === "demo") await db.seedIfEmpty();
db.onProducts(list => { productos = list; setProductos(list); render(); });
onMayoreo(() => render());

function cardHTML(p) {
  const total = stockTotal(p);
  const st = etiquetaStock(total);
  const sinStock = total <= 0;
  const sized = tieneTallas(p);
  const precioTxt = (preciosVarian(p) ? "desde " : "") + precioHTML(precioDesde(p));
  const boton = sinStock
    ? `<button class="add-btn" disabled>Agotado</button>`
    : sized
      ? `<a class="add-btn" href="producto.html?id=${encodeURIComponent(p.id)}" style="display:block;text-align:center;text-decoration:none">Elegir talla</a>`
      : (enCarrito(p.id) >= total
          ? `<button class="add-btn" disabled>Máximo en carrito</button>`
          : `<button class="add-btn" data-add="${p.id}">Agregar al carrito</button>`);
  const media = p.imagen
    ? `<img src="${p.imagen}" alt="${p.nombre}" loading="lazy" onerror="this.style.display='none';this.parentElement.querySelector('.card__ph').style.display='block'">
       <span class="card__ph" style="display:none">📷 Sin foto aún</span>`
    : `<span class="card__ph">📷 Foto pendiente</span>`;
  const flags = [
    p.retro ? `<span class="card__flag card__flag--pre">Retro</span>` : "",
    p.piezaUnica ? `<span class="card__flag card__flag--semi">Pieza única</span>` : ""
  ].join("");
  const tallas = tallasDisponibles(p);
  const tallasTxt = tallas.length ? `<div class="card__tallas">${tallas.map(t => `<span>${t}</span>`).join("")}</div>` : "";
  const meta = [p.equipo, p.temporada].filter(Boolean).join(" · ");
  return `
    <article class="card reveal" data-id="${p.id}">
      <div class="card__media">
        <span class="card__cat">${p.subcategoria || ""}</span>
        ${flags}
        ${media}
      </div>
      <div class="card__body">
        <span class="card__brand">${meta || p.marca || ""}</span>
        <h3 class="card__name">${p.nombre}</h3>
        <p class="card__desc">${p.descripcion || ""}</p>
        ${tallasTxt}
        <div class="card__foot">
          <div class="price">${precioTxt} <span>MXN</span></div>
          <span class="stock stock--${st.cls}">${st.txt}</span>
        </div>
        ${boton}
      </div>
    </article>`;
}

function grupo(lbl, key, valores, abierto) {
  if (valores.length <= 2) return "";
  const opts = valores.map(v =>
    `<span class="opt" data-f="${key}" data-v="${v}">${v}</span>`).join("");
  return `<div class="acc${abierto ? " open" : ""}" data-grp="${key}">
      <button class="acc__h" type="button"><span>${lbl}</span><span class="arr">▾</span></button>
      <div class="acc__b">${opts}</div></div>`;
}

function buildPanel() {
  const cont = $("#filtros");
  if (!cont) return;
  const d = base();
  const uniq = (k, todo) => [todo, ...[...new Set(d.map(p => p[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)))];
  const tallas = ["Todas", ...[...new Set(d.flatMap(p => tallasDisponibles(p)))]
    .sort((a, b) => ["S", "M", "L", "XL", "2XL", "3XL"].indexOf(a) - ["S", "M", "L", "XL", "2XL", "3XL"].indexOf(b))];
  cont.innerHTML = `
    <button class="filtros-btn" type="button" id="filtrosBtn">
      <span class="fico">≡</span> Filtros <span class="fcount" id="fcount"></span>
    </button>
    <div class="filtros-panel" id="filtrosPanel" hidden>
      ${grupo("Versión", "sub", uniq("subcategoria", "Todas"), true)}
      ${grupo("Liga", "liga", uniq("liga", "Todas"), false)}
      ${grupo("Equipo", "equipo", uniq("equipo", "Todos"), false)}
      ${grupo("Temporada", "temporada", uniq("temporada", "Todas"), false)}
      ${grupo("Marca", "marca", uniq("marca", "Todas"), false)}
      ${grupo("Talla", "talla", tallas, false)}
      <div class="acc" data-grp="orden">
        <button class="acc__h" type="button"><span>Orden</span><span class="arr">▾</span></button>
        <div class="acc__b">
          <span class="opt" data-f="orden" data-v="rel">Relevancia</span>
          <span class="opt" data-f="orden" data-v="precio-asc">Precio: menor a mayor</span>
          <span class="opt" data-f="orden" data-v="precio-desc">Precio: mayor a menor</span>
          <span class="opt" data-f="orden" data-v="nombre">Nombre A–Z</span>
        </div>
      </div>
    </div>`;
  panelListo = true;
  marcarSel();
}

function activos() {
  return (f.sub !== "Todas") + (f.liga !== "Todas") + (f.equipo !== "Todos") +
         (f.temporada !== "Todas") + (f.marca !== "Todas") + (f.talla !== "Todas") + (f.orden !== "rel");
}

function marcarSel() {
  document.querySelectorAll("#filtrosPanel .opt").forEach(o => {
    o.classList.toggle("sel", f[o.dataset.f] === o.dataset.v);
  });
  const n = activos();
  const c = $("#fcount"); if (c) { c.textContent = n ? n : ""; c.style.display = n ? "" : "none"; }
}

function render() {
  const gridEl = $("#grid");
  if (!CAT || !gridEl) return;
  if (!panelListo && productos.length) buildPanel();

  const lista = base().filter(p =>
    (f.sub === "Todas" || p.subcategoria === f.sub) &&
    (f.liga === "Todas" || p.liga === f.liga) &&
    (f.equipo === "Todos" || p.equipo === f.equipo) &&
    (f.temporada === "Todas" || p.temporada === f.temporada) &&
    (f.marca === "Todas" || p.marca === f.marca) &&
    (f.talla === "Todas" || tallasDisponibles(p).includes(f.talla)));

  if (f.orden === "precio-asc") lista.sort((a, b) => precioDesde(a) - precioDesde(b));
  else if (f.orden === "precio-desc") lista.sort((a, b) => precioDesde(b) - precioDesde(a));
  else if (f.orden === "nombre") lista.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

  if (!productos.length) { gridEl.innerHTML = `<p style="color:var(--muted)">Cargando…</p>`; return; }
  gridEl.innerHTML = lista.length ? lista.map(cardHTML).join("")
    : `<p style="color:var(--muted)">Nada con esos filtros. Prueba quitar alguno.</p>`;
  if (!lista.length && activos()) track("filtro_sin_resultado", { categoria: CAT, filtros: { ...f } });
  marcarSel();
  observarReveal();
}

function observarReveal() {
  io?.disconnect();
  io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12 });
  document.querySelectorAll(".reveal:not(.in)").forEach(el => io.observe(el));
}

document.addEventListener("click", e => {
  if (e.target.closest("#filtrosBtn")) {
    const panel = $("#filtrosPanel");
    const seAbre = panel?.hasAttribute("hidden");
    if (seAbre) track("filtros_abrir", { categoria: CAT });
    panel?.toggleAttribute("hidden");
    return;
  }
  const h = e.target.closest(".acc__h");
  if (h) { h.parentElement.classList.toggle("open"); return; }
  const opt = e.target.closest("#filtrosPanel .opt");
  if (opt) {
    f[opt.dataset.f] = opt.dataset.v;
    const NOMBRE_F = { sub: "versión", liga: "liga", equipo: "equipo", temporada: "temporada", marca: "marca", talla: "talla", orden: "orden" };
    track("filtro", { categoria: CAT, campo: opt.dataset.f, campoTxt: NOMBRE_F[opt.dataset.f] || opt.dataset.f, valor: opt.dataset.v });
    render();
    return;
  }
  if (!e.target.closest("#filtros")) $("#filtrosPanel")?.setAttribute("hidden", "");
  if (e.target.closest("[data-add],[data-inc],[data-dec],[data-rm]")) return;
  const card = e.target.closest("[data-id]");
  if (card) window.location.href = `producto.html?id=${encodeURIComponent(card.dataset.id)}`;
});

initCart();
observarReveal();
document.addEventListener("cart:add", render);
