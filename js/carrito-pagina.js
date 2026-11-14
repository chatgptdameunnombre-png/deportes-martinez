import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=141";
import { setProductos, initCart } from "./cart.js?v=141";
catalogoRapido(list => setProductos(list));
initCart();
