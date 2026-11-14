import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=138";
import { setProductos, initCart } from "./cart.js?v=138";
catalogoRapido(list => setProductos(list));
initCart();
