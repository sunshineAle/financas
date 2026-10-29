// Patrimônio (anotação 60, itens 3 e 4): cálculo ÚNICO do patrimônio líquido, usado pelo Início (routes/dashboard.js) e pela
// janela de detalhe (GET /api/patrimonio). JS puro: roda no servidor e no navegador (PWA).
//
// Ativos (cada real aparece em UM bloco só):
//   Contas ............. saldos ≥ 0 (contas com saldo negativo vão para Cheque especial, nos passivos)
//   Reserva e metas .... lançamentos com meta + "Guardar" sem ativo da carteira (lançamentos antigos sem meta)
//   Renda fixa ......... ativos da carteira que não são de renda variável (CDB, Tesouro, LCI…), sem meta
//   Renda variável ..... ações, FIIs, Fiagro, ETFs, BDRs, cripto e ouro
//   A soma dos três últimos é exatamente o valor da Reserva/investimentos que o Início sempre usou (reserva_liberdade.valor_atual
//   = soma de historico_aportes). Valor pelo que foi guardado (custo): ainda não há cotação de mercado.
// Passivos: Faturas abertas (com o tipo de crédito do cartão) · Dívidas (não arquivadas) · Cheque especial (|saldo| das contas < 0).
// Compromissos futuros: faturas depois da aberta (parcelas futuras) — linha informativa, FORA do total.
const express = require('express');
const db = require('../db');
const { exigirAutenticacao } = require('../middleware/auth');
const cartoesRouter = require('./cartoes');
const { TIPOS_INVESTIMENTO } = require('../utils/carteira');
const { derivarOrigem, situacaoEfetiva, ROTULO_ORIGEM, ROTULO_SITUACAO } = require('../utils/dividas');

const router = express.Router();

const TIPOS_RENDA_VARIAVEL = ['acoes', 'fii', 'fiagro', 'etf', 'bdr', 'cripto', 'ouro'];
const ROTULO_CREDITO = { '': 'Cartão de crédito', cartao: 'Cartão de crédito', loja: 'Cartão de loja', crediario: 'Crediário' };

const c2 = (n) => Math.round((Number(n) || 0) * 100); // em centavos, para somar sem erro de arredondamento
const r2 = (centavos) => Math.round(centavos) / 100;
const somaCent = (lista) => lista.reduce((s, i) => s + c2(i.valor), 0);

// Tipo/situação da dívida em linguagem simples: situação que pesa (Negativada, Acordo) antes da origem (Crediário, Empréstimo…)
function rotuloDivida(d) {
  const sit = situacaoEfetiva(d);
  if (sit === 'negativada') return 'Negativada';
  if (sit === 'em_acordo') return 'Acordo';
  const origem = derivarOrigem(d);
  if (origem === 'crediario') return 'Crediário';
  if (origem === 'emprestimo') return 'Empréstimo';
  if (sit === 'atrasada') return ROTULO_SITUACAO.atrasada;
  return ROTULO_ORIGEM[origem] || 'Dívida';
}

function bloco(chave, rotulo, itens, rota) {
  const ordenados = itens.filter((i) => c2(i.valor) !== 0).sort((a, b) => b.valor - a.valor);
  return { chave, rotulo, rota, total: r2(somaCent(ordenados)), itens: ordenados };
}

// Patrimônio de um usuário. Devolve totais, blocos, compromissos e `confere` (líquido = jeito antigo do Início, ±1 centavo).
function calcularPatrimonio(usuarioId) {
  // --- Contas ---
  const contas = db
    .prepare('SELECT id, nome, tipo, saldo, icone, cor FROM contas WHERE usuario_id = ? AND excluido_em IS NULL ORDER BY criado_em ASC, rowid ASC')
    .all(usuarioId);
  const contasPositivas = contas.filter((c) => c2(c.saldo) >= 0).map((c) => ({ id: c.id, nome: c.nome, valor: r2(c2(c.saldo)), icone: c.icone || null, cor: c.cor || null, tipo: c.tipo }));
  const chequeEspecial = contas.filter((c) => c2(c.saldo) < 0).map((c) => ({ id: c.id, nome: c.nome, valor: r2(-c2(c.saldo)), icone: c.icone || null, cor: c.cor || null, detalhe: 'Saldo negativo' }));

  // --- Reserva, metas e carteira: cada lançamento (historico_aportes) cai em um bloco só ---
  const reserva = db.prepare('SELECT id, valor_atual FROM reserva_liberdade WHERE usuario_id = ? AND excluido_em IS NULL').get(usuarioId);
  const metas = {};
  const rf = {};
  const rv = {};
  if (reserva) {
    db.prepare('SELECT id, nome, icone FROM metas_reserva WHERE reserva_id = ? AND excluido_em IS NULL').all(reserva.id).forEach((m) => {
      metas[m.id] = { id: m.id, nome: m.nome, icone: m.icone || null, detalhe: 'Meta', valor: 0 };
    });
    const ativos = Object.fromEntries(db.prepare('SELECT id, nome, ticker, tipo FROM ativos WHERE usuario_id = ?').all(usuarioId).map((a) => [a.id, a]));
    const ativoDoAporte = Object.fromEntries(
      db
        .prepare('SELECT aporte_id, ativo_id FROM operacoes WHERE usuario_id = ? AND aporte_id IS NOT NULL AND ativo_id IS NOT NULL AND excluido_em IS NULL')
        .all(usuarioId)
        .map((o) => [o.aporte_id, o.ativo_id])
    );
    const semMeta = { id: 'sem-meta', nome: 'Guardado sem meta', icone: '🐷', detalhe: 'Reserva de Liberdade', valor: 0 };
    db.prepare('SELECT id, valor, tipo, ativo, meta_id FROM historico_aportes WHERE reserva_id = ? AND excluido_em IS NULL').all(reserva.id).forEach((h) => {
      const v = c2(h.valor);
      if (h.meta_id && metas[h.meta_id]) { metas[h.meta_id].valor += v; return; }
      const ativo = ativos[ativoDoAporte[h.id]];
      const tipo = ativo ? ativo.tipo : h.tipo;
      if (TIPOS_RENDA_VARIAVEL.includes(tipo)) {
        const chave = ativo ? ativo.id : `tipo-${tipo}-${h.ativo || ''}`;
        rv[chave] = rv[chave] || { id: chave, nome: ativo ? ativo.ticker || ativo.nome : h.ativo || TIPOS_INVESTIMENTO[tipo] || tipo, detalhe: TIPOS_INVESTIMENTO[tipo] || tipo, tipo, valor: 0 };
        rv[chave].valor += v;
      } else if (ativo) {
        rf[ativo.id] = rf[ativo.id] || { id: ativo.id, nome: ativo.ticker || ativo.nome, detalhe: TIPOS_INVESTIMENTO[ativo.tipo] || ativo.tipo, tipo: ativo.tipo, valor: 0 };
        rf[ativo.id].valor += v;
      } else {
        semMeta.valor += v; // "Guardar" sem meta e sem ativo da carteira (lançamentos antigos)
      }
    });
    if (semMeta.valor) metas[semMeta.id] = semMeta;
  }
  const emReais = (obj) => Object.values(obj).map((i) => ({ ...i, valor: r2(i.valor) }));

  // --- Faturas: a aberta de cada cartão é passivo; as seguintes (parcelas futuras) são compromissos ---
  const cartoes = Object.fromEntries(
    db.prepare('SELECT id, tipo_credito, bandeira, icone FROM cartoes WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId).map((c) => [c.id, c])
  );
  const faturas = cartoesRouter.faturasAPagar(usuarioId);
  const linhaFatura = (f) => {
    const cartao = cartoes[f.cartaoId] || {};
    const tipoCredito = f.tipoCredito !== undefined ? f.tipoCredito : cartao.tipo_credito || '';
    return {
      id: `${f.cartaoId}-${f.chave}`, cartaoId: f.cartaoId, nome: f.cartao, valor: f.total, icone: f.icone || cartao.icone || null,
      bandeira: f.bandeira !== undefined ? f.bandeira : cartao.bandeira || null, fatura: f.chave, vence: f.vence,
      tipoCredito: tipoCredito || '', detalhe: f.tipoCreditoRotulo || ROTULO_CREDITO[tipoCredito || ''] || 'Cartão de crédito',
    };
  };
  const faturasAbertas = faturas.filter((f) => f.aberta).map(linhaFatura);
  const futuras = faturas.filter((f) => !f.aberta).map(linhaFatura).sort((a, b) => String(a.vence).localeCompare(String(b.vence)));

  // --- Dívidas (não arquivadas; mesmo filtro do Início) ---
  const dividas = db
    .prepare('SELECT * FROM dividas WHERE usuario_id = ? AND arquivada = 0 AND excluido_em IS NULL')
    .all(usuarioId)
    .map((d) => ({ id: d.id, nome: d.nome, valor: r2(c2(d.saldo)), detalhe: rotuloDivida(d), credor: d.credor || null }));

  const ativos = [
    bloco('contas', 'Contas', contasPositivas, '/contas'),
    bloco('reserva', 'Reserva e metas', emReais(metas), '/objetivos'),
    bloco('renda_fixa', 'Renda fixa', emReais(rf), '/objetivos?aba=investimentos'),
    bloco('renda_variavel', 'Renda variável', emReais(rv), '/objetivos?aba=investimentos'),
  ];
  const passivos = [
    bloco('faturas', 'Faturas abertas', faturasAbertas, '/cartoes'),
    bloco('dividas', 'Dívidas', dividas, '/dividas'),
    bloco('cheque_especial', 'Cheque especial', chequeEspecial, '/contas'),
  ];
  const totalAtivosC = ativos.reduce((s, b) => s + c2(b.total), 0);
  const totalPassivosC = passivos.reduce((s, b) => s + c2(b.total), 0);
  const liquidoC = totalAtivosC - totalPassivosC;

  // Conferência com o jeito antigo do Início (decisão de 23/10/2026): contas (todas) + Reserva − faturas abertas − dívidas
  const antigoC =
    contas.reduce((s, c) => s + c2(c.saldo), 0) + c2(reserva ? reserva.valor_atual : 0) -
    faturas.filter((f) => f.aberta).reduce((s, f) => s + c2(f.total), 0) - dividas.reduce((s, d) => s + c2(d.valor), 0);

  return {
    patrimonioLiquido: r2(liquidoC),
    totalAtivos: r2(totalAtivosC),
    totalPassivos: r2(totalPassivosC),
    ativos,
    passivos,
    compromissos: { total: r2(somaCent(futuras)), itens: futuras, foraDoTotal: true },
    confere: Math.abs(liquidoC - antigoC) <= 1,
    patrimonioAntigo: r2(antigoC),
    // campos que o Início já usava
    totalContas: r2(contas.reduce((s, c) => s + c2(c.saldo), 0)),
    reservaLiberdade: reserva ? reserva.valor_atual : 0,
    totalFaturasAbertas: r2(faturas.filter((f) => f.aberta).reduce((s, f) => s + c2(f.total), 0)),
    totalDividas: r2(dividas.reduce((s, d) => s + c2(d.valor), 0)),
  };
}

router.get('/', exigirAutenticacao, (req, res) => {
  res.json(calcularPatrimonio(req.usuario.id));
});

router.calcularPatrimonio = calcularPatrimonio;
module.exports = router;
