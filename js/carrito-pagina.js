import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=124";
import { setProductos, initCart } from "./cart.js?v=124";
catalogoRapido(list => setProductos(list));
initCart();
