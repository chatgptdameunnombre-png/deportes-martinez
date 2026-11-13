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
/* manda el WhatsApp de "ya nos llegó tu pago" y el aviso de pedido especial; el servidor revisa que no se repita */
export const AVISO_WEBHOOK = "https://n8n.srv1473142.hstgr.cloud/webhook/dm-aviso";
export const CANCELAR_WEBHOOK = "https://n8n.srv1473142.hstgr.cloud/webhook/dm-cancelar";
/* revisa un código de descuento y dice cuánto quita, para poder enseñarlo en el carrito */
export const PROMO_WEBHOOK = "https://n8n.srv1473142.hstgr.cloud/webhook/dm-promo";
export const ASESOR_WEBHOOK = "https://n8n.srv1473142.hstgr.cloud/webhook/dm-asesor";
/* borra la cuenta del cliente y sus datos; los pedidos se quedan sin datos personales */
export const BORRAR_CUENTA_WEBHOOK = "https://n8n.srv1473142.hstgr.cloud/webhook/dm-borrar-cuenta";

export const EDAD_MINIMA = 18;
export const KIKI_EMAIL = "tuagentedeia.com@gmail.com";

export const NEGOCIO = {
  nombre: "Deportes Martínez",
  claim: "Cumplimos sueños y vestimos campeones",
  ciudad: "",
  mapa: "https://share.google/LqEL9e0FULMOdLhsu",
  direccion: "",
  telefono: "33 2446 9055",
  horario: "",
  instagram: "https://www.instagram.com/_deportes_martinez_/"
};

export const CATEGORIAS = [
  { id: "futbol", nombre: "Futbol", emoji: "⚽", archivo: "futbol.html" },
  { id: "basket", nombre: "Basketball", emoji: "🏀", archivo: "basket.html" },
  { id: "americano", nombre: "Americano", emoji: "🏈", archivo: "americano.html" }
];

export const usaFirebase = Object.values(firebaseConfig).every(v => v && v !== "PEGA_AQUI");
