// Custos fixos mensais (aluguel, internet, mensalidades...). Ficam em Mais > Custos fixos e alimentam a
// projeção do mês seguinte: custos fixos ativos + parcelas de cartão do mês + parcelas de dívidas/acordos ativos.
const express = require('express');
const db = require('../db');
const dados = require('../dados');
const { exigirAutenticacao } = require('../middleware/auth');
const { projecaoCartaoPorMes, chaveHoje } = require('../utils/cartaoMeses');
const utilDividas = require('../utils/dividas');

const router = express.Router();
router.use(exigirAutenticacao);

const arred = (v) => Math.round((Number(v) || 0) * 100) / 100;

function validar(corpo, parcial = false) {
  const c = corpo || {};
  const out = {};
  if (!parcial || c.nome !== undefined) {
    const nome = String(c.nome || '').trim();
    if (!nome) return { erro: 'Informe o nome do custo fixo.' };
    if (nome.length > 80) return { erro: 'O nome pode ter até 80 caracteres.' };
    out.nome = nome;
  }
  if (!parcial || c.valor !== undefined) {
    const valor = Number(c.valor);
    if (!Number.isFinite(valor) || valor <= 0) return { erro: 'Informe um valor maior que zero.' };
    out.valor = arred(valor);
  }
  const dia = c.dia !== undefined ? c.dia : c.diaMes;
  if (!parcial || dia !== undefined) {
    const d = Number(dia === undefined ? 1 : dia);
    if (!Number.isInteger(d) || d < 1 || d > 31) return { erro: 'O dia do mês deve estar entre 1 e 31.' };
    out.dia_mes = d;
  }
  if (c.categoriaId !== undefined || c.categoria_id !== undefined) {
    out.categoria_id = c.categoriaId || c.categoria_id || null;
  }
  if (c.ativo !== undefined) out.ativo = c.ativo ? 1 : 0;
  return { dados: out };
}

function categoriaDoUsuario(usuarioId, id) {
  if (!id) return true;
  return !!db.prepare('SELECT id FROM categorias_orcamento WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(id), usuarioId);
}

function formatar(l) {
  return { id: l.id, nome: l.nome, valor: arred(l.valor), dia: l.dia_mes, categoriaId: l.categoria_id || null, categoriaNome: l.categoria_nome || null, ativo: !!l.ativo };
}

function listar(usuarioId) {
  return db.prepare(
    `SELECT c.*, k.nome AS categoria_nome FROM custos_fixos c
     LEFT JOIN categorias_orcamento k ON k.id = c.categoria_id AND k.excluido_em IS NULL
     WHERE c.usuario_id = ? AND c.excluido_em IS NULL ORDER BY c.dia_mes, c.nome COLLATE NOCASE`
  ).all(usuarioId).map(formatar);
}

router.get('/', (req, res) => {
  const itens = listar(req.usuario.id);
  res.json({ itens, totalAtivos: arred(itens.filter((i) => i.ativo).reduce((s, i) => s + i.valor, 0)) });
});

router.post('/', (req, res) => {
  const v = validar(req.body);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  if (!categoriaDoUsuario(req.usuario.id, v.dados.categoria_id)) return res.status(400).json({ erro: 'Categoria não encontrada.' });
  const novo = dados.inserir('custos_fixos', { usuario_id: req.usuario.id, ativo: 1, ...v.dados });
  res.status(201).json(listar(req.usuario.id).find((i) => i.id === novo.id));
});

router.put('/:id', (req, res) => {
  const atual = db.prepare('SELECT id FROM custos_fixos WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(req.params.id, req.usuario.id);
  if (!atual) return res.status(404).json({ erro: 'Custo fixo não encontrado.' });
  const v = validar(req.body, true);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  if (!categoriaDoUsuario(req.usuario.id, v.dados.categoria_id)) return res.status(400).json({ erro: 'Categoria não encontrada.' });
  dados.atualizar('custos_fixos', atual.id, v.dados);
  res.json(listar(req.usuario.id).find((i) => i.id === atual.id));
});

router.delete('/:id', (req, res) => {
  const atual = db.prepare('SELECT id FROM custos_fixos WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(req.params.id, req.usuario.id);
  if (!atual) return res.status(404).json({ erro: 'Custo fixo não encontrado.' });
  dados.excluir('custos_fixos', atual.id);
  res.json({ ok: true });
});

// ---- Projeção ----
const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function somarMes(chave, n) {
  const [a, m] = chave.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
const rotuloMes = (chave) => { const [a, m] = chave.split('-').map(Number); return `${NOMES_MES[m - 1]} de ${a}`; };

// Parcelas de dívidas/acordos/crediários ativos (valor_parcela > 0, saldo em aberto, status ativa): a parcela do mês
// seguinte entra se ainda restam parcelas até lá (as compras parceladas do cartão entram pelas parcelas do cartão).
function parcelasDeDividas(usuarioId, deslocamento) {
  const linhas = db.prepare(
    `SELECT * FROM dividas WHERE usuario_id = ? AND excluido_em IS NULL AND arquivada = 0 AND saldo > 0
     AND valor_parcela > 0 AND COALESCE(status, 'ativa') = 'ativa'`
  ).all(usuarioId);
  const itens = [];
  linhas.forEach((d) => {
    if (utilDividas.parcelasRestantes(d) < deslocamento) return;
    // a última parcela pode ser menor que o valor cheio
    const restante = arred(d.saldo - (deslocamento - 1) * d.valor_parcela);
    itens.push({ id: d.id, nome: d.nome, valor: arred(Math.min(d.valor_parcela, restante)) });
  });
  return { itens, total: arred(itens.reduce((s, i) => s + i.valor, 0)) };
}

// GET /api/custos-fixos/projecao?meses=1 (padrão 1: o mês seguinte; até 6).
router.get('/projecao', (req, res) => {
  const usuarioId = req.usuario.id;
  const qtd = Math.min(6, Math.max(1, parseInt(req.query.meses, 10) || 1));
  const hoje = chaveHoje();
  const fixos = listar(usuarioId).filter((i) => i.ativo);
  const totalFixos = arred(fixos.reduce((s, i) => s + i.valor, 0));
  const cartao = Object.fromEntries(projecaoCartaoPorMes(usuarioId).map((m) => [m.mes, m]));
  const meses = [];
  for (let i = 1; i <= qtd; i++) {
    const chave = somarMes(hoje, i);
    const pc = cartao[chave] || { total: 0, quantidade: 0 };
    const pd = parcelasDeDividas(usuarioId, i);
    meses.push({
      mes: chave,
      rotulo: rotuloMes(chave),
      custosFixos: { total: totalFixos, quantidade: fixos.length, itens: fixos },
      parcelasCartao: { total: arred(pc.total), quantidade: pc.quantidade },
      parcelasDividas: { total: pd.total, quantidade: pd.itens.length, itens: pd.itens },
      total: arred(totalFixos + pc.total + pd.total),
    });
  }
  res.json({ mes: meses[0].mes, proximo: meses[0], meses });
});

module.exports = router;
