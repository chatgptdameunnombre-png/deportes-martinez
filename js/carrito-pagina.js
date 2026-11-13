import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=126";
import { setProductos, initCart } from "./cart.js?v=126";
catalogoRapido(list => setProductos(list));
initCart();
