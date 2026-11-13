import { firebaseConfig } from "./config.js?v=135";

const DOCS = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/`;
const KEY = "dm_catalogo_v1";

function valor(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(valor);
  if ("mapValue" in v) return campos(v.mapValue.fields || {});
  return null;
}

function campos(f) {
  const o = {};
  for (const k in f) o[k] = valor(f[k]);
  return o;
}

function guardado() {
  try { const c = JSON.parse(localStorage.getItem(KEY) || "null"); return Array.isArray(c) && c.length ? c : null; } catch { return null; }
}

const KEY_T = "dm_catalogo_t";
const VIGENCIA = 10 * 60 * 1000;
let pedido = null;

function fresco() {
  try { return Date.now() - Number(localStorage.getItem(KEY_T) || 0) < VIGENCIA; } catch { return false; }
}

async function visibles() {
  const r = await fetch(`${DOCS.slice(0, -1)}:runQuery?key=${firebaseConfig.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "productos" }], where: { fieldFilter: { field: { fieldPath: "oculto" }, op: "EQUAL", value: { booleanValue: false } } } } })
  });
  if (!r.ok) return null;
  const d = await r.json();
  const lista = (Array.isArray(d) ? d : []).filter(x => x.document).map(x => ({ ...campos(x.document.fields || {}), id: x.document.name.split("/").pop() }));
  return lista.length ? lista : null;
}

async function todos() {
  let lista = [], tok = "";
  do {
    const r = await fetch(`${DOCS}productos?key=${firebaseConfig.apiKey}&pageSize=300${tok ? "&pageToken=" + tok : ""}`);
    if (!r.ok) return null;
    const d = await r.json();
    lista = lista.concat((d.documents || []).map(x => ({ ...campos(x.fields || {}), id: x.name.split("/").pop() })));
    tok = d.nextPageToken || "";
  } while (tok);
  return lista;
}

async function bajar() {
  let lista = null;
  try { lista = await visibles(); } catch {}
  if (!lista) lista = await todos();
  if (!lista) return null;
  lista.sort((a, b) => (String(a.nombre) < String(b.nombre) ? -1 : String(a.nombre) > String(b.nombre) ? 1 : 0));
  guardarCatalogo(lista);
  return lista;
}

export async function catalogoRapido(cb) {
  const c = guardado();
  if (c) cb(c);
  if (c && fresco()) return;
  try {
    pedido = pedido || bajar();
    const lista = await pedido;
    if (lista && (!c || JSON.stringify(c) !== JSON.stringify(lista))) cb(lista);
  } catch {}
}

export async function productoRapido(id) {
  try {
    const r = await fetch(`${DOCS}productos/${encodeURIComponent(id)}?key=${firebaseConfig.apiKey}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d.fields ? { ...campos(d.fields), id } : null;
  } catch { return null; }
}

export async function fotosRapido(id) {
  try {
    const r = await fetch(`${DOCS}productos_fotos/${encodeURIComponent(id)}?key=${firebaseConfig.apiKey}`);
    if (!r.ok) return null;
    const d = await r.json();
    return valor(d.fields?.imagenes) || [];
  } catch { return null; }
}

export function guardarCatalogo(lista) {
  try { const txt = JSON.stringify(lista); if (txt.length < 1500000) { localStorage.setItem(KEY, txt); localStorage.setItem(KEY_T, String(Date.now())); } } catch {}
}
