const KEY = "dm_promotor";
const VIDA = 30 * 24 * 3600 * 1000;
export const PROMO_HASTA = new Date("2026-12-13T00:00:00-06:00");

export const limpiarSlug = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "").slice(0, 30);
export const codigoDe = slug => limpiarSlug(slug).toUpperCase();

function leer() {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) || "null");
    if (g && g.slug && Date.now() - g.t < VIDA) return g;
  } catch { }
  return null;
}

export function guardarPromotor(slug, nuevo = false) {
  const s = limpiarSlug(slug);
  if (s.length < 2) return null;
  const g = { slug: s, codigo: codigoDe(s), t: Date.now(), nuevo };
  try { localStorage.setItem(KEY, JSON.stringify(g)); } catch { }
  return g;
}

export function promotorActual() {
  const p = new URLSearchParams(location.search).get("p");
  if (p) {
    const previo = leer();
    const s = limpiarSlug(p);
    let rechazado = false;
    try { rechazado = (sessionStorage.getItem("dm_promotor_no") || "").split(",").includes(s); } catch { }
    if (s.length >= 2 && !rechazado && (!previo || previo.slug !== s)) return guardarPromotor(s, true);
  }
  return leer();
}

export const promoVigente = () => Date.now() < PROMO_HASTA.getTime();

export async function validarPromotor() {
  const g = promotorActual();
  if (!g) return null;
  try { if (sessionStorage.getItem("dm_promotor_ok") === g.slug) return g; } catch { }
  const { firebaseConfig } = await import("./config.js?v=129");
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/promotores/${g.slug}?key=${firebaseConfig.apiKey}&mask.fieldPaths=activo`).catch(() => null);
  if (!r) return g;
  const d = r.ok ? await r.json().catch(() => null) : null;
  if (r.status === 404 || d?.fields?.activo?.booleanValue === false) {
    try {
      localStorage.removeItem(KEY);
      const no = (sessionStorage.getItem("dm_promotor_no") || "").split(",").filter(Boolean);
      sessionStorage.setItem("dm_promotor_no", [...new Set([...no, g.slug])].slice(-20).join(","));
    } catch { }
    document.dispatchEvent(new CustomEvent("promotor:cambio", { detail: { slug: g.slug } }));
    return null;
  }
  if (r.ok) try { sessionStorage.setItem("dm_promotor_ok", g.slug); } catch { }
  return g;
}

export async function promotorPorCodigo(codigo) {
  const c = String(codigo || "").toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{3,30}$/.test(c)) return null;
  const { firebaseConfig } = await import("./config.js?v=129");
  const slug = c.toLowerCase();
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/promotores/${slug}?key=${firebaseConfig.apiKey}&mask.fieldPaths=activo`).catch(() => null);
  if (!r || !r.ok) return null;
  const d = await r.json().catch(() => null);
  if (d?.fields?.activo?.booleanValue === false) return null;
  return guardarPromotor(slug);
}
