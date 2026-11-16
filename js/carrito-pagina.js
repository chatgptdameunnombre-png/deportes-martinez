import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=144";
import { setProductos, initCart } from "./cart.js?v=144";
catalogoRapido(list => setProductos(list));
initCart();
