const db = require('../db');
const dados = require('../dados');

// Categorias de receita padrão, criadas uma única vez para cada usuário.
// Depois disso o usuário pode criar, renomear e remover à vontade.
const PADRAO = [
  ['Salário', 'cat-entrada-salario'], ['Renda extra / freela', 'cat-entrada-freelance'], ['Benefício', 'cat-entrada-pensao-beneficio'], ['Rendimentos', 'cat-entrada-rendimentos'],
  ['Reembolso', 'cat-entrada-reembolso'], ['Presente', 'cat-entrada-presente'], ['Resgates e saques', 'cat-entrada-resgate'], ['Outras entradas', 'cat-entrada-geral'],
];
// Anotação 38: dinheiro de FORA do app (FGTS, PIS/PASEP, previdência, consórcio, investimento antigo não cadastrado).
const NOME_RESGATES = 'Resgates e saques';
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

// Categorias de despesa padrão (anotação 37): uma por seção do set de ícones, cada uma com o ícone de CATEGORIA da seção.
// Nome único "Casa" (não "Moradia"/"Residência") em filtros, lista e seletor. Criadas só para quem nunca teve categoria de despesa.
const PADRAO_DESPESA = [
  ['Casa', 'cat-grupo-casa'], ['Alimentação', 'cat-grupo-alimentacao'], ['Transporte', 'cat-grupo-transporte'], ['Saúde', 'cat-grupo-saude'],
  ['Contas e serviços', 'cat-grupo-contas-servicos'], ['Compras', 'cat-grupo-compras'], ['Educação', 'cat-grupo-educacao'], ['Pessoal', 'cat-grupo-pessoal'],
  ['Lazer', 'cat-grupo-lazer'], ['Família e pets', 'cat-grupo-familia-pets'], ['Finanças', 'cat-grupo-financas'],
];
function garantirPadraoDespesa(usuarioId) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM categorias_orcamento WHERE usuario_id = ? AND LOWER(nome) <> LOWER(?)').get(usuarioId, NOME_GERAL).n;
  if (n > 0) return;
  dados.transacao(() => { PADRAO_DESPESA.forEach(([nome, icone]) => dados.inserir('categorias_orcamento', { usuario_id: usuarioId, nome, teto_mensal: 0, icone })); });
}

// Garante a categoria de despesa "Geral" do usuário e devolve o registro.
function garantirGeralDespesa(usuarioId) {
  let g = db.prepare('SELECT * FROM categorias_orcamento WHERE usuario_id = ? AND LOWER(nome) = LOWER(?) AND excluido_em IS NULL').get(usuarioId, NOME_GERAL);
  if (!g) g = dados.inserir('categorias_orcamento', { usuario_id: usuarioId, nome: NOME_GERAL, teto_mensal: 0, icone: 'cat-saida-geral' });
  return g;
}
const ehGeral = (nome) => String(nome || '').trim().toLowerCase() === NOME_GERAL.toLowerCase();

const nomesCategoriasReceita = (usuarioId) => listarCategoriasReceita(usuarioId).map((c) => c.nome);
// Garante uma categoria de entrada pelo nome (cria com o ícone dado se não existir) e devolve o nome gravado.
function garantirCategoriaReceita(usuarioId, nome, icone) {
  listarCategoriasReceita(usuarioId);
  const c = db.prepare('SELECT * FROM categorias_receita WHERE usuario_id = ? AND LOWER(nome) = LOWER(?) AND excluido_em IS NULL').get(usuarioId, nome);
  if (c) return c.nome;
  dados.inserir('categorias_receita', { usuario_id: usuarioId, nome, icone });
  return nome;
}

module.exports = { garantirPadraoDespesa, PADRAO_DESPESA, listarCategoriasReceita, nomesCategoriasReceita, garantirGeralDespesa, ehGeral, NOME_GERAL, NOME_RESGATES, garantirCategoriaReceita };
