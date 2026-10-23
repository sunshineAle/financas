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
  const { notificarCategoriaEstourada, notificarFaturaProxima } = req.body || {};

  res.json(
    dados.atualizar('configuracoes', config.id, {
      notificar_categoria_estourada: notificarCategoriaEstourada ? 1 : 0,
      notificar_fatura_proxima: notificarFaturaProxima ? 1 : 0,
    })
  );
});

// Backup completo em um único JSON (o mesmo formato do /api/backup/exportar, que o app guarda
// dentro do arquivo .sfin). Não inclui senha nem tokens do Open Finance (esses nunca saem do servidor).
router.get('/backup.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="backup-financeiro.json"');
  res.send(JSON.stringify(exportarEstado(), null, 2));
});

module.exports = router;
