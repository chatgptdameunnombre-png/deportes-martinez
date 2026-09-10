/* Sección Noticias de la HOME: slider de banners (una noticia a la vez, foto grande + texto al lado). */
import { firebaseConfig } from "./config.js?v=76";

const FS = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const KEY = firebaseConfig.apiKey;

function fsVal(v) {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(v.integerValue);
  if ("booleanValue" in v) return v.booleanValue;
  return undefined;
}
function fsFields(f) { const o = {}; for (const k in f) o[k] = fsVal(f[k]); return o; }

async function runQuery(collectionId, field) {
  const q = { structuredQuery: { from: [{ collectionId }],
    where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { booleanValue: true } } } } };
  const r = await fetch(`${FS}:runQuery?key=${KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(q) });
  const data = await r.json();
  return (data || []).filter(x => x.document).map(x => ({ id: x.document.name.split("/").pop(), ...fsFields(x.document.fields) }));
}

const ANUNCIOS = [
  { img: "fotos/logo/iso-blanco.png", tipo: "Bienvenida", fit: true,
    titulo: "Nuevas llegadas cada semana",
    texto: "Jerseys retro, de temporada y ediciones especiales. Síguenos para ver lo que va entrando.",
    link: "https://www.instagram.com/_deportes_martinez_/", externo: true }
];

function bannerHTML(a, i) {
  const attrs = a.externo ? `target="_blank" rel="noopener"` : "";
  const cta = a.cta || (a.externo ? "Ver en Instagram ↗" : "Ver jersey →");
  const btn = a.link ? `<a class="bslide__btn" href="${a.link}" ${attrs}>${cta}</a>` : "";
  return `
    <div class="bslide${i === 0 ? " on" : ""}">
      <div class="bslide__img"><img src="${a.img}" alt="${a.titulo}" loading="lazy" style="${a.fit ? 'object-fit:contain;background:#0d121d' : ''}"></div>
      <div class="bslide__c">
        ${a.tipo ? `<span class="bslide__tag">${a.tipo}</span>` : ""}
        <h3>${a.titulo}</h3>
        <p>${a.texto || ""}</p>
        ${btn}
      </div>
    </div>`;
}

async function cargarEventos() {
  try {
    const evs = (await runQuery("eventos", "activo"))
      .sort((a, b) => (a.orden || 0) - (b.orden || 0))
      .map(e => ({
        img: e.imagen, tipo: e.tipo, titulo: e.titulo, texto: e.texto,
        link: e.link || "", externo: !!e.externo, fit: !!e.fit, cta: e.cta
      })).filter(a => a.img && a.titulo);
    return evs;
  } catch (e) { return []; }
}

async function cargarNoticias() {
  const cont = document.querySelector("#homeNoticias");
  if (!cont) return;
  let pre = [];
  try {
    pre = (await runQuery("productos", "destacado")).map(p => ({
      img: p.imagen, tipo: p.retro ? "Retro" : "Recién llegado", titulo: p.nombre,
      texto: [p.equipo, p.temporada].filter(Boolean).join(" · ") || "Ya disponible en la tienda.",
      link: `producto.html?id=${encodeURIComponent(p.id)}`, externo: false
    })).filter(a => a.img);
  } catch (e) {}
  const eventos = await cargarEventos();
  const base = eventos.length ? eventos : ANUNCIOS;
  const lista = [...base, ...pre];
  const dots = lista.map((_, i) => `<span class="${i === 0 ? "on" : ""}" data-go="${i}"></span>`).join("");
  const flechas = lista.length > 1
    ? `<button class="bslider__nav bslider__prev" aria-label="Anterior">‹</button>
       <button class="bslider__nav bslider__next" aria-label="Siguiente">›</button>` : "";
  cont.innerHTML = `<div class="bslider" data-i="0" data-n="${lista.length}">
      ${lista.map(bannerHTML).join("")}${flechas}
      <div class="bslider__dots">${dots}</div></div>`;
  initSlider(cont.querySelector(".bslider"));
  revelar();
}

function initSlider(sl) {
  if (!sl) return;
  const n = +sl.dataset.n;
  const slides = sl.querySelectorAll(".bslide");
  const dots = sl.querySelectorAll(".bslider__dots span");
  let timer;
  const ir = k => {
    const i = (k + n) % n;
    sl.dataset.i = i;
    slides.forEach((s, j) => s.classList.toggle("on", j === i));
    dots.forEach((d, j) => d.classList.toggle("on", j === i));
  };
  const auto = () => { clearInterval(timer); if (n > 1) timer = setInterval(() => ir(+sl.dataset.i + 1), 6000); };
  sl.querySelector(".bslider__next")?.addEventListener("click", () => { ir(+sl.dataset.i + 1); auto(); });
  sl.querySelector(".bslider__prev")?.addEventListener("click", () => { ir(+sl.dataset.i - 1); auto(); });
  dots.forEach(d => d.addEventListener("click", () => { ir(+d.dataset.go); auto(); }));
  auto();
}

let io;
function revelar() {
  io?.disconnect();
  io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12 });
  document.querySelectorAll(".reveal:not(.in)").forEach(el => io.observe(el));
}

cargarNoticias();
