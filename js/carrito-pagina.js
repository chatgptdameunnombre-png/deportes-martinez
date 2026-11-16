import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=143";
import { setProductos, initCart } from "./cart.js?v=143";
catalogoRapido(list => setProductos(list));
initCart();
