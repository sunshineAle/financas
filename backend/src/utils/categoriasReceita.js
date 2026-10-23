const db = require('../db');
const dados = require('../dados');

// Categorias de receita padrão, criadas uma única vez para cada usuário.
// Depois disso o usuário pode criar, renomear e remover à vontade.
const PADRAO = [
  ['Salário', 'cat-entrada-salario'], ['Renda extra / freela', 'cat-entrada-freelance'], ['Benefício', 'cat-entrada-pensao-beneficio'], ['Rendimentos', 'cat-entrada-rendimentos'],
  ['Reembolso', 'cat-entrada-reembolso'], ['Presente', 'cat-entrada-presente'], ['Outras entradas', 'cat-entrada-geral'],
];
const NOME_GERAL = 'Geral'; // categoria padrão (não some: serve de destino quando nada casa)

function listarCategoriasReceita(usuarioId) {
  const jaIniciou = db.prepare('SELECT 1 FROM categorias_receita_init WHERE usuario_id = ? AND excluido_em IS NULL').get(usuarioId);
  if (!jaIniciou) {
    dados.transacao(() => {
      PADRAO.forEach(([nome, icone]) => dados.inserir('categorias_receita', { usuario_id: usuarioId, nome, icone }));
      dados.inserir('categorias_receita_init', { usuario_id: usuarioId });
    });
  }
  if (!db.prepare('SELECT 1 FROM categorias_receita WHERE usuario_id = ? AND LOWER(nome) = LOWER(?) AND excluido_em IS NULL').get(usuarioId, NOME_GERAL)) {
    dados.inserir('categorias_receita', { usuario_id: usuarioId, nome: NOME_GERAL, icone: 'cat-entrada-geral' });
  }
  return db.prepare('SELECT * FROM categorias_receita WHERE usuario_id = ? AND excluido_em IS NULL ORDER BY rowid ASC').all(usuarioId);
}

// Garante a categoria de despesa "Geral" do usuário e devolve o registro.
function garantirGeralDespesa(usuarioId) {
  let g = db.prepare('SELECT * FROM categorias_orcamento WHERE usuario_id = ? AND LOWER(nome) = LOWER(?) AND excluido_em IS NULL').get(usuarioId, NOME_GERAL);
  if (!g) g = dados.inserir('categorias_orcamento', { usuario_id: usuarioId, nome: NOME_GERAL, teto_mensal: 0, icone: 'cat-saida-geral' });
  return g;
}
const ehGeral = (nome) => String(nome || '').trim().toLowerCase() === NOME_GERAL.toLowerCase();

const nomesCategoriasReceita = (usuarioId) => listarCategoriasReceita(usuarioId).map((c) => c.nome);

module.exports = { listarCategoriasReceita, nomesCategoriasReceita, garantirGeralDespesa, ehGeral, NOME_GERAL };
