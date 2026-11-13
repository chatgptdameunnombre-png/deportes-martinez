import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=134";
import { setProductos, initCart } from "./cart.js?v=134";
catalogoRapido(list => setProductos(list));
initCart();
