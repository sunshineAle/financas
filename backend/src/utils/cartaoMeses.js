// Compras no cartão de crédito dentro dos totais do mês (decisão de 22/10/2026):
//  - cada PARCELA conta como saída no mês dela (mês da compra + nº da parcela - 1), igual à lista de Transações;
//  - o PAGAMENTO da fatura (a saída que sai da conta) fica de fora dos totais, para não contar duas vezes;
//  - meses depois do atual entram só na PROJEÇÃO (saídas previstas), nunca nos totais "reais".
const db = require('../db');

// Condição SQL (para transacoes, sem apelido ou com o apelido `t.`): tira as saídas que são pagamento de fatura.
const semPagamentoDeFatura = (alias = '') =>
  `${alias}id NOT IN (SELECT transacao_id FROM faturas_pagas WHERE transacao_id IS NOT NULL AND excluido_em IS NULL)`;

const pad = (n) => String(n).padStart(2, '0');

const { chaveDaData } = require('./mesFinanceiro');
// Mês FINANCEIRO de hoje (anotação 51: o mês pode começar no dia 7 ou no 5º dia útil).
function chaveHoje() {
  const d = new Date().toLocaleDateString('sv-SE', { timeZone: process.env.APP_TIMEZONE || 'America/Sao_Paulo' });
  return chaveDaData(d);
}

// Todas as parcelas de cartão do usuário, com a data (AAAA-MM-DD) e o mês (AAAA-MM) em que cada uma pesa.
function parcelasCartao(usuarioId, { categoriaId = null } = {}) {
  const args = [usuarioId];
  let filtro = '';
  if (categoriaId) { filtro = ' AND l.categoria_id = ?'; args.push(categoriaId); }
  const linhas = db
    .prepare(
      `SELECT l.id, l.cartao_id, l.compra_id, l.valor, l.categoria_id, l.data_compra, l.parcela_numero, l.tipo_mov, l.descricao
       FROM lancamentos_cartao l JOIN cartoes k ON k.id = l.cartao_id AND k.excluido_em IS NULL
       WHERE l.usuario_id = ? AND l.excluido_em IS NULL${filtro}`
    )
    .all(...args);
  // Anotação 61: pagamento adiantado (abate a fatura) não é gasto; cashback é ENTRADA (ver entradasCartao)
  return linhas.filter((l) => !CREDITO_FORA_DOS_GASTOS.has(l.tipo_mov)).map(comData);
}
const CREDITO_FORA_DOS_GASTOS = new Set(['pagamento', 'cashback']);
function comData(l) {
  const [a, m, d] = l.data_compra.split('-').map(Number);
  const total = a * 12 + (m - 1) + (l.parcela_numero - 1);
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const data = `${ano}-${pad(mes)}-${pad(Math.min(d, ultimo))}`;
  return { ...l, data, mes: chaveDaData(data) }; // mês financeiro da data em que a parcela pesa
}

// Anotação 61: cashback recebido no cartão = ENTRADA na categoria Cashback (valor positivo), no mês da data do crédito.
const CASHBACK = 'Cashback';
function entradasCartao(usuarioId) {
  return db
    .prepare(
      `SELECT l.id, l.cartao_id, l.compra_id, l.valor, l.data_compra, l.parcela_numero, l.descricao FROM lancamentos_cartao l
       JOIN cartoes k ON k.id = l.cartao_id AND k.excluido_em IS NULL
       WHERE l.usuario_id = ? AND l.excluido_em IS NULL AND l.tipo_mov = 'cashback'`
    )
    .all(usuarioId)
    .map((l) => ({ ...comData(l), valor: Math.abs(l.valor), categoria_receita: CASHBACK }));
}
// Soma das entradas de cashback por mês (só meses até o atual, como as saídas) e por categoria, para os totais.
function entradasCartaoNoPeriodo(usuarioId, tam, chave) {
  const hoje = chaveHoje();
  return entradasCartao(usuarioId).filter((e) => e.mes <= hoje && e.mes.slice(0, tam) === chave).reduce((s, e) => s + e.valor, 0);
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

module.exports = { semPagamentoDeFatura, parcelasCartao, saidasCartaoPorMes, projecaoCartaoPorMes, chaveHoje, entradasCartao, entradasCartaoNoPeriodo, CREDITO_FORA_DOS_GASTOS };
