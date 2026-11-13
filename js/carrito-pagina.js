import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=136";
import { setProductos, initCart } from "./cart.js?v=136";
catalogoRapido(list => setProductos(list));
initCart();
