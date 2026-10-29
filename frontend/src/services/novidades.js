// Novidades da versão (anotações 40, 42 e 43): uma fonte só, changelog.json (public-pwa). O aviso de atualização, o aviso
// "Novidades desta versão" e o Sobre o app leem daqui. Para o aviso de versão nova, a leitura é SEMPRE da rede
// (`fresca`), fora de qualquer cache, para trazer o texto da versão nova e não o da que está rodando.
// Para o usuário não existe "Onda": as entradas usam `versao` = "0.N" e aparecem como "Versão 0.N · 25 out 2026" + selo "teste".
let memoria = null;
const base = () => ((import.meta.env && import.meta.env.BASE_URL) || './');
export async function carregarNovidades({ fresca = false } = {}) {
  if (memoria && !fresca) return memoria;
  try {
    const r = await fetch(base() + 'changelog.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j)) { memoria = j; return j; } }
  } catch { /* offline */ }
  return memoria || [];
}
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const dataCurta = (iso) => { const [a, m, d] = String(iso || '').split('-'); return a ? `${Number(d)} ${MESES[Number(m) - 1]} ${a}` : ''; };
export const ehTeste = (n) => !n || !/^[1-9]/.test(String(n.versao || '')); // 0.N = versão de teste; 1.0 em diante = lançamento
export const rotuloVersao = (n) => (n ? `Versão ${n.versao}${n.data ? ' · ' + dataCurta(n.data) : ''}` : '');

// Aviso "Novidades desta versão": aparece UMA vez na primeira abertura da versão nova (reforço da anotação 42).
const CHAVE_VISTA = 'sf:novidades-vista';
export async function novidadesNaoVistas() {
  const lista = await carregarNovidades({ fresca: true });
  const n = lista[0];
  if (!n) return null;
  let vista = null; let pediu = false;
  try { vista = localStorage.getItem(CHAVE_VISTA); pediu = localStorage.getItem('sf:mostrar-novidades') === '1'; } catch { /* sem armazenamento */ }
  if (vista === n.versao) return null;
  // Instalação nova (nunca viu nenhuma): só marca, sem aviso. Depois de atualizar (ou com versão vista antiga): mostra.
  if (!vista && !pediu) { marcarNovidadesVistas(n.versao); return null; }
  return n;
}
export function marcarNovidadesVistas(versao) {
  try { localStorage.setItem(CHAVE_VISTA, versao); localStorage.removeItem('sf:mostrar-novidades'); } catch { /* ignora */ }
}
