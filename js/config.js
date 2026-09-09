export const firebaseConfig = {
  apiKey: "AIzaSyAp8rqvnOZ77R9pl_2vj1gipCJ0oAq2KHw",
  authDomain: "deportes-martinez.firebaseapp.com",
  projectId: "deportes-martinez",
  storageBucket: "deportes-martinez.firebasestorage.app",
  messagingSenderId: "172425972449",
  appId: "1:172425972449:web:c12590cf69701d9797c5a0"
};

export const WHATSAPP_NUMERO = "523324469055";

export const ENVIO_DOMICILIO = 180;

export const PERSONALIZACION_PRECIO = 150;

export const COBRO_WEBHOOK = "https://n8n.srv1473142.hstgr.cloud/webhook/dm-crear-pago";
/* los pedidos por transferencia se registran aquí: aparta el stock, guarda la venta
   como "por cobrar" y le avisa al dueño */
export const PEDIDO_WEBHOOK = "https://n8n.srv1473142.hstgr.cloud/webhook/dm-pago-ok";
/* revisa un código de descuento y dice cuánto quita, para poder enseñarlo en el carrito */
export const PROMO_WEBHOOK = "https://n8n.srv1473142.hstgr.cloud/webhook/dm-promo";
export const ASESOR_WEBHOOK = "https://n8n.srv1473142.hstgr.cloud/webhook/dm-asesor";

export const NEGOCIO = {
  nombre: "Deportes Martínez",
  claim: "Cumplimos sueños y vestimos campeones",
  ciudad: "",
  mapa: "https://www.google.com/maps?q=20.546361,-103.467528",
  direccion: "",
  telefono: "33 2446 9055",
  telefono2: "33 3389 5508",
  horario: "",
  instagram: "https://www.instagram.com/_deportes_martinez_/"
};

export const CATEGORIAS = [
  { id: "futbol", nombre: "Futbol", emoji: "⚽", archivo: "futbol.html" },
  { id: "basket", nombre: "Basketball", emoji: "🏀", archivo: "basket.html" },
  { id: "americano", nombre: "Americano", emoji: "🏈", archivo: "americano.html" }
];

export const usaFirebase = Object.values(firebaseConfig).every(v => v && v !== "PEGA_AQUI");
