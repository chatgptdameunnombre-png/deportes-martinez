import { db, MODO } from "./db.js?v=76";
import { setProductos, initCart, enCarrito, addCart } from "./cart.js?v=76";
import { ENVIO_DOMICILIO, PERSONALIZACION_PRECIO, PROMO_WEBHOOK } from "./config.js?v=76";
import { iniciarPago, iniciarTransferencia } from "./checkout.js?v=76";
import { tieneTallas, tallasDe, stockDeTalla, stockTotal, precioTalla, precioDesde, preciosVarian, etiquetaStock } from "./tallas.js?v=76";
import { onMayoreo, precioHTML, precioMay } from "./mayoreo.js?v=76";
import { track, trackProducto, cerrarProducto } from "./track.js?v=76";

const $ = s => document.querySelector(s);
const money = n => "$" + Number(n).toLocaleString("es-MX");
const id = new URLSearchParams(location.search).get("id");

const badge = document.createElement("div");
badge.className = "mode-badge mode-badge--" + (MODO === "nube" ? "nube" : "demo");
badge.textContent = MODO === "nube" ? "● En la nube (Firebase)" : "● Modo demo (local)";
document.body.appendChild(badge);

let productos = [];
let fotosCache = null;
let entregaProd = null;
let tallaSel = null;
let metodoPagoProd = "tarjeta";
let promoProd = null;   /* {codigo, descuento, etiqueta} — lo que dijo el servidor */

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

db.onProducts(async list => {
  productos = list;
  setProductos(list);
  if (fotosCache === null && list.some(x => x.id === id)) {
    try { fotosCache = await db.getFotos(id); } catch { fotosCache = null; }
  }
  render();
});
onMayoreo(() => render());

function tallaBtn(t, on) {
  const ag = Number(t.stock) <= 0;
  const color = ag ? "#7a7a82" : (on ? "#e8b923" : "#f4f4f5");
  const borde = on ? "#e8b923" : "#2a2a32";
  const fondo = on ? "rgba(232,185,35,.14)" : "#141418";
  return `<button type="button" class="talla-btn" data-talla="${t.talla}" style="min-width:48px;padding:9px 13px;border-radius:11px;border:1px solid ${borde};background:${fondo};color:${color};cursor:pointer;font-weight:800;${ag ? "text-decoration:line-through" : ""}">${t.talla}</button>`;
}

function render() {
  const cont = $("#producto");
  if (!cont) return;
  const p = productos.find(x => x.id === id);
  if (!productos.length) { cont.innerHTML = `<p style="color:var(--muted)">Cargando…</p>`; return; }
  if (!p) {
    cont.innerHTML = `<div class="prod-404"><h2>Producto no encontrado</h2><a href="index.html" class="btn">← Volver a la tienda</a></div>`;
    return;
  }
  const sized = tieneTallas(p);
  const stockActual = sized ? (tallaSel ? stockDeTalla(p, tallaSel) : stockTotal(p)) : stockTotal(p);
  const precioActual = sized ? (tallaSel ? precioTalla(p, tallaSel) : precioDesde(p)) : Number(p.precio || 0);
  const st = etiquetaStock(stockActual);
  const puede = sized ? (!!tallaSel && stockDeTalla(p, tallaSel) > 0) : stockActual > 0;
  const precioLinea = (sized && !tallaSel && preciosVarian(p)) ? "desde " + precioHTML(precioDesde(p)) : precioHTML(precioActual);
  const labelAdd = (sized && !tallaSel) ? "Elige tu talla" : (puede ? (enCarrito(p.id, sized ? tallaSel : null) >= stockActual ? "Máximo" : "Agregar al carrito") : "Agotado");
  const labelBuy = (sized && !tallaSel) ? "Elige tu talla" : (puede ? "Comprar" : "Agotado");
  const topeAdd = puede && enCarrito(p.id, sized ? tallaSel : null) >= stockActual;

  const fotos = fotosCache?.length ? fotosCache : (p.imagenes?.length ? p.imagenes : (p.imagen ? [p.imagen] : []));
  const NOMBRE_CAT = { futbol: "Futbol", basket: "Basketball", americano: "Americano" };
  const volver = `${p.categoria || "futbol"}.html`;
  const nombreCat = NOMBRE_CAT[p.categoria] || "Catálogo";

  const galeria = fotos.length
    ? `<div class="prod__main"><img id="prodMainImg" src="${fotos[0]}" alt="${p.nombre}"></div>
       ${fotos.length > 1 ? `<div class="prod__thumbs">${fotos.map((f, i) =>
         `<button class="prod__thumb ${i === 0 ? "on" : ""}" data-thumb="${f}"><img src="${f}" alt=""></button>`).join("")}</div>` : ""}`
    : `<div class="prod__main prod__main--ph">📷 Sin foto todavía</div>`;

  const detalles = [
    ["Equipo", p.equipo], ["Liga", p.liga], ["Temporada", p.temporada],
    ["Marca", p.marca], ["Versión", p.subcategoria], ["Uniforme", p.kit],
    ["Material", p.material], ["Corte", p.genero]
  ].filter(d => d[1]);
  const detallesBloque = detalles.length
    ? `<h4 class="prod__spectitle">Detalles</h4>
       <ul class="prod__specs">${detalles.map(d => `<li><b style="color:#c9c9cf">${d[0]}:</b> ${d[1]}</li>`).join("")}</ul>`
    : "";

  const persoBloque = p.personalizable === false ? "" : `
    <div style="margin-top:14px;border:1px solid #2a2a32;background:#141418;border-radius:12px;padding:12px">
      <label style="display:flex;align-items:center;gap:9px;cursor:pointer;font-size:13.5px">
        <input type="checkbox" id="persoChk" ${persoOn ? "checked" : ""} style="width:17px;height:17px;accent-color:#e8b923">
        <span>Ponle nombre y número <b style="color:#e8b923">+${money(PERSONALIZACION_PRECIO)}</b></span>
      </label>
      <div id="persoCampos" style="display:${persoOn ? "flex" : "none"};gap:8px;margin-top:10px">
        <input id="persoNombre" maxlength="14" placeholder="NOMBRE" style="flex:2;min-width:0;background:#0b0b0e;border:1px solid #2a2a32;color:#f4f4f5;border-radius:10px;padding:10px;font:inherit;text-transform:uppercase">
        <input id="persoDorsal" maxlength="2" inputmode="numeric" placeholder="10" style="flex:1;min-width:0;background:#0b0b0e;border:1px solid #2a2a32;color:#f4f4f5;border-radius:10px;padding:10px;font:inherit;text-align:center">
      </div>
    </div>`;

  const specs = (p.specs || []).length
    ? `<h4 class="prod__spectitle">Especificaciones</h4><ul class="prod__specs">${p.specs.map(s => `<li>${s}</li>`).join("")}</ul>`
    : "";

  const tallasBloque = sized
    ? `<div style="margin:12px 0 4px;font-size:13px;color:#c9c9cf;font-weight:600">Talla${tallaSel ? ": " + tallaSel : ""}</div>
       <div style="display:flex;gap:8px;flex-wrap:wrap">${tallasDe(p).map(t => tallaBtn(t, t.talla === tallaSel)).join("")}</div>`
    : `<div style="margin:8px 0 2px;font-size:12.5px;color:#9a9aa2">Talla universal</div>`;

  cont.innerHTML = `
    <a href="${volver}" class="volver">← ${nombreCat}</a>
    <div class="prod">
      <div class="prod__galeria">${galeria}</div>
      <div class="prod__info">
        <span class="prod__brand">${[p.equipo, p.temporada, p.subcategoria].filter(Boolean).join(" · ") || p.marca || ""}</span>
        <h1 class="prod__name">${p.nombre}</h1>
        <div class="prod__price">${precioLinea} <span>MXN</span></div>
        <span class="stock stock--${st.cls}">${st.txt}</span>
        <p class="prod__envio">🚚 Te llega en 72 horas después de que confirmes tu compra${p.personalizable === false ? "" : " (si lo pides con nombre y número, unos días más)"}</p>
        ${tallasBloque}
        ${persoBloque}
        <div style="display:flex;gap:10px;margin-top:12px">
          <button class="add-btn add-btn--big" id="addBtn2" ${puede && !topeAdd ? "" : "disabled"} style="flex:1;margin:0">${labelAdd}</button>
          <button class="add-btn add-btn--big" id="buyNow" ${puede ? "" : "disabled"} style="flex:1;margin:0;background:#e8b923;color:#1a1405">${labelBuy}</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button type="button" class="entrega-op" data-entrega="tienda" style="flex:1;padding:11px;border-radius:12px;border:1px solid #2a2a32;background:#141418;color:#f4f4f5;font-size:13px;cursor:pointer">Recoger en tienda</button>
          <button type="button" class="entrega-op" data-entrega="domicilio" style="flex:1;padding:11px;border-radius:12px;border:1px solid #2a2a32;background:#141418;color:#f4f4f5;font-size:13px;cursor:pointer">🏠 A domicilio +${money(ENVIO_DOMICILIO)}</button>
        </div>
        <div style="margin-top:12px;font-size:12.5px;color:#9a9aa2">¿Cómo quieres pagar? <span style="color:#7a7a82">(al usar "Comprar")</span></div>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button type="button" class="pago-op" data-pago="tarjeta" style="flex:1;padding:11px;border-radius:12px;border:1px solid #2a2a32;background:#141418;color:#f4f4f5;font-size:13px;cursor:pointer">💳 Tarjeta</button>
          <button type="button" class="pago-op" data-pago="transferencia" style="flex:1;padding:11px;border-radius:12px;border:1px solid #2a2a32;background:#141418;color:#f4f4f5;font-size:13px;cursor:pointer">🏦 Transferencia</button>
        </div>
        <div class="promo-caja" style="margin-top:12px;border:0;padding:0">
          <button type="button" class="promo-abrir" id="pdPromoAbrir">¿Tienes un código de descuento?</button>
          <div class="promo-campo" id="pdPromoCampo" hidden>
            <input id="pdPromoInput" placeholder="Escríbelo aquí" autocapitalize="characters" autocomplete="off">
            <button type="button" id="pdPromoAplicar">Aplicar</button>
          </div>
          <p class="promo-aviso" id="pdPromoAviso" hidden></p>
        </div>
        <div id="prodTotal" style="margin-top:10px;font-weight:600;color:#e8b923"></div>
        ${p.descripcion ? `<p class="prod__desc">${p.descripcion}</p>` : ""}
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
  pintarEntrega();
  pintarPago();
  relacionados();
}

function cardRel(x) {
  /* el click en un relacionado se registra como ver_producto de la ficha destino */
  const precio = preciosVarian(x) ? `desde ${money(precioDesde(x))}` : money(precioDesde(x));
  const media = x.imagen
    ? `<img src="${x.imagen}" alt="${x.nombre}" loading="lazy" onerror="this.style.display='none'">`
    : `<span class="card__ph">📷</span>`;
  const flag = x.retro ? `<span class="rel-card__flag">Retro</span>` : (x.piezaUnica ? `<span class="rel-card__flag">Única</span>` : "");
  return `<a class="rel-card" href="producto.html?id=${encodeURIComponent(x.id)}">
      <div class="rel-card__media">${media}${flag}</div>
      <div class="rel-card__body">
        <div class="rel-card__name">${x.nombre}</div>
        <div class="rel-card__price">${precio}</div>
      </div>
    </a>`;
}

function relacionados() {
  const cont = $("#relacionados");
  const p = productos.find(x => x.id === id);
  if (!cont || !p) return;
  let rel = productos.filter(x => x.id !== p.id && x.categoria === p.categoria && stockTotal(x) > 0);
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
  document.querySelectorAll(".entrega-op").forEach(b => {
    const on = b.dataset.entrega === entregaProd;
    b.style.borderColor = on ? "#e8b923" : "#2a2a32";
    b.style.background = on ? "rgba(232,185,35,.14)" : "#141418";
    b.style.color = on ? "#e8b923" : "#f4f4f5";
  });
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
  const desc = promoProd ? Math.min(promoProd.descuento, base - 1) : 0;
  if (desc > 0) {
    el.innerHTML = `<s class="prod__price-antes">${money(base)}</s> ${money(base - desc)} <span>MXN</span>`;
  } else if (el.querySelector(".prod__price-antes")) {
    const sized = tieneTallas(p);
    const linea = (sized && !tallaSel && preciosVarian(p)) ? "desde " + precioHTML(precioDesde(p)) : precioHTML(precioSel(p));
    el.innerHTML = `${linea} <span>MXN</span>`;
  }
}

function actualizarTotal() {
  precioConDescuento();
  const p = productos.find(x => x.id === id);
  const el = $("#prodTotal");
  if (!p || !el) return;
  el.style.color = "#e8b923";
  const base = precioMay(precioSel(p)) + (persoOn ? PERSONALIZACION_PRECIO : 0);
  if (!entregaProd) { el.textContent = ""; return; }
  const conEnvio = base + (entregaProd === "domicilio" ? ENVIO_DOMICILIO : 0);
  const cola = entregaProd === "domicilio" ? "(con envío)" : "(recoges en tienda)";
  /* el descuento lo calculó el servidor sobre el precio del jersey, sin el envío */
  const desc = promoProd ? Math.min(promoProd.descuento, base - 1) : 0;
  if (desc > 0) {
    el.innerHTML = `Total: <s style="color:#7a7a82;font-weight:400;margin-right:6px">${money(conEnvio)}</s>` +
      `${money(conEnvio - desc)} <span style="color:#9a9aa2;font-weight:400;font-size:13px">${cola}</span>`;
  } else {
    el.textContent = `Total: ${money(conEnvio)} ${cola}`;
  }
}

function err(txt) {
  const el = $("#prodTotal");
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

function comprarDirecto() {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  const sized = tieneTallas(p);
  if (sized && !tallaSel) { err("Elige tu talla"); return; }
  const stock = sized ? stockDeTalla(p, tallaSel) : stockTotal(p);
  if (stock <= 0) return;
  if (!entregaProd) { err("Elige cómo lo quieres recibir: recoger o a domicilio"); return; }
  const pe = persoActual();
  if (persoOn && !pe) { err("Escribe el nombre o el número"); return; }
  const precio = precioSel(p) + (pe ? PERSONALIZACION_PRECIO : 0);
  const prodInfo = [{ id: p.id, qty: 1, title: p.nombre, talla: sized ? tallaSel : "", perso: pe }];
  track("comprar_directo", { id: p.id, nombre: p.nombre, metodo: metodoPagoProd, promo: promoProd?.codigo || "" });
  const promo = promoProd?.codigo || "";
  if (metodoPagoProd === "transferencia") {
    const bruto = precio + (entregaProd === "domicilio" ? ENVIO_DOMICILIO : 0);
    const total = promoProd ? Math.max(1, bruto - Math.min(promoProd.descuento, precio - 1)) : bruto;
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
  if (e.target.closest("#pdPromoQuitar")) {
    promoProd = null;
    const av = $("#pdPromoAviso"); av.hidden = true; av.className = "promo-aviso";
    const inp = $("#pdPromoInput"); if (inp) inp.value = "";
    actualizarTotal();
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
        promoProd = { codigo: d.codigo, descuento: d.descuento, etiqueta: d.etiqueta };
        av.className = "promo-aviso promo-aviso--ok";
        av.innerHTML = `Se aplicó <b>${d.codigo}</b> — ${d.etiqueta}. <button type="button" id="pdPromoQuitar" class="promo-quitar">Quitar</button>`;
        track("promo_aplicada", { codigo: d.codigo, descuento: d.descuento, donde: "ficha" });
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
  if (e.target.closest("#buyNow")) comprarDirecto();
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
