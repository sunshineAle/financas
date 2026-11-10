// Auto-categorização: 1) REGRAS do usuário (nome + valor + conta, ver utils/regras.js) quando o contexto vem;
// 2) palavra-chave: casa a descrição da transação contra o nome de cada categoria já cadastrada pelo usuário.
// É deliberadamente simples — sem NLP, sem lista de sinônimos embutida.
//   categorizarTransacao(descricao, categorias, { usuarioId, valor, contaId })  (o 3º argumento é opcional)
function categorizarDetalhado(descricao, categorias, ctx = null) {
  if (ctx && ctx.usuarioId) {
    const regras = require('./regras');
    const r = regras.acharRegra(ctx.usuarioId, 'saida', { descricao, valor: ctx.valor, contaId: ctx.contaId });
    if (r && r.categoria_id && categorias.some((c) => c.id === r.categoria_id)) {
      regras.registrarUso(r);
      const prova = regras.provenienciaRegra(r);
      const snapshot = JSON.parse(prova.regra_snapshot);
      return { categoriaId: r.categoria_id, origem: 'regra', regraId: r.id, regraSnapshot: prova.regra_snapshot, aplicadaEm: snapshot.aplicadaEm };
    }
  }
  const descricaoNormalizada = normalizar(descricao);
  const categoriaEncontrada = categorias.find(categoria => descricaoNormalizada.includes(normalizar(categoria.nome)));
  return { categoriaId: categoriaEncontrada?.id || null, origem: categoriaEncontrada ? 'palavra_chave' : 'padrao', regraId: null, regraSnapshot: null, aplicadaEm: new Date().toISOString() };
}

// Compatibilidade dos chamadores antigos: uma única avaliação/contagem da regra.
function categorizarTransacao(descricao, categorias, ctx = null) {
  return categorizarDetalhado(descricao, categorias, ctx).categoriaId;
}

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // remove acentos para casar "Alimentação" com "alimentacao"
}

// A procedência só é gravada junto da classificação efetivamente escolhida pelo chamador.
function dadosDaClassificacao(resultado) {
  return {
    classificacao_origem: resultado.origem,
    regra_id: resultado.regraId || null,
    regra_snapshot: resultado.regraSnapshot || null,
  };
}
const classificacaoManual = () => ({ classificacao_origem: 'manual', regra_id: null, regra_snapshot: null });
module.exports = { categorizarTransacao, categorizarDetalhado, dadosDaClassificacao, classificacaoManual };
