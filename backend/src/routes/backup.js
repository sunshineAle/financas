// Rotas de backup (contrato em CONTRATO-SFIN.md). O arquivo .sfin (compressão/criptografia) é feito no frontend.
const express = require('express');
const { exigirAutenticacao } = require('../middleware/auth');
const { exportarEstado, importarEstado, resumoEstado, ErroImportacao } = require('../dados/exportacao');

const router = express.Router();
router.use(exigirAutenticacao);

router.get('/exportar', (req, res) => res.json(exportarEstado()));

router.get('/resumo', (req, res) => res.json(resumoEstado()));

router.post('/importar', (req, res) => {
  const { modo, dados, simular } = req.body || {};
  try {
    res.json(importarEstado(dados, { modo, simular: !!simular, usuarioId: req.usuario.id }));
  } catch (e) {
    if (e instanceof ErroImportacao) return res.status(400).json({ erro: e.message });
    console.error(e);
    res.status(500).json({ erro: 'Não foi possível importar o backup: ' + (e.message || e) + '. Nada foi alterado.' });
  }
});

module.exports = router;
