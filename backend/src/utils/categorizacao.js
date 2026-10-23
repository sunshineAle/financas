// Auto-categorização: 1) REGRAS do usuário (nome + valor + conta, ver utils/regras.js) quando o contexto vem;
// 2) palavra-chave: casa a descrição da transação contra o nome de cada categoria já cadastrada pelo usuário.
// É deliberadamente simples — sem NLP, sem lista de sinônimos embutida.
//   categorizarTransacao(descricao, categorias, { usuarioId, valor, contaId })  (o 3º argumento é opcional)
function categorizarTransacao(descricao, categorias, ctx = null) {
  if (ctx && ctx.usuarioId) {
    const regras = require('./regras');
    const r = regras.acharRegra(ctx.usuarioId, 'saida', { descricao, valor: ctx.valor, contaId: ctx.contaId });
    if (r && r.categoria_id && categorias.some((c) => c.id === r.categoria_id)) { regras.registrarUso(r); return r.categoria_id; }
  }
  const descricaoNormalizada = normalizar(descricao);

  const categoriaEncontrada = categorias.find((categoria) =>
    descricaoNormalizada.includes(normalizar(categoria.nome))
  );

  return categoriaEncontrada ? categoriaEncontrada.id : null;
}

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // remove acentos para casar "Alimentação" com "alimentacao"
}

module.exports = { categorizarTransacao };
