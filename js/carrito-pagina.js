import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=145";
import { setProductos, initCart } from "./cart.js?v=145";
catalogoRapido(list => setProductos(list));
initCart();
