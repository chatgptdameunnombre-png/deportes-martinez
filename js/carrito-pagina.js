import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=133";
import { setProductos, initCart } from "./cart.js?v=133";
catalogoRapido(list => setProductos(list));
initCart();
