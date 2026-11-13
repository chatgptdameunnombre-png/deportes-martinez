import { catalogoRapido } from "./catalogo.js?v=128";

const caja = document.querySelector("[data-proximos]");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function tarjeta(p) {
  const url = `producto.html?id=${encodeURIComponent(p.id)}`;
  const meta = [p.equipo, p.temporada].filter(Boolean).join(" · ");
  return `
    <article class="card card--prox">
      <a class="card__media" href="${url}">
        <span class="card__cat">Próximamente</span>
        ${p.imagen ? `<img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy">` : `<span class="card__ph">📷 Foto pendiente</span>`}
      </a>
      <div class="card__body">
        <span class="card__brand">${esc(meta || p.marca)}</span>
        <h3 class="card__name">${esc(p.nombre)}</h3>
        <p class="card__desc">${esc(p.descripcion)}</p>
        <div class="card__foot">
          <div class="price">Próximamente</div>
          <span class="stock stock--prox">En camino</span>
        </div>
        <a class="add-btn" href="${url}" style="display:block;text-align:center;text-decoration:none">Ver detalles</a>
      </div>
    </article>`;
}

if (caja) {
  catalogoRapido(list => {
    const lista = list.filter(p => p.proximamente && !p.oculto && p.categoria === caja.dataset.proximos);
    caja.innerHTML = lista.map(tarjeta).join("");
    const t = document.querySelector(".proxi-gal__t");
    if (t) t.hidden = !lista.length;
  });
}
