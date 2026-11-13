import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=131";
import { setProductos, initCart } from "./cart.js?v=131";
catalogoRapido(list => setProductos(list));
initCart();
