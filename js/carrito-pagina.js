import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=127";
import { setProductos, initCart } from "./cart.js?v=127";
catalogoRapido(list => setProductos(list));
initCart();
