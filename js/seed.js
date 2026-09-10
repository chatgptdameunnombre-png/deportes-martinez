/* Catálogo de arranque para el modo demo (sin Firebase).
   Con Firebase configurado esto no se usa: los jerseys viven en la colección `productos`. */
export const PRODUCTOS_SEED = [
  {
    id: "demo-mexico-2026",
    nombre: "México Local 2026",
    categoria: "futbol",
    subcategoria: "Actual",
    equipo: "Selección de México",
    liga: "Mundial 2026",
    temporada: "2026",
    marca: "adidas",
    kit: "Local",
    precio: 1899,
    descripcion: "Ejemplo de demo. Con Firebase conectado, el catálogo real viene de la nube.",
    retro: false,
    piezaUnica: false,
    personalizable: true,
    genero: "Unisex",
    tallaTipo: "tallas",
    tallas: [
      { talla: "S", stock: 3, precio: 0 },
      { talla: "M", stock: 4, precio: 0 },
      { talla: "L", stock: 4, precio: 0 },
      { talla: "XL", stock: 2, precio: 0 }
    ],
    stock: 13,
    imagenes: []
  }
];
