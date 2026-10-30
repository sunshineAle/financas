// Custos fixos mensais (aluguel, internet, mensalidades...). Ficam em Mais > Custos fixos e alimentam a
// projeção do mês seguinte: custos fixos ativos + parcelas de cartão do mês + parcelas de dívidas/acordos ativos.
const express = require('express');
const db = require('../db');
const dados = require('../dados');
const { exigirAutenticacao } = require('../middleware/auth');
const { projecaoCartaoPorMes, chaveHoje, parcelasCartao, semPagamentoDeFatura } = require('../utils/cartaoMeses');
const utilDividas = require('../utils/dividas');
const { chaveDaData } = require('../utils/mesFinanceiro');
const cartoesRouter = require('./cartoes');

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
  // Recorrência com prazo (homologação 1.0, seção 12): "por 5 meses" a partir do mês de início; sem prazo = null.
  if (c.meses !== undefined) {
    if (c.meses === null || c.meses === '' || Number(c.meses) === 0) out.meses_total = null;
    else { const n = Number(c.meses); if (!Number.isInteger(n) || n < 1 || n > 120) return { erro: 'O prazo deve ser de 1 a 120 meses.' }; out.meses_total = n; }
  }
  if (c.inicioMes !== undefined) {
    const k = String(c.inicioMes || '');
    if (k && !/^\d{4}-(0[1-9]|1[0-2])$/.test(k)) return { erro: 'Mês de início inválido.' };
    out.inicio_mes = k || null;
  }
  return { dados: out };
}

// A recorrência vale no mês `chave`? Sem prazo: sempre (a partir do início, se houver). Com prazo: só nos N meses.
function recorrenciaValeNoMes(i, chave) {
  if (i.inicioMes && chave < i.inicioMes) return false;
  if (!i.meses) return true;
  const ini = i.inicioMes || chave;
  const [a, m] = ini.split('-').map(Number); const [b, n] = chave.split('-').map(Number);
  return (b - a) * 12 + (n - m) < i.meses;
}

function categoriaDoUsuario(usuarioId, id) {
  if (!id) return true;
  return !!db.prepare('SELECT id FROM categorias_orcamento WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(id), usuarioId);
}

function formatar(l) {
  return { id: l.id, nome: l.nome, valor: arred(l.valor), dia: l.dia_mes, categoriaId: l.categoria_id || null, categoriaNome: l.categoria_nome || null, ativo: !!l.ativo, meses: l.meses_total || null, inicioMes: l.inicio_mes || null };
}

function listar(usuarioId) {
  return db.prepare(
    `SELECT c.*, k.nome AS categoria_nome FROM custos_fixos c
     LEFT JOIN categorias_orcamento k ON k.id = c.categoria_id AND k.excluido_em IS NULL
     WHERE c.usuario_id = ? AND c.excluido_em IS NULL ORDER BY c.dia_mes, c.nome COLLATE NOCASE`
  ).all(usuarioId).map(formatar);
}

router.get('/', (req, res) => {
  const hoje = chaveHoje();
  const gastoMes = gastosDoMesPorCategoria(req.usuario.id, hoje);
  const itens = listar(req.usuario.id).map((i) => ({ ...i, pagoMes: i.categoriaId ? (gastoMes[i.categoriaId] || 0) > 0 : null, valeNoMes: recorrenciaValeNoMes(i, hoje) }));
  const totalAtivos = arred(itens.filter((i) => i.ativo && i.valeNoMes).reduce((s, i) => s + i.valor, 0));
  const ess = essenciais(req.usuario.id);
  // Custo de vida = fixos + essenciais estimados (anotação 41/43). Parcelas NÃO entram (são temporárias).
  res.json({ itens, totalAtivos, totalEssenciais: ess.total, custoDeVida: arred(totalAtivos + ess.total) });
});

// ---- Essenciais (anotação 41/43): gastos do mês que mudam de valor, ligados a uma categoria ----
const somarMesChave = (chave, n) => { const [a, m] = chave.split('-').map(Number); const t = a * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
// Gasto por categoria e mês financeiro: saídas da conta (sem pagamento de fatura) + parcelas do cartão.
function gastoPorCategoriaMes(usuarioId) {
  const mapa = {}; // categoriaId -> { 'YYYY-MM': total }
  db.prepare(
    `SELECT categoria_id AS c, mes_fin(data) AS m, SUM(-valor) AS t FROM transacoes
     WHERE usuario_id = ? AND excluido_em IS NULL AND ignorada = 0 AND valor < 0 AND categoria_id IS NOT NULL AND ${semPagamentoDeFatura()}
     GROUP BY categoria_id, m`
  ).all(usuarioId).forEach((l) => { (mapa[l.c] ||= {})[l.m] = (mapa[l.c][l.m] || 0) + (Number(l.t) || 0); });
  parcelasCartao(usuarioId).forEach((p) => { if (!p.categoria_id) return; (mapa[p.categoria_id] ||= {})[p.mes] = (mapa[p.categoria_id][p.mes] || 0) + (Number(p.valor) || 0); });
  return mapa;
}
function gastosDoMesPorCategoria(usuarioId, chave) {
  const mapa = gastoPorCategoriaMes(usuarioId);
  return Object.fromEntries(Object.entries(mapa).map(([c, meses]) => [c, meses[chave] || 0]));
}
// Últimos 6 meses financeiros FECHADOS (sem o atual), do mais antigo ao mais recente. Com menos histórico, usa os que houver
// (a partir do primeiro mês com gasto na categoria).
function estatisticas(porMes, hoje) {
  const chaves = [6, 5, 4, 3, 2, 1].map((n) => somarMesChave(hoje, -n));
  const primeiro = chaves.findIndex((k) => (porMes?.[k] || 0) > 0);
  if (primeiro < 0) return { meses: 0, media: 0, min: 0, max: 0, tendencia: null, comGasto: 0 };
  const vals = chaves.slice(primeiro).map((k) => arred(porMes[k] || 0));
  const media = arred(vals.reduce((a, b) => a + b, 0) / vals.length);
  let tendencia = 'estavel';
  if (vals.length >= 2) {
    const meio = Math.floor(vals.length / 2);
    const ant = vals.slice(0, meio), rec = vals.slice(meio);
    const ma = ant.reduce((a, b) => a + b, 0) / ant.length, mr = rec.reduce((a, b) => a + b, 0) / rec.length;
    if (ma > 0 && mr > ma * 1.05) tendencia = 'subindo'; else if (mr < ma * 0.95) tendencia = 'descendo';
  }
  return { meses: vals.length, media, min: Math.min(...vals), max: Math.max(...vals), tendencia, comGasto: chaves.filter((k) => (porMes?.[k] || 0) > 0).length };
}
// Fora das sugestões (não essenciais por padrão): lazer, restaurante, delivery...
const NAO_ESSENCIAL = /(lazer|restaurante|delivery|ifood|bar\b|bares|cinema|viage|passeio|presente|hobby|jogo|games|streaming|assinatura|compras|roupa|vestu|beleza|investiment|transfer|fatura|outros)/i;
function essenciais(usuarioId) {
  const hoje = chaveHoje();
  const mapa = gastoPorCategoriaMes(usuarioId);
  const linhas = db.prepare(
    `SELECT e.*, k.nome AS categoria_nome, k.icone AS categoria_icone, k.cor AS categoria_cor FROM custos_essenciais e
     JOIN categorias_orcamento k ON k.id = e.categoria_id AND k.excluido_em IS NULL
     WHERE e.usuario_id = ? AND e.excluido_em IS NULL ORDER BY COALESCE(e.nome, k.nome) COLLATE NOCASE`
  ).all(usuarioId);
  const itens = linhas.map((l) => {
    const est = estatisticas(mapa[l.categoria_id], hoje);
    const manual = l.valor_manual != null && Number(l.valor_manual) > 0 ? arred(l.valor_manual) : null;
    const gastoMes = arred(mapa[l.categoria_id]?.[hoje] || 0);
    return {
      id: l.id, categoriaId: l.categoria_id, nome: l.nome || l.categoria_nome, categoriaNome: l.categoria_nome, icone: l.categoria_icone || null, cor: l.categoria_cor || null,
      valorManual: manual, dia: l.dia_mes || null, ativo: !!l.ativo, ...est, estimado: manual != null ? manual : est.media, gastoMes, pagoMes: gastoMes > 0,
    };
  });
  const usadas = new Set(linhas.map((l) => l.categoria_id));
  const cats = db.prepare('SELECT id, nome, icone, cor FROM categorias_orcamento WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId);
  const sugestoes = cats
    .filter((c) => !usadas.has(c.id) && !NAO_ESSENCIAL.test(c.nome))
    .map((c) => ({ categoriaId: c.id, nome: c.nome, icone: c.icone || null, cor: c.cor || null, ...estatisticas(mapa[c.id], hoje) }))
    .filter((c) => c.comGasto >= 5)
    .sort((a, b) => b.media - a.media);
  return { itens, sugestoes, total: arred(itens.filter((i) => i.ativo).reduce((s, i) => s + i.estimado, 0)) };
}
function validarEssencial(corpo, parcial = false) {
  const c = corpo || {};
  const out = {};
  if (!parcial || c.categoriaId !== undefined) {
    if (!c.categoriaId) return { erro: 'Escolha a categoria.' };
    out.categoria_id = String(c.categoriaId);
  }
  if (c.nome !== undefined) { const n = String(c.nome || '').trim(); if (n.length > 80) return { erro: 'O nome pode ter até 80 caracteres.' }; out.nome = n || null; }
  if (c.valorManual !== undefined) {
    if (c.valorManual === null || c.valorManual === '' || Number(c.valorManual) === 0) out.valor_manual = null;
    else { const v = Number(c.valorManual); if (!Number.isFinite(v) || v < 0) return { erro: 'Valor inválido.' }; out.valor_manual = arred(v); }
  }
  if (c.dia !== undefined) {
    if (c.dia === null || c.dia === '' || Number(c.dia) === 0) out.dia_mes = null;
    else { const d = Number(c.dia); if (!Number.isInteger(d) || d < 1 || d > 31) return { erro: 'O dia do mês deve estar entre 1 e 31.' }; out.dia_mes = d; }
  }
  if (c.ativo !== undefined) out.ativo = c.ativo ? 1 : 0;
  return { dados: out };
}
router.get('/essenciais', (req, res) => res.json(essenciais(req.usuario.id)));
router.post('/essenciais', (req, res) => {
  const v = validarEssencial(req.body);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  if (!categoriaDoUsuario(req.usuario.id, v.dados.categoria_id)) return res.status(400).json({ erro: 'Categoria não encontrada.' });
  if (db.prepare('SELECT id FROM custos_essenciais WHERE usuario_id = ? AND categoria_id = ? AND excluido_em IS NULL').get(req.usuario.id, v.dados.categoria_id)) {
    return res.status(400).json({ erro: 'Essa categoria já está nos essenciais.' });
  }
  const novo = dados.inserir('custos_essenciais', { usuario_id: req.usuario.id, ativo: 1, ...v.dados });
  res.status(201).json(essenciais(req.usuario.id).itens.find((i) => i.id === novo.id));
});
router.put('/essenciais/:id', (req, res) => {
  const atual = db.prepare('SELECT id FROM custos_essenciais WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(req.params.id, req.usuario.id);
  if (!atual) return res.status(404).json({ erro: 'Item não encontrado.' });
  const v = validarEssencial(req.body, true);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  if (v.dados.categoria_id && !categoriaDoUsuario(req.usuario.id, v.dados.categoria_id)) return res.status(400).json({ erro: 'Categoria não encontrada.' });
  dados.atualizar('custos_essenciais', atual.id, v.dados);
  res.json(essenciais(req.usuario.id).itens.find((i) => i.id === atual.id));
});
router.delete('/essenciais/:id', (req, res) => {
  const atual = db.prepare('SELECT id FROM custos_essenciais WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(req.params.id, req.usuario.id);
  if (!atual) return res.status(404).json({ erro: 'Item não encontrado.' });
  dados.excluir('custos_essenciais', atual.id);
  res.json({ ok: true });
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

// Projeção do mês = fixos + essenciais estimados + parcelas ativas (anotação 41).
// GET /api/custos-fixos/projecao?meses=1 (padrão 1: o mês seguinte; até 6).
router.get('/projecao', (req, res) => {
  const usuarioId = req.usuario.id;
  const qtd = Math.min(6, Math.max(1, parseInt(req.query.meses, 10) || 1));
  const hoje = chaveHoje();
  const fixos = listar(usuarioId).filter((i) => i.ativo);
  const totalFixos = arred(fixos.reduce((s, i) => s + i.valor, 0));
  const ess = essenciais(usuarioId);
  const essAtivos = ess.itens.filter((i) => i.ativo);
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
      essenciais: { total: ess.total, quantidade: essAtivos.length },
      parcelasCartao: { total: arred(pc.total), quantidade: pc.quantidade },
      parcelasDividas: { total: pd.total, quantidade: pd.itens.length, itens: pd.itens },
      total: arred(totalFixos + ess.total + pc.total + pd.total),
    });
  }
  res.json({ mes: meses[0].mes, proximo: meses[0], meses });
});

// ---- Previsão do dinheiro nas contas (anotação 51) ----
// Única exceção à "data da compra": aqui a fatura entra no VENCIMENTO, porque a pergunta é "quanto vou ter na conta?".
// Previsto(mês) = saldo anterior + entradas recorrentes − Custo de vida − faturas que vencem − parcelas de dívidas/acordos.
// Mês 0 = o mês financeiro atual (só o que ainda falta acontecer nele); depois, os 5 seguintes.
router.get('/previsao', (req, res) => {
  const usuarioId = req.usuario.id;
  const qtd = Math.min(12, Math.max(2, parseInt(req.query.meses, 10) || 6));
  const hoje = chaveHoje();
  const saldoContas = arred(db.prepare('SELECT COALESCE(SUM(saldo), 0) AS t FROM contas WHERE usuario_id = ? AND excluido_em IS NULL').get(usuarioId).t);
  // Entradas recorrentes = média dos 3 últimos meses financeiros fechados (sem resgates, rendimentos e transferências).
  const ent = Object.fromEntries(db.prepare(
    `SELECT mes_fin(data) AS m, SUM(valor) AS t FROM transacoes
     WHERE usuario_id = ? AND excluido_em IS NULL AND ignorada = 0 AND valor > 0 AND COALESCE(tipo_mov, '') = ''
       AND COALESCE(categoria_receita, '') NOT IN ('Resgates e saques', 'Rendimentos')
     GROUP BY m`
  ).all(usuarioId).map((l) => [l.m, Number(l.t) || 0]));
  const fechados = [1, 2, 3].map((n) => somarMes(hoje, -n)).filter((k) => ent[k] > 0);
  const entradasMedia = fechados.length ? arred(fechados.reduce((s, k) => s + ent[k], 0) / fechados.length) : 0;
  const recebidoMes = arred(ent[hoje] || 0);
  // Custo de vida (fixos + essenciais). No mês atual, só o que ainda falta pagar.
  const gastoMes = gastosDoMesPorCategoria(usuarioId, hoje);
  const fixos = listar(usuarioId).filter((i) => i.ativo);
  const ess = essenciais(usuarioId);
  const essAtivos = ess.itens.filter((i) => i.ativo);
  const custoVida = arred(fixos.reduce((s, i) => s + i.valor, 0) + ess.total);
  const custoRestante = arred(
    fixos.reduce((s, i) => s + (i.categoriaId && (gastoMes[i.categoriaId] || 0) > 0 ? 0 : i.valor), 0)
    + essAtivos.reduce((s, i) => s + Math.max(0, i.estimado - i.gastoMes), 0)
  );
  // Faturas a pagar, no mês financeiro do vencimento.
  const faturasPorMes = {};
  cartoesRouter.faturasAPagar(usuarioId).forEach((f) => {
    let k = chaveDaData(f.vence);
    if (k < hoje) k = hoje; // vencida e não paga: pesa já
    (faturasPorMes[k] ||= { total: 0, itens: [] }).total += f.total;
    faturasPorMes[k].itens.push({ nome: f.cartao, valor: arred(f.total), vence: f.vence });
  });
  let saldo = saldoContas;
  let negativoEm = null;
  const meses = [];
  for (let i = 0; i < qtd; i++) {
    const chave = somarMes(hoje, i);
    const entradas = i === 0 ? arred(Math.max(0, entradasMedia - recebidoMes)) : entradasMedia;
    const custo = i === 0 ? custoRestante : custoVida;
    const fat = faturasPorMes[chave] || { total: 0, itens: [] };
    const pd = parcelasDeDividas(usuarioId, i + 1);
    saldo = arred(saldo + entradas - custo - fat.total - pd.total);
    if (saldo < 0 && !negativoEm) negativoEm = { mes: chave, rotulo: rotuloMes(chave) };
    meses.push({
      mes: chave, rotulo: rotuloMes(chave), atual: i === 0,
      entradas, custoDeVida: custo,
      faturas: { total: arred(fat.total), itens: fat.itens },
      dividas: { total: pd.total, itens: pd.itens },
      saldo,
    });
  }
  res.json({ saldoContas, entradasMedia, custoDeVida: custoVida, semEntradas: !fechados.length, negativoEm, meses });
});

// ---- Previsão do Saldo do mês (homologação 1.0, seção 1 — regra do Contador) ----
// Uma regra só, a mesma do Saldo do mês: tudo conta na DATA DA COMPRA (parcela do cartão no mês em que cai na fatura).
// Previsto(mês futuro) = entradas previstas − Custo de vida − parcelas do cartão do mês − parcelas de dívidas/acordos
//                        − saídas já lançadas para o mês (pagamento de fatura fica de fora).
// Entradas previstas = o maior entre a média dos 3 últimos meses fechados e o que já foi lançado para o mês.
function previsaoDoMes(usuarioId, chave) {
  const hoje = chaveHoje();
  const desloc = (() => { const [a, m] = chave.split('-').map(Number); const [ha, hm] = hoje.split('-').map(Number); return (a - ha) * 12 + (m - hm); })();
  if (desloc < 1) return null;
  const ent = Object.fromEntries(db.prepare(
    `SELECT mes_fin(data) AS m, SUM(valor) AS t FROM transacoes
     WHERE usuario_id = ? AND excluido_em IS NULL AND ignorada = 0 AND valor > 0 AND COALESCE(tipo_mov, '') = ''
       AND COALESCE(categoria_receita, '') NOT IN ('Resgates e saques', 'Rendimentos')
     GROUP BY m`
  ).all(usuarioId).map((l) => [l.m, Number(l.t) || 0]));
  const fechados = [1, 2, 3].map((n) => somarMes(hoje, -n)).filter((k) => ent[k] > 0);
  const entradasMedia = fechados.length ? arred(fechados.reduce((s, k) => s + ent[k], 0) / fechados.length) : 0;
  const entradasLancadas = arred(ent[chave] || 0);
  const entradas = Math.max(entradasMedia, entradasLancadas);
  const saidasLancadas = arred(db.prepare(
    `SELECT COALESCE(SUM(-valor), 0) AS t FROM transacoes WHERE usuario_id = ? AND excluido_em IS NULL AND ignorada = 0 AND valor < 0
       AND COALESCE(tipo_mov, '') = '' AND mes_fin(data) = ? AND ${semPagamentoDeFatura()}`
  ).get(usuarioId, chave).t);
  const fixos = listar(usuarioId).filter((i) => i.ativo && recorrenciaValeNoMes(i, chave));
  const ess = essenciais(usuarioId);
  const custoDeVida = arred(fixos.reduce((s, i) => s + i.valor, 0) + ess.total);
  const pc = projecaoCartaoPorMes(usuarioId).find((m) => m.mes === chave) || { total: 0, quantidade: 0 };
  const pd = parcelasDeDividas(usuarioId, desloc);
  const saidas = arred(custoDeVida + pc.total + pd.total + saidasLancadas);
  return {
    mes: chave, rotulo: rotuloMes(chave), semEntradas: !fechados.length,
    entradas: arred(entradas), entradasMedia, entradasLancadas,
    custoDeVida, parcelasCartao: arred(pc.total), parcelasDividas: pd.total, saidasLancadas,
    saidas, saldo: arred(entradas - saidas),
  };
}
// Primeiro mês futuro (até `qtd`) com Saldo do mês previsto negativo: alimenta o aviso "mantendo as dívidas atuais…".
function primeiroMesNegativo(usuarioId, qtd = 6) {
  const hoje = chaveHoje();
  for (let i = 1; i <= qtd; i++) {
    const p = previsaoDoMes(usuarioId, somarMes(hoje, i));
    if (p && p.saldo < 0) return p;
  }
  return null;
}
router.get('/previsao-mes', (req, res) => {
  const chave = String(req.query.mes || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(chave)) return res.status(400).json({ erro: 'Mês inválido.' });
  res.json(previsaoDoMes(req.usuario.id, chave));
});
router.previsaoDoMes = previsaoDoMes;
router.primeiroMesNegativo = primeiroMesNegativo;

module.exports = router;
