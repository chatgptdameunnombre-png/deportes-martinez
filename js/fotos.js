const GRANDE = /-(estante|frente|espalda)\.webp(\?|$)/;

export const fotoMedia = src => String(src || "").replace(GRANDE, "-$1-m.webp$2");

document.addEventListener("error", e => {
  const img = e.target;
  if (img?.tagName !== "IMG" || img.dataset.grande || !/-m\.webp(\?|$)/.test(img.getAttribute("src") || "")) return;
  e.stopPropagation();
  img.dataset.grande = "1";
  img.src = img.getAttribute("src").replace(/-m\.webp(\?|$)/, ".webp$1");
}, true);
