import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=142";
import { setProductos, initCart } from "./cart.js?v=142";
catalogoRapido(list => setProductos(list));
initCart();
