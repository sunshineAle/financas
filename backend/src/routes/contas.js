const express = require('express');
const db = require('../db');
const dados = require('../dados');
const { exigirAutenticacao } = require('../middleware/auth');

const router = express.Router();
router.use(exigirAutenticacao);

const { lerIcone } = require('../utils/icone');
const { definirSaldoInicial, ajustarSaldo } = require('../utils/saldoInicial');

const hojeStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: process.env.APP_TIMEZONE || 'America/Sao_Paulo' });
// Anotação 55: { saldoInicial: { data, valor } } (novo) ou `saldo` (legado = saldo de hoje). Devolve null se não veio nada.
function lerSaldoInicial(corpo) {
  if (corpo.saldoInicial && typeof corpo.saldoInicial === 'object') {
    return { data: corpo.saldoInicial.data || hojeStr(), valor: Number(corpo.saldoInicial.valor) || 0 };
  }
  return null;
}
function responderErro(res, e) {
  if (e && e.status) return res.status(e.status).json({ erro: e.message });
  throw e;
}

const TIPOS_VALIDOS = ['corrente', 'poupanca', 'dinheiro', 'beneficio', 'corretora', 'outra'];

router.get('/', (req, res) => {
  const contas = db
    .prepare(
      `SELECT contas.*, conexoes_pluggy.ultima_sincronizacao, conexoes_pluggy.status AS status_conexao,
         (SELECT MAX(data) FROM transacoes WHERE conta_id = contas.id AND excluido_em IS NULL) AS ultima_transacao,
         (SELECT COALESCE(SUM(valor), 0) FROM transacoes WHERE conta_id = contas.id AND valor > 0 AND excluido_em IS NULL
            AND ignorada = 0 AND mes_fin(data) = mes_fin(date('now', 'localtime'))) AS entradas_mes,
         (SELECT COALESCE(-SUM(valor), 0) FROM transacoes WHERE conta_id = contas.id AND valor < 0 AND excluido_em IS NULL
            AND ignorada = 0 AND mes_fin(data) = mes_fin(date('now', 'localtime'))) AS saidas_mes,
         (SELECT valor FROM transacoes WHERE conta_id = contas.id AND tipo_mov = 'saldo_inicial' AND excluido_em IS NULL ORDER BY rowid DESC LIMIT 1) AS saldo_inicial_valor,
         (SELECT substr(data, 1, 10) FROM transacoes WHERE conta_id = contas.id AND tipo_mov = 'saldo_inicial' AND excluido_em IS NULL ORDER BY rowid DESC LIMIT 1) AS saldo_inicial_data
       FROM contas
       LEFT JOIN conexoes_pluggy ON conexoes_pluggy.id = contas.conexao_id AND conexoes_pluggy.excluido_em IS NULL
       WHERE contas.usuario_id = ? AND contas.excluido_em IS NULL
       ORDER BY contas.criado_em DESC, contas.rowid DESC`
    )
    .all(req.usuario.id);
  res.json(contas);
});

router.post('/', (req, res) => {
  const { nome, tipo, saldo, cor, icone } = req.body || {};

  if (!nome || !nome.trim()) {
    return res.status(400).json({ erro: 'Informe um nome para a conta.' });
  }
  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ erro: 'Tipo de conta inválido.' });
  }

  // Anotação 55: o saldo informado no cadastro vira o lançamento "Saldo inicial" (fora das entradas), não um número solto.
  const inicial = lerSaldoInicial(req.body || {}) || (Number(saldo) ? { data: hojeStr(), valor: Number(saldo) } : null);
  let conta;
  try {
    dados.transacao(() => {
      conta = dados.inserir('contas', {
        usuario_id: req.usuario.id, nome: nome.trim(), tipo: tipo || 'corrente', origem: 'manual',
        saldo: 0, cor: cor || null, icone: lerIcone(icone),
      });
      if (inicial && inicial.valor) definirSaldoInicial(req.usuario.id, conta, inicial);
    });
  } catch (e) { return responderErro(res, e); }
  res.status(201).json(dados.buscar('contas', conta.id));
});

router.put('/:id', (req, res) => {
  const conta = db
    .prepare('SELECT * FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(req.params.id, req.usuario.id);

  if (!conta) {
    return res.status(404).json({ erro: 'Conta não encontrada.' });
  }
  if (conta.origem !== 'manual') {
    return res.status(400).json({ erro: 'Contas conectadas não podem ser editadas manualmente.' });
  }

  const { nome, tipo, saldo, cor, icone } = req.body || {};
  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ erro: 'Tipo de conta inválido.' });
  }

  const inicial = lerSaldoInicial(req.body || {});
  try {
    dados.transacao(() => {
      dados.atualizar('contas', conta.id, {
        nome: (nome ?? conta.nome).trim(),
        tipo: tipo || conta.tipo,
        // `saldo` solto (legado) só vale quando não veio o saldo inicial; o caminho certo é saldoInicial ou Ajustar saldo.
        saldo: saldo === undefined || inicial ? conta.saldo : Number(saldo),
        cor: cor === undefined ? conta.cor : cor,
        icone: icone === undefined ? conta.icone : lerIcone(icone),
      });
      if (inicial) definirSaldoInicial(req.usuario.id, dados.buscar('contas', conta.id), inicial);
    });
  } catch (e) { return responderErro(res, e); }
  res.json(dados.buscar('contas', conta.id));
});

// Anotação 55 — "Ajustar saldo" (conciliação): { saldo } = saldo real de hoje. Lança a diferença como "Ajuste de saldo",
// fora das entradas/saídas. Responde { conta, diferenca, desde, faltando } (faltando = diferença > R$ 50).
router.post('/:id/ajustar-saldo', (req, res) => {
  const conta = db
    .prepare('SELECT * FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(req.params.id, req.usuario.id);
  if (!conta) return res.status(404).json({ erro: 'Conta não encontrada.' });
  try {
    const r = ajustarSaldo(req.usuario.id, conta, (req.body || {}).saldo);
    res.status(r.ajuste ? 201 : 200).json({ ...r, conta: dados.buscar('contas', conta.id) });
  } catch (e) { return responderErro(res, e); }
});

router.delete('/:id', (req, res) => {
  const conta = db
    .prepare('SELECT * FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(req.params.id, req.usuario.id);

  if (!conta) {
    return res.status(404).json({ erro: 'Conta não encontrada.' });
  }

  dados.excluir('contas', conta.id);
  res.json({ ok: true });
});

module.exports = router;
