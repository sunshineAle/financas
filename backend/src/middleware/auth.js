const jwt = require('jsonwebtoken');
const db = require('../db');

function exigirAutenticacao(req, res, next) {
  const token = req.cookies?.sessao;

  if (!token) {
    return res.status(401).json({ erro: 'Não autenticado.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Confere a "versao_sessao": se o usuário trocou a senha ou pediu para
    // encerrar todas as sessões desde que este token foi emitido, o número
    // no banco já subiu e este token some — mesmo sem estar expirado.
    const usuario = db
      .prepare('SELECT sessao_versao FROM usuarios WHERE id = ? AND excluido_em IS NULL')
      .get(payload.sub);
    if (!usuario || usuario.sessao_versao !== payload.sessaoVersao) {
      return res.status(401).json({ erro: 'Sessão encerrada. Faça login novamente.' });
    }

    req.usuario = { id: payload.sub, email: payload.email, nome: payload.nome };
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  }
}

module.exports = { exigirAutenticacao };
