// Apoio das telas de Metas e Investimentos (setor G): chamadas à API, CDI do Bacen e formatação.
// O CDI diário vem do cache local do Bacen (services/bacen.js; funciona offline com snapshot) e é enviado ao backend
// (?cdiDiario=) para simular o rendimento das metas. Sem Bacen disponível, usa um valor aproximado marcado como estimativa.
const CDI_PADRAO = 0.0545; // % ao dia útil (aprox. do snapshot embutido)
const estado = { cdi: null, origem: 'estimativa', atualizadoEm: null };

export async function carregarCdi() {
  if (estado.cdi) return estado;
  try {
    const m = await import('./bacen.js');
    const s = await m.getSerie('cdi_diaria');
    const ultimo = s && s.dados && s.dados.length ? s.dados[s.dados.length - 1].valor : null;
    if (ultimo > 0) {
      estado.cdi = ultimo;
      estado.origem = s.origem;
      estado.atualizadoEm = s.atualizadoEm;
    }
  } catch { /* sem Bacen: segue com o valor aproximado */ }
  if (!estado.cdi) estado.cdi = CDI_PADRAO;
  return estado;
}
export const infoCdi = () => estado;

// Acrescenta ?cdiDiario= à URL (só nas rotas de Metas)
export function comCdi(url) {
  if (!estado.cdi) return url;
  return url + (url.includes('?') ? '&' : '?') + 'cdiDiario=' + estado.cdi;
}

export async function api(metodo, url, corpo) {
  const r = await fetch(url, {
    method: metodo,
    credentials: 'include',
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { /* resposta sem corpo */ }
  return { ok: r.ok, status: r.status, json };
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const moeda = (v) => fmt.format(Number(v) || 0);
export const moeda4 = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(v) || 0);
export const numeroBR = (v) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(Number(v) || 0);
export function dataBR(t) {
  const [a, m, d] = String(t || '').slice(0, 10).split('-');
  return a ? `${d}/${m}/${a}` : '—';
}
export function dataHoraBR(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Tipos de ativo negociados em cotas (compra com cotas e preço; provento por cota)
export const TIPOS_COTAS = ['acoes', 'fii', 'fiagro', 'etf', 'bdr', 'cripto', 'ouro'];
