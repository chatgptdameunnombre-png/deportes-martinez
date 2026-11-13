import { validarPromotor, promoVigente } from "./promotor.js?v=125";

const KEY = "dm_promo_vista";

function mostrar(pr) {
  const m = document.createElement("div");
  m.className = "aviso-modal promo-abre";
  m.innerHTML = pr ? `
    <div class="aviso-modal__caja promo-abre__caja" role="dialog" aria-modal="true" aria-labelledby="promoT">
      <button type="button" class="aviso-modal__x" aria-label="Cerrar">×</button>
      <span class="promo-abre__eti">Gracias por entrar a Deportes Martínez</span>
      <h2 class="promo-abre__t" id="promoT">Todos los jerseys a <b>$600</b></h2>
      <p class="promo-abre__p">Como agradecimiento, tienes descuento con el código <b class="promo-abre__cod">${pr.codigo}</b>. Ya va aplicado en cada playera.</p>
      <a class="btn promo-abre__btn" href="futbol.html">Ver jerseys →</a>
    </div>` : `
    <div class="aviso-modal__caja promo-abre__caja" role="dialog" aria-modal="true" aria-labelledby="promoT">
      <button type="button" class="aviso-modal__x" aria-label="Cerrar">×</button>
      <span class="promo-abre__eti">Precio de apertura</span>
      <h2 class="promo-abre__t" id="promoT">Todos los jerseys a <b>$600</b></h2>
      <p class="promo-abre__p">Para celebrar la apertura de la tienda. Válido hasta el 12 de diciembre.</p>
      <a class="btn promo-abre__btn" href="futbol.html">Ver jerseys →</a>
    </div>`;
  const cerrar = () => { m.remove(); document.removeEventListener("keydown", tecla); };
  const tecla = e => { if (e.key === "Escape") cerrar(); };
  m.addEventListener("click", e => { if (e.target === m || e.target.closest(".aviso-modal__x")) cerrar(); });
  m.querySelector(".promo-abre__btn").addEventListener("click", e => {
    if (location.pathname.endsWith("futbol.html")) { e.preventDefault(); cerrar(); }
  });
  document.addEventListener("keydown", tecla);
  document.body.appendChild(m);
}

validarPromotor().catch(() => null).then(pr => {
  try {
    const porLink = new URLSearchParams(location.search).has("p") && pr;
    if (promoVigente() && (porLink || !sessionStorage.getItem(KEY))) {
      sessionStorage.setItem(KEY, "1");
      setTimeout(() => mostrar(porLink ? pr : null), 900);
    }
  } catch {}
});
