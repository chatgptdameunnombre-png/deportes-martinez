import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=129";
import { setProductos, initCart } from "./cart.js?v=129";
catalogoRapido(list => setProductos(list));
initCart();
