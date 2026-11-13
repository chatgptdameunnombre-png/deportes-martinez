import { limpiarSlug } from "./promotor.js?v=137";
import { tiempo, hace, sinRepetidos, tarjeta, barra, bloque } from "./estadisticas.js?v=137";

const $ = s => document.querySelector(s);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "$" + Number(n || 0).toLocaleString("es-MX");
const BASE = location.origin + location.pathname.replace(/[^/]*$/, "");
const linkDe = slug => `${BASE}?p=${slug}`;
const copiarBtn = (txt, etiqueta) => `<button type="button" class="btn btn--ghost prm__copiar" data-copiar="${esc(txt)}">${etiqueta}</button>`;
const APARATO = { movil: "Teléfono", tablet: "Tablet", escritorio: "Computadora" };

let db = null;
let datos = { filas: [], visitas: [] };
let filtro = "";

const pagada = v => v.estado !== "por_cobrar" && v.estado !== "cancelada";
const suma = vs => vs.reduce((a, v) => a + Number(v.total || 0), 0);

function etiquetaVisita(s) {
  const pag = s.ventas.filter(pagada), pend = s.ventas.filter(v => v.estado === "por_cobrar");
  if (pag.length) return ["compro", `Compró y pagó ${money(suma(pag))}`];
  if (pend.length) return ["porconfirmar", `Compró · falta que pague ${money(suma(pend))}`];
  const prods = s.productos || {};
  if (Object.values(prods).some(d => d.carrito)) return ["carrito", "Dejó el carrito"];
  if (Object.keys(prods).length) return ["miro", "Miró jerseys"];
  return ["paso", "Solo pasó"];
}

function visitaHTML(s, nombres) {
  const [clase, etiqueta] = etiquetaVisita(s);
  const vio = Object.values(s.productos || {}).map(d => d.nombre).filter(Boolean);
  return `<details class="st-visita">
    <summary class="st-visita__cab">
      <span class="st-visita__cuando">${hace(s.inicio)}</span>
      <span class="st-visita__quien">${esc(s.nombreCliente || s.clienteEmail || "Visitante")}<span class="st-visita__vio"> · de ${esc(nombres[s.promotor] || s.promotor)}</span></span>
      <span class="st-visita__tiempo">${tiempo(s.duracion)} · ${esc(APARATO[s.dispositivo] || s.dispositivo || "")}</span>
      <span class="st-tag st-tag--${clase}">${etiqueta}</span>
    </summary>
    <div class="st-visita__cuerpo">
      ${vio.length ? `Vio: ${vio.slice(0, 6).map(esc).join(", ")}${vio.length > 6 ? "…" : ""}` : "No abrió ningún jersey."}
      ${s.ventas.length ? `<br>Pedido ${s.ventas.map(v => `<b>${esc(v.folio || v.id)}</b>`).join(", ")}` : ""}
      ${(s.eventos || []).length ? `<div class="st-visita__acciones"><button class="btn btn--ghost" data-prm-pasos="${esc(s.id)}">Ver qué hizo paso a paso</button></div>` : ""}
    </div>
  </details>`;
}

function pintarVisitas() {
  const nombres = Object.fromEntries(datos.filas.map(f => [f.slug, f.nombre]));
  const lista = datos.visitas.filter(s => !filtro || s.promotor === filtro);
  const cont = $("#prmVisitas");
  if (!cont) return;
  cont.innerHTML = lista.length
    ? `<div class="st-visitas">${lista.slice(0, 40).map(s => visitaHTML(s, nombres)).join("")}</div>${lista.length > 40 ? `<p class="st-bloque__ayuda">Se muestran las 40 más recientes de ${lista.length}.</p>` : ""}`
    : `<p class="st-vacio">Todavía no hay visitas${filtro ? " de este promotor" : ""}.</p>`;
}

function pintar() {
  const { filas, visitas } = datos;
  const tot = filas.reduce((a, f) => ({ visitas: a.visitas + f.visitas, personas: a.personas + f.personas, compras: a.compras + f.compras, vendido: a.vendido + f.vendido, porCobrar: a.porCobrar + f.porCobrar }), { visitas: 0, personas: 0, compras: 0, vendido: 0, porCobrar: 0 });
  $("#prmResumen").innerHTML = `<div class="stat-row st-tarjetas">
    ${tarjeta(filas.filter(f => f.activo !== false).length, "Promotores activos", `${filas.length} en total`)}
    ${tarjeta(tot.visitas, "Visitas que trajeron", `${tot.personas} ${tot.personas === 1 ? "persona" : "personas"} distintas`)}
    ${tarjeta(tot.compras, "Compras", tot.visitas ? `${Math.round(tot.compras / tot.visitas * 100)}% de las visitas` : "")}
    ${tarjeta(money(tot.vendido), "Vendido y pagado", tot.porCobrar ? `${money(tot.porCobrar)} falta que paguen` : "solo lo ya cobrado")}
  </div>`;
  if (!filas.length) { $("#prmTabla").innerHTML = `<p class="st-vacio">Todavía no hay promotores. Crea el primero arriba.</p>`; return; }
  const max = Math.max(1, ...filas.map(f => f.visitas));
  const ranking = filas.filter(f => f.visitas).slice(0, 8).map((f, i) => `<div class="prm__rank">
      <span class="prm__rank-n">${i + 1}</span>
      <div class="prm__rank-c"><b>${esc(f.nombre)}</b>${barra(f.visitas, max, `${f.visitas} ${f.visitas === 1 ? "visita" : "visitas"} · ${f.compras} ${f.compras === 1 ? "compra" : "compras"}`)}</div>
    </div>`).join("");
  const tarjetas = filas.map(f => `
    <article class="prm__card${f.activo === false ? " prm__card--off" : ""}">
      <div class="prm__quien">
        <b>${esc(f.nombre)}</b>
        <span>Código <b class="prm__cod">${esc(f.codigo || f.slug.toUpperCase())}</b>${f.activo === false ? " · pausado" : ""}${f.ultima ? ` · última visita ${hace(f.ultima)}` : ""}</span>
      </div>
      <div class="prm__nums">
        <div><b>${f.visitas}</b><span>visitas</span></div>
        <div><b>${f.personas}</b><span>personas</span></div>
        <div><b>${f.compras}</b><span>compras</span></div>
        <div><b>${money(f.vendido)}</b><span>${f.porCobrar ? `pagado · ${money(f.porCobrar)} por cobrar` : "pagado"}</span></div>
      </div>
      <div class="prm__acc">
        ${f.visitas ? `<button type="button" class="btn btn--ghost" data-prm-filtro="${esc(f.slug)}">Ver sus visitas</button>` : ""}
        ${copiarBtn(linkDe(f.slug), "Copiar link")}
        <button type="button" class="btn btn--ghost" data-activo="${esc(f.slug)}" data-on="${f.activo === false ? "1" : "0"}">${f.activo === false ? "Reactivar" : "Pausar"}</button>
        <button type="button" class="btn btn--ghost prm__borrar" data-borrar="${esc(f.slug)}" data-nombre="${esc(f.nombre)}">Borrar</button>
      </div>
    </article>`).join("");
  const opciones = `<option value="">Todos los promotores</option>` + filas.filter(f => f.visitas).map(f => `<option value="${esc(f.slug)}"${filtro === f.slug ? " selected" : ""}>${esc(f.nombre)} (${f.visitas})</option>`).join("");
  $("#prmTabla").innerHTML = `
    ${visitas.length ? bloque("Quién te trae más gente", `<div class="prm__ranking">${ranking}</div>`) : ""}
    ${bloque("Tus promotores", tarjetas)}
    ${bloque("Visita por visita", `<div class="prm__filtro"><select class="input" id="prmFiltro">${opciones}</select></div><div id="prmVisitas"></div>`, "prmDetalle", "Abre cualquiera para ver qué hizo esa persona.")}`;
  pintarVisitas();
}

async function cargar() {
  $("#prmTabla").innerHTML = `<p class="st-vacio">Cargando…</p>`;
  try {
    const [proms, ses, ventas] = await Promise.all([db.listarPromotores(), db.sesionesDePromotores(), db.listarVentas()]);
    const porRef = new Map(ventas.filter(v => v.estado !== "cancelada").map(v => [String(v.folio || v.id).replace(/^TR-/, ""), v]));
    const fechaDe = v => new Date(v.fechaISO || v.confirmada || v.fecha || 0).getTime();
    const candidatas = new Map();
    for (const s of ses) {
      delete s.venta;
      s.ventas = [];
      const refs = Array.isArray(s.refPedidos) && s.refPedidos.length ? s.refPedidos : [s.refPedido];
      for (const ref of refs) {
        const v = porRef.get(String(ref || "").replace(/^TR-/, ""));
        if (!v) continue;
        const cuando = fechaDe(v), inicio = new Date(s.inicio || 0).getTime();
        if (cuando && (inicio > cuando + 10 * 60e3 || inicio < cuando - 6 * 3600e3)) continue;
        if (v.clienteUid && s.clienteUid && v.clienteUid !== s.clienteUid) continue;
        const clave = v.folio || v.id;
        const prev = candidatas.get(clave);
        if (!prev || inicio > new Date(prev.s.inicio || 0).getTime()) candidatas.set(clave, { s, v });
      }
    }
    for (const { s, v } of candidatas.values()) {
      s.ventas.push(v);
      if (!s.nombreCliente && v.cliente) s.nombreCliente = v.cliente;
    }
    ses.sort((a, b) => String(a.inicio || "").localeCompare(String(b.inicio || "")));
    ses.reverse();
    const filas = proms.map(p => {
      const suyas = ses.filter(s => s.promotor === p.slug);
      const todas = suyas.flatMap(s => s.ventas);
      const pagadas = todas.filter(pagada), pendientes = todas.filter(v => v.estado === "por_cobrar");
      return {
        ...p,
        visitas: suyas.length,
        personas: new Set(suyas.map(s => s.uid || s.id)).size,
        compras: pagadas.length,
        vendido: suma(pagadas),
        porCobrar: suma(pendientes),
        ultima: suyas[0]?.inicio || ""
      };
    }).sort((a, b) => b.vendido - a.vendido || b.visitas - a.visitas);
    datos = { filas, visitas: ses.filter(s => proms.some(p => p.slug === s.promotor)) };
    if (filtro && !filas.some(f => f.slug === filtro)) filtro = "";
    pintar();
  } catch (e) {
    $("#prmResumen").innerHTML = "";
    $("#prmTabla").innerHTML = `<p class="st-vacio">No se pudo cargar (${esc(e?.code || e?.message || e)}). Revisa que estén publicadas las reglas nuevas.</p>`;
  }
}

async function crear(e) {
  e.preventDefault();
  const nombre = $("#prmNombre").value.trim();
  const slug = limpiarSlug($("#prmCodigo").value);
  const err = $("#prmErr");
  err.textContent = "";
  if (!nombre) return;
  if (slug.length < 3) { err.textContent = "El código necesita al menos 3 letras o números."; return; }
  const codigo = slug.toUpperCase();
  $("#prmCrear").disabled = true;
  try {
    const existentes = await db.listarPromotores();
    if (existentes.some(p => p.slug === slug)) { err.textContent = `El código ${codigo} ya lo tiene otro promotor.`; return; }
    await db.guardarPromotorDoc(slug, { nombre, codigo, activo: true, creado: new Date().toISOString() });
    const link = linkDe(slug);
    $("#prmNuevo").innerHTML = `<div class="prm__listo">
      <p>Listo. Mándale esto a <b>${esc(nombre)}</b>:</p>
      <div><span>Link</span><b>${esc(link)}</b>${copiarBtn(link, "Copiar")}</div>
      <div><span>Código</span><b>${esc(codigo)}</b>${copiarBtn(codigo, "Copiar")}</div>
    </div>`;
    $("#prmNombre").value = "";
    $("#prmCodigo").value = "";
    cargar();
  } catch (x) {
    err.textContent = "No se pudo crear: " + (x?.code || x?.message || x);
  } finally {
    $("#prmCrear").disabled = false;
  }
}

export function iniciarPromotores(base) {
  db = base;
  $("#prmForm")?.addEventListener("submit", crear);
  $("#prmCodigo")?.addEventListener("input", e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
  document.addEventListener("panel:seccion", e => { if (e.detail?.sec === "promotores") cargar(); });
  document.addEventListener("change", e => { if (e.target.id === "prmFiltro") { filtro = e.target.value; pintarVisitas(); } });
  document.addEventListener("click", async e => {
    const c = e.target.closest("[data-copiar]");
    if (c) {
      try { await navigator.clipboard.writeText(c.dataset.copiar); c.textContent = "Copiado ✓"; } catch { }
      return;
    }
    const pa = e.target.closest("[data-prm-pasos]");
    if (pa) {
      const s = datos.visitas.find(x => x.id === pa.dataset.prmPasos);
      const cont = pa.closest(".st-visita__cuerpo");
      pa.parentElement.remove();
      cont.insertAdjacentHTML("beforeend", `<ul class="st-pasos">${sinRepetidos(s?.eventos || []).map(t => `<li>${t}</li>`).join("")}</ul>`);
      return;
    }
    const fi = e.target.closest("[data-prm-filtro]");
    if (fi) {
      filtro = fi.dataset.prmFiltro;
      const sel = $("#prmFiltro"); if (sel) sel.value = filtro;
      pintarVisitas();
      $("#prmDetalle")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const a = e.target.closest("[data-activo]");
    if (a) { await db.guardarPromotorDoc(a.dataset.activo, { activo: a.dataset.on === "1" }); cargar(); return; }
    const bo = e.target.closest("[data-borrar]");
    if (bo) {
      if (!confirm(`¿Borrar a ${bo.dataset.nombre}? Su link deja de dar código. Sus visitas pasadas se quedan en tus estadísticas.`)) return;
      bo.disabled = true;
      try { await db.borrarPromotorDoc(bo.dataset.borrar); } catch (x) { alert("No se pudo borrar: " + (x?.code || x?.message || x)); }
      cargar(); return;
    }
    if (e.target.closest("#prmRecargar")) cargar();
  });
  if (!$("#secPromotores")?.hidden) cargar();
}
