import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=123";
import { setProductos, initCart } from "./cart.js?v=123";
catalogoRapido(list => setProductos(list));
initCart();
