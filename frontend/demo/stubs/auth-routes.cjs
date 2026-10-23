const express = require('express');
const { exigirAutenticacao } = require('./auth-middleware.cjs');
const router = express.Router();
const sessao = () => globalThis.__SESSAO_DEMO;

router.post('/login', (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  sessao().logado = true; // na demonstração qualquer e-mail e senha entram
  res.json(sessao().usuario);
});
router.post('/logout', (req, res) => { sessao().logado = false; res.json({ ok: true }); });
router.get('/me', exigirAutenticacao, (req, res) => res.json(req.usuario));
router.put('/senha', exigirAutenticacao, (req, res) => res.json({ ok: true, mensagem: 'Demonstração: a senha não foi alterada.' }));
router.post('/encerrar-sessoes', exigirAutenticacao, (req, res) => { sessao().logado = false; res.json({ ok: true }); });
module.exports = router;
