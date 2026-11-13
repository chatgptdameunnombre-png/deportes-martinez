import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=125";
import { setProductos, initCart } from "./cart.js?v=125";
catalogoRapido(list => setProductos(list));
initCart();
