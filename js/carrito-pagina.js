import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=139";
import { setProductos, initCart } from "./cart.js?v=139";
catalogoRapido(list => setProductos(list));
initCart();
