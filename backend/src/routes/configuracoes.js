const express = require('express');
const db = require('../db');
const dados = require('../dados');
const { exportarEstado } = require('../dados/exportacao');
const { exigirAutenticacao } = require('../middleware/auth');

const router = express.Router();
router.use(exigirAutenticacao);

function buscarOuCriarConfiguracoes(usuarioId) {
  let config = db.prepare('SELECT * FROM configuracoes WHERE usuario_id = ? AND excluido_em IS NULL').get(usuarioId);
  if (!config) config = dados.inserir('configuracoes', { usuario_id: usuarioId });
  return config;
}

router.get('/', (req, res) => {
  res.json(buscarOuCriarConfiguracoes(req.usuario.id));
});

router.put('/', (req, res) => {
  const config = buscarOuCriarConfiguracoes(req.usuario.id);
  const { notificarCategoriaEstourada, notificarFaturaProxima, inicioMes } = req.body || {};
  // Só grava o que veio (antes, faltar um campo zerava o outro).
  const mud = {};
  if (notificarCategoriaEstourada !== undefined) mud.notificar_categoria_estourada = notificarCategoriaEstourada ? 1 : 0;
  if (notificarFaturaProxima !== undefined) mud.notificar_fatura_proxima = notificarFaturaProxima ? 1 : 0;
  if (inicioMes !== undefined) {
    const c = inicioMes || {};
    const ok = (c.tipo === 'util' && Number(c.n) >= 1 && Number(c.n) <= 10)
      || (c.tipo === 'dia' && (c.dia === 'ultimo' || (Number.isInteger(Number(c.dia)) && Number(c.dia) >= 1 && Number(c.dia) <= 28)));
    if (!ok) return res.status(400).json({ erro: 'Início do mês inválido.' });
    mud.inicio_mes = JSON.stringify(c.tipo === 'util' ? { tipo: 'util', n: Number(c.n) } : { tipo: 'dia', dia: c.dia === 'ultimo' ? 'ultimo' : Number(c.dia) });
  }
  res.json(Object.keys(mud).length ? dados.atualizar('configuracoes', config.id, mud) : config);
});

// Backup completo em um único JSON (o mesmo formato do /api/backup/exportar, que o app guarda
// dentro do arquivo .sfin). Não inclui senha nem tokens do Open Finance (esses nunca saem do servidor).
router.get('/backup.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="backup-financeiro.json"');
  res.send(JSON.stringify(exportarEstado(), null, 2));
});

module.exports = router;
