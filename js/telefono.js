export const PAISES = [
  ["MX", "🇲🇽", "México", "52", 10],
  ["US", "🇺🇸", "Estados Unidos", "1", 10],
  ["CA", "🇨🇦", "Canadá", "1", 10],
  ["ES", "🇪🇸", "España", "34", 9],
  ["AR", "🇦🇷", "Argentina", "54", 10],
  ["CO", "🇨🇴", "Colombia", "57", 10],
  ["CL", "🇨🇱", "Chile", "56", 9],
  ["PE", "🇵🇪", "Perú", "51", 9],
  ["EC", "🇪🇨", "Ecuador", "593", 9],
  ["VE", "🇻🇪", "Venezuela", "58", 10],
  ["GT", "🇬🇹", "Guatemala", "502", 8],
  ["SV", "🇸🇻", "El Salvador", "503", 8],
  ["HN", "🇭🇳", "Honduras", "504", 8],
  ["CR", "🇨🇷", "Costa Rica", "506", 8]
];

const pais = cod => PAISES.find(p => p[0] === cod) || PAISES[0];

export function campoTelefono(id, estilo = "") {
  const opciones = PAISES.map(p => `<option value="${p[0]}">${p[1]} +${p[3]}</option>`).join("");
  return `<div class="telCampo" style="display:flex;gap:8px">
      <select id="${id}Pais" aria-label="País del teléfono" style="${estilo};width:auto;flex:none;padding-right:8px;cursor:pointer">${opciones}</select>
      <input id="${id}" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="WhatsApp (10 dígitos)" style="${estilo};flex:1;min-width:0">
    </div>`;
}

function separar(valor) {
  const s = String(valor || "").trim();
  let d = s.replace(/\D/g, "");
  if (s.startsWith("+") || s.startsWith("00")) {
    if (s.startsWith("00")) d = d.slice(2);
    const p = [...PAISES].sort((a, b) => b[3].length - a[3].length).find(x => d.startsWith(x[3]));
    if (p) {
      let resto = d.slice(p[3].length);
      if (p[0] === "MX" && resto.length === 11 && resto.startsWith("1")) resto = resto.slice(1);
      return { cod: p[0], num: resto };
    }
  }
  if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  return { cod: "MX", num: d };
}

function ajustar(sel, inp) {
  const p = pais(sel.value);
  inp.placeholder = `WhatsApp (${p[4]} dígitos)`;
  inp.value = inp.value.replace(/\D/g, "");
}

export function ponerTelefono(raiz, id, valor = "") {
  const sel = raiz.querySelector("#" + id + "Pais"), inp = raiz.querySelector("#" + id);
  if (!sel || !inp) return;
  const { cod, num } = separar(valor);
  sel.value = cod;
  inp.value = num;
  ajustar(sel, inp);
}

export function conectarTelefono(raiz, id, valor = "") {
  const sel = raiz.querySelector("#" + id + "Pais"), inp = raiz.querySelector("#" + id);
  if (!sel || !inp) return;
  ponerTelefono(raiz, id, valor);
  sel.addEventListener("change", () => { ajustar(sel, inp); inp.focus(); });
  inp.addEventListener("keydown", e => {
    const lleno = inp.value.replace(/\D/g, "").length >= pais(sel.value)[4];
    const sinSeleccion = inp.selectionStart === inp.selectionEnd;
    if (/^\d$/.test(e.key) && lleno && sinSeleccion) e.preventDefault();
  });
  inp.addEventListener("input", () => {
    const crudo = inp.value.trim(), d = crudo.replace(/\D/g, "");
    const conLada = crudo.startsWith("+") || crudo.startsWith("00") || (sel.value === "MX" && ((d.length === 12 && d.startsWith("52")) || (d.length === 13 && d.startsWith("521"))));
    if (conLada) {
      const { cod, num } = separar(crudo.startsWith("+") || crudo.startsWith("00") ? crudo : "+" + d);
      sel.value = cod;
      inp.value = num;
    }
    ajustar(sel, inp);
  });
}

export function leerTelefono(raiz, id) {
  const sel = raiz.querySelector("#" + id + "Pais"), inp = raiz.querySelector("#" + id);
  const p = pais(sel ? sel.value : "MX");
  const num = String(inp ? inp.value : "").replace(/\D/g, "");
  if (!num) return { ok: false, vacio: true, valor: "", error: "Pon tu número de WhatsApp." };
  if (num.length !== p[4]) return { ok: false, valor: "", error: `Tu número de ${p[2]} debe tener ${p[4]} dígitos (llevas ${num.length}).` };
  return { ok: true, valor: `+${p[3]} ${num}` };
}
