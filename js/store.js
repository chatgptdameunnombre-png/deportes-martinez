import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=136";
import { setProductos, initCart, enCarrito } from "./cart.js?v=136";
import { tieneTallas, stockTotal, precioDesde, preciosVarian, etiquetaStock, tallasDisponibles, precioAntes } from "./tallas.js?v=136";
import { onMayoreo, precioHTML } from "./mayoreo.js?v=136";
import { track } from "./track.js?v=136";
import { tarjetaSugerenciaHTML, conectarFormulario } from "./sugerencias.js?v=136";
import { ESCUDOS } from "./escudos.js?v=136";
import { fotoMedia } from "./fotos.js?v=136";

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
  color: qs.get("color") || "Todos",
  orden: "rel"
};
let q = qs.get("q") || "";
let qTimer, renderTimer;

const norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();
const VACIAS = new Set(["playera", "playeras", "jersey", "jerseys", "camiseta", "camisetas", "camisa", "uniforme",
  "quiero", "busco", "buscar", "tienes", "tienen", "tiene", "hay", "venden", "de", "del", "la", "el", "los", "las",
  "un", "una", "unos", "y", "con", "para", "en", "por", "que", "me", "mi", "talla", "tallas", "version", "equipo"]);
const TALLA = { s: "S", ch: "S", chica: "S", m: "M", med: "M", mediana: "M", l: "L", g: "L", grande: "L",
  xl: "XL", xxl: "2XL", "2xl": "2XL", xxxl: "3XL", "3xl": "3XL", xxxxl: "4XL", "4xl": "4XL" };
const SINON = {
  barca: ["barcelona"], fcb: ["barcelona"], madrid: ["madrid"], merengue: ["madrid"], rm: ["madrid"],
  chivas: ["chivas", "guadalajara"], rebano: ["chivas"], guadalajara: ["chivas"], aguilas: ["america"],
  rayados: ["monterrey"], monterrey: ["monterrey"], unam: ["pumas"], maquina: ["cruz"], cementeros: ["cruz"],
  bvb: ["dortmund"], borussia: ["dortmund"], dortmund: ["dortmund"], united: ["manchester"], manu: ["manchester"],
  spurs: ["tottenham"], wolves: ["wolverhampton"], juve: ["juventus"], rossoneri: ["milan"],
  holanda: ["holanda", "paises"], netherlands: ["paises"], germany: ["alemania"], england: ["inglaterra"],
  spain: ["espana"], tri: ["mexico"], mx: ["mexico"], seleccion: ["seleccion"], miami: ["miami"],
  spiderman: ["spider"], arana: ["spider"], aranas: ["spider"], ml: ["larga"], largas: ["larga"],
  visitante: ["visita"], away: ["visita"], home: ["local"], casa: ["local"], third: ["tercera"], "3ra": ["tercera"],
  tercer: ["tercera"], vintage: ["retro"], clasica: ["retro"], clasico: ["retro"], antigua: ["retro"],
  bca: ["blanca", "blanco"], blanca: ["blanca", "blanco"], blanco: ["blanca", "blanco"], negra: ["negra", "negro"],
  negro: ["negra", "negro"], roja: ["roja", "rojo", "rojas"], rojo: ["roja", "rojo"], verde: ["verde"],
  rosa: ["rosa"], rojiblanca: ["chivas", "rojiblanca"], rojiblancas: ["chivas"], azul: ["azul"], amarilla: ["amarilla", "amarillo"], dorada: ["dorada", "dorado", "oro"],
  nino: ["nino"], ninos: ["nino"], infantil: ["nino"], kids: ["nino"], dama: ["mujer"], mujeres: ["mujer"],
  cr7: ["cristiano", "ronaldo"], addidas: ["adidas"], adiddas: ["adidas"], naik: ["nike"], jordan: ["jordan"], portero: ["portero"], arquero: ["portero"], basquet: ["basket"], basketball: ["basket"]
};

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function palabraCoincide(t, w) {
  if (w.startsWith(t)) return true;
  if (t.length < 4 || /\d/.test(t)) return false;
  const tope = t.length >= 7 ? 2 : 1;
  return lev(t, w.slice(0, t.length)) <= tope || lev(t, w) <= tope;
}

const COLOR = {
  blanco: "blanco", blanca: "blanco", bca: "blanco", white: "blanco",
  negro: "negro", negra: "negro", black: "negro",
  rojo: "rojo", roja: "rojo", red: "rojo", granate: "rojo",
  azul: "azul", marino: "azul", blue: "azul",
  celeste: "celeste", cielo: "celeste",
  verde: "verde", green: "verde",
  amarillo: "amarillo", amarilla: "amarillo", yellow: "amarillo",
  dorado: "dorado", dorada: "dorado", oro: "dorado", gold: "dorado", dorados: "dorado",
  naranja: "naranja", anaranjado: "naranja", orange: "naranja",
  rosa: "rosa", rosado: "rosa", rosita: "rosa", pink: "rosa",
  morado: "morado", morada: "morado", purpura: "morado", lila: "morado", violeta: "morado",
  gris: "gris", plata: "gris", plateado: "gris",
  beige: "beige", crema: "beige", hueso: "beige"
};

function aniosDe(p) {
  const anios = new Set();
  const txt = `${p.temporada || ""} ${p.nombre || ""}`;
  for (const m of txt.matchAll(/(\d{4})(?:\s*[-/]\s*(\d{2,4}))?/g)) {
    const ini = +m[1];
    let fin = m[2] ? +(m[2].length === 2 ? String(ini).slice(0, 2) + m[2] : m[2]) : ini;
    if (fin < ini) fin += 100;
    if (ini < 2015) for (let a = ini; a <= fin; a++) anios.add(a);
    else { anios.add(ini); if (fin !== ini) anios.add(-fin); }
  }
  return anios;
}

function anioCoincide(t, anios, palabras) {
  if (palabras.includes(t)) return true;
  if (t.length === 4) return anios.has(+t);
  if (t.length === 2) return [...anios].some(a => Math.abs(a) % 100 === +t);
  return false;
}

function analizarBusqueda(texto) {
  const tallas = [];
  const terminos = [];
  let corta = false;
  for (const t of norm(texto).split(" ").filter(Boolean)) {
    if (TALLA[t]) { tallas.push(TALLA[t]); continue; }
    if (VACIAS.has(t) || t === "manga") continue;
    if (t === "corta" || t === "cortas") { corta = true; continue; }
    if (COLOR[t]) { terminos.push({ color: COLOR[t] }); continue; }
    terminos.push({ t, op: [t, ...(SINON[t] || [])] });
  }
  return { tallas, terminos, corta };
}

function puntaje(p, b) {
  if (b.corta && /manga larga/i.test(p.nombre || "")) return 0;
  if (b.tallas.length && !b.tallas.some(t => tallasDisponibles(p).includes(t))) return 0;
  const nombre = norm(p.nombre).split(" ");
  const resto = norm([p.equipo, p.marca, p.subcategoria, p.retro ? "retro" : "",
    p.genero === "Niño" ? "nino" : p.genero === "Mujer" ? "mujer" : ""].join(" ")).split(" ");
  const colores = (p.colores || []).map(norm);
  const anios = aniosDe(p);
  let total = 1;
  for (const x of b.terminos) {
    if (x.color) {
      const i = colores.indexOf(x.color);
      if (i < 0) return 0;
      total += i === 0 ? 4 : 2;
      continue;
    }
    if (/^\d+$/.test(x.t)) {
      if (!anioCoincide(x.t, anios, nombre)) return 0;
      total += 4;
      continue;
    }
    let mejor = 0;
    for (const o of x.op) {
      if (nombre.includes(o) || resto.includes(o)) { mejor = 5; break; }
      if (nombre.some(w => palabraCoincide(o, w))) mejor = Math.max(mejor, 4);
      else if (resto.some(w => palabraCoincide(o, w))) mejor = Math.max(mejor, 3);
    }
    if (!mejor) return 0;
    total += mejor;
  }
  return total;
}

function recibir(list) { productos = list.filter(p => !p.oculto && !p.proximamente); setProductos(list); render(); }
queueMicrotask(() => catalogoRapido(recibir));
onMayoreo(() => render());

function cardHTML(p) {
  const total = stockTotal(p);
  const st = etiquetaStock(total);
  const sinStock = total <= 0;
  const sized = tieneTallas(p);
  const precioTxt = (precioAntes(p) ? `<s class="precio-antes">${precioHTML(precioAntes(p))}</s> ` : "") + (preciosVarian(p) ? "desde " : "") + precioHTML(precioDesde(p));
  const boton = sinStock
    ? `<button class="add-btn" disabled>Agotado</button>`
    : sized
      ? `<a class="add-btn" href="producto.html?id=${encodeURIComponent(p.id)}" style="display:block;text-align:center;text-decoration:none">Elegir talla</a>`
      : (enCarrito(p.id) >= total
          ? `<button class="add-btn" disabled>Máximo en carrito</button>`
          : `<button class="add-btn" data-add="${esc(p.id)}">Agregar al carrito</button>`);
  const media = p.imagen
    ? `<img src="${esc(fotoMedia(p.imagen))}" alt="${esc(p.nombre)}" loading="lazy" onerror="this.style.display='none';this.parentElement.querySelector('.card__ph').style.display='block'">
       <span class="card__ph" style="display:none">📷 Sin foto aún</span>`
    : `<span class="card__ph">📷 Foto pendiente</span>`;
  const flags = [
    p.retro ? `<span class="card__flag card__flag--pre">Retro</span>` : "",
    p.piezaUnica ? `<span class="card__flag card__flag--semi">Pieza única</span>` : ""
  ].join("");
  const tallas = tallasDisponibles(p);
  const tallasTxt = tallas.length ? `<div class="card__tallas">${tallas.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : "";
  const meta = [p.equipo, p.temporada].filter(Boolean).join(" · ");
  return `
    <article class="card reveal" data-id="${esc(p.id)}">
      <div class="card__media">
        <span class="card__cat">${esc(p.subcategoria || "")}</span>
        ${flags}
        ${media}
      </div>
      <div class="card__body">
        <span class="card__brand">${esc(meta || p.marca || "")}</span>
        <h3 class="card__name">${esc(p.nombre)}</h3>
        <p class="card__desc">${esc(p.descripcion || "")}</p>
        ${tallasTxt}
        <div class="card__foot">
          <div class="price">${precioTxt} <span>MXN</span></div>
          <span class="stock stock--${st.cls}">${st.txt}</span>
        </div>
        ${boton}
      </div>
    </article>`;
}

const ORDEN_LIGAS = ["Liga MX", "Selección Nacional", "LaLiga", "MLS", "Serie A", "Premier League", "Bundesliga", "Ligue 1", "Edición especial"];
const ORDEN_EQUIPOS = [
  "Selección Mexicana", "Selección de España", "Selección de Argentina", "Selección de Inglaterra", "Selección de Noruega",
  "Selección de Portugal", "Selección de Brasil", "Selección de Alemania",
  "Chivas de Guadalajara", "Club América", "Atlas", "Cruz Azul", "Pumas UNAM", "Rayados de Monterrey", "Toluca", "Atlante",
  "Real Madrid", "FC Barcelona"
];
const ORDEN_KIT = ["Local", "Visita", "Tercera", "Especial", "Entrenamiento"];
const posEn = (arr, v) => { const i = arr.indexOf(v); return i < 0 ? arr.length : i; };
const anio = p => parseInt(String(p.temporada || "").slice(0, 4), 10) || 0;
const ordenEquipo = (a, b) => posEn(ORDEN_EQUIPOS, a.equipo) - posEn(ORDEN_EQUIPOS, b.equipo) || String(a.equipo || "").localeCompare(String(b.equipo || ""))
  || (a.retro ? 1 : 0) - (b.retro ? 1 : 0) || anio(b) - anio(a) || posEn(ORDEN_KIT, a.kit) - posEn(ORDEN_KIT, b.kit)
  || String(a.nombre || "").localeCompare(String(b.nombre || ""));
const NOMBRE_LIGA = { "Selección Nacional": "Selecciones" };

function escudoHTML(eq) {
  const a = ESCUDOS[eq];
  const on = f.equipo === eq;
  return a ? `<button type="button" class="liga-head__esc${on ? " on" : ""}" data-escudo="${esc(eq)}" title="${esc(eq)}" aria-pressed="${on}"><img src="fotos/escudos/${a}.webp" alt="${esc(eq)}" width="64" height="64" loading="lazy"></button>` : "";
}

function porLigas(lista) {
  const grupos = new Map();
  for (const p of lista) {
    const l = p.liga || "Otros";
    if (!grupos.has(l)) grupos.set(l, []);
    grupos.get(l).push(p);
  }
  const pos = l => { const i = ORDEN_LIGAS.indexOf(l); return i < 0 ? ORDEN_LIGAS.length : i; };
  const ligas = [...grupos.keys()].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b));
  return ligas.map(l => {
    const ps = grupos.get(l).sort(ordenEquipo);
    const deLiga = f.equipo !== "Todos" ? base().filter(p => p.liga === l).sort(ordenEquipo) : ps;
    const equipos = [...new Set(deLiga.map(p => p.equipo).filter(e => ESCUDOS[e]))];
    const mitad = Math.ceil(equipos.length / 2);
    const izq = equipos.slice(0, mitad).map(escudoHTML).join("");
    const der = equipos.slice(mitad).map(escudoHTML).join("");
    return `<div class="liga-head reveal${f.equipo !== "Todos" ? " liga-head--filtro" : ""}">
        <div class="liga-head__lado liga-head__lado--izq">${izq}</div>
        <h2 class="liga-head__t">${esc(NOMBRE_LIGA[l] || l)}</h2>
        <div class="liga-head__lado">${der}</div>
      </div>${ps.map(cardHTML).join("")}`;
  }).join("");
}

function grupo(lbl, key, valores, abierto, chips) {
  if (valores.length <= 2) return "";
  const opts = valores.map(v =>
    `<span class="opt${key === "color" && v !== "Todos" ? " opt--color" : ""}" data-f="${esc(key)}" data-v="${esc(v)}">${key === "color" && v !== "Todos" ? `<i class="pinta pinta--${esc(norm(v))}"></i>` : ""}${esc(v)}</span>`).join("");
  return `<div class="acc${abierto ? " open" : ""}${chips ? " acc--chips" : ""}" data-grp="${key}">
      <button class="acc__h" type="button"><span>${lbl}</span><span class="arr">▾</span></button>
      <div class="acc__b">${opts}</div></div>`;
}

function buildPanel() {
  const cont = $("#filtros");
  if (!cont) return;
  const d = base();
  const uniq = (k, todo) => [todo, ...[...new Set(d.map(p => p[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)))];
  const tallas = ["Todas", ...[...new Set(d.flatMap(p => tallasDisponibles(p)))]
    .sort((a, b) => ["S", "M", "L", "XL", "2XL", "3XL", "4XL"].indexOf(a) - ["S", "M", "L", "XL", "2XL", "3XL", "4XL"].indexOf(b))];
  const ORDEN_COLOR = ["Blanco", "Negro", "Rojo", "Azul", "Celeste", "Verde", "Amarillo", "Dorado", "Naranja", "Rosa", "Morado", "Gris", "Beige"];
  const hay = new Set(d.flatMap(p => p.colores || []));
  const colores = ["Todos", ...ORDEN_COLOR.filter(c => hay.has(c))];
  const inicio = t => +(String(t).match(/\d{4}/) || [0])[0];
  const temporadas = ["Todas", ...[...new Set(d.map(p => p.temporada).filter(Boolean))]
    .sort((a, b) => inicio(b) - inicio(a) || String(b).localeCompare(String(a)))];
  cont.innerHTML = `
    <div class="filtros-fila">
      <button class="filtros-btn" type="button" id="filtrosBtn">
        <span class="fico">≡</span> Filtros <span class="fcount" id="fcount"></span>
      </button>
      <label class="buscador" id="buscar">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4.2-4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input id="buscarInput" type="search" enterkeyhint="search" autocomplete="off" placeholder="Busca tu jersey: equipo, año, retro…" aria-label="Buscar jersey">
        <button type="button" class="buscador__x" id="buscarX" aria-label="Borrar búsqueda" hidden>✕</button>
      </label>
    </div>
    <div class="filtros-panel" id="filtrosPanel" hidden>
      ${grupo("Versión", "sub", uniq("subcategoria", "Todas"), true)}
      ${grupo("Liga", "liga", uniq("liga", "Todas"), false)}
      ${grupo("Equipo", "equipo", uniq("equipo", "Todos"), false)}
      ${grupo("Color", "color", colores, false, true)}
      ${grupo("Temporada", "temporada", temporadas, false, true)}
      ${grupo("Marca", "marca", uniq("marca", "Todas"), false)}
      ${grupo("Talla", "talla", tallas, false, true)}
      <div class="acc" data-grp="orden">
        <button class="acc__h" type="button"><span>Orden</span><span class="arr">▾</span></button>
        <div class="acc__b">
          <span class="opt" data-f="orden" data-v="rel">Relevancia</span>
          <span class="opt" data-f="orden" data-v="precio-asc">Precio: menor a mayor</span>
          <span class="opt" data-f="orden" data-v="precio-desc">Precio: mayor a menor</span>
          <span class="opt" data-f="orden" data-v="nombre">Nombre A–Z</span>
        </div>
      </div>
    </div>
    <p class="buscar-res" id="buscarRes" aria-live="polite"></p>`;
  panelListo = true;
  const inp = $("#buscarInput");
  inp.value = q;
  $("#buscarX").hidden = !q;
  inp.addEventListener("input", () => {
    q = inp.value;
    $("#buscarX").hidden = !q;
    const u = new URL(location.href);
    q.trim() ? u.searchParams.set("q", q.trim()) : u.searchParams.delete("q");
    history.replaceState(null, "", u);
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 160);
    clearTimeout(qTimer);
    qTimer = setTimeout(anotarBusqueda, 1500);
  });
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { inp.blur(); clearTimeout(qTimer); anotarBusqueda(); } });
  $("#buscarX").addEventListener("click", () => { inp.value = ""; inp.dispatchEvent(new Event("input")); inp.focus(); });
  if (location.hash === "#buscar") setTimeout(() => inp.focus(), 50);
  marcarSel();
}

let ultimaAnotada = "";
let ultimosResultados = 0;
function anotarBusqueda() {
  const t = q.trim();
  if (t.length < 3 || t === ultimaAnotada) return;
  ultimaAnotada = t;
  track("busqueda", { texto: t, categoria: CAT, resultados: ultimosResultados });
  if (!ultimosResultados) track("busqueda_sin_resultado", { texto: t, categoria: CAT });
}

function activos() {
  return (f.sub !== "Todas") + (f.liga !== "Todas") + (f.equipo !== "Todos") + (f.color !== "Todos") +
         (f.temporada !== "Todas") + (f.marca !== "Todas") + (f.talla !== "Todas") + (f.orden !== "rel");
}

function marcarSel() {
  document.querySelectorAll("#filtrosPanel .opt").forEach(o => {
    o.classList.toggle("sel", f[o.dataset.f] === o.dataset.v);
  });
  const INICIAL = { sub: "Todas", liga: "Todas", equipo: "Todos", color: "Todos", temporada: "Todas", marca: "Todas", talla: "Todas", orden: "rel" };
  document.querySelectorAll("#filtrosPanel .acc[data-grp]").forEach(a => {
    const k = a.dataset.grp;
    a.classList.toggle("acc--activo", k in INICIAL && f[k] !== INICIAL[k]);
  });
  const n = activos();
  const c = $("#fcount"); if (c) { c.textContent = n ? n : ""; c.style.display = n ? "" : "none"; }
}

function render() {
  const gridEl = $("#grid");
  if (!CAT || !gridEl) return;
  if (!panelListo && productos.length) buildPanel();

  let lista = base().filter(p =>
    (f.sub === "Todas" || p.subcategoria === f.sub) &&
    (f.liga === "Todas" || p.liga === f.liga) &&
    (f.equipo === "Todos" || p.equipo === f.equipo) &&
    (f.temporada === "Todas" || p.temporada === f.temporada) &&
    (f.marca === "Todas" || p.marca === f.marca) &&
    (f.talla === "Todas" || tallasDisponibles(p).includes(f.talla)) &&
    (f.color === "Todos" || (p.colores || []).includes(f.color)));

  const b = analizarBusqueda(q);
  const buscando = b.terminos.length || b.tallas.length || b.corta;
  let lista2 = lista;
  if (buscando) {
    const pts = new Map(lista.map(p => [p, puntaje(p, b)]));
    lista2 = lista.filter(p => pts.get(p) > 0);
    if (f.orden === "rel") lista2.sort((x, y) => pts.get(y) - pts.get(x) || stockTotal(y) - stockTotal(x));
  }
  lista = lista2;
  ultimosResultados = lista.length;

  if (f.orden === "precio-asc") lista.sort((a, b) => precioDesde(a) - precioDesde(b));
  else if (f.orden === "precio-desc") lista.sort((a, b) => precioDesde(b) - precioDesde(a));
  else if (f.orden === "nombre") lista.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

  if (!productos.length) { gridEl.innerHTML = `<p style="color:var(--muted)">Cargando…</p>`; return; }
  const res = $("#buscarRes");
  if (res) res.textContent = buscando && lista.length ? `${lista.length} ${lista.length === 1 ? "jersey" : "jerseys"} para «${q.trim()}»` : "";
  if (lista.length) gridEl.innerHTML = (!buscando && f.orden === "rel") ? porLigas(lista) : lista.map(cardHTML).join("");
  else if (buscando) {
    gridEl.innerHTML = `<div class="buscar-vacio">
        <p class="buscar-vacio__t">No tenemos «${esc(q.trim())}» por ahora.</p>
        <p class="buscar-vacio__s">${activos() ? "Prueba quitar algún filtro, o escribe" : "Prueba con"} el nombre del equipo, el año o «retro».</p>
        ${tarjetaSugerenciaHTML(CAT)}
      </div>`;
    const form = gridEl.querySelector("form.sug");
    const campo = form?.querySelector("[name=texto]");
    if (campo) campo.value = q.trim().slice(0, 200);
    conectarFormulario(form);
  } else gridEl.innerHTML = `<p style="color:var(--muted)">Nada con esos filtros. Prueba quitar alguno.</p>`;
  if (!lista.length && activos()) track("filtro_sin_resultado", { categoria: CAT, filtros: { ...f } });
  marcarSel();
  observarReveal();
}

function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function observarReveal() {
  io?.disconnect();
  io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12 });
  document.querySelectorAll(".reveal:not(.in)").forEach(el => io.observe(el));
}

document.addEventListener("click", e => {
  const lupa = e.target.closest(".hdr-buscar");
  if (lupa && $("#buscarInput")) {
    e.preventDefault();
    $("#buscarInput").scrollIntoView({ behavior: "smooth", block: "center" });
    $("#buscarInput").focus();
    return;
  }
  if (e.target.closest(".buscar-vacio")) return;
  if (e.target.closest("#filtrosBtn")) {
    const panel = $("#filtrosPanel");
    const seAbre = panel?.hasAttribute("hidden");
    if (seAbre) track("filtros_abrir", { categoria: CAT });
    panel?.toggleAttribute("hidden");
    return;
  }
  const h = e.target.closest(".acc__h");
  if (h) { h.parentElement.classList.toggle("open"); return; }
  const escudo = e.target.closest("[data-escudo]");
  if (escudo) {
    f.equipo = f.equipo === escudo.dataset.escudo ? "Todos" : escudo.dataset.escudo;
    track("filtro", { categoria: CAT, campo: "equipo", campoTxt: "equipo", valor: f.equipo });
    render();
    $("#catalogo")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const opt = e.target.closest("#filtrosPanel .opt");
  if (opt) {
    f[opt.dataset.f] = opt.dataset.v;
    const NOMBRE_F = { sub: "versión", liga: "liga", equipo: "equipo", temporada: "temporada", marca: "marca", talla: "talla", color: "color", orden: "orden" };
    track("filtro", { categoria: CAT, campo: opt.dataset.f, campoTxt: NOMBRE_F[opt.dataset.f] || opt.dataset.f, valor: opt.dataset.v });
    render();
    return;
  }
  if (!e.target.closest("#filtros")) $("#filtrosPanel")?.setAttribute("hidden", "");
  if (e.target.closest("[data-add],[data-inc],[data-dec],[data-rm]")) return;
  const card = e.target.closest("[data-id]");
  if (card) window.location.href = `producto.html?id=${encodeURIComponent(card.dataset.id)}`;
});

window.addEventListener("hashchange", () => {
  if (location.hash === "#buscar" && $("#buscarInput")) { $("#buscarInput").scrollIntoView({ block: "center" }); $("#buscarInput").focus(); }
});

initCart();
observarReveal();
document.addEventListener("cart:add", render);
