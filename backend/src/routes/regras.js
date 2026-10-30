// Regras de categorização: lista, criação (com "aplicar nas antigas"), edição/pausa, exclusão e "desfazer" (restaurar).
// Anotação 48: a regra também guarda subcategoria e ícone do item, gravados nas transações que ela categoriza.
const express = require('express');
const db = require('../db');
const dados = require('../dados');
const { exigirAutenticacao } = require('../middleware/auth');
const { nomesCategoriasReceita } = require('../utils/categoriasReceita');
const R = require('../utils/regras');

const router = express.Router();
router.use(exigirAutenticacao);

const numeroOuNulo = (v) => (v === undefined || v === null || v === '' ? null : R.arredondar(Number(v)));

// Valida o corpo e devolve { dados } ou { erro }.
function ler(usuarioId, corpo, atual = null) {
  const c = corpo || {};
  const d = {};
  const tipo = c.tipo !== undefined ? c.tipo : atual ? atual.tipo : 'saida';
  if (tipo !== 'saida' && tipo !== 'entrada' && tipo !== 'reserva') return { erro: 'Informe se a regra é de saída, de entrada ou de metas e investimentos.' };
  d.tipo = tipo;
  if (c.padrao !== undefined || !atual) {
    const padrao = String(c.padrao || '').trim().slice(0, 80);
    if (padrao.length < 2) return { erro: 'Informe o trecho do nome (pelo menos 2 letras). Ex.: Padaria do José.' };
    d.padrao = padrao;
  }
  for (const [campo, col] of [['valorMin', 'valor_min'], ['valorMax', 'valor_max']]) {
    if (c[campo] !== undefined || !atual) {
      const n = numeroOuNulo(c[campo]);
      if (n !== null && (!Number.isFinite(n) || n < 0)) return { erro: 'Os valores da regra não podem ser negativos.' };
      d[col] = n;
    }
  }
  const min = d.valor_min !== undefined ? d.valor_min : atual && atual.valor_min;
  const max = d.valor_max !== undefined ? d.valor_max : atual && atual.valor_max;
  if (min !== null && min !== undefined && max !== null && max !== undefined && min > max) return { erro: 'O valor mínimo não pode ser maior que o máximo.' };
  if (c.contaId !== undefined || !atual) {
    const contaId = c.contaId ? String(c.contaId) : null;
    if (contaId && !db.prepare('SELECT 1 FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(contaId, usuarioId)) return { erro: 'Conta não encontrada.' };
    d.conta_id = contaId;
  }
  if (tipo === 'reserva') {
    // Seção 15: Guardar/Resgatar numa meta ou aporte/resgate de um investimento
    const destino = c.destino !== undefined ? c.destino : atual ? atual.destino : null;
    if (!['guardar', 'resgatar', 'aporte', 'resgate_inv'].includes(destino)) return { erro: 'Escolha o que a regra faz: guardar, resgatar, aporte ou resgate.' };
    d.destino = destino;
    d.categoria_id = null; d.categoria_receita = null;
    if (destino === 'guardar' || destino === 'resgatar') {
      const id = c.metaId !== undefined ? c.metaId : atual ? atual.meta_id : null;
      if (!id || !db.prepare('SELECT 1 FROM metas_reserva m JOIN reserva_liberdade r ON r.id = m.reserva_id WHERE m.id = ? AND r.usuario_id = ? AND m.excluido_em IS NULL').get(String(id), usuarioId)) return { erro: 'Escolha a meta.' };
      d.meta_id = String(id); d.ativo_id = null;
    } else {
      const id = c.ativoId !== undefined ? c.ativoId : atual ? atual.ativo_id : null;
      if (!id || !db.prepare('SELECT 1 FROM ativos WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(id), usuarioId)) return { erro: 'Escolha o investimento.' };
      d.ativo_id = String(id); d.meta_id = null;
    }
  } else if (tipo === 'saida') {
    const id = c.categoriaId !== undefined ? c.categoriaId : atual ? atual.categoria_id : null;
    if (!id || !db.prepare('SELECT 1 FROM categorias_orcamento WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(id), usuarioId)) return { erro: 'Escolha a categoria de despesa da regra.' };
    d.categoria_id = String(id);
    d.categoria_receita = null;
  } else {
    const nome = c.categoriaReceita !== undefined ? c.categoriaReceita : atual ? atual.categoria_receita : null;
    if (!nome || !nomesCategoriasReceita(usuarioId).includes(nome)) return { erro: 'Escolha a categoria de entrada da regra.' };
    d.categoria_receita = nome;
    d.categoria_id = null;
  }
  if (c.ativa !== undefined) d.ativa = c.ativa ? 1 : 0;
  if (c.subcategoria !== undefined) d.subcategoria = String(c.subcategoria || '').trim().slice(0, 80) || null;
  if (c.icone !== undefined) d.icone = /^cat-[a-z0-9-]{2,60}$/.test(String(c.icone || '')) ? String(c.icone) : null; // mesma regra do ícone da transação
  return { dados: d };
}

function paraSaida(r) {
  let categoriaNome = r.categoria_receita || null;
  let categoriaIcone = null;
  if (r.categoria_id) {
    const c = db.prepare('SELECT nome, icone, cor FROM categorias_orcamento WHERE id = ? AND excluido_em IS NULL').get(r.categoria_id);
    categoriaNome = c ? c.nome : null; categoriaIcone = c ? c.icone : null;
  } else if (r.categoria_receita) {
    const c = db.prepare('SELECT icone FROM categorias_receita WHERE usuario_id = ? AND nome = ? AND excluido_em IS NULL').get(r.usuario_id, r.categoria_receita);
    categoriaIcone = c ? c.icone : null;
  }
  let metaNome = null, ativoNome = null;
  if (r.tipo === 'reserva') {
    if (r.meta_id) metaNome = (db.prepare('SELECT nome FROM metas_reserva WHERE id = ?').get(r.meta_id) || {}).nome || null;
    if (r.ativo_id) { const a = db.prepare('SELECT nome, ticker FROM ativos WHERE id = ?').get(r.ativo_id); ativoNome = a ? a.ticker || a.nome : null; }
    const verbo = { guardar: 'Guardar em', resgatar: 'Resgatar de', aporte: 'Aporte em', resgate_inv: 'Resgate de' }[r.destino] || '';
    categoriaNome = `${verbo} ${metaNome || ativoNome || '—'}`;
  }
  const conta = r.conta_id ? db.prepare('SELECT nome FROM contas WHERE id = ? AND excluido_em IS NULL').get(r.conta_id) : null;
  return {
    id: r.id, tipo: r.tipo, padrao: r.padrao, valorMin: r.valor_min, valorMax: r.valor_max,
    contaId: r.conta_id || null, contaNome: conta ? conta.nome : null,
    categoriaId: r.categoria_id || null, categoriaReceita: r.categoria_receita || null, categoriaNome, categoriaIcone,
    subcategoria: r.subcategoria || '', icone: r.icone || '',
    ativa: !!r.ativa, aplicacoes: r.aplicacoes || 0,
    destino: r.destino || null, metaId: r.meta_id || null, ativoId: r.ativo_id || null, metaNome, ativoNome,
  };
}

// Aplica a regra às antigas (categoria) e completa subcategoria/ícone das que casam e ainda não têm (não sobrescreve escolha do usuário).
function aplicar(usuarioId, regra) {
  if (regra.tipo === 'reserva') return R.aplicarReservaNasAntigas(usuarioId, regra); // seção 15
  const aplicadas = R.aplicarNasAntigas(usuarioId, regra);
  if (!regra.subcategoria && !regra.icone) return aplicadas;
  const ehSaida = regra.tipo !== 'entrada';
  dados.transacao(() => {
    const txs = db.prepare(`SELECT id, conta_id, descricao, valor, subcategoria, icone FROM transacoes
      WHERE usuario_id = ? AND excluido_em IS NULL AND ignorada = 0 AND tipo_mov IS NULL AND ${ehSaida ? 'valor < 0' : 'valor > 0'}`).all(usuarioId);
    for (const t of txs) {
      if (!R.casa(regra, { descricao: t.descricao, valor: t.valor, contaId: t.conta_id })) continue;
      const campos = {};
      if (regra.subcategoria && !t.subcategoria) campos.subcategoria = regra.subcategoria;
      if (regra.icone && !t.icone) campos.icone = regra.icone;
      if (Object.keys(campos).length) dados.atualizar('transacoes', t.id, campos);
    }
    if (ehSaida && regra.subcategoria) {
      const lcs = db.prepare('SELECT id, descricao, valor, subcategoria FROM lancamentos_cartao WHERE usuario_id = ? AND excluido_em IS NULL AND tipo_mov IS NULL').all(usuarioId);
      for (const l of lcs) {
        if (l.subcategoria || !R.casa(regra, { descricao: l.descricao, valor: l.valor, contaId: null })) continue;
        dados.atualizar('lancamentos_cartao', l.id, { subcategoria: regra.subcategoria });
      }
    }
  });
  return aplicadas;
}

router.get('/', (req, res) => {
  const lista = db.prepare('SELECT * FROM regras_categorias WHERE usuario_id = ? AND excluido_em IS NULL ORDER BY criado_em DESC, rowid DESC').all(req.usuario.id);
  res.json(lista.map(paraSaida));
});

// Quantas transações antigas a regra (ainda não salva) mudaria de categoria.
router.get('/previa', (req, res) => {
  const q = req.query || {};
  const l = ler(req.usuario.id, { tipo: q.tipo || 'saida', padrao: q.padrao, valorMin: q.valorMin, valorMax: q.valorMax, contaId: q.contaId, categoriaId: q.categoriaId, categoriaReceita: q.categoriaReceita, destino: q.destino, metaId: q.metaId, ativoId: q.ativoId });
  if (l.erro) return res.status(400).json({ erro: l.erro });
  if (l.dados.tipo === 'reserva') {
    const sai = l.dados.destino === 'guardar' || l.dados.destino === 'aporte';
    const ex = db.prepare(`SELECT id, conta_id, descricao, valor FROM transacoes WHERE usuario_id = ? AND excluido_em IS NULL AND ignorada = 0 AND tipo_mov IS NULL AND ${sai ? 'valor < 0' : 'valor > 0'}`).all(req.usuario.id)
      .filter((t) => R.casa(l.dados, { descricao: t.descricao, valor: t.valor, contaId: t.conta_id }));
    return res.json({ quantidade: ex.length, exemplos: ex.slice(0, 5).map((x) => x.descricao) });
  }
  const linhas = R.afetadas(req.usuario.id, { ...l.dados, usuario_id: req.usuario.id });
  res.json({ quantidade: linhas.length, exemplos: linhas.slice(0, 5).map((x) => x.descricao) });
});

router.post('/', (req, res) => {
  const l = ler(req.usuario.id, req.body);
  if (l.erro) return res.status(400).json({ erro: l.erro });
  const igual = db.prepare('SELECT * FROM regras_categorias WHERE usuario_id = ? AND excluido_em IS NULL AND tipo = ?').all(req.usuario.id, l.dados.tipo)
    .find((r) => R.normalizar(r.padrao) === R.normalizar(l.dados.padrao) && (r.conta_id || null) === (l.dados.conta_id || null) && (r.valor_min ?? null) === (l.dados.valor_min ?? null) && (r.valor_max ?? null) === (l.dados.valor_max ?? null));
  if (igual) return res.status(400).json({ erro: 'Já existe uma regra igual para esse trecho. Edite ou apague a antiga.' });
  let regra; let aplicadas = 0;
  dados.transacao(() => {
    regra = dados.inserir('regras_categorias', { usuario_id: req.usuario.id, ativa: 1, aplicacoes: 0, ...l.dados });
    if (req.body && req.body.aplicarAntigas) aplicadas = aplicar(req.usuario.id, regra);
  });
  res.status(201).json({ regra: paraSaida(db.prepare('SELECT * FROM regras_categorias WHERE id = ?').get(regra.id)), aplicadas });
});

function achar(req, res) {
  const r = db.prepare('SELECT * FROM regras_categorias WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(req.params.id, req.usuario.id);
  if (!r) res.status(404).json({ erro: 'Regra não encontrada.' });
  return r;
}

router.put('/:id', (req, res) => {
  const atual = achar(req, res);
  if (!atual) return;
  const l = ler(req.usuario.id, req.body, atual);
  if (l.erro) return res.status(400).json({ erro: l.erro });
  dados.atualizar('regras_categorias', atual.id, l.dados);
  const nova = db.prepare('SELECT * FROM regras_categorias WHERE id = ?').get(atual.id);
  const aplicadas = req.body && req.body.aplicarAntigas && nova.ativa ? aplicar(req.usuario.id, nova) : 0;
  res.json({ ...paraSaida(db.prepare('SELECT * FROM regras_categorias WHERE id = ?').get(atual.id)), aplicadas });
});

router.post('/:id/aplicar', (req, res) => {
  const atual = achar(req, res);
  if (!atual) return;
  res.json({ aplicadas: aplicar(req.usuario.id, atual) });
});

router.delete('/:id', (req, res) => {
  const atual = achar(req, res);
  if (!atual) return;
  dados.excluir('regras_categorias', atual.id);
  res.json({ ok: true });
});

// "Desfazer" da exclusão (toast da tela de regras).
router.post('/:id/restaurar', (req, res) => {
  const r = db.prepare('SELECT * FROM regras_categorias WHERE id = ? AND usuario_id = ? AND excluido_em IS NOT NULL').get(req.params.id, req.usuario.id);
  if (!r) return res.status(404).json({ erro: 'Regra não encontrada.' });
  dados.restaurar('regras_categorias', r.id);
  res.json(paraSaida(db.prepare('SELECT * FROM regras_categorias WHERE id = ?').get(r.id)));
});

module.exports = router;
