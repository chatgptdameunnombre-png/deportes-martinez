import { db } from "./db.js?v=76";
import { pintarEstadisticas } from "./estadisticas.js?v=76";
import "./panel-nav.js?v=76";

const $ = s => document.querySelector(s);
const money = n => "$" + Number(n).toLocaleString("es-MX");

const TAXONOMIA = {
  "futbol": ["Retro", "Actual", "Versión jugador", "Versión fan", "Entrenamiento", "Portero"],
  "basket": ["NBA", "Retro", "Universitario", "Edición especial"],
  "americano": ["NFL", "Retro", "Colegial", "Edición especial"]
};
const KITS = ["Local", "Visita", "Tercera", "Portero", "Especial"];
const MAX_BYTES = 950000;

let productos = [];
let inicializado = false;
let fotosActuales = [];

const OWNER_EMAILS = ["admindeportesmartinez@gmail.com"];
const esDueno = u => !!u && OWNER_EMAILS.includes((u.email || "").toLowerCase());

db.onAuth(user => {
  if (!user) { window.location.replace("admin.html"); return; }
  if (!esDueno(user)) { window.location.replace("index.html"); return; }
  $("#loader").hidden = true;
  $("#dash").hidden = false;
  window.scrollTo(0, 0);
  arrancarDash();
});

$("#logout").onclick = async () => { await db.logout(); window.location.replace("admin.html"); };

async function arrancarDash() {
  if (inicializado) return;
  inicializado = true;
  await db.seedIfEmpty();
  db.onProducts(list => { productos = list; render(); });
  pintarEstadisticas(db);
  cargarVentas();
  cargarPromos();
}

function stockPill(s) {
  if (s <= 0) return `<span class="stock-pill" style="color:var(--danger)">Agotado</span>`;
  if (s <= 3) return `<span class="stock-pill" style="color:var(--warn)">${s} · bajo</span>`;
  return `<span class="stock-pill" style="color:var(--ink)">${s}</span>`;
}

const ORDEN_DEPORTE = { futbol: 0, basket: 1, americano: 2 };

/* primero futbol, luego basketball, luego americano; dentro de cada uno por liga (A-Z) y nombre */
function ordenar(lista) {
  return lista.slice().sort((a, b) => {
    const d = (ORDEN_DEPORTE[a.categoria] ?? 9) - (ORDEN_DEPORTE[b.categoria] ?? 9);
    if (d) return d;
    const l = String(a.liga || "zzz").localeCompare(String(b.liga || "zzz"), "es");
    if (l) return l;
    return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
  });
}

function render() {
  $("#stTotal").textContent = productos.length;
  $("#stStock").textContent = productos.reduce((a, p) => a + Number(p.stock || 0), 0);
  $("#stOut").textContent = productos.filter(p => p.stock <= 0).length;

  const DEPORTE_TXT = { futbol: "Futbol", basket: "Basketball", americano: "Americano" };
  const enOrden = ordenar(productos);

  const porDeporte = new Map();
  for (const p of enOrden) {
    const d = p.categoria || "otros";
    if (!porDeporte.has(d)) porDeporte.set(d, new Map());
    const ligas = porDeporte.get(d);
    const l = p.liga || "Sin liga";
    if (!ligas.has(l)) ligas.set(l, []);
    ligas.get(l).push(p);
  }

  const fila = p => `
    <div class="p-row">
      <img class="p-thumb" src="${p.imagen || ''}" alt="" onerror="this.style.visibility='hidden'">
      <div class="p-name">
        <b>${p.nombre}</b>
        <span>${[p.equipo, p.liga, p.temporada, p.subcategoria].filter(Boolean).join(" · ") || p.marca || ""}</span>
        ${p.retro || p.personalizable === false ? `<span class="p-tags">
          ${p.retro ? `<span class="p-tag p-tag--retro">RETRO</span>` : ""}
          ${p.personalizable === false ? `<span class="p-tag">SIN NOMBRE</span>` : ""}
        </span>` : ""}
      </div>
      <span class="hide-sm p-cat">${p.categoria}</span>
      <span class="hide-sm p-precio">${money(p.precio)}</span>
      <span>${stockPill(p.stock)}</span>
      <div class="p-actions">
        <button class="edit-a" data-edit="${p.id}">Editar</button>
        <button class="del-a" data-del="${p.id}">Borrar</button>
      </div>
    </div>`;

  /* todo cerrado al entrar: el catálogo es largo y así se ve de un vistazo */
  const html = [...porDeporte.entries()].map(([dep, ligas]) => {
    const cuantos = [...ligas.values()].reduce((a, l) => a + l.length, 0);
    const dentro = [...ligas.entries()].map(([liga, lista]) => `
      <details class="p-liga">
        <summary class="p-liga__cab">${liga} <span class="p-cuenta">${lista.length}</span></summary>
        ${lista.map(fila).join("")}
      </details>`).join("");
    return `<details class="p-dep">
      <summary class="p-grupo">
        <span class="p-grupo__txt">${DEPORTE_TXT[dep] || dep}</span>
        <span class="p-cuenta">${cuantos}</span>
        <button class="p-todas" data-todas="${dep}" type="button">Abrir todas</button>
      </summary>
      ${dentro}
    </details>`;
  }).join("");

  const barra = html
    ? `<div class="p-barra"><button class="p-todas p-todas--all" data-todo="1" type="button">Abrir todo</button></div>`
    : "";
  $("#pList").innerHTML = (barra + html) || `<div style="padding:40px;text-align:center;color:var(--muted)">Sin jerseys todavía. Agrega el primero.</div>`;
}

/* ============================================================
   Jerseys de jugador: si ya traen nombre y número estampado,
   no se les puede poner otro. El panel lo detecta solo.
   ============================================================ */
const JUGADORES = [
  "messi", "cristiano", "ronaldo", "haaland", "mbappe", "mbappé", "neymar", "benzema", "modric", "modrić",
  "kaka", "kaká", "zidane", "ronaldinho", "beckham", "maradona", "pele", "pelé", "salah", "vinicius",
  "bellingham", "lewandowski", "suarez", "suárez", "iniesta", "xavi", "pique", "piqué", "ramos", "buffon",
  "totti", "del piero", "raul", "raúl", "figo", "henry", "drogba", "gerrard", "lampard", "rooney",
  "chicharito", "hernandez", "hernández", "campos", "marquez", "márquez", "blanco", "borgetti", "ochoa",
  "lozano", "jimenez", "jiménez", "alvarez", "álvarez", "gimenez", "giménez",
  "tatum", "curry", "doncic", "dončić", "lebron", "james", "jordan", "kobe", "bryant", "durant",
  "giannis", "antetokounmpo", "wembanyama", "shai", "gilgeous", "harden", "embiid", "jokic", "jokić",
  "allen", "brady", "mahomes", "watt", "kelce", "burrow", "jefferson", "rodgers", "manning", "montana"
];

function pareceDeJugador(texto) {
  const t = " " + String(texto).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") + " ";
  if (/#\s*\d{1,2}\b/.test(t)) return "trae número";
  const hit = JUGADORES.find(j => t.includes(" " + j.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
  return hit ? "es de " + hit.charAt(0).toUpperCase() + hit.slice(1) : null;
}

function avisoPerso(auto) {
  const aviso = $("#persoAviso");
  if (!aviso) return;
  const motivo = pareceDeJugador($("#pNombre").value);
  if (motivo && !$("#pPerso").checked) {
    aviso.innerHTML = `<b style="color:var(--accent)">Este jersey ${motivo}</b>, así que ya trae nombre y número estampado y no se le puede poner otro. ${auto ? "Le quité la personalización." : ""}`;
  } else if (motivo && $("#pPerso").checked) {
    aviso.innerHTML = `<b style="color:#ff9b9b">Ojo:</b> este jersey ${motivo}. Si ya viene estampado, quita la palomita de arriba.`;
  } else {
    aviso.textContent = "Retro y pieza única salen con etiqueta en el catálogo.";
  }
}

let persoTocado = false;
$("#pPerso")?.addEventListener("change", () => { persoTocado = true; avisoPerso(false); });
$("#pNombre")?.addEventListener("input", () => {
  if (!persoTocado && pareceDeJugador($("#pNombre").value) && $("#pPerso").checked) {
    $("#pPerso").checked = false;
    avisoPerso(true);
    return;
  }
  avisoPerso(false);
});

/* ---------- subcategorías dependientes ---------- */
function poblarSub(categoria, seleccion = "") {
  const sub = $("#pSub");
  const opts = TAXONOMIA[categoria] || [];
  sub.innerHTML = `<option value="">—</option>` + opts.map(o => `<option ${o === seleccion ? "selected" : ""}>${o}</option>`).join("");
}
$("#pCategoria").addEventListener("change", e => poblarSub(e.target.value));

function poblarKits(seleccion = "") {
  const k = $("#pKit");
  if (!k) return;
  k.innerHTML = `<option value="">—</option>` + KITS.map(o => `<option ${o === seleccion ? "selected" : ""}>${o}</option>`).join("");
}
poblarKits();

/* ---------- tallas ---------- */
const TALLAS = ["S", "M", "L", "XL", "2XL", "3XL"];
function aplicarTallaTipo(tipo) {
  const conTallas = tipo === "tallas";
  $("#bloqueTallas").hidden = !conTallas;
  $("#bloqueUniversal").hidden = conTallas;
}
function buildTallasEditor(tallas = []) {
  const map = {};
  (tallas || []).forEach(t => { map[t.talla] = t; });
  $("#tallasEditor").innerHTML = TALLAS.map(t => {
    const on = !!map[t];
    const st = on ? (map[t].stock ?? "") : "";
    const pr = on && Number(map[t].precio) > 0 ? map[t].precio : "";
    return `<div class="talla-row" data-talla="${t}" style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
      <label style="display:flex;gap:6px;align-items:center;min-width:64px;margin:0"><input type="checkbox" class="t-on" ${on ? "checked" : ""}> <b>${t}</b></label>
      <input class="input t-stock" type="number" min="0" placeholder="stock" value="${st}" ${on ? "" : "disabled"} style="flex:1">
      <input class="input t-precio" type="number" min="0" placeholder="precio (opcional)" value="${pr}" ${on ? "" : "disabled"} style="flex:1">
    </div>`;
  }).join("");
}
$("#pTallaTipo").addEventListener("change", e => aplicarTallaTipo(e.target.value));
$("#tallasEditor").addEventListener("change", e => {
  const cb = e.target.closest(".t-on");
  if (!cb) return;
  const row = cb.closest(".talla-row");
  row.querySelector(".t-stock").disabled = !cb.checked;
  row.querySelector(".t-precio").disabled = !cb.checked;
});

/* ---------- fotos: subir + comprimir ---------- */
const MAX_FOTOS = 5;                 /* más que eso nadie las ve y la ficha se hace lenta */
const FONDO_FOTO = [14, 18, 29];     /* el mismo negro azulado de las tarjetas de la web */
const MARGEN_FOTO = 0.04;

/* Deja transparente el fondo, sea blanco, negro o de un color plano.
   Solo borra desde los bordes hacia dentro, así un jersey blanco no se agujera. */
function quitarFondoCanvas(d, w, h) {
  const p = d.data;
  const k = Math.max(4, Math.min(w, h) >> 5);
  let r = 0, g = 0, b = 0, n = 0;
  const esquina = (x0, y0) => {
    for (let y = y0; y < y0 + k; y++) for (let x = x0; x < x0 + k; x++) {
      const i = (y * w + x) * 4; r += p[i]; g += p[i + 1]; b += p[i + 2]; n++;
    }
  };
  esquina(0, 0); esquina(w - k, 0); esquina(0, h - k); esquina(w - k, h - k);
  r /= n; g /= n; b /= n;
  const luz = (r + g + b) / 3;
  const esFondo = i => {
    const R = p[i], G = p[i + 1], B = p[i + 2];
    const min = Math.min(R, G, B), max = Math.max(R, G, B);
    if (luz > 225) return min > 232 && max - min < 16;
    if (luz < 42) return max < 46 && max - min < 22;
    return Math.abs(R - r) + Math.abs(G - g) + Math.abs(B - b) < 30;
  };
  const pila = [];
  const meter = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) pila.push(y * w + x); };
  for (let x = 0; x < w; x++) { meter(x, 0); meter(x, h - 1); }
  for (let y = 0; y < h; y++) { meter(0, y); meter(w - 1, y); }
  const visto = new Uint8Array(w * h);
  while (pila.length) {
    const q = pila.pop();
    if (visto[q]) continue;
    const i = q * 4;
    if (!esFondo(i)) continue;
    visto[q] = 1;
    p[i + 3] = 0;
    const x = q % w, y = (q - x) / w;
    meter(x + 1, y); meter(x - 1, y); meter(x, y + 1); meter(x, y - 1);
  }
}

function recorteVisible(d, w, h) {
  const p = d.data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (p[(y * w + x) * 4 + 3] > 10) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? { x0: 0, y0: 0, w, h } : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/* Deja la foto lista para el catálogo: sin su fondo, centrada, del tamaño de la
   caja (la amplía si viene chica) y sobre el fondo de la web. */
function comprimirImagen(file, size = 1000, calidad = 0.9) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      /* se trabaja sobre una copia de máximo 1400 px: con fotos de 3000 px el
         barrido del fondo tardaría demasiado en el navegador */
      const tope = 1400;
      const esc0 = Math.min(1, tope / Math.max(img.width, img.height));
      const tw = Math.max(1, Math.round(img.width * esc0));
      const th = Math.max(1, Math.round(img.height * esc0));
      const t = document.createElement("canvas");
      t.width = tw; t.height = th;
      const tc = t.getContext("2d", { willReadFrequently: true });
      tc.drawImage(img, 0, 0, tw, th);

      let caja = { x0: 0, y0: 0, w: tw, h: th };
      try {
        const d = tc.getImageData(0, 0, tw, th);
        quitarFondoCanvas(d, tw, th);
        tc.putImageData(d, 0, 0);
        caja = recorteVisible(d, tw, th);
      } catch (_) { /* si el navegador no deja leer el canvas, se sigue sin recortar */ }

      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const ctx = c.getContext("2d");
      ctx.fillStyle = `rgb(${FONDO_FOTO[0]},${FONDO_FOTO[1]},${FONDO_FOTO[2]})`;
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const cajaPx = size * (1 - MARGEN_FOTO * 2);
      const esc = cajaPx / Math.max(caja.w, caja.h);   /* siempre a la caja: amplía si hace falta */
      const w = caja.w * esc, h = caja.h * esc;
      ctx.drawImage(t, caja.x0, caja.y0, caja.w, caja.h, (size - w) / 2, (size - h) / 2, w, h);

      const chica = (caja.w / esc0) < 620 && (caja.h / esc0) < 620;
      resolve({ data: c.toDataURL("image/jpeg", calidad), chica });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function renderFotos() {
  const btn = $("#pFileBtn");
  if (btn) {
    btn.disabled = fotosActuales.length >= MAX_FOTOS;
    btn.textContent = fotosActuales.length >= MAX_FOTOS
      ? `Ya tienes ${MAX_FOTOS} fotos (el máximo)`
      : (fotosActuales.length
          ? `📷 Agregar otra foto (${fotosActuales.length}/${MAX_FOTOS})`
          : "📷 Subir fotos desde tu dispositivo");
  }
  $("#pFotos").innerHTML = fotosActuales.map((src, i) => `
    <div class="foto-mini">
      <img src="${src}" alt="">
      ${i === 0 ? '<span class="foto-badge">Principal</span>' : ''}
      <button type="button" class="foto-rm" data-rmfoto="${i}">✕</button>
    </div>`).join("");
}

$("#pFileBtn").onclick = () => $("#pFile").click();
$("#pFile").addEventListener("change", async e => {
  const files = [...e.target.files];
  e.target.value = "";
  let chicas = 0, sobraron = 0;
  for (const f of files) {
    if (fotosActuales.length >= MAX_FOTOS) { sobraron++; continue; }
    try {
      const r = await comprimirImagen(f);
      fotosActuales.push(r.data);
      if (r.chica) chicas++;
    } catch { toast("No se pudo procesar una imagen"); }
  }
  renderFotos();
  if (sobraron) toast(`Son máximo ${MAX_FOTOS} fotos por jersey. ${sobraron === 1 ? "Una no entró" : `${sobraron} no entraron`}: borra alguna si quieres cambiarla.`);
  if (chicas) toast(chicas === 1
    ? "Una foto venía muy chica y se va a ver borrosa. Busca una más grande."
    : `${chicas} fotos venían muy chicas y se van a ver borrosas. Busca otras más grandes.`);
});

/* ---------- modal ---------- */
const ov = $("#modalOv");
const abrir = () => ov.classList.add("open");
const cerrar = () => ov.classList.remove("open");

function nuevo() {
  $("#modalTitle").textContent = "Nuevo jersey";
  $("#prodForm").reset();
  $("#pId").value = "";
  fotosActuales = [];
  poblarSub("");
  $("#pTallaTipo").value = "tallas";
  aplicarTallaTipo("tallas");
  buildTallasEditor([]);
  renderFotos();
  abrir();
}
function editar(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  $("#modalTitle").textContent = "Editar jersey";
  $("#pId").value = p.id;
  $("#pNombre").value = p.nombre;
  $("#pMarca").value = p.marca;
  $("#pCategoria").value = TAXONOMIA[p.categoria] ? p.categoria : "";
  poblarSub($("#pCategoria").value, p.subcategoria || "");
  poblarKits(p.kit || "");
  $("#pPrecio").value = p.precio;
  $("#pStock").value = p.stock;
  $("#pEquipo").value = p.equipo || "";
  $("#pLiga").value = p.liga || "";
  $("#pTemporada").value = p.temporada || "";
  $("#pKit").value = p.kit || "";
  $("#pMaterial").value = p.material || "";
  persoTocado = true;   /* al editar uno que ya existe, se respeta lo que el dueño puso */
  $("#pRetro").checked = !!p.retro;
  $("#pUnica").checked = !!p.piezaUnica;
  $("#pPerso").checked = p.personalizable !== false;
  const tipo = p.tallaTipo === "tallas" ? "tallas" : "universal";
  $("#pTallaTipo").value = tipo;
  aplicarTallaTipo(tipo);
  buildTallasEditor(p.tallas || []);
  $("#pDesc").value = p.descripcion || "";
  $("#pSpecs").value = (p.specs || []).join("\n");
  fotosActuales = p.imagenes?.length ? [...p.imagenes] : (p.imagen ? [p.imagen] : []);
  renderFotos();
  abrir();
  db.getFotos(id).then(fotos => {
    if ($("#pId").value !== id) return;
    fotosActuales = fotos;
    renderFotos();
  }).catch(() => {});
}

$("#prodForm").addEventListener("submit", async e => {
  e.preventDefault();
  const imagenes = fotosActuales;
  if (JSON.stringify(imagenes).length > MAX_BYTES) {
    toast("Demasiadas fotos o muy pesadas. Quita alguna.");
    return;
  }
  const id = $("#pId").value;
  const tipo = $("#pTallaTipo").value === "tallas" ? "tallas" : "universal";
  const data = {
    nombre: $("#pNombre").value.trim(),
    marca: $("#pMarca").value.trim(),
    categoria: $("#pCategoria").value,
    subcategoria: $("#pSub").value,
    precio: Number($("#pPrecio").value) || 0,
    descripcion: $("#pDesc").value.trim(),
    specs: $("#pSpecs").value.split("\n").map(s => s.trim()).filter(Boolean),
    imagenes,
    imagen: imagenes[0] || "",
    tallaTipo: tipo,
    equipo: $("#pEquipo").value.trim(),
    liga: $("#pLiga").value.trim(),
    temporada: $("#pTemporada").value.trim(),
    kit: $("#pKit").value,
    material: $("#pMaterial").value.trim(),
    retro: $("#pRetro").checked,
    piezaUnica: $("#pUnica").checked,
    personalizable: $("#pPerso").checked
  };
  if (tipo === "tallas") {
    const tallas = [];
    document.querySelectorAll("#tallasEditor .talla-row").forEach(row => {
      if (row.querySelector(".t-on").checked) {
        tallas.push({
          talla: row.dataset.talla,
          stock: Number(row.querySelector(".t-stock").value) || 0,
          precio: Number(row.querySelector(".t-precio").value) || 0
        });
      }
    });
    if (!tallas.length) { toast("Activa al menos una talla o cámbialo a universal."); return; }
    data.tallas = tallas;
    data.stock = tallas.reduce((a, t) => a + t.stock, 0);
  } else {
    data.tallas = [];
    data.stock = Number($("#pStock").value) || 0;
  }
  try {
    if (id) await db.updateProduct(id, data);
    else await db.addProduct(data);
    cerrar();
    toast(id ? "Producto actualizado" : "Producto agregado");
  } catch (err) { toast("Error: " + (err.message || "no se pudo guardar")); }
});

async function borrar(id) {
  const p = productos.find(x => x.id === id);
  if (!confirm(`¿Borrar "${p?.nombre}"? Esta acción no se puede deshacer.`)) return;
  try { await db.deleteProduct(id); toast("Producto borrado"); }
  catch (err) { toast("Error al borrar"); }
}

/* ---------- eventos ---------- */
$("#addBtn").onclick = nuevo;
document.addEventListener("panel:nuevo", nuevo);
$("#optBtn").onclick = async () => {
  if (!confirm("Optimiza las fotos de todos los productos para que la tienda cargue más rápido y gaste menos. Se corre una sola vez. ¿Continuar?")) return;
  const btn = $("#optBtn");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Optimizando…";
  try {
    const n = await db.optimizarCatalogo(hechos => { btn.textContent = `Optimizando… ${hechos}`; });
    toast(n ? `Listo: ${n} producto${n === 1 ? "" : "s"} optimizado${n === 1 ? "" : "s"}` : "Ya estaba todo optimizado");
  } catch (err) {
    toast("Error al optimizar: " + (err.message || "reintenta"));
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
};
$("#modalClose").onclick = cerrar;
$("#modalCancel").onclick = cerrar;
ov.addEventListener("click", e => { if (e.target === ov) cerrar(); });
/* "Abrir todo": los tres deportes y todas sus ligas, en orden */
document.addEventListener("click", e => {
  const bg = e.target.closest("[data-todo]");
  if (!bg) return;
  e.preventDefault();
  const deportes = [...document.querySelectorAll(".p-dep")];
  const ligas = [...document.querySelectorAll(".p-liga")];
  const abrir = deportes.some(d => !d.open) || ligas.some(l => !l.open);
  bg.textContent = abrir ? "Cerrar todo" : "Abrir todo";
  deportes.forEach(d => { d.open = abrir; });
  document.querySelectorAll(".p-todas[data-todas]").forEach(b => { b.textContent = abrir ? "Cerrar todas" : "Abrir todas"; });
  ligas.forEach((l, i) => setTimeout(() => { l.open = abrir; }, i * 45));
});

/* "Abrir todas" dentro de un deporte: las ligas se van abriendo en orden, de arriba a abajo */
document.addEventListener("click", e => {
  const bt = e.target.closest("[data-todas]");
  if (!bt) return;
  e.preventDefault();
  e.stopPropagation();
  const dep = bt.closest(".p-dep");
  if (!dep) return;
  const ligas = [...dep.querySelectorAll(".p-liga")];
  const abrir = ligas.some(l => !l.open);
  dep.open = true;
  bt.textContent = abrir ? "Cerrar todas" : "Abrir todas";
  ligas.forEach((l, i) => setTimeout(() => { l.open = abrir; }, i * 70));
});

document.addEventListener("click", e => {
  const rm = e.target.closest("[data-rmfoto]");
  if (rm) { fotosActuales.splice(Number(rm.dataset.rmfoto), 1); renderFotos(); return; }
  const t = e.target.closest("[data-edit],[data-del]");
  if (!t) return;
  if (t.dataset.edit) editar(t.dataset.edit);
  else if (t.dataset.del) borrar(t.dataset.del);
});

function toast(html) {
  const t = document.createElement("div");
  t.className = "toast"; t.innerHTML = html;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ============================================================
   Cuentas de clientes (con candado de contraseña)
   ============================================================ */
let clientesCargados = null;

/* Ya no se vuelve a pedir la contraseña: para llegar aquí hubo que entrar al panel con ella.
   Los clientes se cargan solos al abrir la sección. */
document.addEventListener("panel:cuentas", async () => {
  const cuerpo = $("#cuentasBody");
  if (!cuerpo) return;
  if (clientesCargados) { pintarClientes(clientesCargados); return; }
  cuerpo.innerHTML = `<p class="st-vacio">Cargando…</p>`;
  try {
    clientesCargados = await db.listarClientes();
    pintarClientes(clientesCargados);
  } catch (err) {
    const m = String(err?.code || err?.message || "");
    cuerpo.innerHTML = `<p class="st-error">${m.includes("permission") || m.includes("PERMISSION")
      ? "Falta activar el permiso de lectura en la base de datos (regla de Firestore)."
      : "No se pudieron cargar las cuentas."}</p>`;
  }
});

function filaCliente(c) {
  const campos = [
    ["Nombre", c.nombre], ["Correo", c.email], ["Teléfono", c.telefono],
    ["Calle", c.calle], ["Colonia", c.colonia], ["C.P.", c.cp],
    ["Ciudad", c.ciudad], ["Estado", c.estado], ["Referencias", c.referencias]
  ];
  const llenos = campos.filter(([, v]) => v && String(v).trim());
  const faltan = campos.filter(([, v]) => !v || !String(v).trim()).map(([k]) => k);
  const completo = Math.round((llenos.length / campos.length) * 100);
  return `<details class="st-visita">
    <summary class="st-visita__cab" style="grid-template-columns:1.2fr 1.4fr 130px 120px">
      <span class="st-visita__quien">${c.nombre || "Sin nombre"}</span>
      <span class="st-visita__tiempo" title="${c.email || c.uid}">${c.email || c.uid}</span>
      <span class="st-visita__tiempo">${c.telefono || "sin teléfono"}</span>
      <span class="st-tag st-tag--${completo === 100 ? "compro" : (completo >= 50 ? "carrito" : "paso")}">${completo}% de datos</span>
    </summary>
    <div class="st-visita__cuerpo">
      ${llenos.map(([k, v]) => `<div><b>${k}:</b> ${v}</div>`).join("")}
      ${faltan.length ? `<div style="margin-top:8px;color:var(--muted)">Le falta llenar: ${faltan.join(", ")}</div>` : ""}
      ${c.actualizado ? `<div style="margin-top:6px;color:var(--muted)">Última actualización: ${String(c.actualizado).replace("T", " ").slice(0, 16)}</div>` : ""}
      ${comprasDe(c.uid)}
      <div class="cliente-acciones">
        <button class="btn btn--ghost" data-borrar-historial="${c.uid}" data-correo="${c.email || ""}">Borrar su historial de visitas</button>
        <button class="btn btn--danger" data-borrar-cliente="${c.uid}" data-correo="${c.email || ""}">Borrar esta cuenta</button>
      </div>
    </div>
  </details>`;
}

/* Lo que ha comprado esa persona. Se saca de las ventas ya cargadas,
   así no hay que volver a consultar la base por cada cliente. */
function comprasDe(uid) {
  if (!ventasCargadas) return "";
  const suyas = ventasCargadas.filter(v => v.clienteUid === uid && !v.prueba);
  if (!suyas.length) return `<div class="vt-datos" style="margin-top:12px">Todavía no te ha comprado nada.</div>`;
  const gastado = suyas.filter(v => v.estado !== "cancelada").reduce((a, v) => a + Number(v.total || 0), 0);
  return `<div class="vt-datos" style="margin-top:12px">
    <b>Sus compras (${suyas.length}) · ${vtMoney(gastado)} en total</b>
    ${suyas.map(v => {
      const est = VT_ESTADO[v.estado] || VT_ESTADO.pagada;
      return `<div style="padding:3px 0">${vtCuando(v)} — ${vtMoney(v.total)}
        <span class="st-tag st-tag--${est.clase}" style="font-size:10px;padding:1px 7px">${est.etq}</span><br>
        <span style="color:#8a8a92">${v.productos || ""}</span></div>`;
    }).join("")}
  </div>`;
}

function pintarClientes(lista) {
  const cuerpo = $("#cuentasBody");
  const conDatos = lista.filter(c => c.nombre || c.telefono).length;
  cuerpo.innerHTML = `
    <div class="stat-row st-tarjetas" style="margin-bottom:18px">
      <div class="stat"><div class="n">${lista.length}</div><div class="l">Cuentas creadas</div></div>
      <div class="stat"><div class="n">${conDatos}</div><div class="l">Ya llenaron sus datos</div></div>
      <div class="stat"><div class="n">${lista.length - conDatos}</div><div class="l">Solo se registraron</div></div>
    </div>
    <div class="vt-grupo">
      <div class="vt-grupo__h"><h4>Tus clientes</h4><span class="vt-num">${lista.length}</span></div>
      <span class="vt-grupo__suma">Son datos personales: trátalos con cuidado.</span>
    </div>
    <div class="st-visitas">${lista.length ? lista.map(filaCliente).join("") : `<p class="st-vacio">Todavía nadie ha creado su cuenta.</p>`}</div>`;
  cuerpo.hidden = false;
}

$("#cuentasVer")?.addEventListener("click", async () => {
  const btn = $("#cuentasVer"), msg = $("#cuentasMsg"), pass = $("#cuentasPass").value;
  if (!pass) { msg.textContent = "Escribe tu contraseña."; return; }
  btn.disabled = true; btn.textContent = "Revisando…"; msg.textContent = "";
  try {
    const usuario = await new Promise(r => { const off = db.onAuth(u => { off?.(); r(u); }); });
    await db.revalidar(usuario.email, pass);
    clientesCargados = await db.listarClientes();
    $("#cuentasPass").value = "";
    pintarClientes(clientesCargados);
  } catch (err) {
    const m = String(err?.code || err?.message || "");
    msg.textContent = m.includes("permission") || m.includes("PERMISSION")
      ? "Falta activar el permiso de lectura en la base de datos (regla de Firestore)."
      : "Contraseña incorrecta.";
  }
  btn.disabled = false; btn.textContent = "Ver los datos";
});


document.addEventListener("click", async e => {
  const h = e.target.closest("[data-borrar-historial]");
  if (h) {
    const uid = h.dataset.borrarHistorial, correo = h.dataset.correo;
    if (!confirm("¿Borrar todo el historial de visitas de esta persona?\n\nSu cuenta y sus datos se quedan; solo se borra lo que hizo en la tienda. Esto no se puede deshacer.")) return;
    h.disabled = true; h.textContent = "Borrando…";
    try {
      const n = await db.borrarHistorialCliente(uid, correo);
      h.disabled = false; h.textContent = "Borrar su historial de visitas";
      toast(n ? `Historial borrado (${n} ${n === 1 ? "visita" : "visitas"})` : "Esta persona no tenía visitas guardadas");
      document.dispatchEvent(new CustomEvent("panel:recargar-estadisticas"));
    } catch (err) {
      h.disabled = false; h.textContent = "Borrar su historial de visitas";
      const m = String(err?.code || err?.message || "");
      toast(m.includes("permission") || m.includes("PERMISSION")
        ? "Falta el permiso de borrado en la base de datos"
        : "No se pudo borrar el historial");
    }
    return;
  }
  const b = e.target.closest("[data-borrar-cliente]");
  if (!b) return;
  const uid = b.dataset.borrarCliente, correo = b.dataset.correo;
  if (!confirm("¿Borrar los datos de esta cuenta? El cliente podrá volver a llenarlos si entra otra vez.\n\nTambién se borrará su historial de visitas.")) return;
  b.disabled = true; b.textContent = "Borrando…";
  try {
    await db.borrarCliente(uid);
    let n = 0;
    try { n = await db.borrarHistorialCliente(uid, correo); } catch { }
    clientesCargados = (clientesCargados || []).filter(c => c.uid !== uid);
    pintarClientes(clientesCargados);
    toast(n ? `Cuenta borrada y ${n} ${n === 1 ? "visita" : "visitas"} de su historial` : "Cuenta borrada");
    document.dispatchEvent(new CustomEvent("panel:recargar-estadisticas"));
  } catch (err) {
    b.disabled = false; b.textContent = "Borrar esta cuenta";
    const m = String(err?.code || err?.message || "");
    toast(m.includes("permission") || m.includes("PERMISSION")
      ? "Falta el permiso de borrado en la base de datos"
      : "No se pudo borrar");
  }
});

/* ============================================================
   Ventas: los pedidos que faltan por cobrar y los ya pagados
   ============================================================ */
const VT_ESTADO = {
  por_cobrar: { etq: "Falta que pague", clase: "carrito" },
  pagada: { etq: "Pagada · falta entregar", clase: "porconfirmar" },
  entregada: { etq: "Terminada", clase: "compro" },
  cancelada: { etq: "Cancelada", clase: "paso" }
};
let ventasCargadas = null;
let vtFiltro = "por_cobrar";
let vtTocado = false;
let vtBusca = "";

const vtMoney = n => "$" + Number(n || 0).toLocaleString("es-MX");

function vtCuando(v) {
  const iso = v.fechaISO;
  if (!iso) return v.fecha || "";
  const d = new Date(iso);
  if (!d.getTime()) return v.fecha || "";
  const h = d.getHours() % 12 || 12;
  const ampm = d.getHours() >= 12 ? "pm" : "am";
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  const cuando = mismoDia ? "hoy" : `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]}`;
  return `${cuando} a las ${h}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}`;
}

function vtLineas(v) {
  let lineas = [];
  try { lineas = JSON.parse(v.lineas || "[]"); } catch { lineas = []; }
  if (lineas.length) {
    return lineas.map(l => `<div class="vt-item">
      <b>${l.qty}×</b> ${l.nombre || l.id}${l.talla ? ` · talla ${l.talla}` : ""}${l.perso ? ` · <span style="color:var(--accent)">${l.perso}</span>` : ""}
    </div>`).join("");
  }
  return `<div class="vt-item">${v.productos || "sin detalle"}</div>`;
}

function vtWhats(tel, v) {
  const num = String(tel || "").replace(/\D/g, "");
  if (num.length < 10) return "";
  const conLada = num.length === 10 ? "52" + num : num;
  const que = v.estado === "por_cobrar"
    ? `Hola ${v.cliente || ""}, te escribo de Deportes Martínez por tu pedido ${v.id}. ¿Ya pudiste hacer la transferencia?`
    : `Hola ${v.cliente || ""}, te escribo de Deportes Martínez por tu pedido ${v.id}.`;
  return `<a class="btn btn--ghost" href="https://wa.me/${conLada}?text=${encodeURIComponent(que)}" target="_blank" rel="noopener">Escribirle por WhatsApp</a>`;
}

function vtFoto(l) {
  const p = productos.find(x => x.id === l.id);
  return p && p.imagen
    ? `<img class="vt-foto" src="${p.imagen}" alt="">`
    : `<div class="vt-foto vt-foto--vacia"></div>`;
}

function vtFila(v) {
  const est = VT_ESTADO[v.estado] || VT_ESTADO.pagada;
  const porCobrar = v.estado === "por_cobrar";
  const cancelada = v.estado === "cancelada";
  let lineas = [];
  try { lineas = JSON.parse(v.lineas || "[]"); } catch { }

  const jerseys = lineas.length
    ? lineas.map(l => `<div class="vt-jersey">
        ${vtFoto(l)}
        <div>
          <b>${l.nombre || l.id}</b>
          <div class="vt-jersey__det">
            ${l.qty > 1 ? `<span class="vt-pill">${l.qty} piezas</span>` : ""}
            ${l.talla ? `<span class="vt-pill">Talla ${l.talla}</span>` : ""}
            ${l.perso ? `<span class="vt-pill vt-pill--oro">${l.perso}</span>` : ""}
          </div>
        </div>
      </div>`).join("")
    : `<div class="vt-jersey"><div><b>${v.productos || "sin detalle"}</b></div></div>`;

  const dir = v.entrega === "domicilio"
    ? `<div class="vt-envio">
         <span class="vt-envio__k">Mandar a</span>
         <span class="vt-envio__v">${v.direccion || "sin dirección"}</span>
         ${v.direccion ? `<button class="vt-copiar" data-copiar="${encodeURIComponent(v.direccion)}">Copiar</button>` : ""}
       </div>`
    : `<div class="vt-envio"><span class="vt-envio__k">Pasa a recogerlo</span></div>`;

  return `<article class="vt-card${porCobrar ? " vt-card--pendiente" : ""}${v.estado === "pagada" ? " vt-card--entregar" : ""}${cancelada ? " vt-card--cancelada" : ""}">
    <header class="vt-card__top">
      <span class="st-tag st-tag--${est.clase}">${est.etq}</span>
      <span class="vt-cuando">${vtCuando(v)}</span>
      <b class="vt-total">${vtMoney(v.total)}</b>
    </header>

    ${jerseys}

    <div class="vt-quien">
      <b>${v.cliente || v.clienteEmail || "Sin nombre"}</b>${v.prueba ? ` <span class="vt-pill">prueba</span>` : ""}
      ${v.telefono ? `<span class="vt-quien__tel">${v.telefono}</span>` : ""}
    </div>
    ${dir}
    <div class="vt-folio">
      <span class="vt-folio__k">Pedido</span>
      <b class="vt-folio__v">${v.folio || v.id}</b>
      <span class="vt-folio__m">pagó con ${v.metodo === "transferencia" ? "transferencia" : "tarjeta"}</span>
    </div>

    ${porCobrar ? `<div class="vt-acciones">
      <button class="btn" data-vt-pagada="${v.id}">✓ Ya me pagó</button>
      ${vtWhats(v.telefono, v)}
      <button class="btn btn--danger" data-vt-cancelar="${v.id}">No pagó · cancelar</button>
    </div>` : ""}
    ${v.estado === "pagada" ? `<div class="vt-acciones">
      <button class="btn" data-vt-entregada="${v.id}">${v.entrega === "domicilio" ? "✓ Ya lo envié" : "✓ Ya lo recogió"}</button>
      ${vtWhats(v.telefono, v)}
    </div>` : ""}
    ${v.estado === "entregada" || cancelada ? `<div class="vt-acciones">
      ${vtWhats(v.telefono, v)}
      <button class="btn btn--danger" data-vt-borrar="${v.id}">Borrar de la base</button>
    </div>` : ""}
  </article>`;
}

function pintarVentas() {
  const cuerpo = $("#ventasBody");
  if (!cuerpo || !ventasCargadas) return;
  const cuenta = e => ventasCargadas.filter(v => (v.estado || "pagada") === e).length;
  const nCobrar = cuenta("por_cobrar");
  $("#vtNumCobrar").textContent = nCobrar;
  $("#vtNumPagadas").textContent = cuenta("pagada");
  const nEntregadas = $("#vtNumEntregadas");
  if (nEntregadas) nEntregadas.textContent = cuenta("entregada");
  $("#vtNumCanceladas").textContent = cuenta("cancelada");
  /* el número del menú suma lo que requiere acción: cobrar + entregar */
  const pendientes = nCobrar + cuenta("pagada");
  const chip = $("#pnavPorCobrar");
  if (chip) { chip.textContent = pendientes; chip.hidden = !pendientes; }

  /* Buscar por folio, nombre o teléfono. Con folio se busca en TODAS las pestañas:
     es la forma de comprobar si un pedido que te dicen por WhatsApp existe de verdad. */
  if (vtBusca) {
    const q = vtBusca.toLowerCase().replace(/\s/g, "");
    const hallados = ventasCargadas.filter(v =>
      String(v.folio || v.id).toLowerCase().replace(/\s/g, "").includes(q) ||
      String(v.cliente || "").toLowerCase().includes(vtBusca.toLowerCase()) ||
      String(v.telefono || "").replace(/\D/g, "").includes(q.replace(/\D/g, "")) && q.replace(/\D/g, "").length >= 4
    );
    cuerpo.innerHTML = hallados.length
      ? `<div class="vt-aviso">Encontré <b>${hallados.length}</b> ${hallados.length === 1 ? "pedido" : "pedidos"} con «${vtBusca}».</div>` +
        hallados.map(vtFila).join("")
      : `<div class="vt-aviso vt-aviso--malo">No hay ningún pedido con «${vtBusca}».
           Si alguien te dio ese número, <b>no es un pedido real</b> de tu tienda.</div>`;
    return;
  }

  const lista = ventasCargadas.filter(v => (v.estado || "pagada") === vtFiltro);
  const vacio = {
    por_cobrar: "Todo al corriente: nadie te debe nada.",
    pagada: "No tienes nada pendiente de entregar.",
    entregada: "Todavía no has terminado ningún pedido.",
    cancelada: "No has cancelado ningún pedido."
  }[vtFiltro];
  const total = lista.reduce((a, v) => a + Number(v.total || 0), 0);
  if (!lista.length) { cuerpo.innerHTML = `<p class="st-vacio">${vacio}</p>`; return; }

  /* Separado por cómo lo recibe: lo de domicilio hay que empaquetar y mandar,
     lo de tienda solo apartarlo y esperar a que pasen. Son dos trabajos distintos. */
  const domicilio = lista.filter(v => v.entrega === "domicilio");
  const tienda = lista.filter(v => v.entrega !== "domicilio");
  const grupo = (titulo, ayuda, arr) => {
    if (!arr.length) return "";
    const suma = arr.reduce((a, v) => a + Number(v.total || 0), 0);
    return `<div class="vt-grupo">
        <div class="vt-grupo__h"><h4>${titulo}</h4><span class="vt-num">${arr.length}</span></div>
        <span class="vt-grupo__suma">${ayuda} · <b>${vtMoney(suma)}</b></span>
      </div>
      ${arr.map(vtFila).join("")}`;
  };
  const AVISOS = {
    por_cobrar: `Estas personas ya apartaron su jersey pero <b>todavía no te pagan</b>.
      Cuando te llegue el dinero dale a <b>Ya me pagó</b>. Si al final no pagan, cancélalo y el jersey vuelve al catálogo.`,
    pagada: `Ya te pagaron: <b>falta entregarlos</b>. Los de domicilio hay que empaquetar y mandar;
      los de tienda, tenerlos apartados hasta que pasen. Cuando salga cada uno, dale al botón y pasa a Terminadas.`,
    entregada: `Pedidos cerrados: pagados y entregados. Nada que hacer con ellos.`
  };
  const aviso = AVISOS[vtFiltro] ? `<div class="vt-aviso">${AVISOS[vtFiltro]}</div>` : "";
  const titulos = vtFiltro === "pagada"
    ? ["📦 Hay que enviarlos", "Empaquétalos y mándalos", "🏪 Pasan a recogerlos", "Tenlos apartados hasta que vengan"]
    : ["🏠 A domicilio", "Se mandaron por paquetería", "🏪 Recogieron en tienda", "Pasaron por él"];
  cuerpo.innerHTML = aviso +
    `<p class="st-bloque__ayuda">${lista.length} ${lista.length === 1 ? "pedido" : "pedidos"} · ${vtMoney(total)} en total</p>` +
    grupo(titulos[0], titulos[1], domicilio) +
    grupo(titulos[2], titulos[3], tienda);
}

async function cargarVentas() {
  const cuerpo = $("#ventasBody");
  if (!cuerpo) return;
  try {
    ventasCargadas = await db.listarVentas();
    /* si hay pedidos esperando pago, se abre ahí: es lo que hay que atender */
    /* abre en lo que hay que atender: primero cobrar, luego entregar */
    if (!vtTocado) {
      if (ventasCargadas.some(v => v.estado === "por_cobrar")) vtFiltro = "por_cobrar";
      else if (ventasCargadas.some(v => v.estado === "pagada")) vtFiltro = "pagada";
      else vtFiltro = "entregada";
    }
    document.querySelectorAll(".vt-tab").forEach(t => t.classList.toggle("on", t.dataset.vt === vtFiltro));
    pintarVentas();
  } catch (e) {
    cuerpo.innerHTML = `<p class="st-error">No se pudieron leer las ventas: ${e.message}</p>`;
  }
}

document.addEventListener("click", async e => {
  const tab = e.target.closest("[data-vt]");
  if (tab) {
    vtFiltro = tab.dataset.vt;
    vtTocado = true;
    document.querySelectorAll(".vt-tab").forEach(t => t.classList.toggle("on", t === tab));
    pintarVentas();
    return;
  }
  if (e.target.id === "ventasRefrescar") { cargarVentas(); return; }
  if (e.target.id === "vtBuscarX") {
    vtBusca = ""; $("#vtBuscar").value = ""; $("#vtBuscarX").hidden = true; pintarVentas(); return;
  }

  const cop = e.target.closest("[data-copiar]");
  if (cop) {
    const txt = decodeURIComponent(cop.dataset.copiar);
    try {
      await navigator.clipboard.writeText(txt);
      cop.textContent = "¡Copiada!";
      setTimeout(() => { cop.textContent = "Copiar"; }, 1600);
    } catch { toast("No se pudo copiar"); }
    return;
  }

  const pag = e.target.closest("[data-vt-pagada]");
  if (pag) {
    if (!confirm("¿Ya te llegó el dinero de este pedido?\n\nVa a pasar a Ya pagadas.")) return;
    pag.disabled = true; pag.textContent = "Guardando…";
    try {
      await db.marcarVentaPagada(pag.dataset.vtPagada);
      toast("Pedido marcado como pagado");
      await cargarVentas();
    } catch (err) {
      pag.disabled = false; pag.textContent = "Ya me pagó";
      toast("No se pudo guardar");
    }
    return;
  }

  const ent = e.target.closest("[data-vt-entregada]");
  if (ent) {
    const esEnvio = ent.textContent.includes("envié");
    if (!confirm(esEnvio
      ? "¿Ya mandaste este pedido?\n\nPasa a Terminadas."
      : "¿Ya pasó el cliente por su jersey?\n\nPasa a Terminadas.")) return;
    ent.disabled = true; ent.textContent = "Guardando…";
    try {
      await db.marcarVentaEntregada(ent.dataset.vtEntregada);
      toast(esEnvio ? "Pedido enviado · queda terminado" : "Pedido entregado · queda terminado");
      await cargarVentas();
    } catch (err) {
      ent.disabled = false;
      ent.textContent = esEnvio ? "✓ Ya lo envié" : "✓ Ya lo recogió";
      toast("No se pudo guardar");
    }
    return;
  }

  const can = e.target.closest("[data-vt-cancelar]");
  if (can) {
    if (!confirm("¿Cancelar este pedido?\n\nLos jerseys que estaban apartados regresan al catálogo.")) return;
    can.disabled = true; can.textContent = "Cancelando…";
    try {
      const n = await db.cancelarVenta(can.dataset.vtCancelar);
      toast(n ? `Pedido cancelado · ${n} ${n === 1 ? "jersey regresó" : "jerseys regresaron"} al catálogo` : "Pedido cancelado");
      await cargarVentas();
    } catch (err) {
      can.disabled = false; can.textContent = "No pagó · cancelar";
      toast("No se pudo cancelar");
    }
    return;
  }
});

document.addEventListener("input", e => {
  if (e.target.id !== "vtBuscar") return;
  vtBusca = e.target.value.trim();
  const x = $("#vtBuscarX");
  if (x) x.hidden = !vtBusca;
  pintarVentas();
});

/* ============================================================
   Códigos de descuento
   ============================================================ */
let promosCargadas = null;
let prTipo = "porcentaje";
let prDur = "siempre";
let prEditando = null;

const prOv = $("#promoOv");
const prAbrir = () => prOv.classList.add("open");
const prCerrar = () => prOv.classList.remove("open");

function prPintarEjemplo() {
  const v = Number($("#prValor").value || 0);
  const el = $("#prEjemplo");
  if (!el) return;
  if (!v) { el.textContent = ""; return; }
  el.textContent = prTipo === "porcentaje"
    ? `En un jersey de $1,000 el cliente pagaría ${vtMoney(1000 - Math.round(1000 * v / 100))}.`
    : `En un jersey de $1,000 el cliente pagaría ${vtMoney(Math.max(0, 1000 - v))}.`;
}

function prSetTipo(t) {
  prTipo = t;
  document.querySelectorAll("[data-tipo]").forEach(b => b.classList.toggle("on", b.dataset.tipo === t));
  $("#prUnidad").textContent = t === "porcentaje" ? "%" : "$";
  prPintarEjemplo();
}

function prSetDur(d) {
  prDur = d;
  document.querySelectorAll("[data-dur]").forEach(b => b.classList.toggle("on", b.dataset.dur === d));
  $("#prDiasBox").style.display = d === "dias" ? "" : "none";
  $("#prFechaBox").style.display = d === "fecha" ? "" : "none";
}

function prLimpiar() {
  prEditando = null;
  $("#promoTitulo").textContent = "Nuevo código";
  $("#prCodigo").value = ""; $("#prCodigo").disabled = false;
  $("#prValor").value = ""; $("#prDias").value = ""; $("#prFecha").value = "";
  $("#prMinimo").value = ""; $("#prUsosMax").value = "";
  $("#prActivo").checked = true;
  prSetTipo("porcentaje"); prSetDur("siempre"); prPintarEjemplo();
}

/* cómo se lee el vencimiento en la lista */
function prVigencia(p) {
  if (!p.vence) return { txt: "Sin fecha límite", vencido: false };
  const hasta = new Date(p.vence + "T23:59:59");
  const vencido = hasta.getTime() < Date.now();
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const txt = `${hasta.getDate()} ${meses[hasta.getMonth()]} ${hasta.getFullYear()}`;
  if (vencido) return { txt: `Se venció el ${txt}`, vencido: true };
  const dias = Math.ceil((hasta.getTime() - Date.now()) / 86400000);
  return { txt: dias <= 7 ? `Vence en ${dias} ${dias === 1 ? "día" : "días"} (${txt})` : `Vence el ${txt}`, vencido: false };
}

function prFila(p) {
  const v = prVigencia(p);
  const usos = Number(p.usos || 0);
  const tope = Number(p.usosMax || 0);
  const agotado = tope > 0 && usos >= tope;
  const apagado = p.activo === false;
  const muerto = apagado || v.vencido || agotado;
  const razon = apagado ? "Apagado" : (v.vencido ? "Vencido" : (agotado ? "Se acabaron los usos" : "Funcionando"));
  return `<article class="pr-card${muerto ? " pr-card--off" : ""}">
    <header class="pr-card__top">
      <b class="pr-codigo">${p.codigo}</b>
      <span class="pr-desc">${p.tipo === "fijo" ? vtMoney(p.valor) + " menos" : p.valor + "% de descuento"}</span>
      <span class="st-tag st-tag--${muerto ? "paso" : "compro"}">${razon}</span>
    </header>
    <div class="pr-datos">
      <span>${v.txt}</span>
      <span>Usado ${usos} ${usos === 1 ? "vez" : "veces"}${tope ? ` de ${tope}` : ""}</span>
      ${p.minimo ? `<span>Solo en compras de ${vtMoney(p.minimo)} o más</span>` : ""}
    </div>
    <div class="vt-acciones">
      <button class="btn btn--ghost" data-pr-editar="${p.codigo}">Editar</button>
      <button class="btn btn--ghost" data-pr-toggle="${p.codigo}">${apagado ? "Encender" : "Apagar"}</button>
      <button class="btn btn--danger" data-pr-borrar="${p.codigo}">Borrar</button>
    </div>
  </article>`;
}

function pintarPromos() {
  const cont = $("#promosBody");
  if (!cont || !promosCargadas) return;
  if (!promosCargadas.length) {
    cont.innerHTML = `<div class="st-vacio">Todavía no tienes códigos.
      Crea uno para repartirlo en la próxima expo.</div>`;
    return;
  }
  const vivos = promosCargadas.filter(p => {
    const v = prVigencia(p);
    const tope = Number(p.usosMax || 0);
    return p.activo !== false && !v.vencido && !(tope > 0 && Number(p.usos || 0) >= tope);
  });
  cont.innerHTML =
    `<p class="st-bloque__ayuda">${vivos.length} funcionando de ${promosCargadas.length}</p>` +
    promosCargadas.map(prFila).join("");
}

async function cargarPromos() {
  const cont = $("#promosBody");
  if (!cont) return;
  try {
    promosCargadas = await db.listarPromos();
    pintarPromos();
  } catch (e) {
    cont.innerHTML = `<p class="st-error">No se pudieron leer los códigos: ${e.message}</p>`;
  }
}

$("#promoNueva")?.addEventListener("click", () => { prLimpiar(); prAbrir(); });
$("#promoX")?.addEventListener("click", prCerrar);
$("#prCancelar")?.addEventListener("click", prCerrar);
prOv?.addEventListener("click", e => { if (e.target === prOv) prCerrar(); });
$("#prValor")?.addEventListener("input", prPintarEjemplo);

document.addEventListener("click", e => {
  const t = e.target.closest("[data-tipo]");
  if (t) { prSetTipo(t.dataset.tipo); return; }
  const d = e.target.closest("[data-dur]");
  if (d) { prSetDur(d.dataset.dur); return; }
});

$("#prGuardar")?.addEventListener("click", async () => {
  const codigo = $("#prCodigo").value.trim().toUpperCase().replace(/\s+/g, "");
  const valor = Number($("#prValor").value || 0);
  if (!codigo) { toast("Ponle un código"); $("#prCodigo").focus(); return; }
  if (!/^[A-Z0-9-]{3,24}$/.test(codigo)) { toast("Solo letras, números y guiones (3 a 24)"); return; }
  if (!valor || valor <= 0) { toast("Pon cuánto descuenta"); $("#prValor").focus(); return; }
  if (prTipo === "porcentaje" && valor > 90) { toast("Un descuento de más del 90% seguro es un error"); return; }

  let vence = "";
  if (prDur === "dias") {
    const dias = Number($("#prDias").value || 0);
    if (!dias) { toast("¿Cuántos días dura?"); $("#prDias").focus(); return; }
    const d2 = new Date(); d2.setDate(d2.getDate() + dias);
    vence = d2.toISOString().slice(0, 10);
  } else if (prDur === "fecha") {
    vence = $("#prFecha").value;
    if (!vence) { toast("Elige la fecha"); $("#prFecha").focus(); return; }
  }

  const datos = {
    tipo: prTipo,
    valor,
    vence,
    minimo: Number($("#prMinimo").value || 0),
    usosMax: Number($("#prUsosMax").value || 0),
    activo: $("#prActivo").checked,
    actualizado: new Date().toISOString()
  };
  if (!prEditando) { datos.creado = new Date().toISOString(); datos.usos = 0; }

  const btn = $("#prGuardar"); btn.disabled = true; btn.textContent = "Guardando…";
  try {
    await db.guardarPromo(codigo, datos);
    toast(prEditando ? "Código actualizado" : `Código <b>${codigo}</b> listo para repartir`);
    prCerrar();
    await cargarPromos();
  } catch (err) { toast("No se pudo guardar"); }
  btn.disabled = false; btn.textContent = "Guardar código";
});

document.addEventListener("click", async e => {
  const ed = e.target.closest("[data-pr-editar]");
  if (ed) {
    const p = (promosCargadas || []).find(x => x.codigo === ed.dataset.prEditar);
    if (!p) return;
    prLimpiar();
    prEditando = p.codigo;
    $("#promoTitulo").textContent = "Editar " + p.codigo;
    $("#prCodigo").value = p.codigo; $("#prCodigo").disabled = true;
    $("#prValor").value = p.valor || "";
    $("#prMinimo").value = p.minimo || "";
    $("#prUsosMax").value = p.usosMax || "";
    $("#prActivo").checked = p.activo !== false;
    prSetTipo(p.tipo === "fijo" ? "fijo" : "porcentaje");
    if (p.vence) { prSetDur("fecha"); $("#prFecha").value = p.vence; } else prSetDur("siempre");
    prPintarEjemplo();
    prAbrir();
    return;
  }
  const tg = e.target.closest("[data-pr-toggle]");
  if (tg) {
    const p = (promosCargadas || []).find(x => x.codigo === tg.dataset.prToggle);
    if (!p) return;
    tg.disabled = true;
    try {
      await db.guardarPromo(p.codigo, { activo: p.activo === false, actualizado: new Date().toISOString() });
      await cargarPromos();
    } catch { toast("No se pudo"); tg.disabled = false; }
    return;
  }
  const bo = e.target.closest("[data-pr-borrar]");
  if (bo) {
    const cod = bo.dataset.prBorrar;
    if (!confirm(`¿Borrar el código ${cod}?\n\nSi alguien ya lo tiene en la mano, dejará de funcionar.`)) return;
    bo.disabled = true;
    try { await db.borrarPromo(cod); toast("Código borrado"); await cargarPromos(); }
    catch { toast("No se pudo borrar"); bo.disabled = false; }
  }
});

/* ============================================================
   Lo que piden — jerseys que la gente buscó y no había.
   Llegan de las páginas de "Próximamente" y del asistente.
   ============================================================ */
let sugerenciasCargadas = null;

/* Las sugerencias las escribe cualquiera desde la web: hay que escaparlas antes
   de pintarlas o alguien podría meter HTML y que corra en el panel del dueño. */
const escHTML = t => String(t ?? "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

function cuandoFue(iso) {
  const t = new Date(iso);
  if (isNaN(t)) return "";
  const min = Math.round((Date.now() - t.getTime()) / 60000);
  if (min < 60) return min <= 1 ? "hace un momento" : `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

const DEPORTE_PIDEN = { basket: "Basketball", americano: "Americano", futbol: "Futbol" };

/* El botón que hace que "Lo que piden" valga: avisarle a quien lo pidió.
   Si no dejó WhatsApp no sale — no tiene sentido un botón que no lleva a nada. */
function pidenWhats(s) {
  const num = String(s.tel || "").replace(/\D/g, "");
  if (num.length < 10) return "";
  const conLada = num.length === 10 ? "52" + num : num;
  const hola = s.nombre ? `Hola ${s.nombre}` : "Hola";
  const que = `${hola}, te escribo de Deportes Martínez. Nos pediste «${s.texto}» y ya lo conseguimos. ¿Te lo aparto?`;
  return `<a class="btn btn--ghost" href="https://wa.me/${conLada}?text=${encodeURIComponent(que)}" target="_blank" rel="noopener">Avisarle por WhatsApp</a>`;
}

function pintarSugerencias() {
  const cuerpo = $("#pidenBody");
  if (!cuerpo || !sugerenciasCargadas) return;
  const lista = sugerenciasCargadas;
  /* primero los que dejaron WhatsApp: son los que se pueden convertir en venta */
  const pendientes = lista.filter(s => !s.atendida)
    .sort((a, b) => (b.tel ? 1 : 0) - (a.tel ? 1 : 0));

  const chip = $("#pnavPiden");
  if (chip) { chip.textContent = pendientes.length; chip.hidden = !pendientes.length; }

  if (!lista.length) {
    cuerpo.innerHTML = `<p class="st-vacio">Todavía nadie ha pedido nada. Aquí van a caer los jerseys que la gente busca y no tienes.</p>`;
    return;
  }
  const tarjeta = s => `
    <article class="pd-card${s.atendida ? " pd-card--ok" : ""}">
      <div class="pd-card__top">
        ${s.deporte ? `<span class="vt-pill">${DEPORTE_PIDEN[s.deporte] || s.deporte}</span>` : ""}
        <span class="pd-cuando">${cuandoFue(s.fecha)}</span>
        ${s.atendida ? `<span class="st-tag st-tag--compro">Ya la conseguiste</span>` : ""}
      </div>
      <p class="pd-texto">${escHTML(s.texto || "")}</p>
      <div class="pd-quien">
        ${s.nombre ? `Lo pidió <b>${escHTML(s.nombre)}</b>` : "Sin nombre"}
        ${s.tel ? `<span class="pd-tel">${escHTML(s.tel)}</span>` : `<span class="pd-sintel">no dejó WhatsApp</span>`}
      </div>
      <div class="pd-acciones">
        <button class="btn ${s.atendida ? "btn--ghost" : ""}" data-sug-ok="${s.id}" data-val="${s.atendida ? "0" : "1"}">
          ${s.atendida ? "Volver a pendiente" : "✓ Ya la conseguí"}
        </button>
        ${pidenWhats(s)}
        <button class="btn btn--danger" data-sug-del="${s.id}">Borrar</button>
      </div>
    </article>`;

  const atendidas = lista.filter(s => s.atendida);
  const grupo = (t, ayuda, arr) => arr.length ? `
    <div class="vt-grupo">
      <div class="vt-grupo__h"><h4>${t}</h4><span class="vt-num">${arr.length}</span></div>
      <span class="vt-grupo__suma">${ayuda}</span>
    </div>${arr.map(tarjeta).join("")}` : "";

  cuerpo.innerHTML =
    grupo("Por conseguir", "Esto es lo que te están pidiendo y no tienes.", pendientes) +
    grupo("Ya conseguidas", "Las que ya marcaste como resueltas.", atendidas);
}

async function cargarSugerencias(forzar) {
  const cuerpo = $("#pidenBody");
  if (!cuerpo) return;
  if (sugerenciasCargadas && !forzar) { pintarSugerencias(); return; }
  cuerpo.innerHTML = `<p class="st-vacio">Cargando…</p>`;
  try {
    sugerenciasCargadas = await db.listarSugerencias();
    pintarSugerencias();
  } catch (err) {
    const m = String(err?.code || err?.message || "");
    cuerpo.innerHTML = `<p class="st-error">${m.includes("permission") || m.includes("PERMISSION")
      ? "Falta la regla de la colección <b>sugerencias</b> en la base de datos."
      : "No se pudieron cargar."}</p>`;
  }
}

document.addEventListener("panel:seccion", e => {
  if (e.detail?.sec === "piden") cargarSugerencias();
});
/* el contador del menú se llena al entrar, sin esperar a que abran la sección */
document.addEventListener("DOMContentLoaded", () => {
  db.listarSugerencias().then(l => {
    sugerenciasCargadas = l;
    const p = l.filter(s => !s.atendida).length;
    const chip = $("#pnavPiden");
    if (chip) { chip.textContent = p; chip.hidden = !p; }
  }).catch(() => { });
});

$("#pidenRefrescar")?.addEventListener("click", () => cargarSugerencias(true));

/* Borrado definitivo de un pedido ya terminado o cancelado. Solo se ofrece ahí:
   una venta por cobrar o por entregar todavía tiene stock apartado y trabajo detrás. */
document.addEventListener("click", async e => {
  const bo = e.target.closest("[data-vt-borrar]");
  if (bo) {
    const id = bo.dataset.vtBorrar;
    const v = (ventasCargadas || []).find(x => x.id === id);
    const quien = v?.cliente ? ` de ${v.cliente}` : "";
    if (!confirm(`¿Borrar para siempre el pedido ${v?.folio || id}${quien}?\n\nDesaparece de tus registros y de las estadísticas. No se puede deshacer.`)) return;
    bo.disabled = true; bo.textContent = "Borrando…";
    try {
      await db.borrarVenta(id);
      ventasCargadas = ventasCargadas.filter(x => x.id !== id);
      pintarVentas();
      toast("Pedido borrado de la base");
      document.dispatchEvent(new CustomEvent("panel:recargar-estadisticas"));
    } catch {
      bo.disabled = false; bo.textContent = "Borrar de la base";
      toast("No se pudo borrar");
    }
    return;
  }
  const ok = e.target.closest("[data-sug-ok]");
  if (ok) {
    const id = ok.dataset.sugOk, val = ok.dataset.val === "1";
    ok.disabled = true;
    try {
      await db.marcarSugerencia(id, val);
      const s = sugerenciasCargadas.find(x => x.id === id);
      if (s) s.atendida = val;
      pintarSugerencias();
      /* recién marcada y con WhatsApp: se le recuerda avisarle, que es el punto */
      if (val && s?.tel) {
        const boton = $(`[data-sug-ok="${id}"]`)?.closest(".pd-card")?.querySelector('a[href*="wa.me"]');
        if (boton) toast(`Listo. <b>Avísale a ${s.nombre || "quien lo pidió"}</b> con el botón de WhatsApp.`);
      }
    } catch { ok.disabled = false; toast("No se pudo guardar"); }
    return;
  }
  const del = e.target.closest("[data-sug-del]");
  if (del) {
    if (!confirm("¿Borrar esta petición? No se puede deshacer.")) return;
    const id = del.dataset.sugDel;
    del.disabled = true;
    try {
      await db.borrarSugerencia(id);
      sugerenciasCargadas = sugerenciasCargadas.filter(x => x.id !== id);
      pintarSugerencias();
    } catch { del.disabled = false; toast("No se pudo borrar"); }
  }
});
