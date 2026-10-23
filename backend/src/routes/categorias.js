const express = require('express');
const db = require('../db');
const dados = require('../dados');
const { exigirAutenticacao } = require('../middleware/auth');
const { lerIcone } = require('../utils/icone');
const { lerCor } = require('../utils/cor');

const router = express.Router();
router.use(exigirAutenticacao);

// ---- Categorias de receita (entradas) ----
const { listarCategoriasReceita, garantirGeralDespesa, ehGeral } = require('../utils/categoriasReceita');

router.get('/receitas', (req, res) => res.json(listarCategoriasReceita(req.usuario.id)));

router.post('/receitas', (req, res) => {
  const nome = String(req.body?.nome || '').trim().slice(0, 60);
  if (!nome) return res.status(400).json({ erro: 'Informe um nome para a categoria.' });
  const existentes = listarCategoriasReceita(req.usuario.id);
  if (existentes.some((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
    return res.status(400).json({ erro: 'Já existe uma categoria de receita com esse nome.' });
  }
  res.status(201).json(dados.inserir('categorias_receita', { usuario_id: req.usuario.id, nome, icone: lerIcone(req.body?.icone), cor: lerCor(req.body?.cor) }));
});

router.put('/receitas/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM categorias_receita WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(req.params.id, req.usuario.id);
  if (!cat) return res.status(404).json({ erro: 'Categoria não encontrada.' });
  const nome = req.body?.nome === undefined ? cat.nome : String(req.body.nome).trim().slice(0, 60);
  if (!nome) return res.status(400).json({ erro: 'Informe um nome para a categoria.' });
  if (ehGeral(cat.nome) && !ehGeral(nome)) return res.status(400).json({ erro: 'A categoria padrão "Geral" não pode ser renomeada.' });
  const outra = db.prepare('SELECT id FROM categorias_receita WHERE usuario_id = ? AND id <> ? AND LOWER(nome) = LOWER(?) AND excluido_em IS NULL').get(req.usuario.id, cat.id, nome);
  if (outra) return res.status(400).json({ erro: 'Já existe uma categoria de receita com esse nome.' });
  const nova = dados.transacao(() => {
    const atualizada = dados.atualizar('categorias_receita', cat.id, { nome, icone: req.body?.icone === undefined ? cat.icone : lerIcone(req.body.icone), cor: req.body?.cor === undefined ? cat.cor : lerCor(req.body.cor) });
    // As entradas já lançadas acompanham o novo nome
    if (nome !== cat.nome) dados.atualizarOnde('transacoes', 'usuario_id = ? AND categoria_receita = ?', [req.usuario.id, cat.nome], { categoria_receita: nome });
    return atualizada;
  });
  res.json(nova);
});

router.delete('/receitas/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM categorias_receita WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(req.params.id, req.usuario.id);
  if (!cat) return res.status(404).json({ erro: 'Categoria não encontrada.' });
  if (ehGeral(cat.nome)) return res.status(400).json({ erro: 'A categoria padrão "Geral" não pode ser removida.' });
  // As entradas dessa categoria ficam como "Sem categoria"
  dados.transacao(() => {
    dados.atualizarOnde('transacoes', 'usuario_id = ? AND categoria_receita = ?', [req.usuario.id, cat.nome], { categoria_receita: null });
    dados.excluir('categorias_receita', cat.id);
  });
  res.json({ ok: true });
});

router.get('/', (req, res) => {
  garantirGeralDespesa(req.usuario.id);
  const categorias = db
    .prepare('SELECT * FROM categorias_orcamento WHERE usuario_id = ? AND excluido_em IS NULL ORDER BY criado_em ASC, rowid ASC')
    .all(req.usuario.id);
  res.json(categorias);
});

router.post('/', (req, res) => {
  const { nome, tetoMensal, icone, cor } = req.body || {};

  if (!nome || !nome.trim()) {
    return res.status(400).json({ erro: 'Informe um nome para a categoria.' });
  }
  // O teto é opcional: vazio ou 0 significa "sem teto".
  const teto = tetoMensal === undefined || tetoMensal === null || tetoMensal === '' ? 0 : Number(tetoMensal);
  if (!Number.isFinite(teto) || teto < 0) {
    return res.status(400).json({ erro: 'O teto mensal não pode ser negativo.' });
  }

  if (db.prepare('SELECT 1 FROM categorias_orcamento WHERE usuario_id = ? AND LOWER(nome) = LOWER(?) AND excluido_em IS NULL').get(req.usuario.id, nome.trim())) {
    return res.status(400).json({ erro: 'Já existe uma categoria com esse nome.' });
  }
  const categoria = dados.inserir('categorias_orcamento', {
    usuario_id: req.usuario.id, nome: nome.trim(), teto_mensal: teto, icone: lerIcone(icone), cor: lerCor(cor),
  });
  res.status(201).json(categoria);
});

router.put('/:id', (req, res) => {
  const categoria = db
    .prepare('SELECT * FROM categorias_orcamento WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(req.params.id, req.usuario.id);
  if (!categoria) return res.status(404).json({ erro: 'Categoria não encontrada.' });

  const { nome, tetoMensal, icone, cor } = req.body || {};
  if (ehGeral(categoria.nome) && nome !== undefined && !ehGeral(nome)) return res.status(400).json({ erro: 'A categoria padrão "Geral" não pode ser renomeada.' });
  if (tetoMensal !== undefined && tetoMensal !== null && tetoMensal !== '' && (!Number.isFinite(Number(tetoMensal)) || Number(tetoMensal) < 0)) {
    return res.status(400).json({ erro: 'O teto mensal não pode ser negativo.' });
  }
  res.json(
    dados.atualizar('categorias_orcamento', categoria.id, {
      nome: (nome ?? categoria.nome).trim(),
      teto_mensal: tetoMensal === undefined ? categoria.teto_mensal : Number(tetoMensal || 0),
      icone: icone === undefined ? categoria.icone : lerIcone(icone),
      cor: cor === undefined ? categoria.cor : lerCor(cor),
    })
  );
});

router.delete('/:id', (req, res) => {
  const categoria = db
    .prepare('SELECT * FROM categorias_orcamento WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(req.params.id, req.usuario.id);
  if (!categoria) return res.status(404).json({ erro: 'Categoria não encontrada.' });
  if (ehGeral(categoria.nome)) return res.status(400).json({ erro: 'A categoria padrão "Geral" não pode ser removida.' });

  dados.excluir('categorias_orcamento', categoria.id);
  res.json({ ok: true });
});

// Registrar gasto manualmente — substitui, por enquanto, a auto-categorização
// de transações reais que o roteiro prevê a partir da Etapa 6.
router.post('/:id/gastos', (req, res) => {
  const categoria = db
    .prepare('SELECT * FROM categorias_orcamento WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(req.params.id, req.usuario.id);
  if (!categoria) return res.status(404).json({ erro: 'Categoria não encontrada.' });

  const valor = Number(req.body?.valor);
  if (!valor || valor <= 0) {
    return res.status(400).json({ erro: 'Informe um valor de gasto maior que zero.' });
  }

  res.json(dados.somar('categorias_orcamento', categoria.id, 'gasto_atual', valor));
});

module.exports = router;
