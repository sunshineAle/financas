// Índices do Banco Central (API SGS), com cache local e uso offline.
//   import { getSerie, ultimoValor, ultimaAtualizacao, atualizar, estadoBacen, SERIES } from './bacen.js';
// - Atualiza no máximo 1x por dia por série (a menos que `atualizar({ forcar: true })`).
// - Guarda o cache no IndexedDB, com a data/hora da última atualização bem-sucedida.
// - Sem internet (ou API fora do ar): usa o cache; sem cache, usa o SNAPSHOT embutido (valores aproximados,
//   sempre marcados com origem 'snapshot').
// Endereço: https://api.bcb.gov.br/dados/serie/bcdata.sgs.<codigo>/dados/ultimos/<n>?formato=json
import { reactive } from 'vue';
import { kvGet, kvSet } from './idb.js';

// Códigos SGS. Os quatro primeiros são os do roteiro (Selic meta 432, Selic diária 11, CDI diário 12, IPCA mensal 433)
// e 13522 (IPCA acumulado em 12 meses). As taxas médias de crédito (grupo 'credito') têm códigos A CONFIRMAR no
// portal https://www3.bcb.gov.br/sgspub: se um código estiver errado a série só aparece vazia; para trocar sem
// mexer no código, grave em localStorage 'sf:bacen:codigos' um JSON como {"cartao_rotativo": 12345}.
export const SERIES = {
  selic_meta: { codigo: 432, nome: 'Selic (meta)', unidade: '% a.a.', periodicidade: 'sob decisão do Copom', n: 24, grupo: 'juros' },
  selic_diaria: { codigo: 11, nome: 'Selic (taxa diária)', unidade: '% a.d.', periodicidade: 'diária', n: 60, grupo: 'juros' },
  cdi_diaria: { codigo: 12, nome: 'CDI (taxa diária)', unidade: '% a.d.', periodicidade: 'diária', n: 60, grupo: 'juros' },
  ipca_mensal: { codigo: 433, nome: 'IPCA (variação mensal)', unidade: '% no mês', periodicidade: 'mensal', n: 24, grupo: 'inflacao' },
  ipca_12m: { codigo: 13522, nome: 'IPCA (acumulado em 12 meses)', unidade: '% em 12 meses', periodicidade: 'mensal', n: 24, grupo: 'inflacao' },
  // Códigos a confirmar (taxa média mensal de juros, pessoa física, recursos livres):
  // Cartão (PF, recursos livres, % a.a.): códigos conferidos nas páginas do Dados Abertos do Bacen (22022 rotativo, 22023 parcelado, 22024 total).
  cartao_rotativo: { codigo: 22022, nome: 'Cartão de crédito rotativo (taxa média)', unidade: '% a.a.', periodicidade: 'mensal', n: 12, grupo: 'credito', confirmado: true },
  cartao_parcelado: { codigo: 22023, nome: 'Cartão de crédito parcelado (taxa média)', unidade: '% a.a.', periodicidade: 'mensal', n: 12, grupo: 'credito', confirmado: true },
  cartao_total: { codigo: 22024, nome: 'Cartão de crédito total (taxa média)', unidade: '% a.a.', periodicidade: 'mensal', n: 12, grupo: 'credito', confirmado: true },
  cheque_especial: { codigo: 20741, nome: 'Cheque especial (taxa média)', unidade: '% a.a.', periodicidade: 'mensal', n: 12, grupo: 'credito', confirmado: false },
  credito_pessoal: { codigo: 20743, nome: 'Crédito pessoal não consignado (taxa média)', unidade: '% a.a.', periodicidade: 'mensal', n: 12, grupo: 'credito', confirmado: false },
};

// Reserva embutida: valores APROXIMADOS (foto de uma data passada), só para o app nunca ficar sem número.
export const DATA_SNAPSHOT = '2026-06-30';
const SNAPSHOT = {
  selic_meta: [{ data: '2026-06-30', valor: 14.75 }],
  selic_diaria: [{ data: '2026-06-30', valor: 0.0551 }],
  cdi_diaria: [{ data: '2026-06-30', valor: 0.0545 }],
  ipca_mensal: [{ data: '2026-05-31', valor: 0.35 }],
  ipca_12m: [{ data: '2026-05-31', valor: 4.5 }],
  // Cartão (% a.a.): ordem de grandeza só para a tela nunca ficar sem número; some assim que o Bacen responder.
  cartao_rotativo: [{ data: '2026-05-31', valor: 440 }],
  cartao_parcelado: [{ data: '2026-05-31', valor: 185 }],
  cartao_total: [{ data: '2026-05-31', valor: 90 }],
};

export const estadoBacen = reactive({ ultima: null, origem: 'snapshot', atualizando: false, erro: '' });

const memoria = {};
const codigoDe = (id) => {
  let sobre = {};
  try { sobre = JSON.parse(localStorage.getItem('sf:bacen:codigos') || '{}') || {}; } catch { sobre = {}; }
  return Number(sobre[id] || SERIES[id].codigo);
};
const paraIso = (d) => { const [dd, mm, aa] = String(d).split('/'); return `${aa}-${mm}-${dd}`; };
const hojeIso = () => new Date().toISOString().slice(0, 10);

async function lerCache(id) {
  if (memoria[id]) return memoria[id];
  const c = await kvGet('bacen:' + id);
  if (c) memoria[id] = c;
  return c;
}

async function baixar(id) {
  const s = SERIES[id];
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigoDe(id)}/dados/ultimos/${s.n}?formato=json`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('Bacen respondeu ' + r.status);
    const json = await r.json();
    const dados = json.map((p) => ({ data: paraIso(p.data), valor: Number(String(p.valor).replace(',', '.')) })).filter((p) => Number.isFinite(p.valor));
    const reg = { id, dados, atualizadoEm: new Date().toISOString() };
    memoria[id] = reg;
    await kvSet('bacen:' + id, reg);
    return reg;
  } finally { clearTimeout(t); }
}

// Série pelo id (ex.: 'selic_meta'). Nunca lança: devolve cache, ou snapshot, ou série vazia.
export async function getSerie(id) {
  const s = SERIES[id];
  if (!s) return null;
  const c = await lerCache(id);
  if (c && c.dados && c.dados.length) return { id, ...s, dados: c.dados, atualizadoEm: c.atualizadoEm, origem: 'bacen' };
  const snap = SNAPSHOT[id];
  if (snap) return { id, ...s, dados: snap, atualizadoEm: DATA_SNAPSHOT + 'T00:00:00.000Z', origem: 'snapshot' };
  return { id, ...s, dados: [], atualizadoEm: null, origem: 'vazia' };
}
export async function ultimoValor(id) {
  const s = await getSerie(id);
  return s && s.dados.length ? { ...s.dados[s.dados.length - 1], origem: s.origem, unidade: s.unidade } : null;
}

// Data (ISO) da última atualização bem-sucedida de qualquer série; null se só há snapshot.
export async function ultimaAtualizacao() {
  let melhor = null;
  for (const id of Object.keys(SERIES)) {
    const c = await lerCache(id);
    if (c && c.atualizadoEm && (!melhor || c.atualizadoEm > melhor)) melhor = c.atualizadoEm;
  }
  estadoBacen.ultima = melhor;
  estadoBacen.origem = melhor ? 'bacen' : 'snapshot';
  return melhor;
}

let emAndamento = null;
export function atualizar({ forcar = false } = {}) {
  if (emAndamento) return emAndamento;
  emAndamento = (async () => {
    estadoBacen.atualizando = true;
    estadoBacen.erro = '';
    let falhas = 0;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { estadoBacen.erro = 'Sem internet: usando os últimos valores guardados.'; return; }
      for (const id of Object.keys(SERIES)) {
        const c = await lerCache(id);
        if (!forcar && c && c.atualizadoEm && c.atualizadoEm.slice(0, 10) === hojeIso()) continue;
        try { await baixar(id); } catch { falhas += 1; }
      }
      if (falhas) estadoBacen.erro = falhas === Object.keys(SERIES).length ? 'Não foi possível atualizar agora: usando os últimos valores guardados.' : 'Algumas séries não puderam ser atualizadas.';
    } finally {
      await ultimaAtualizacao();
      estadoBacen.atualizando = false;
      emAndamento = null;
    }
  })();
  return emAndamento;
}

// Chamado ao abrir o app: lê o cache e tenta atualizar em segundo plano (sem travar a tela).
export function iniciarBacen() {
  ultimaAtualizacao();
  setTimeout(() => atualizar(), 3000);
}
