// Open Finance via Pluggy (conector gratuito MeuPluggy, uso pessoal).
// Fluxo: o navegador pede um token temporário -> abre o widget da Pluggy ->
// ao conectar, envia o itemId -> o servidor sincroniza contas, cartões,
// extrato e investimentos. As chaves nunca saem do servidor.
const express = require('express');
const db = require('../db');
const dados = require('../dados');
const { exigirAutenticacao } = require('../middleware/auth');
const pluggy = require('../utils/pluggy');
const { sincronizarConexao, registrarConexao } = require('../utils/sincronizacaoPluggy');

const router = express.Router();
router.use(exigirAutenticacao);

function listarConexoes(usuarioId) {
  return db.prepare(
    `SELECT c.id, c.banco, c.status, c.ultima_sincronizacao, c.ultimo_erro, c.criado_em,
       (SELECT COUNT(*) FROM contas WHERE conexao_id = c.id AND excluido_em IS NULL) AS contas,
       (SELECT COUNT(*) FROM cartoes WHERE conexao_id = c.id AND excluido_em IS NULL) AS cartoes
     FROM conexoes_pluggy c WHERE c.usuario_id = ? AND c.excluido_em IS NULL AND c.status != 'removida' ORDER BY c.criado_em, c.rowid`
  ).all(usuarioId);
}

router.get('/status', (req, res) => {
  const investimentos = db.prepare(
    'SELECT id, nome, tipo, saldo, conexao_id FROM investimentos_conectados WHERE usuario_id = ? AND excluido_em IS NULL ORDER BY saldo DESC'
  ).all(req.usuario.id);
  res.json({
    configurado: pluggy.configurado(),
    conexoes: listarConexoes(req.usuario.id),
    limiteConexoesGratuito: 5,
    investimentos: { total: investimentos.reduce((s, i) => s + i.saldo, 0), itens: investimentos },
  });
});

router.post('/connect-token', async (req, res) => {
  try {
    res.json({ connectToken: await pluggy.criarConnectToken(), incluirSandbox: process.env.PLUGGY_SANDBOX === 'true' });
  } catch (e) {
    res.status(502).json({ erro: e.message });
  }
});

// Chamado depois que o widget conecta um banco
router.post('/conexoes', async (req, res) => {
  try {
    const conexao = registrarConexao(req.usuario.id, req.body?.itemId);
    const resumo = await sincronizarConexao(conexao.id);
    res.status(201).json({ conexao: listarConexoes(req.usuario.id).find((c) => c.id === conexao.id), resumo });
  } catch (e) {
    res.status(502).json({ erro: e.message });
  }
});

async function sincronizarDoUsuario(usuarioId, so) {
  const conexoes = db.prepare("SELECT id, banco FROM conexoes_pluggy WHERE usuario_id = ? AND excluido_em IS NULL AND status = 'ativa'").all(usuarioId)
    .filter((c) => !so || c.id === so);
  const total = { contas: 0, cartoes: 0, transacoesNovas: 0, lancamentosNovos: 0, investimentos: 0, avisos: [] };
  for (const c of conexoes) {
    try {
      const r = await sincronizarConexao(c.id);
      for (const k of ['contas', 'cartoes', 'transacoesNovas', 'lancamentosNovos', 'investimentos']) total[k] += r[k];
      total.avisos.push(...r.avisos);
    } catch (e) {
      total.avisos.push(`${c.banco || 'Banco'}: ${e.message}`);
    }
  }
  return total;
}

router.post('/sincronizar', async (req, res) => {
  res.json({ resumo: await sincronizarDoUsuario(req.usuario.id), conexoes: listarConexoes(req.usuario.id) });
});

router.post('/sincronizar/:conexaoId', async (req, res) => {
  const id = String(req.params.conexaoId);
  const c = db.prepare('SELECT id FROM conexoes_pluggy WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(id, req.usuario.id);
  if (!c) return res.status(404).json({ erro: 'Conexão não encontrada.' });
  res.json({ resumo: await sincronizarDoUsuario(req.usuario.id, id), conexoes: listarConexoes(req.usuario.id) });
});

// Desconectar: o histórico fica; contas e cartões voltam a ser manuais
router.delete('/conexoes/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM conexoes_pluggy WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(req.params.id), req.usuario.id);
  if (!c) return res.status(404).json({ erro: 'Conexão não encontrada.' });
  dados.transacao(() => {
    dados.atualizarOnde('contas', 'conexao_id = ?', [c.id], { origem: 'manual', conexao_id: null });
    dados.atualizarOnde('cartoes', 'conexao_id = ?', [c.id], { origem: 'manual', conexao_id: null });
    dados.excluirOnde('investimentos_conectados', 'conexao_id = ?', [c.id]);
    dados.atualizar('conexoes_pluggy', c.id, { status: 'removida' });
  });
  res.json({ ok: true });
});

module.exports = router;
module.exports.sincronizarDoUsuario = sincronizarDoUsuario;
