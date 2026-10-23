// Na demonstração a pessoa já entra logada, sem JWT nem cookie.
const estado = globalThis.__SESSAO_DEMO || (globalThis.__SESSAO_DEMO = { logado: true, usuario: null });
function exigirAutenticacao(req, res, next) {
  if (!estado.logado || !estado.usuario) return res.status(401).json({ erro: 'Não autenticado.' });
  req.usuario = estado.usuario;
  next();
}
module.exports = { exigirAutenticacao };
