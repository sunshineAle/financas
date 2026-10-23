// Compras no cartão de crédito dentro dos totais do mês (decisão de 22/10/2026):
//  - cada PARCELA conta como saída no mês dela (mês da compra + nº da parcela - 1), igual à lista de Transações;
//  - o PAGAMENTO da fatura (a saída que sai da conta) fica de fora dos totais, para não contar duas vezes;
//  - meses depois do atual entram só na PROJEÇÃO (saídas previstas), nunca nos totais "reais".
const db = require('../db');

// Condição SQL (para transacoes, sem apelido ou com o apelido `t.`): tira as saídas que são pagamento de fatura.
const semPagamentoDeFatura = (alias = '') =>
  `${alias}id NOT IN (SELECT transacao_id FROM faturas_pagas WHERE transacao_id IS NOT NULL AND excluido_em IS NULL)`;

const pad = (n) => String(n).padStart(2, '0');

function chaveHoje() {
  const d = new Date().toLocaleDateString('sv-SE', { timeZone: process.env.APP_TIMEZONE || 'America/Sao_Paulo' });
  return d.slice(0, 7);
}

// Todas as parcelas de cartão do usuário, com a data (AAAA-MM-DD) e o mês (AAAA-MM) em que cada uma pesa.
function parcelasCartao(usuarioId, { categoriaId = null } = {}) {
  const args = [usuarioId];
  let filtro = '';
  if (categoriaId) { filtro = ' AND l.categoria_id = ?'; args.push(categoriaId); }
  const linhas = db
    .prepare(
      `SELECT l.id, l.cartao_id, l.compra_id, l.valor, l.categoria_id, l.data_compra, l.parcela_numero
       FROM lancamentos_cartao l JOIN cartoes k ON k.id = l.cartao_id AND k.excluido_em IS NULL
       WHERE l.usuario_id = ? AND l.excluido_em IS NULL${filtro}`
    )
    .all(...args);
  return linhas.map((l) => {
    const [a, m, d] = l.data_compra.split('-').map(Number);
    const total = a * 12 + (m - 1) + (l.parcela_numero - 1);
    const ano = Math.floor(total / 12);
    const mes = (total % 12) + 1;
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const data = `${ano}-${pad(mes)}-${pad(Math.min(d, ultimo))}`;
    return { ...l, data, mes: data.slice(0, 7) };
  });
}

// Soma por mês (AAAA-MM) das parcelas que já valem nos totais (mês atual e anteriores).
function saidasCartaoPorMes(usuarioId) {
  const hoje = chaveHoje();
  const porMes = {};
  parcelasCartao(usuarioId).forEach((p) => { if (p.mes <= hoje) porMes[p.mes] = (porMes[p.mes] || 0) + p.valor; });
  return porMes;
}

// Parcelas dos meses FUTUROS, por mês: é a projeção das próximas faturas.
function projecaoCartaoPorMes(usuarioId) {
  const hoje = chaveHoje();
  const porMes = {};
  parcelasCartao(usuarioId).forEach((p) => {
    if (p.mes > hoje) {
      const m = (porMes[p.mes] ||= { mes: p.mes, total: 0, quantidade: 0 });
      m.total += p.valor;
      m.quantidade++;
    }
  });
  return Object.values(porMes).sort((x, y) => (x.mes < y.mes ? -1 : 1)).map((m) => ({ ...m, total: Math.round(m.total * 100) / 100 }));
}

module.exports = { semPagamentoDeFatura, parcelasCartao, saidasCartaoPorMes, projecaoCartaoPorMes, chaveHoje };
