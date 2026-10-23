const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const dados = require('../dados');
const { exigirAutenticacao } = require('../middleware/auth');

const router = express.Router();

const cookieBase = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.COOKIE_SECURE === 'true',
  path: '/',
};

router.post('/login', async (req, res) => {
  const { email, senha, lembrarDispositivo } = req.body || {};

  if (!email || !senha) {
    return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ? AND excluido_em IS NULL').get(email);

  // Mesma mensagem genérica em ambos os casos, para não revelar se o
  // e-mail existe ou não.
  const credenciaisInvalidas = () =>
    res.status(401).json({ erro: 'E-mail ou senha inválidos.' });

  if (!usuario) return credenciaisInvalidas();

  const senhaConfere = await bcrypt.compare(senha, usuario.senha_hash);
  if (!senhaConfere) return credenciaisInvalidas();

  const expiraEm = lembrarDispositivo
    ? process.env.JWT_EXPIRES_LONGO || '30d'
    : process.env.JWT_EXPIRES_CURTO || '8h';

  const token = jwt.sign(
    { sub: usuario.id, email: usuario.email, nome: usuario.nome, sessaoVersao: usuario.sessao_versao },
    process.env.JWT_SECRET,
    { expiresIn: expiraEm }
  );

  const maxAgeMs = lembrarDispositivo ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;

  res.cookie('sessao', token, { ...cookieBase, maxAge: maxAgeMs });
  res.json({ id: usuario.id, email: usuario.email, nome: usuario.nome });
});

router.post('/logout', (req, res) => {
  res.clearCookie('sessao', cookieBase);
  res.json({ ok: true });
});

router.get('/me', exigirAutenticacao, (req, res) => {
  res.json(req.usuario);
});

// Trocar senha — invalida todas as sessões existentes (inclusive a atual)
// por segurança, subindo a "sessao_versao". O usuário precisa logar de
// novo depois, mesmo no dispositivo em que fez a troca.
router.put('/senha', exigirAutenticacao, async (req, res) => {
  const { senhaAtual, novaSenha } = req.body || {};

  if (!senhaAtual || !novaSenha) {
    return res.status(400).json({ erro: 'Informe a senha atual e a nova senha.' });
  }
  if (novaSenha.length < 8) {
    return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 8 caracteres.' });
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ? AND excluido_em IS NULL').get(req.usuario.id);
  const senhaConfere = await bcrypt.compare(senhaAtual, usuario.senha_hash);
  if (!senhaConfere) {
    return res.status(401).json({ erro: 'Senha atual incorreta.' });
  }

  const novoHash = await bcrypt.hash(novaSenha, 12);
  dados.atualizar('usuarios', usuario.id, { senha_hash: novoHash, sessao_versao: usuario.sessao_versao + 1 });

  res.clearCookie('sessao', cookieBase);
  res.json({ ok: true, mensagem: 'Senha alterada. Faça login novamente.' });
});

// Encerra todas as sessões ativas (todos os dispositivos), inclusive a
// atual — sobe a "sessao_versao" sem exigir a senha de novo, para o caso
// de o usuário achar que esqueceu o celular logado em algum lugar.
router.post('/encerrar-sessoes', exigirAutenticacao, (req, res) => {
  dados.somar('usuarios', req.usuario.id, 'sessao_versao', 1);
  res.clearCookie('sessao', cookieBase);
  res.json({ ok: true });
});

module.exports = router;
