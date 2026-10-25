// Novidades da versão (anotação 40): uma fonte só, changelog.json (public-pwa). O balão de atualização e o Sobre o app
// leem daqui. Busca sempre na rede (para o balão mostrar a versão NOVA) e cai no cache do service worker se estiver offline.
let memoria = null;
export async function carregarNovidades() {
  if (memoria) return memoria;
  const base = (import.meta.env && import.meta.env.BASE_URL) || './';
  try {
    const r = await fetch(base + 'changelog.json', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j)) memoria = j; }
  } catch { /* offline: sem novidades */ }
  return memoria || [];
}
export const dataCurta = (iso) => { const [a, m, d] = String(iso || '').split('-'); return a ? `${d}/${m}/${a}` : ''; };
