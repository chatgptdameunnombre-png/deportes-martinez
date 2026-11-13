import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=130";
import { setProductos, initCart } from "./cart.js?v=130";
catalogoRapido(list => setProductos(list));
initCart();
