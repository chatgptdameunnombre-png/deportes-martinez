import { catalogoRapido, fotosRapido, guardarCatalogo, productoRapido } from "./catalogo.js?v=137";
import { setProductos, initCart, enCarrito, addCart } from "./cart.js?v=137";
import { ENVIO_DOMICILIO, PERSONALIZACION_PRECIO, PROMO_WEBHOOK, NEGOCIO } from "./config.js?v=137";
import { iniciarPago, iniciarTransferencia } from "./checkout.js?v=137";
import { tieneTallas, tallasDe, stockDeTalla, stockTotal, precioTalla, precioDesde, preciosVarian, etiquetaStock, precioAntes } from "./tallas.js?v=137";
import { onMayoreo, precioHTML, precioMay } from "./mayoreo.js?v=137";
import { track, trackProducto, cerrarProducto } from "./track.js?v=137";
import { promotorPorCodigo } from "./promotor.js?v=137";
import { codigoDe, ponerCodigo, descuentoCodigo, revalidarCodigos } from "./codigos.js?v=137";
import { fotoMedia } from "./fotos.js?v=137";
const escH = t => String(t ?? "").replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));

const $ = s => document.querySelector(s);
const money = n => "$" + Number(n).toLocaleString("es-MX");
const id = new URLSearchParams(location.search).get("id");


let productos = [];
let fotosCache = null;
let entregaProd = null;
let tallaSel = null;
let metodoPagoProd = "tarjeta";
let promoProd = null;
let persoN = "", persoD = "";   /* {codigo, tipo, valor, etiqueta} — lo que dijo el servidor */
const codigoAplicadoHTML = (codigo, etiqueta) => `<div class="pd-cod-ok"><span class="pd-cod-ok__check">✓</span><div><b>Descuento aplicado</b><span>Código ${String(codigo).replace(/[^A-Z0-9-]/gi, "")}${etiqueta ? " · " + String(etiqueta).replace(/[<>&"]/g, "") : ""}</span></div></div>`;

/* Revisa el código con el servidor. Igual que en el carrito: la página nunca
   decide el descuento, solo pinta lo que le contestaron. */
async function revisarPromoProd(codigo, subtotal) {
  const r = await fetch(PROMO_WEBHOOK, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo, subtotal })
  });
  return r.json();
}
let persoOn = false;
let trackeado = false;

let buscadoSolo = false;
function recibir(list) {
  productos = list;
  setProductos(list);
  render();
  if (id && !buscadoSolo && list.length) {
    buscadoSolo = true;
    productoRapido(id).then(p => {
      if (!p) return;
      const otros = productos.filter(x => x.id !== id);
      productos = p.oculto ? otros : [...otros, p];
      setProductos(productos);
      render();
    });
  }
}
queueMicrotask(() => catalogoRapido(recibir));
fotosRapido(id).then(extra => {
  if (extra === null) return;
  fotosCache = extra;
  render();
});
onMayoreo(() => render());
document.addEventListener("promotor:cambio", () => render());
document.addEventListener("input", e => {
  if (e.target.id === "persoNombre") persoN = e.target.value;
  if (e.target.id === "persoDorsal") persoD = e.target.value;
});

function tallaBtn(t, on) {
  const ag = Number(t.stock) <= 0;
  const color = ag ? "#7a7a82" : (on ? "#e8b923" : "#f4f4f5");
  const borde = on ? "#e8b923" : "#2a2a32";
  const fondo = on ? "rgba(232,185,35,.14)" : "#141418";
  return `<button type="button" class="talla-btn" data-talla="${escH(t.talla)}" style="min-width:48px;padding:9px 13px;border-radius:11px;border:1px solid ${borde};background:${fondo};color:${color};cursor:pointer;font-weight:800;${ag ? "text-decoration:line-through" : ""}">${t.talla}</button>`;
}

function render() {
  const cont = $("#producto");
  if (!cont) return;
  const p = productos.find(x => x.id === id);
  if (!productos.length) { cont.innerHTML = `<p style="color:var(--muted)">Cargando…</p>`; return; }
  if (!p || p.oculto) {
    cont.innerHTML = `<div class="prod-404"><h2>Esta playera ya no está disponible</h2><a href="index.html" class="btn">← Volver a la tienda</a></div>`;
    return;
  }
  const sized = tieneTallas(p);
  const stockActual = sized ? (tallaSel ? stockDeTalla(p, tallaSel) : stockTotal(p)) : stockTotal(p);
  const precioActual = sized ? (tallaSel ? precioTalla(p, tallaSel) : precioDesde(p)) : Number(p.precio || 0);
  const st = etiquetaStock(stockActual);
  const puede = sized ? (!!tallaSel && stockDeTalla(p, tallaSel) > 0) : stockActual > 0;
  const precioLinea = (precioAntes(p) ? `<s class="precio-antes">${precioHTML(precioAntes(p))}</s> ` : "") + ((sized && !tallaSel && preciosVarian(p)) ? "desde " + precioHTML(precioDesde(p)) : precioHTML(precioActual));
  const labelAdd = (sized && !tallaSel) ? "Elige tu talla" : (puede ? (enCarrito(p.id, sized ? tallaSel : null) >= stockActual ? "Máximo" : "Agregar al carrito") : "Agotado");
  const labelBuy = (sized && !tallaSel) ? "Elige tu talla" : (puede ? "Pagar " + money(totalPagar(p)) : "Agotado");
  promoProd = codigoDe(id);
  const topeAdd = puede && enCarrito(p.id, sized ? tallaSel : null) >= stockActual;

  const fotos = fotosCache?.length ? [p.imagen, ...fotosCache].filter(Boolean) : (p.imagenes?.length ? p.imagenes : (p.imagen ? [p.imagen] : []));
  const NOMBRE_CAT = { futbol: "Futbol", basket: "Basketball", americano: "Americano", beisbol: "Béisbol", f1: "Fórmula 1" };
  const volver = `${p.categoria || "futbol"}.html`;
  const nombreCat = NOMBRE_CAT[p.categoria] || "Catálogo";

  const galeria = fotos.length
    ? `<div class="prod__main"><img id="prodMainImg" src="${escH(fotos[0])}" alt="${escH(p.nombre)}"></div>
       ${fotos.length > 1 ? `<div class="prod__thumbs">${fotos.map((f, i) =>
         `<button class="prod__thumb ${i === 0 ? "on" : ""}" data-thumb="${escH(f)}"><img src="${escH(fotoMedia(f))}" alt=""></button>`).join("")}</div>` : ""}`
    : `<div class="prod__main prod__main--ph">📷 Sin foto todavía</div>`;

  const detalles = [
    ["Equipo", p.equipo], ["Liga", p.liga], ["Temporada", p.temporada],
    ["Marca", p.marca], ["Versión", p.subcategoria], ["Uniforme", p.kit],
    ["Material", p.material], ["Corte", p.genero]
  ].filter(d => d[1]);
  const detallesBloque = detalles.length
    ? `<h4 class="prod__spectitle">Detalles</h4>
       <ul class="prod__specs">${detalles.map(d => `<li><b style="color:#c9c9cf">${escH(d[0])}:</b> ${escH(d[1])}</li>`).join("")}</ul>`
    : "";

  const persoBloque = p.personalizable === false ? "" : `
    <div style="margin-top:14px;border:1px solid #2a2a32;background:#141418;border-radius:12px;padding:12px">
      <label style="display:flex;align-items:center;gap:9px;cursor:pointer;font-size:13.5px">
        <input type="checkbox" id="persoChk" ${persoOn ? "checked" : ""} style="width:17px;height:17px;accent-color:#e8b923">
        <span>Ponle nombre y número <b style="color:#e8b923">+${money(PERSONALIZACION_PRECIO)}</b></span>
      </label>
      <div id="persoCampos" style="display:${persoOn ? "flex" : "none"};gap:8px;margin-top:10px">
        <input id="persoNombre" maxlength="14" value="${escA(persoN)}" placeholder="NOMBRE" style="flex:2;min-width:0;background:#0b0b0e;border:1px solid #2a2a32;color:#f4f4f5;border-radius:10px;padding:10px;font:inherit;text-transform:uppercase">
        <input id="persoDorsal" maxlength="2" inputmode="numeric" value="${escA(persoD)}" placeholder="10" style="flex:1;min-width:0;background:#0b0b0e;border:1px solid #2a2a32;color:#f4f4f5;border-radius:10px;padding:10px;font:inherit;text-align:center">
      </div>
    </div>`;

  const specs = (p.specs || []).length
    ? `<h4 class="prod__spectitle">Especificaciones</h4><ul class="prod__specs">${p.specs.map(s => `<li>${escH(s)}</li>`).join("")}</ul>`
    : "";

  const tallasBloque = sized
    ? `<div style="margin:12px 0 4px;font-size:13px;color:#c9c9cf;font-weight:600">Talla${tallaSel ? ": " + escH(tallaSel) : ""}</div>
       <div style="display:flex;gap:8px;flex-wrap:wrap">${tallasDe(p).map(t => tallaBtn(t, t.talla === tallaSel)).join("")}</div>`
    : `<div style="margin:8px 0 2px;font-size:12.5px;color:#9a9aa2">Talla universal</div>`;

  if (p.proximamente) {
    cont.innerHTML = `
    <a href="${volver}" class="volver">← ${nombreCat}</a>
    <div class="prod">
      <div class="prod__galeria">${galeria}</div>
      <div class="prod__info">
        <span class="prod__brand">${escH([p.equipo, p.temporada].filter(Boolean).join(" · ") || p.marca || "")}</span>
        <h1 class="prod__name">${escH(p.nombre)}</h1>
        <span class="stock stock--prox">Próximamente</span>
        <p class="prod__envio">Todavía no está a la venta. Dinos si la quieres y te avisamos en cuanto llegue.</p>
        <button class="add-btn add-btn--big" disabled style="width:100%;margin:12px 0 0">Próximamente</button>
        <button type="button" class="btn" id="avisoAbrir" style="display:block;width:100%;text-align:center;margin-top:10px">Avísame cuando llegue →</button>
        ${p.descripcion ? `<p class="prod__desc">${escH(p.descripcion)}</p>` : ""}
        ${detallesBloque}
      </div>
    </div>`;
    document.title = `${p.nombre} — Deportes Martínez`;
    document.getElementById("avisoAbrir")?.addEventListener("click", () => abrirAviso(p));
    if (!trackeado) {
      trackeado = true;
      track("ver_producto", { id: p.id, nombre: p.nombre, equipo: p.equipo || "", categoria: p.categoria || "" });
    }
    return;
  }

  cont.innerHTML = `
    <a href="${volver}" class="volver">← ${nombreCat}</a>
    <div class="prod">
      <div class="prod__galeria">${galeria}</div>
      <div class="prod__info">
        <span class="prod__brand">${escH([p.equipo, p.temporada, p.subcategoria].filter(Boolean).join(" · ") || p.marca || "")}</span>
        <h1 class="prod__name">${escH(p.nombre)}</h1>
        <div class="prod__price">${precioLinea} <span>MXN</span></div>
        <span class="stock stock--${st.cls}">${st.txt}</span>
        <p class="prod__envio">🚚 Envío a todo México: lo preparamos en 1 a 2 días hábiles y te avisamos cuánto tarda en llegar según tu ubicación${p.personalizable === false ? "" : " (si lo pides con nombre y número, unos días más)"}</p>
        ${tallasBloque}
        ${persoBloque}
        <div class="pd-botones">
          <button class="add-btn add-btn--big pd-carrito" id="addBtn2" ${puede && !topeAdd ? "" : "disabled"}>${labelAdd}</button>
          <button class="add-btn add-btn--big pd-pagar" id="buyNow" ${puede ? "" : "disabled"}>${labelBuy}</button>
        </div>
        <div class="promo-caja" id="pdPromoCaja" style="margin-top:12px;border:0;padding:0">
          ${promoProd ? codigoAplicadoHTML(promoProd.codigo, promoProd.etiqueta) : `
          <button type="button" class="promo-abrir" id="pdPromoAbrir">¿Tienes un código de descuento?</button>
          <div class="promo-campo" id="pdPromoCampo" hidden>
            <input id="pdPromoInput" placeholder="Escríbelo aquí" autocapitalize="characters" autocomplete="off">
            <button type="button" id="pdPromoAplicar">Aplicar</button>
          </div>
          <p class="promo-aviso" id="pdPromoAviso" hidden></p>`}
        </div>
        <div id="prodTotal" style="margin-top:10px;font-weight:600;color:#e8b923"></div>
        ${p.descripcion ? `<p class="prod__desc">${escH(p.descripcion)}</p>` : ""}
        ${detallesBloque}
        ${specs}
      </div>
    </div>`;
  document.title = `${p.nombre} — Deportes Martínez`;
  ponerDatosParaGoogle(p, precioActual, stockActual);
  if (!trackeado) {
    trackeado = true;
    trackProducto(p);
    track("ver_producto", { id: p.id, nombre: p.nombre, equipo: p.equipo || "", categoria: p.categoria || "" });
  }
  actualizarTotal();
  relacionados();
}

function cardRel(x) {
  /* el click en un relacionado se registra como ver_producto de la ficha destino */
  const precio = (precioAntes(x) ? `<s class="precio-antes">${money(precioAntes(x))}</s> ` : "") + (preciosVarian(x) ? `desde ${money(precioDesde(x))}` : money(precioDesde(x)));
  const media = x.imagen
    ? `<img src="${escH(fotoMedia(x.imagen))}" alt="${escH(x.nombre)}" loading="lazy" onerror="this.style.display='none'">`
    : `<span class="card__ph">📷</span>`;
  const flag = x.retro ? `<span class="rel-card__flag">Retro</span>` : (x.piezaUnica ? `<span class="rel-card__flag">Única</span>` : "");
  return `<a class="rel-card" href="producto.html?id=${encodeURIComponent(x.id)}">
      <div class="rel-card__media">${media}${flag}</div>
      <div class="rel-card__body">
        <div class="rel-card__name">${escH(x.nombre)}</div>
        <div class="rel-card__price">${precio}</div>
      </div>
    </a>`;
}

function relacionados() {
  const cont = $("#relacionados");
  const p = productos.find(x => x.id === id);
  if (!cont || !p) return;
  let rel = productos.filter(x => x.id !== p.id && !x.oculto && !x.proximamente && x.categoria === p.categoria && stockTotal(x) > 0);
  const punt = x => (x.equipo === p.equipo ? 4 : 0) + (x.liga === p.liga ? 2 : 0) + (x.subcategoria === p.subcategoria ? 1 : 0);
  rel.sort((a, b) => punt(b) - punt(a));
  rel = rel.slice(0, 12);
  if (!rel.length) { cont.innerHTML = ""; return; }
  cont.innerHTML = `
    <div class="wrap">
      <div class="sec-head" style="margin-bottom:18px">
        <span class="eyebrow">También te puede gustar</span>
        <h2 style="font-size:24px">Productos relacionados</h2>
      </div>
    </div>
    <div class="rel-row">${rel.map(cardRel).join("")}</div>`;
}

function pintarEntrega() {
  const pe = $("#pagoErr"); if (pe) pe.textContent = "";
  document.querySelectorAll(".entrega-op").forEach(b => {
    const on = b.dataset.entrega === entregaProd;
    b.style.borderColor = on ? "#e8b923" : "#2a2a32";
    b.style.background = on ? "rgba(232,185,35,.14)" : "#141418";
    b.style.color = on ? "#e8b923" : "#f4f4f5";
  });
  document.querySelectorAll("#pagoModal .mapa-tienda").forEach(a => { a.hidden = entregaProd !== "tienda"; });
  actualizarTotal();
}

function pintarPago() {
  document.querySelectorAll(".pago-op").forEach(b => {
    const on = b.dataset.pago === metodoPagoProd;
    b.style.borderColor = on ? "#e8b923" : "#2a2a32";
    b.style.background = on ? "rgba(232,185,35,.14)" : "#141418";
    b.style.color = on ? "#e8b923" : "#f4f4f5";
  });
}

function totalPagar(p) {
  const base = precioMay(precioSel(p)) + (persoOn ? PERSONALIZACION_PRECIO : 0);
  const desc = descuentoCodigo(promoProd, base);
  return base - desc + (entregaProd === "domicilio" ? ENVIO_DOMICILIO : 0);
}

function precioSel(p) {
  const sized = tieneTallas(p);
  return sized ? (tallaSel ? precioTalla(p, tallaSel) : precioDesde(p)) : Number(p.precio || 0);
}

/* El precio grande de la ficha se pinta al cargar y no se enteraba del descuento:
   solo se tachaba el renglón de "Total", y ese ni sale hasta elegir entrega.
   Ahora el precio de arriba se tacha igual que en el carrito. */
function precioConDescuento() {
  const p = productos.find(x => x.id === id);
  const el = document.querySelector(".prod__price");
  if (!p || !el) return;
  const base = precioMay(precioSel(p));
  const desc = descuentoCodigo(promoProd, base);
  if (desc > 0) {
    el.innerHTML = `<s class="prod__price-antes">${money(base)}</s> ${money(base - desc)} <span>MXN</span>`;
  } else if (el.querySelector(".prod__price-antes")) {
    const sized = tieneTallas(p);
    const linea = (precioAntes(p) ? `<s class="precio-antes">${precioHTML(precioAntes(p))}</s> ` : "") + ((sized && !tallaSel && preciosVarian(p)) ? "desde " + precioHTML(precioDesde(p)) : precioHTML(precioSel(p)));
    el.innerHTML = `${linea} <span>MXN</span>`;
  }
}

function actualizarTotal() {
  precioConDescuento();
  const p = productos.find(x => x.id === id);
  const bn = $("#buyNow");
  if (p && bn && !bn.disabled) bn.textContent = "Pagar " + money(totalPagar(p));
  const mt = $("#pagoTotal");
  if (p && mt) mt.textContent = money(totalPagar(p)) + (entregaProd === "domicilio" ? " con envío" : "");
  const el = $("#prodTotal");
  if (!p || !el) return;
  el.style.color = "#e8b923";
  const base = precioMay(precioSel(p)) + (persoOn ? PERSONALIZACION_PRECIO : 0);
  if (!entregaProd) { el.textContent = ""; return; }
  const conEnvio = base + (entregaProd === "domicilio" ? ENVIO_DOMICILIO : 0);
  const cola = entregaProd === "domicilio" ? "(con envío)" : "(recoges en tienda)";
  /* el descuento lo calculó el servidor sobre el precio del jersey, sin el envío */
  const desc = descuentoCodigo(promoProd, base);
  if (desc > 0) {
    el.innerHTML = `Total: <s style="color:#7a7a82;font-weight:400;margin-right:6px">${money(conEnvio)}</s>` +
      `${money(conEnvio - desc)} <span style="color:#9a9aa2;font-weight:400;font-size:13px">${cola}</span>`;
  } else {
    el.textContent = `Total: ${money(conEnvio)} ${cola}`;
  }
}

function err(txt) {
  const el = $("#pagoErr") || $("#prodTotal");
  if (el) { el.style.color = "#ff6b6b"; el.textContent = txt; }
}

function persoActual() {
  if (!persoOn) return null;
  const n = ($("#persoNombre")?.value || "").trim();
  const d = ($("#persoDorsal")?.value || "").trim();
  if (!n && !d) return null;
  return { nombre: n, dorsal: d };
}

function agregar() {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  const sized = tieneTallas(p);
  if (sized && !tallaSel) { err("Elige tu talla"); return; }
  if (persoOn && !persoActual()) { err("Escribe el nombre o el número"); return; }
  addCart(p.id, sized ? tallaSel : null, persoActual());
}

async function comprarDirecto() {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  const precioCod = precioSel(p) + (persoActual() ? PERSONALIZACION_PRECIO : 0);
  if (descuentoCodigo(promoProd, precioCod) > 0) {
    const fuera = await revalidarCodigos([{ id: p.id, precio: precioCod }]);
    if (fuera.length) {
      promoProd = codigoDe(id);
      render();
      err(`El código ${fuera.join(", ")} ya no aplica para esta playera. Revisa el nuevo total.`);
      return;
    }
    promoProd = codigoDe(id);
  }
  const sized = tieneTallas(p);
  if (sized && !tallaSel) { err("Elige tu talla"); return; }
  const stock = sized ? stockDeTalla(p, tallaSel) : stockTotal(p);
  if (stock <= 0) return;
  if (!entregaProd) { err("Elige cómo lo quieres recibir: recoger o a domicilio"); return; }
  const pe = persoActual();
  if (persoOn && !pe) { err("Escribe el nombre o el número"); return; }
  const precio = precioSel(p) + (pe ? PERSONALIZACION_PRECIO : 0);
  const prodInfo = [{ id: p.id, qty: 1, title: p.nombre, talla: sized ? tallaSel : "", perso: pe, promo: promoProd?.codigo || "" }];
  document.getElementById("pagoModal")?.remove();
  track("comprar_directo", { id: p.id, nombre: p.nombre, metodo: metodoPagoProd, promo: promoProd?.codigo || "" });
  const promo = descuentoCodigo(promoProd, precio) > 0 ? promoProd.codigo : "";
  if (metodoPagoProd === "transferencia") {
    const bruto = precio + (entregaProd === "domicilio" ? ENVIO_DOMICILIO : 0);
    const total = Math.max(1, bruto - descuentoCodigo(promoProd, precio));
    iniciarTransferencia({ productos: prodInfo, entrega: entregaProd, total, promo, onError: () => err("No se pudo, intenta de nuevo") });
    return;
  }
  const title = (sized ? `${p.nombre} — Talla ${tallaSel}` : p.nombre) + (pe ? " (personalizado)" : "");
  const items = [{ title, quantity: 1, unit_price: precio, currency_id: "MXN" }];
  if (entregaProd === "domicilio") items.push({ title: "Envío a domicilio", quantity: 1, unit_price: ENVIO_DOMICILIO, currency_id: "MXN" });
  iniciarPago({
    items,
    productos: prodInfo,
    entrega: entregaProd,
    promo,
    onError: () => err("No se pudo generar el pago, intenta de nuevo")
  });
}

document.addEventListener("click", async e => {
  const th = e.target.closest("[data-thumb]");
  if (th) {
    track("ver_foto", { id });
    $("#prodMainImg").src = th.dataset.thumb;
    document.querySelectorAll(".prod__thumb").forEach(t => t.classList.toggle("on", t === th));
    return;
  }
  const tb = e.target.closest(".talla-btn");
  if (tb) {
    const p = productos.find(x => x.id === id);
    const anterior = tallaSel;
    tallaSel = tb.dataset.talla;
    track(anterior ? "cambia_talla" : "elige_talla", { id, nombre: p?.nombre || "", talla: tallaSel, antes: anterior || "" });
    render(); return;
  }
  const eb = e.target.closest("[data-entrega]");
  if (eb) {
    entregaProd = eb.dataset.entrega;
    track("elige_entrega", { entrega: entregaProd, donde: "producto" });
    pintarEntrega(); return;
  }
  const pb = e.target.closest("[data-pago]");
  if (pb) {
    metodoPagoProd = pb.dataset.pago;
    track("elige_pago", { metodo: metodoPagoProd, donde: "producto" });
    pintarPago(); return;
  }
  const chk = e.target.closest("#persoChk");
  if (chk) {
    persoOn = chk.checked;
    const campos = $("#persoCampos");
    if (campos) campos.style.display = persoOn ? "flex" : "none";
    actualizarTotal();
    track("personalizacion", { activada: persoOn, id, nombre: productos.find(x => x.id === id)?.nombre || "" });
    return;
  }
  if (e.target.closest("#addBtn2")) { agregar(); return; }
  if (e.target.closest("#pdPromoAbrir")) {
    document.getElementById("pdPromoCampo").hidden = false;
    e.target.hidden = true;
    document.getElementById("pdPromoInput")?.focus();
    return;
  }
  if (e.target.closest("#pdPromoAplicar")) {
    const p = productos.find(x => x.id === id);
    const inp = $("#pdPromoInput"), av = $("#pdPromoAviso"), btn = e.target;
    const cod = inp.value.trim().toUpperCase().replace(/\s+/g, "");
    if (!cod || !p) { inp.focus(); return; }
    inp.value = cod;
    btn.disabled = true; btn.textContent = "Revisando…";
    av.hidden = false; av.className = "promo-aviso"; av.textContent = "Revisando tu código…";
    const base = precioMay(precioSel(p)) + (persoOn ? PERSONALIZACION_PRECIO : 0);
    try {
      const d = await revisarPromoProd(cod, base);
      if (d && d.ok) {
        promoProd = { codigo: d.codigo, tipo: d.tipo, valor: d.valor, etiqueta: d.etiqueta };
        ponerCodigo(p.id, promoProd);
        $("#pdPromoCaja").innerHTML = codigoAplicadoHTML(d.codigo, d.etiqueta);
        track("promo_aplicada", { codigo: d.codigo, descuento: d.descuento, donde: "ficha" });
        actualizarTotal();
        return;
      } else if (await promotorPorCodigo(cod)) {
        track("promo_promotor", { codigo: cod, donde: "ficha" });
        render();
        return;
      } else {
        promoProd = null;
        av.className = "promo-aviso promo-aviso--mal";
        av.textContent = (d && d.motivo) || "Ese código no sirve";
      }
    } catch (err) {
      promoProd = null;
      av.className = "promo-aviso promo-aviso--mal";
      av.textContent = "No se pudo revisar. Intenta otra vez.";
    }
    btn.disabled = false; btn.textContent = "Aplicar";
    actualizarTotal();
    return;
  }
  if (e.target.closest("#buyNow")) { abrirPago(); return; }
  if (e.target.closest("#pagoSeguir")) { comprarDirecto(); return; }
});
document.addEventListener("cart:add", render);

initCart();

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") cerrarProducto(); });
window.addEventListener("pagehide", cerrarProducto);


/* Datos estructurados de la ficha: así Google puede mostrar precio y existencia */
function ponerDatosParaGoogle(p, precio, stock) {
  const viejo = document.getElementById("ldProducto");
  if (viejo) viejo.remove();
  const url = location.origin + location.pathname + "?id=" + encodeURIComponent(p.id);
  const datos = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.nombre,
    description: p.descripcion || `Jersey de ${p.equipo || p.categoria}`,
    image: p.imagen ? [p.imagen] : undefined,
    brand: p.marca ? { "@type": "Brand", name: p.marca } : undefined,
    category: p.categoria,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "MXN",
      price: String(precio || 0),
      availability: stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "Deportes Martínez" }
    }
  };
  const tag = document.createElement("script");
  tag.type = "application/ld+json";
  tag.id = "ldProducto";
  tag.textContent = JSON.stringify(datos);
  document.head.appendChild(tag);
}

const escA = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function abrirAviso(p) {
  const { conectarFormulario } = await import("./sugerencias.js?v=137");
  document.getElementById("avisoModal")?.remove();
  const m = document.createElement("div");
  m.className = "aviso-modal";
  m.id = "avisoModal";
  m.innerHTML = `
    <div class="aviso-modal__caja" role="dialog" aria-modal="true" aria-labelledby="avisoT">
      <button type="button" class="aviso-modal__x" aria-label="Cerrar">×</button>
      <h2 class="aviso-modal__t" id="avisoT">Avísame cuando llegue</h2>
      <p class="aviso-modal__p">Déjanos tu WhatsApp y te escribimos en cuanto llegue.</p>
      <form class="sug" data-deporte="${escA(p.categoria || "")}" autocomplete="off">
        <label class="sug__lb" for="avisoTexto">Jersey</label>
        <input class="sug__in" id="avisoTexto" name="texto" maxlength="200" required value="${escA(("Avísame cuando llegue: " + p.nombre).slice(0, 200))}">
        <label class="sug__lb" for="avisoTalla">Talla <span>(opcional)</span></label>
        <select class="sug__in" id="avisoTalla" name="talla"><option value="">Sin talla</option><option value="S">S</option><option value="M">M</option><option value="L">L</option><option value="XL">XL</option><option value="2XL">2XL</option><option value="3XL">3XL</option><option value="4XL">4XL</option><option value="Niño">Niño</option></select>
        <label class="sug__lb" for="avisoNombre">Tu nombre <span>(opcional)</span></label>
        <input class="sug__in" id="avisoNombre" name="nombre" maxlength="60" placeholder="Para saber quién lo pidió">
        <label class="sug__lb" for="avisoTel">Tu WhatsApp</label>
        <input class="sug__in" id="avisoTel" name="tel" inputmode="tel" maxlength="20" placeholder="33 1234 5678">
        <p style="margin:10px 0 0;font-size:12.5px;color:#8a8a92;line-height:1.5">Usamos tus datos para conseguirte la playera y avisarte. <a href="legales.html#privacidad" target="_blank" rel="noopener" style="color:#e8b923">Aviso de privacidad</a></p>
        <button class="btn sug__btn" type="submit">Avísame</button>
        <p class="sug__msg" role="status"></p>
      </form>
    </div>`;
  const cerrar = () => { m.remove(); document.removeEventListener("keydown", tecla); };
  const tecla = e => { if (e.key === "Escape") cerrar(); };
  m.addEventListener("click", e => { if (e.target === m || e.target.closest(".aviso-modal__x")) cerrar(); });
  document.addEventListener("keydown", tecla);
  document.body.appendChild(m);
  conectarFormulario(m.querySelector("form"));
  m.querySelector("#avisoNombre").focus();
  track("aviso_llegue", { id: p.id, nombre: p.nombre });
}

function abrirPago() {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  const sized = tieneTallas(p);
  if (sized && !tallaSel) { err("Elige tu talla"); return; }
  if (persoOn && !persoActual()) { err("Escribe el nombre o el número"); return; }
  document.getElementById("pagoModal")?.remove();
  const m = document.createElement("div");
  m.className = "aviso-modal";
  m.id = "pagoModal";
  m.innerHTML = `
    <div class="aviso-modal__caja pago-modal" role="dialog" aria-modal="true" aria-labelledby="pagoT">
      <button type="button" class="aviso-modal__x" aria-label="Cerrar">×</button>
      <h2 class="aviso-modal__t" id="pagoT">Pagar</h2>
      <p class="aviso-modal__p">${escA(p.nombre)}${sized ? " · Talla " + escA(tallaSel) : ""}</p>
      <div class="pago-modal__paso">1. ¿Dónde lo quieres recibir?</div>
      <div class="pago-modal__ops">
        <button type="button" class="entrega-op" data-entrega="tienda">Recoger en tienda</button>
        <button type="button" class="entrega-op" data-entrega="domicilio">🏠 A domicilio +${money(ENVIO_DOMICILIO)}</button>
      </div>
      <a class="mapa-tienda" href="${NEGOCIO.mapa}" target="_blank" rel="noopener" hidden>📍 Cómo llegar a la tienda</a>
      <div class="pago-modal__paso">2. ¿Cómo quieres pagar?</div>
      <div class="pago-modal__ops">
        <button type="button" class="pago-op" data-pago="tarjeta">💳 Tarjeta</button>
        <button type="button" class="pago-op" data-pago="transferencia">🏦 Transferencia</button>
      </div>
      <div class="pago-modal__total">Total <b id="pagoTotal"></b></div>
      <p class="pago-modal__err" id="pagoErr"></p>
      <button type="button" class="add-btn add-btn--big pd-pagar" id="pagoSeguir">Continuar al pago</button>
      <p class="aviso-wa">Te mandamos la confirmación y los avisos de tu pedido por WhatsApp. <a href="legales.html#privacidad" target="_blank" rel="noopener">Aviso de privacidad</a></p>
    </div>`;
  const cerrar = () => { m.remove(); document.removeEventListener("keydown", tecla); };
  const tecla = e => { if (e.key === "Escape") cerrar(); };
  m.addEventListener("click", e => { if (e.target === m || e.target.closest(".aviso-modal__x")) cerrar(); });
  document.addEventListener("keydown", tecla);
  document.body.appendChild(m);
  pintarEntrega();
  pintarPago();
  track("abrir_pago", { id: p.id, nombre: p.nombre });
}
