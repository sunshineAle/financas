// Ícone de conta ou cartão: emoji curto ou imagem pequena enviada (data URI, até ~150 KB)
function lerIcone(valor) {
  const t = String(valor || '');
  if (t.startsWith('data:image/')) return t.length <= 150000 && /^data:image\/(png|jpeg|webp|gif);base64,/.test(t) ? t : null;
  if (/^banco:[a-z0-9-]{1,60}$/.test(t)) return t; // logo do catálogo de instituições
  if (/^cat-(saida|entrada)-[a-z0-9-]{1,60}$/.test(t)) return t; // ícone do manifesto de categorias (v2)
  if (t.startsWith('data:') || /^https?:/i.test(t)) return null;
  return t.slice(0, 8) || null;
}

module.exports = { lerIcone };
