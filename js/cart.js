import { ENVIO_DOMICILIO, PERSONALIZACION_PRECIO, PROMO_WEBHOOK } from "./config.js?v=76";
import { iniciarPago, iniciarTransferencia } from "./checkout.js?v=76";
import { tieneTallas, stockDeTalla, stockTotal, precioTalla } from "./tallas.js?v=76";
import { onMayoreo, precioHTML, precioMay } from "./mayoreo.js?v=76";
import { track, marcarProducto } from "./track.js?v=76";

const CART_KEY = "dm_cart";
const $ = s => document.querySelector(s);
const money = n => "$" + Number(n).toLocaleString("es-MX");

let cart = cargar();
let productos = [];
let entrega = null;
let metodoPago = "tarjeta";

const persoTxt = pe => (pe && (pe.nombre || pe.dorsal)) ? `${(pe.nombre || "").toUpperCase()}|${pe.dorsal || ""}` : "";
const keyOf = (id, talla, pe) => [id, talla || "", persoTxt(pe)].filter((v, i) => i === 0 || v !== "").join("__");

function cargar() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
  catch { return {}; }
}
function guardar() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCart();
}

export function setProductos(list) { productos = list; renderCart(); }

export function enCarrito(id, talla = null) {
  const p = productos.find(x => x.id === id);
  const t = (p && tieneTallas(p)) ? talla : null;
  return Object.values(cart).filter(c => c.id === id && (!t || c.talla === t)).reduce((a, c) => a + (c.qty || 0), 0);
}

function dispDe(p, talla) {
  return (tieneTallas(p) && talla) ? stockDeTalla(p, talla) : stockTotal(p);
}
function precioDe(p, talla) {
  return (tieneTallas(p) && talla) ? precioTalla(p, talla) : Number(p.precio || 0);
}

export function addCart(id, talla = null, perso = null) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  const sized = tieneTallas(p);
  const t = sized ? talla : null;
  if (sized && !t) return;
  const disp = dispDe(p, t);
  if (disp <= 0) return;
  const pe = (perso && (perso.nombre || perso.dorsal)) ? { nombre: (perso.nombre || "").toUpperCase().slice(0, 14), dorsal: String(perso.dorsal || "").slice(0, 2) } : null;
  const k = keyOf(id, t, pe);
  const q = cart[k]?.qty || 0;
  const yaDeEsteProducto = Object.entries(cart).filter(([kk, c]) => c.id === id && c.talla === t).reduce((a, [, c]) => a + c.qty, 0);
  if (yaDeEsteProducto >= disp) return;
  cart[k] = { id, talla: t, perso: pe, qty: q + 1 };
  guardar();
  marcarProducto(id, "carrito");
  track("agregar_carrito", { id, nombre: p.nombre, talla: t || "", personalizado: !!pe });
  toast(`<b>${p.nombre}${t ? " — Talla " + t : ""}</b> agregado`);
  openDrawer();
  document.dispatchEvent(new CustomEvent("cart:add", { detail: { id } }));
}

function itemsCarrito() {
  return Object.entries(cart).map(([k, c]) => {
    const p = productos.find(x => x.id === c.id);
    if (!p) return null;
    const t = tieneTallas(p) ? (c.talla || null) : null;
    const disp = dispDe(p, t);
    const qty = Math.min(c.qty, disp);
    if (qty <= 0) return null;
    const extra = c.perso ? PERSONALIZACION_PRECIO : 0;
    return { key: k, id: c.id, talla: t, perso: c.perso || null, nombre: p.nombre, imagen: p.imagen, precio: precioDe(p, t) + extra, qty, disp };
  }).filter(Boolean);
}

export function renderCart() {
  const items = itemsCarrito();
  const count = items.reduce((a, i) => a + i.qty, 0);
  const subtotal = items.reduce((a, i) => a + i.qty * precioMay(i.precio), 0);
  const total = subtotal + (entrega === "domicilio" ? ENVIO_DOMICILIO : 0);
  const countEl = $("#cartCount");
  if (countEl) countEl.textContent = count;

  const body = $("#cartBody");
  if (!body) return;
  if (!items.length) {
    body.innerHTML = `<div class="drawer__empty">👕<br>Tu carrito está vacío.<br><small>Agrega jerseys del catálogo.</small></div>`;
    $("#cartFoot").hidden = true;
    return;
  }
  body.innerHTML = items.map(i => `
    <div class="line">
      <img class="line__img" src="${i.imagen || ''}" alt="" onerror="this.style.visibility='hidden'">
      <div class="line__info">
        <div class="line__name">${i.nombre}${i.talla ? ` <small style="color:#9a9aa2">· Talla ${i.talla}</small>` : ""}${i.perso ? `<br><small style="color:var(--accent)">${i.perso.nombre || ""}${i.perso.dorsal ? " #" + i.perso.dorsal : ""} · personalizado</small>` : ""}</div>
        <div class="line__price">${precioHTML(i.precio)}</div>
        <div class="qty">
          <button data-dec="${i.key}">−</button>
          <span>${i.qty}</span>
          <button data-inc="${i.key}" ${i.qty >= i.disp ? "disabled" : ""}>+</button>
        </div>
      </div>
      <button class="line__rm" data-rm="${i.key}">Quitar</button>
    </div>`).join("");
  /* si hay descuento, el total viejo va tachado y abajo el nuevo */
  const desc = promoAplicada ? Math.min(promoAplicada.descuento, subtotal - 1) : 0;
  const totalFinal = Math.max(0, total - desc);
  const tot = $("#cartTotal");
  if (desc > 0) {
    tot.innerHTML = `<s class="tot-antes">${money(total)}</s> ${money(totalFinal)}`;
    const fila = $("#cartDesc");
    if (fila) {
      fila.hidden = false;
      fila.innerHTML = `<span>Descuento ${promoAplicada.codigo}</span><b>−${money(desc)}</b>`;
    }
  } else {
    tot.textContent = money(total);
    const fila = $("#cartDesc");
    if (fila) fila.hidden = true;
  }
  document.querySelectorAll(".entrega-cart").forEach(b => {
    const on = b.dataset.ec === entrega;
    b.style.borderColor = on ? "#e8b923" : "#2a2a32";
    b.style.background = on ? "rgba(232,185,35,.14)" : "#141418";
    b.style.color = on ? "#e8b923" : "#f4f4f5";
  });
  document.querySelectorAll(".pago-cart").forEach(b => {
    const on = b.dataset.pm === metodoPago;
    b.style.borderColor = on ? "#e8b923" : "#2a2a32";
    b.style.background = on ? "rgba(232,185,35,.14)" : "#141418";
    b.style.color = on ? "#e8b923" : "#f4f4f5";
  });
  $("#cartFoot").hidden = false;
}

/* El código lo teclea el cliente aquí, pero quien decide si vale es el servidor.
   Aquí solo se guarda para mandarlo con el pedido. */
let promoEscrita = "";
let promoAplicada = null;   /* {codigo, descuento, etiqueta} — lo que dijo el servidor */

/* El descuento se enseña en el carrito, pero lo calcula el servidor.
   La página nunca decide cuánto se descuenta: solo pinta lo que le contestaron. */
async function revisarPromo(codigo) {
  const items = itemsCarrito();
  const subtotal = items.reduce((a, i) => a + i.qty * i.precio, 0);
  const r = await fetch(PROMO_WEBHOOK, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo, subtotal })
  });
  return r.json();
}

function quitarPromo() {
  promoAplicada = null; promoEscrita = "";
  const av = document.getElementById("promoAviso");
  if (av) { av.hidden = true; av.className = "promo-aviso"; }
  const inp = document.getElementById("promoInput");
  if (inp) inp.value = "";
  renderCart();
}

document.addEventListener("click", async e => {
  if (e.target.id === "promoAbrir") {
    const c = document.getElementById("promoCampo");
    c.hidden = false;
    e.target.hidden = true;
    document.getElementById("promoInput")?.focus();
    return;
  }
  if (e.target.id === "promoQuitar") { quitarPromo(); return; }

  if (e.target.id === "promoAplicar") {
    const inp = document.getElementById("promoInput");
    const av = document.getElementById("promoAviso");
    const btn = e.target;
    const cod = inp.value.trim().toUpperCase().replace(/\s+/g, "");
    if (!cod) { inp.focus(); return; }
    inp.value = cod;
    btn.disabled = true; btn.textContent = "Revisando…";
    av.hidden = false; av.className = "promo-aviso"; av.textContent = "Revisando tu código…";
    try {
      const d = await revisarPromo(cod);
      if (d && d.ok) {
        promoAplicada = { codigo: d.codigo, descuento: d.descuento, etiqueta: d.etiqueta };
        promoEscrita = d.codigo;
        av.className = "promo-aviso promo-aviso--ok";
        av.innerHTML = `Se aplicó <b>${d.codigo}</b> — ${d.etiqueta}. <button type="button" id="promoQuitar" class="promo-quitar">Quitar</button>`;
        track("promo_aplicada", { codigo: d.codigo, descuento: d.descuento });
      } else {
        promoAplicada = null; promoEscrita = "";
        av.className = "promo-aviso promo-aviso--mal";
        av.textContent = (d && d.motivo) || "Ese código no sirve";
        track("promo_rechazada", { codigo: cod, motivo: (d && d.motivo) || "" });
      }
    } catch (err) {
      promoAplicada = null; promoEscrita = "";
      av.className = "promo-aviso promo-aviso--mal";
      av.textContent = "No se pudo revisar. Revisa tu internet e intenta otra vez.";
    }
    btn.disabled = false; btn.textContent = "Aplicar";
    renderCart();
  }
});

function checkout() {
  const items = itemsCarrito();
  if (!items.length) return;
  if (!entrega) { toast("Elige cómo lo recibes: <b>recoger</b> o <b>a domicilio</b>"); return; }
  const productos = items.map(i => ({ id: i.id, qty: i.qty, title: i.nombre, talla: i.talla || "", perso: i.perso || null }));
  const promo = promoEscrita;
  track("checkout", { metodo: metodoPago, entrega, items: items.length });
  if (metodoPago === "transferencia") {
    const subtotal = items.reduce((a, i) => a + i.qty * i.precio, 0);
    const total = subtotal + (entrega === "domicilio" ? ENVIO_DOMICILIO : 0);
    iniciarTransferencia({ productos, entrega, total, promo, onError: () => toast("No se pudo, intenta de nuevo") });
    return;
  }
  const mpItems = items.map(i => ({ title: (i.talla ? `${i.nombre} — Talla ${i.talla}` : i.nombre) + (i.perso ? " (personalizado)" : ""), quantity: i.qty, unit_price: i.precio, currency_id: "MXN" }));
  if (entrega === "domicilio") mpItems.push({ title: "Envío a domicilio", quantity: 1, unit_price: ENVIO_DOMICILIO, currency_id: "MXN" });
  iniciarPago({
    items: mpItems,
    productos,
    entrega,
    promo,
    onError: () => toast("No se pudo generar el pago, intenta de nuevo")
  });
}

const openDrawer = () => { $("#drawer")?.classList.add("open"); $("#overlay")?.classList.add("open"); };
const closeDrawer = () => { $("#drawer")?.classList.remove("open"); $("#overlay")?.classList.remove("open"); };

function toast(html) {
  const wrap = $("#toasts");
  if (!wrap) return;
  const t = document.createElement("div");
  t.className = "toast"; t.innerHTML = html;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

export function initCart() {
  document.addEventListener("click", e => {
    const ec = e.target.closest("[data-ec]");
    if (ec) {
      entrega = ec.dataset.ec;
      track("elige_entrega", { entrega, donde: "carrito" });
      renderCart(); return;
    }
    const pm = e.target.closest("[data-pm]");
    if (pm) {
      metodoPago = pm.dataset.pm;
      track("elige_pago", { metodo: metodoPago, donde: "carrito" });
      renderCart(); return;
    }
    const t = e.target.closest("[data-add],[data-inc],[data-dec],[data-rm]");
    if (!t) return;
    e.preventDefault();
    if (t.dataset.add) addCart(t.dataset.add);
    else if (t.dataset.inc) {
      const c = cart[t.dataset.inc];
      if (!c) return;
      const p = productos.find(x => x.id === c.id);
      const disp = p ? dispDe(p, tieneTallas(p) ? c.talla : null) : 0;
      if (c.qty < disp) {
        c.qty++;
        track("carrito_cantidad", { id: c.id, nombre: p?.nombre || "", cantidad: c.qty });
        guardar();
      }
    }
    else if (t.dataset.dec) {
      const k = t.dataset.dec; if (!cart[k]) return;
      const c = cart[k];
      const p = productos.find(x => x.id === c.id);
      cart[k].qty--;
      if (cart[k].qty <= 0) { delete cart[k]; track("carrito_quitar", { id: c.id, nombre: p?.nombre || "", talla: c.talla || "" }); }
      else track("carrito_cantidad", { id: c.id, nombre: p?.nombre || "", cantidad: cart[k].qty });
      guardar();
    }
    else if (t.dataset.rm) {
      const c = cart[t.dataset.rm];
      const p = c ? productos.find(x => x.id === c.id) : null;
      if (c) track("carrito_quitar", { id: c.id, nombre: p?.nombre || "", talla: c.talla || "" });
      delete cart[t.dataset.rm]; guardar();
    }
  });
  $("#openCart")?.addEventListener("click", () => { track("carrito_abrir", { items: itemsCarrito().length }); openDrawer(); });
  $("#closeCart")?.addEventListener("click", () => { track("carrito_cerrar", { items: itemsCarrito().length }); closeDrawer(); });
  $("#overlay")?.addEventListener("click", () => { track("carrito_cerrar", { items: itemsCarrito().length }); closeDrawer(); });
  $("#checkout")?.addEventListener("click", checkout);
  onMayoreo(() => renderCart());
  const foot = $("#cartFoot");
  if (foot && !$("#entregaCart")) {
    const wrap = document.createElement("div");
    wrap.id = "entregaCart";
    wrap.style.cssText = "display:flex;gap:8px;margin-bottom:12px";
    wrap.innerHTML = `<button type="button" class="entrega-cart" data-ec="tienda" style="flex:1;padding:10px;border-radius:10px;border:1px solid #2a2a32;background:#141418;color:#f4f4f5;font-size:12.5px;cursor:pointer">Recoger en tienda</button><button type="button" class="entrega-cart" data-ec="domicilio" style="flex:1;padding:10px;border-radius:10px;border:1px solid #2a2a32;background:#141418;color:#f4f4f5;font-size:12.5px;cursor:pointer">🏠 A domicilio +${money(ENVIO_DOMICILIO)}</button>`;
    foot.prepend(wrap);
  }
  if (foot && !$("#pagoCart")) {
    const w2 = document.createElement("div");
    w2.id = "pagoCart";
    w2.style.cssText = "display:flex;gap:8px;margin-bottom:12px";
    w2.innerHTML = `<button type="button" class="pago-cart" data-pm="tarjeta" style="flex:1;padding:10px;border-radius:10px;border:1px solid #2a2a32;background:#141418;color:#f4f4f5;font-size:12.5px;cursor:pointer">💳 Tarjeta</button><button type="button" class="pago-cart" data-pm="transferencia" style="flex:1;padding:10px;border-radius:10px;border:1px solid #2a2a32;background:#141418;color:#f4f4f5;font-size:12.5px;cursor:pointer">🏦 Transferencia</button>`;
    $("#entregaCart")?.after(w2);
  }
  renderCart();
}
