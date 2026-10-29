const express = require('express');
const db = require('../db');
const { semPagamentoDeFatura, parcelasCartao, chaveHoje, entradasCartao } = require('../utils/cartaoMeses');
const { exigirAutenticacao } = require('../middleware/auth');
const { chaveDaData: chaveDaDataFin } = require('../utils/mesFinanceiro');

const router = express.Router();
router.use(exigirAutenticacao);

function ultimosNMeses(n) {
  const meses = [];
  const agora = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    meses.push({ chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, mes: d.toLocaleDateString('pt-BR', { month: 'short' }) });
  }
  return meses;
}

// Compras no cartão por mês (até o mês atual): contam como saída no mês de cada parcela; o pagamento
// da fatura fica de fora dos totais (regra de 22/10/2026, a mesma de Transações e do Dashboard).
function cartaoPorMes(usuarioId) {
  const hoje = chaveHoje();
  const m = {};
  parcelasCartao(usuarioId).forEach((p) => { if (p.mes <= hoje) m[p.mes] = (m[p.mes] || 0) + p.valor; });
  return m;
}
// Anotação 61: cashback recebido no cartão = entrada no mês dele (até o mês atual)
function cashbackPorMes(usuarioId) {
  const hoje = chaveHoje();
  const m = {};
  entradasCartao(usuarioId).forEach((e) => { if (e.mes <= hoje) m[e.mes] = (m[e.mes] || 0) + e.valor; });
  return m;
}

// Fluxo de caixa real dos últimos 12 meses, a partir da tabela
// "transacoes" (alimentada pela sincronização do Open Finance).
router.get('/fluxo-caixa', (req, res) => {
  const meses = ultimosNMeses(12);

  const linhas = db
    .prepare(
      `SELECT mes_fin(data) AS chave,
              SUM(CASE WHEN valor > 0 THEN valor ELSE 0 END) AS entradas,
              SUM(CASE WHEN valor < 0 THEN -valor ELSE 0 END) AS saidas
       FROM transacoes
       WHERE usuario_id = ? AND excluido_em IS NULL AND ignorada = 0 AND ${semPagamentoDeFatura()}
       GROUP BY chave`
    )
    .all(req.usuario.id);

  const porChave = Object.fromEntries(linhas.map((l) => [l.chave, l]));
  const cartao = cartaoPorMes(req.usuario.id);
  const cashback = cashbackPorMes(req.usuario.id);
  const fluxoCaixa = meses.map((m) => ({
    mes: m.mes,
    entradas: (porChave[m.chave]?.entradas || 0) + (cashback[m.chave] || 0),
    saidas: (porChave[m.chave]?.saidas || 0) + (cartao[m.chave] || 0),
  }));

  res.json(fluxoCaixa);
});

// Detalhamento por categoria do mês atual — o que mais pesou.
router.get('/detalhamento-categoria', (req, res) => {
  const mesAtual = chaveDaDataFin(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString());
  const linhas = db
    .prepare(
      `SELECT categorias_orcamento.id AS id, categorias_orcamento.nome AS nome, SUM(-transacoes.valor) AS total
       FROM transacoes
       JOIN categorias_orcamento ON categorias_orcamento.id = transacoes.categoria_id AND categorias_orcamento.excluido_em IS NULL
       WHERE transacoes.usuario_id = ? AND transacoes.excluido_em IS NULL AND transacoes.ignorada = 0 AND transacoes.valor < 0
         AND mes_fin(transacoes.data) = ?
         AND ${semPagamentoDeFatura('transacoes.')}
       GROUP BY categorias_orcamento.id
       ORDER BY total DESC`
    )
    .all(req.usuario.id, mesAtual);
  // Compras no cartão do mês, por categoria
  const nomes = Object.fromEntries(db.prepare('SELECT id, nome FROM categorias_orcamento WHERE usuario_id = ? AND excluido_em IS NULL').all(req.usuario.id).map((c) => [c.id, c.nome]));
  const porId = Object.fromEntries(linhas.map((l) => [l.id, l]));
  parcelasCartao(req.usuario.id).forEach((p) => {
    if (p.mes !== mesAtual || !p.categoria_id || !nomes[p.categoria_id]) return;
    (porId[p.categoria_id] ||= (linhas.push({ id: p.categoria_id, nome: nomes[p.categoria_id], total: 0 }), linhas[linhas.length - 1])).total += p.valor;
  });
  linhas.sort((a, b) => b.total - a.total);
  res.json(linhas.map(({ nome, total }) => ({ nome, total })));
});

// Projeção simples do próximo mês = média dos últimos 3 meses com dados.
router.get('/projecao', (req, res) => {
  const linhas = db
    .prepare(
      `SELECT mes_fin(data) AS chave,
              SUM(CASE WHEN valor > 0 THEN valor ELSE 0 END) AS entradas,
              SUM(CASE WHEN valor < 0 THEN -valor ELSE 0 END) AS saidas
       FROM transacoes
       WHERE usuario_id = ? AND excluido_em IS NULL AND ignorada = 0 AND ${semPagamentoDeFatura()}
       GROUP BY chave
       ORDER BY chave DESC`
    )
    .all(req.usuario.id);
  // soma as compras no cartão (meses até o atual) e fica com os 3 últimos meses com dados
  const cartao = cartaoPorMes(req.usuario.id);
  const porMes = Object.fromEntries(linhas.map((l) => [l.chave, l]));
  Object.keys(cartao).forEach((k) => { (porMes[k] ||= { chave: k, entradas: 0, saidas: 0 }).saidas += cartao[k]; });
  const cashback = cashbackPorMes(req.usuario.id);
  Object.keys(cashback).forEach((k) => { (porMes[k] ||= { chave: k, entradas: 0, saidas: 0 }).entradas += cashback[k]; });
  linhas.length = 0;
  Object.values(porMes).sort((a, b) => (a.chave < b.chave ? 1 : -1)).slice(0, 3).forEach((l) => linhas.push(l));

  if (!linhas.length) {
    return res.json({ entradas: 0, saidas: 0, mesesConsiderados: 0 });
  }

  const entradas = linhas.reduce((s, l) => s + l.entradas, 0) / linhas.length;
  const saidas = linhas.reduce((s, l) => s + l.saidas, 0) / linhas.length;
  res.json({ entradas, saidas, mesesConsiderados: linhas.length });
});

// Exportação simples em CSV de todas as transações do usuário.
router.get('/exportar.csv', (req, res) => {
  const transacoes = db
    .prepare('SELECT data, descricao, valor FROM transacoes WHERE usuario_id = ? AND excluido_em IS NULL ORDER BY data DESC')
    .all(req.usuario.id);

  const linhas = ['data,descricao,valor'];
  transacoes.forEach((t) => {
    const descricaoEscapada = `"${t.descricao.replace(/"/g, '""')}"`;
    linhas.push(`${t.data},${descricaoEscapada},${t.valor}`);
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="transacoes.csv"');
  res.send(linhas.join('\n'));
});

module.exports = router;
