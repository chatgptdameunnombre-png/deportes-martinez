import { catalogoRapido, guardarCatalogo } from "./catalogo.js?v=146";
import { setProductos, initCart } from "./cart.js?v=146";
catalogoRapido(list => setProductos(list));
initCart();
