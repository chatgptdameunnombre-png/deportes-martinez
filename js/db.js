import { firebaseConfig, usaFirebase } from "./config.js?v=76";
import { PRODUCTOS_SEED } from "./seed.js?v=76";

const LS_KEY = "dm_productos";
const LS_AUTH = "dm_auth";
const DEMO_USER = { email: "dueno@demo.com", pass: "demo1234" };

let impl;

if (usaFirebase) {
  impl = await crearImplFirebase();
} else {
  impl = crearImplDemo();
}

function separarFotos(data) {
  const { id, imagenes, ...resto } = data;
  const fotos = Array.isArray(imagenes) ? imagenes : [];
  const principal = { ...resto, imagen: fotos[0] || resto.imagen || "", nFotos: fotos.length };
  const extra = fotos.slice(1);
  return { id, principal, fotos, extra };
}

async function crearImplFirebase() {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js");
  const {
    getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, getDoc,
    deleteDoc, getDocs, setDoc, deleteField, query, orderBy, where
  } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");
  const {
    getAuth, initializeAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
    createUserWithEmailAndPassword, sendPasswordResetEmail,
    indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, inMemoryPersistence
  } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js");

  const app = initializeApp(firebaseConfig);
  const fdb = getFirestore(app);
  /* La sesión se guarda en localStorage ANTES que en IndexedDB, a propósito.
     En Safari de iPhone IndexedDB no siempre falla: a veces se queda colgado sin
     responder, y entonces `onAuthStateChanged` NUNCA dispara — la persona entra,
     la cuenta se crea de verdad, pero la web sigue diciendo "Iniciar sesión".
     localStorage es sincrónico y en Safari sí responde. IndexedDB queda como
     segunda opción (solo aporta compartir sesión entre pestañas). */
  let auth;
  try {
    auth = initializeAuth(app, {
      persistence: [browserLocalPersistence, indexedDBLocalPersistence, browserSessionPersistence, inMemoryPersistence]
    });
  } catch (e) {
    auth = getAuth(app);
  }
  const col = collection(fdb, "productos");
  const refProd = id => doc(fdb, "productos", id);
  const refFotos = id => doc(fdb, "productos_fotos", id);
  const refCliente = uid => doc(fdb, "clientes", uid);
  const refSolic = uid => doc(fdb, "solicitudes_mayoreo", uid);
  const colSolic = collection(fdb, "solicitudes_mayoreo");
  const colSes = collection(fdb, "sesiones");

  async function escribirFotos(id, extra) {
    if (extra.length) await setDoc(refFotos(id), { imagenes: extra });
    else await deleteDoc(refFotos(id)).catch(() => {});
  }

  return {
    modo: "nube",
    onProducts(cb) {
      return onSnapshot(query(col, orderBy("nombre")), snap => {
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    },
    async addProduct(data) {
      const ref = data.id ? refProd(data.id) : doc(col);
      const { principal, extra } = separarFotos({ ...data, id: ref.id });
      await setDoc(ref, principal);
      await escribirFotos(ref.id, extra);
    },
    async updateProduct(id, patch) {
      if ("imagenes" in patch) {
        const { principal, extra } = separarFotos({ ...patch, id });
        await escribirFotos(id, extra);
        return updateDoc(refProd(id), { ...principal, imagenes: deleteField() });
      }
      return updateDoc(refProd(id), patch);
    },
    async deleteProduct(id) {
      await deleteDoc(refFotos(id)).catch(() => {});
      return deleteDoc(refProd(id));
    },
    async getFotos(id) {
      const fs = await getDoc(refFotos(id));
      const extra = fs.exists() ? (fs.data().imagenes || []) : null;
      const ms = await getDoc(refProd(id));
      const d = ms.exists() ? ms.data() : {};
      if (extra) return [d.imagen, ...extra].filter(Boolean);
      if (d.imagenes?.length) return d.imagenes;
      return d.imagen ? [d.imagen] : [];
    },
    login(email, pass) { return signInWithEmailAndPassword(auth, email, pass); },
    registrar(email, pass) { return createUserWithEmailAndPassword(auth, email, pass); },
    /* quién está dentro AHORA, sin esperar al aviso de Firebase */
    usuarioAhora() {
      const u = auth.currentUser;
      return u ? { email: u.email, uid: u.uid } : null;
    },
    resetPass(email) { return sendPasswordResetEmail(auth, email); },
    logout() { return signOut(auth); },
    onAuth(cb) { return onAuthStateChanged(auth, u => cb(u ? { email: u.email, uid: u.uid } : null)); },
    async guardarPerfil(uid, data) { await setDoc(refCliente(uid), data, { merge: true }); },
    async getPerfil(uid) { const s = await getDoc(refCliente(uid)); return s.exists() ? s.data() : null; },
    async solicitarMayoreo(uid, data) { await setDoc(refSolic(uid), { ...data, estado: "pendiente", creado: new Date().toISOString() }, { merge: true }); },
    async getMiMayoreo(uid) { try { const s = await getDoc(refSolic(uid)); return s.exists() ? s.data() : null; } catch { return null; } },
    async listarMayoreo() { const snap = await getDocs(colSolic); return snap.docs.map(d => ({ uid: d.id, ...d.data() })); },
    async resolverMayoreo(uid, aprobado) { await updateDoc(refSolic(uid), { estado: aprobado ? "aprobado" : "rechazado", resuelto: new Date().toISOString() }); },
    async listarSesiones() {
      const snap = await getDocs(colSes);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(b.inicio || "").localeCompare(String(a.inicio || "")));
    },
    async token() { return auth.currentUser ? auth.currentUser.getIdToken() : null; },
    async listarClientes() {
      const snap = await getDocs(collection(fdb, "clientes"));
      return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    },
    async borrarCliente(uid) { await deleteDoc(refCliente(uid)); },
    async revalidar(email, pass) {
      await signInWithEmailAndPassword(auth, email, pass);
      return true;
    },
    async borrarSesion(id) { await deleteDoc(doc(fdb, "sesiones", id)); },

    /* Lo que la gente pidió y no había. Se ordena aquí y no con orderBy
       para no tener que crear un índice en Firestore. */
    async listarSugerencias() {
      const snap = await getDocs(collection(fdb, "sugerencias"));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
    },
    async marcarSugerencia(id, atendida) {
      await updateDoc(doc(fdb, "sugerencias", id), { atendida: !!atendida });
    },
    async borrarSugerencia(id) { await deleteDoc(doc(fdb, "sugerencias", id)); },

    /* ---------- códigos de promoción ---------- */
    async listarPromos() {
      const snap = await getDocs(collection(fdb, "promos"));
      return snap.docs.map(d => ({ codigo: d.id, ...d.data() }))
        .sort((a, b) => String(b.creado || "").localeCompare(String(a.creado || "")));
    },
    async guardarPromo(codigo, datos) {
      await setDoc(doc(fdb, "promos", codigo), datos, { merge: true });
    },
    async borrarPromo(codigo) { await deleteDoc(doc(fdb, "promos", codigo)); },

    /* ---------- ventas ---------- */
    async listarVentas() {
      const snap = await getDocs(collection(fdb, "ventas"));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(b.fechaISO || b.fecha || "").localeCompare(String(a.fechaISO || a.fecha || "")));
    },
    /* las compras de una persona: se filtra por su uid (así lo exigen las reglas)
       y se ordena aquí, para no tener que crear un índice en Firestore */
    /* solo lo necesario para la miniatura de los pedidos del cliente */
    async productosParaFoto() {
      const snap = await getDocs(col);
      return snap.docs.map(d => ({ id: d.id, imagen: d.data().imagen || "" }));
    },
    async misCompras(uid) {
      if (!uid) return [];
      const snap = await getDocs(query(collection(fdb, "ventas"), where("clienteUid", "==", uid)));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(b.fechaISO || "").localeCompare(String(a.fechaISO || "")));
    },
    async marcarVentaPagada(id) {
      await updateDoc(doc(fdb, "ventas", id), {
        estado: "pagada",
        confirmada: new Date().toISOString()
      });
    },
    /* ya salió de la tienda: enviado o recogido, según cómo lo pidió */
    async marcarVentaEntregada(id) {
      await updateDoc(doc(fdb, "ventas", id), {
        estado: "entregada",
        entregada: new Date().toISOString()
      });
    },
    /* Cancelar devuelve el stock que se había apartado. Se lee de `lineas`
       (lo que se apartó de verdad), no del carrito. */
    async cancelarVenta(id) {
      const ref = doc(fdb, "ventas", id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return 0;
      const v = snap.data();
      let lineas = [];
      try { lineas = JSON.parse(v.lineas || "[]"); } catch { lineas = []; }
      let devueltos = 0;
      for (const l of lineas) {
        if (!l.id || !l.qty) continue;
        const rp = refProd(l.id);
        const ps = await getDoc(rp);
        if (!ps.exists()) continue;
        const p = ps.data();
        if (Array.isArray(p.tallas) && p.tallas.length && l.talla) {
          const tallas = p.tallas.map(t => t.talla === l.talla
            ? { ...t, stock: Number(t.stock || 0) + Number(l.qty) } : t);
          const total = tallas.reduce((a, t) => a + Number(t.stock || 0), 0);
          await updateDoc(rp, { tallas, stock: total });
        } else {
          await updateDoc(rp, { stock: Number(p.stock || 0) + Number(l.qty) });
        }
        devueltos += Number(l.qty);
      }
      await updateDoc(ref, { estado: "cancelada", cancelada: new Date().toISOString() });
      return devueltos;
    },
    async borrarVenta(id) { await deleteDoc(doc(fdb, "ventas", id)); },
    /* Borra TODAS las visitas de una persona: las de su cuenta y, si se pasa el correo,
       también las que quedaron ligadas a ese correo. Devuelve cuántas borró. */
    async borrarHistorialCliente(uid, email) {
      const vistos = new Map();
      const consultas = [];
      if (uid) consultas.push(query(colSes, where("clienteUid", "==", uid)));
      if (email) consultas.push(query(colSes, where("clienteEmail", "==", email)));
      for (const q of consultas) {
        const snap = await getDocs(q);
        snap.docs.forEach(d => vistos.set(d.id, d.ref));
      }
      for (const ref of vistos.values()) await deleteDoc(ref);
      return vistos.size;
    },
    async seedIfEmpty() {
      const snap = await getDocs(col);
      if (snap.empty) {
        for (const p of PRODUCTOS_SEED) {
          const { principal, extra } = separarFotos(p);
          await setDoc(refProd(p.id), principal);
          await escribirFotos(p.id, extra);
        }
      }
    },
    async optimizarCatalogo(onProgress) {
      const snap = await getDocs(col);
      let hechos = 0;
      for (const d of snap.docs) {
        const data = d.data();
        if (!data.imagenes?.length) continue;
        const extra = data.imagenes.slice(1);
        await escribirFotos(d.id, extra);
        await updateDoc(refProd(d.id), {
          imagen: data.imagenes[0] || data.imagen || "",
          nFotos: data.imagenes.length,
          imagenes: deleteField()
        });
        hechos++;
        onProgress?.(hechos);
      }
      return hechos;
    }
  };
}

function crearImplDemo() {
  const bc = "BroadcastChannel" in window ? new BroadcastChannel("deportes-martinez") : null;
  const listeners = new Set();
  const authListeners = new Set();

  const leer = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch { return []; }
  };
  const guardar = (arr) => {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
    notificar();
    bc?.postMessage("cambio");
  };
  const ligero = ({ imagenes, ...p }) => ({ ...p, imagen: (imagenes?.[0]) || p.imagen || "", nFotos: imagenes?.length || (p.imagen ? 1 : 0) });
  const notificar = () => {
    const arr = [...leer()].map(ligero).sort((a, b) => a.nombre.localeCompare(b.nombre));
    listeners.forEach(cb => cb(arr));
  };

  bc?.addEventListener("message", notificar);
  window.addEventListener("storage", e => { if (e.key === LS_KEY) notificar(); });

  const usuarioActual = () => {
    try { return JSON.parse(localStorage.getItem(LS_AUTH)); } catch { return null; }
  };
  const notificarAuth = () => authListeners.forEach(cb => cb(usuarioActual()));

  return {
    modo: "demo",
    onProducts(cb) {
      listeners.add(cb);
      cb([...leer()].map(ligero).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      return () => listeners.delete(cb);
    },
    async addProduct(data) {
      const arr = leer();
      const id = data.id || `p_${Date.now()}`;
      const fotos = Array.isArray(data.imagenes) ? data.imagenes : (data.imagen ? [data.imagen] : []);
      const i = arr.findIndex(p => p.id === id);
      const item = { ...data, id, imagenes: fotos, imagen: fotos[0] || "" };
      if (i >= 0) arr[i] = item; else arr.push(item);
      guardar(arr);
    },
    async updateProduct(id, patch) {
      const arr = leer();
      const i = arr.findIndex(p => p.id === id);
      if (i < 0) return;
      const merged = { ...arr[i], ...patch };
      if ("imagenes" in patch) {
        const fotos = Array.isArray(patch.imagenes) ? patch.imagenes : [];
        merged.imagenes = fotos;
        merged.imagen = fotos[0] || "";
      }
      arr[i] = merged;
      guardar(arr);
    },
    async deleteProduct(id) {
      guardar(leer().filter(p => p.id !== id));
    },
    async getFotos(id) {
      const p = leer().find(x => x.id === id);
      if (!p) return [];
      return p.imagenes?.length ? p.imagenes : (p.imagen ? [p.imagen] : []);
    },
    async login(email, pass) {
      if (email.trim().toLowerCase() === DEMO_USER.email && pass === DEMO_USER.pass) {
        localStorage.setItem(LS_AUTH, JSON.stringify({ email: DEMO_USER.email, uid: "demo_owner" }));
        notificarAuth();
        return true;
      }
      const err = new Error("Correo o contraseña incorrectos");
      err.code = "auth/invalid-credential";
      throw err;
    },
    async registrar(email, pass) {
      const e = email.trim().toLowerCase();
      localStorage.setItem(LS_AUTH, JSON.stringify({ email: e, uid: "demo_" + e }));
      notificarAuth();
      return true;
    },
    async resetPass() { return true; },
    async guardarPerfil(uid, data) { localStorage.setItem("dm_perfil_" + uid, JSON.stringify(data)); },
    async getPerfil(uid) { try { return JSON.parse(localStorage.getItem("dm_perfil_" + uid)); } catch { return null; } },
    async solicitarMayoreo(uid, data) { localStorage.setItem("dm_mayoreo_" + uid, JSON.stringify({ ...data, estado: "pendiente" })); },
    async getMiMayoreo(uid) { try { return JSON.parse(localStorage.getItem("dm_mayoreo_" + uid)); } catch { return null; } },
    async listarMayoreo() { return []; },
    async resolverMayoreo() {},
    async listarSesiones() { return []; },
    async borrarSesion() {},
    async token() { return null; },
    async listarClientes() { return []; },
    async borrarCliente() {},
    async borrarHistorialCliente() { return 0; },
    async listarPromos() { return []; },
    async guardarPromo() {},
    async borrarPromo() {},
    async listarVentas() { return []; },
    async listarSugerencias() { return []; },
    async marcarSugerencia() { },
    async borrarSugerencia() { },
    async misCompras() { return []; },
    async productosParaFoto() { return []; },
    async marcarVentaPagada() {},
    async marcarVentaEntregada() {},
    async cancelarVenta() { return 0; },
    async borrarVenta() {},
    async revalidar() { return true; },
    async logout() { localStorage.removeItem(LS_AUTH); notificarAuth(); },
    usuarioAhora() { return usuarioActual(); },
    onAuth(cb) { authListeners.add(cb); cb(usuarioActual()); return () => authListeners.delete(cb); },
    async seedIfEmpty() {
      if (leer().length === 0) guardar(PRODUCTOS_SEED.map(p => ({ ...p })));
    },
    async optimizarCatalogo() { return 0; }
  };
}

export const db = impl;
export const MODO = impl.modo;
export const CREDS_DEMO = DEMO_USER;
