// Versão do build do PWA (hash do conteúdo), gravada em version.json no build. Usada no "Sobre o app".
// Devolve { versao, gerado } ou null fora do PWA / sem rede e sem cache.
export async function versaoBuild() {
  try {
    const r = await fetch(import.meta.env.BASE_URL + 'version.json', { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
export async function textoVersao() {
  const v = await versaoBuild();
  if (!v) return '—';
  const quando = v.gerado ? new Date(v.gerado).toLocaleDateString('pt-BR') : '';
  return `build ${v.versao}${quando ? ' · ' + quando : ''}`;
}
