import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=140";
import { setProductos, initCart } from "./cart.js?v=140";
catalogoRapido(list => setProductos(list));
initCart();
