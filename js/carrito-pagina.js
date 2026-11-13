import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=135";
import { setProductos, initCart } from "./cart.js?v=135";
catalogoRapido(list => setProductos(list));
initCart();
