const express = require('express');
const db = require('../db');
const dados = require('../dados');
const { exigirAutenticacao } = require('../middleware/auth');

const router = express.Router();
router.use(exigirAutenticacao);

const { lerIcone } = require('../utils/icone');

const TIPOS_VALIDOS = ['corrente', 'poupanca', 'dinheiro', 'beneficio', 'corretora', 'outra'];

router.get('/', (req, res) => {
  const contas = db
    .prepare(
      `SELECT contas.*, conexoes_pluggy.ultima_sincronizacao, conexoes_pluggy.status AS status_conexao,
         (SELECT MAX(data) FROM transacoes WHERE conta_id = contas.id AND excluido_em IS NULL) AS ultima_transacao,
         (SELECT COALESCE(SUM(valor), 0) FROM transacoes WHERE conta_id = contas.id AND valor > 0 AND excluido_em IS NULL
            AND ignorada = 0 AND mes_fin(data) = mes_fin(date('now', 'localtime'))) AS entradas_mes,
         (SELECT COALESCE(-SUM(valor), 0) FROM transacoes WHERE conta_id = contas.id AND valor < 0 AND excluido_em IS NULL
            AND ignorada = 0 AND mes_fin(data) = mes_fin(date('now', 'localtime'))) AS saidas_mes
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

  const conta = dados.inserir('contas', {
    usuario_id: req.usuario.id, nome: nome.trim(), tipo: tipo || 'corrente', origem: 'manual',
    saldo: Number(saldo) || 0, cor: cor || null, icone: lerIcone(icone),
  });
  res.status(201).json(conta);
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

  const atualizada = dados.atualizar('contas', conta.id, {
    nome: (nome ?? conta.nome).trim(),
    tipo: tipo || conta.tipo,
    saldo: saldo === undefined ? conta.saldo : Number(saldo),
    cor: cor === undefined ? conta.cor : cor,
    icone: icone === undefined ? conta.icone : lerIcone(icone),
  });
  res.json(atualizada);
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
