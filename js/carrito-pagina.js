import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=137";
import { setProductos, initCart } from "./cart.js?v=137";
catalogoRapido(list => setProductos(list));
initCart();
