import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=128";
import { setProductos, initCart } from "./cart.js?v=128";
catalogoRapido(list => setProductos(list));
initCart();
