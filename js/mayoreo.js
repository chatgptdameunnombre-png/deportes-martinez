const money = n => "$" + Number(n).toLocaleString("es-MX");

export function esMayorista() { return false; }

export function descuento() { return 0; }

export function precioHTML(n) { return money(n); }

export function onMayoreo(cb) { return () => {}; }

export function precioMay(n) { return Number(n) || 0; }
