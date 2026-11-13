import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=132";
import { setProductos, initCart } from "./cart.js?v=132";
catalogoRapido(list => setProductos(list));
initCart();
