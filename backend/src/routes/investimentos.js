// Investimentos (setor G): ativos consolidados por ticker, operações (compra, venda, guardar, resgatar, provento, rendimento),
// corretoras como contas (tipo 'corretora') e conciliação pela transferência do extrato.
// Toda gravação passa por `dados`. Metas só aceitam ativos de liquidez rápida (validado aqui e em routes/reserva.js).
const express = require('express');
const db = require('../db');
const dados = require('../dados');
const { exigirAutenticacao } = require('../middleware/auth');
const { dataValida, arredondar } = require('../utils/faturas');
const lanc = require('../utils/lancamentos');
const carteira = require('../utils/carteiraDb');
const {
  TIPOS_INVESTIMENTO, TIPOS_LIQUIDEZ_RAPIDA, MSG_SO_LIQUIDEZ_RAPIDA, liquidezPadrao, TIPOS_OPERACAO,
  OPERACOES_ENTRADA, OPERACOES_SAIDA, consolidarAtivo, cotasEm,
} = require('../utils/carteira');

const router = express.Router();
router.use(exigirAutenticacao);

const COM_COTAS = ['acoes', 'fii', 'fiagro', 'etf', 'bdr', 'cripto', 'ouro'];
const erro = (status, msg) => Object.assign(new Error(msg), { status });
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(String(v).replace(',', '.')));

function operacoesDe(ativoId) {
  return db.prepare('SELECT * FROM operacoes WHERE ativo_id = ? AND excluido_em IS NULL ORDER BY data ASC, criado_em ASC, rowid ASC').all(ativoId);
}
function ativoDoUsuario(id, usuarioId) {
  return db.prepare('SELECT * FROM ativos WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(id), usuarioId);
}
const rotuloTipo = (t) => TIPOS_INVESTIMENTO[t] || t;

function resumoAtivo(a, ops, contasPorId) {
  const c = consolidarAtivo(ops);
  const datas = ops.map((o) => String(o.data).slice(0, 10)).sort();
  return {
    id: a.id, nome: a.nome, ticker: a.ticker, tipo: a.tipo, tipo_rotulo: rotuloTipo(a.tipo), liquidez: a.liquidez,
    corretora_conta_id: a.corretora_conta_id, corretora_nome: a.corretora_conta_id ? contasPorId[a.corretora_conta_id]?.nome || null : null,
    usa_cotas: c.usa_cotas, cotas: c.cotas, preco_medio: c.preco_medio, custo: c.custo, valor_atual: c.valor_atual,
    proventos: c.proventos, rendimentos: c.rendimentos, realizado: c.realizado,
    encerrado: c.valor_atual === 0 && c.cotas === 0 && ops.length > 0,
    operacoes: ops.length, ultima_data: datas.length ? datas[datas.length - 1] : null,
  };
}

function montarLista(usuarioId) {
  const contas = db.prepare('SELECT id, nome, tipo, saldo, origem FROM contas WHERE usuario_id = ? AND excluido_em IS NULL ORDER BY criado_em ASC, rowid ASC').all(usuarioId);
  const porId = Object.fromEntries(contas.map((c) => [c.id, c]));
  const ativos = db.prepare('SELECT * FROM ativos WHERE usuario_id = ? AND excluido_em IS NULL ORDER BY nome COLLATE NOCASE ASC').all(usuarioId);
  const ops = db.prepare('SELECT * FROM operacoes WHERE usuario_id = ? AND ativo_id IS NOT NULL AND excluido_em IS NULL').all(usuarioId);
  const porAtivo = {};
  ops.forEach((o) => (porAtivo[o.ativo_id] = porAtivo[o.ativo_id] || []).push(o));
  const itens = ativos.map((a) => resumoAtivo(a, porAtivo[a.id] || [], porId));
  const ativosComPosicao = itens.filter((i) => !i.encerrado).sort((a, b) => b.valor_atual - a.valor_atual);
  const encerrados = itens.filter((i) => i.encerrado);

  const total = arredondar(itens.reduce((t, i) => t + i.valor_atual, 0));
  const porTipo = {};
  itens.forEach((i) => { if (i.valor_atual > 0) porTipo[i.tipo] = (porTipo[i.tipo] || 0) + i.valor_atual; });
  const resumo_por_tipo = Object.entries(porTipo)
    .map(([tipo, v]) => ({ tipo, rotulo: rotuloTipo(tipo), total: arredondar(v), pct: total ? Math.round((v / total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);

  // Evolução: valor investido (compras/guardados menos vendas/resgates) ao fim de cada mês
  const porMes = {};
  ops.forEach((o) => {
    const m = String(o.data).slice(0, 7);
    if (OPERACOES_ENTRADA.includes(o.tipo)) porMes[m] = (porMes[m] || 0) + o.total;
    else if (OPERACOES_SAIDA.includes(o.tipo)) porMes[m] = (porMes[m] || 0) - o.total;
  });
  let acc = 0;
  const evolucao = Object.keys(porMes).sort().map((mes) => ({ mes, movimento: arredondar(porMes[mes]), saldo: (acc = arredondar(acc + porMes[mes])) }));

  const ultima = ops.map((o) => o.alterado_em).sort().pop() || null;
  const corretoras = contas.filter((c) => c.tipo === 'corretora');
  return {
    ativos: [...ativosComPosicao, ...encerrados],
    totais: {
      investido: total,
      custo: arredondar(itens.reduce((t, i) => t + i.custo, 0)),
      proventos: arredondar(itens.reduce((t, i) => t + i.proventos, 0)),
      realizado: arredondar(itens.reduce((t, i) => t + i.realizado, 0)),
      quantidade: ativosComPosicao.length,
    },
    resumo_por_tipo, evolucao,
    corretoras, tem_corretora: corretoras.length > 0,
    contas: contas.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, origem: c.origem })),
    tipos: Object.entries(TIPOS_INVESTIMENTO).map(([valor, rotulo]) => ({ valor, rotulo, liquidez: liquidezPadrao(valor), cotas: COM_COTAS.includes(valor) })),
    tipos_liquidez_rapida: TIPOS_LIQUIDEZ_RAPIDA,
    aviso_liquidez: MSG_SO_LIQUIDEZ_RAPIDA,
    atualizado_em: ultima,
  };
}

router.get('/', (req, res) => res.json(montarLista(req.usuario.id)));

// --- Conciliação pela transferência do extrato (quando não há corretora cadastrada) --------------------------------------
const RE_CORRETORA = /corretora|invest|xp\b|rico\b|clear\b|btg|genial|toro\b|modal|avenue|binance|mercado bitcoin|nuinvest|ag[oó]ra|warren|inter dtvm|c6 invest|ted|transfer/i;
router.get('/conciliacao', (req, res) => {
  const desde = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const linhas = db
    .prepare(
      `SELECT t.id, t.descricao, t.valor, t.data, t.conta_id, c.nome AS conta_nome
       FROM transacoes t LEFT JOIN contas c ON c.id = t.conta_id
       WHERE t.usuario_id = ? AND t.excluido_em IS NULL AND t.valor < 0 AND t.data >= ? AND t.ignorada = 0 AND t.tipo_mov IS NULL
         AND t.id NOT IN (SELECT transacao_id FROM faturas_pagas WHERE transacao_id IS NOT NULL AND excluido_em IS NULL)
       ORDER BY t.data DESC, t.rowid DESC LIMIT 200`
    )
    .all(req.usuario.id, desde)
    .map((t) => ({ ...t, data: String(t.data).slice(0, 10), provavel: RE_CORRETORA.test(t.descricao || '') }));
  linhas.sort((a, b) => Number(b.provavel) - Number(a.provavel));
  res.json({ transacoes: linhas });
});

// --- Transferência banco -> corretora ------------------------------------------------------------------------------------
// Usa a transferência entre contas próprias do setor E1 (CONTRATO-TRANSACOES.md): par de lançamentos fora dos totais, com saldos
// atualizados. Para desfazer: DELETE /api/transacoes/transferencia/:vinculo.
router.post('/transferencia', (req, res) => {
  const { origemId, corretoraId, descricao } = req.body || {};
  const corretora = db.prepare('SELECT * FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(corretoraId || ''), req.usuario.id);
  if (!corretora) return res.status(404).json({ erro: 'Conta não encontrada.' });
  if (corretora.tipo !== 'corretora') return res.status(400).json({ erro: 'A conta de destino precisa ser do tipo Corretora.' });
  try {
    const r = lanc.criarTransferencia(req.usuario.id, { origemId, destinoId: corretora.id, valor: req.body?.valor, data: req.body?.data, descricao });
    res.status(201).json(r);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ erro: e.message });
    throw e;
  }
});

// --- Ativos ----------------------------------------------------------------------------------------------------------------
function lerAtivo(corpo, usuarioId, atual) {
  const nome = String(corpo.nome === undefined ? atual?.nome : corpo.nome || '').trim().slice(0, 60);
  if (!nome) return { erro: 'Dê um nome para o ativo.' };
  const tipo = corpo.tipo === undefined ? atual?.tipo : corpo.tipo;
  if (!TIPOS_INVESTIMENTO[tipo]) return { erro: 'Tipo de investimento inválido.' };
  let ticker = corpo.ticker === undefined ? atual?.ticker || null : String(corpo.ticker || '').trim().toUpperCase().slice(0, 20) || null;
  let liquidez = corpo.liquidez === undefined ? atual?.liquidez || liquidezPadrao(tipo) : corpo.liquidez;
  if (!['rapida', 'lenta'].includes(liquidez)) return { erro: 'Liquidez inválida.' };
  // ações, FIIs, ETFs, cripto etc. nunca têm liquidez rápida para metas
  if (!TIPOS_LIQUIDEZ_RAPIDA.includes(tipo)) liquidez = 'lenta';
  let corretora = corpo.corretoraContaId === undefined ? atual?.corretora_conta_id || null : corpo.corretoraContaId || null;
  if (corretora) {
    const c = db.prepare('SELECT tipo FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(corretora), usuarioId);
    if (!c) return { erro: 'Corretora não encontrada.' };
    if (c.tipo !== 'corretora') return { erro: 'A conta escolhida não é do tipo Corretora.' };
  }
  return { dados: { nome, ticker, tipo, liquidez, corretora_conta_id: corretora } };
}

router.post('/ativos', (req, res) => {
  const lida = lerAtivo(req.body || {}, req.usuario.id, null);
  if (lida.erro) return res.status(400).json({ erro: lida.erro });
  const d = lida.dados;
  const chave = (d.ticker || d.nome).toLowerCase();
  const dup = db.prepare('SELECT * FROM ativos WHERE usuario_id = ? AND excluido_em IS NULL').all(req.usuario.id).find((a) => (a.ticker || a.nome).toLowerCase() === chave);
  if (dup) return res.status(409).json({ erro: 'Já existe um ativo com esse ticker/nome.' });
  const a = dados.inserir('ativos', { usuario_id: req.usuario.id, ...d });
  res.status(201).json(a);
});

router.put('/ativos/:id', (req, res) => {
  const atual = ativoDoUsuario(req.params.id, req.usuario.id);
  if (!atual) return res.status(404).json({ erro: 'Ativo não encontrado.' });
  const lida = lerAtivo(req.body || {}, req.usuario.id, atual);
  if (lida.erro) return res.status(400).json({ erro: lida.erro });
  const d = lida.dados;
  if (d.liquidez !== 'rapida') {
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM operacoes WHERE ativo_id = ? AND meta_id IS NOT NULL AND excluido_em IS NULL").get(atual.id);
    if (n > 0) return res.status(400).json({ erro: 'Este ativo já tem lançamentos vinculados a metas. Desvincule-os antes de mudar a liquidez.' });
  }
  res.json(dados.atualizar('ativos', atual.id, d));
});

router.delete('/ativos/:id', (req, res) => {
  const atual = ativoDoUsuario(req.params.id, req.usuario.id);
  if (!atual) return res.status(404).json({ erro: 'Ativo não encontrado.' });
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM operacoes WHERE ativo_id = ? AND excluido_em IS NULL').get(atual.id);
  if (n > 0) return res.status(400).json({ erro: 'Apague as operações do ativo antes de removê-lo.' });
  dados.excluir('ativos', atual.id);
  res.json({ ok: true });
});

// Detalhe do ativo: posição + listas tabulares (compras: Data | Cotas | Preço | Total; proventos: Data | Provento/cota | Total)
router.get('/ativos/:id', (req, res) => {
  const a = ativoDoUsuario(req.params.id, req.usuario.id);
  if (!a) return res.status(404).json({ erro: 'Ativo não encontrado.' });
  const ops = operacoesDe(a.id);
  const contas = Object.fromEntries(db.prepare('SELECT id, nome FROM contas WHERE usuario_id = ? AND excluido_em IS NULL').all(req.usuario.id).map((c) => [c.id, c]));
  const c = consolidarAtivo(ops);
  const nomeMeta = Object.fromEntries(
    db.prepare('SELECT m.id, m.nome FROM metas_reserva m JOIN reserva_liberdade r ON r.id = m.reserva_id WHERE r.usuario_id = ? AND m.excluido_em IS NULL').all(req.usuario.id).map((m) => [m.id, m.nome])
  );
  const rendimentos = ops.filter((o) => o.tipo === 'rendimento').map((o) => ({ id: o.id, data: String(o.data).slice(0, 10), total: o.total, descricao: o.descricao || null })).reverse();
  const mapear = (l) => ({ ...l, data: String(l.data).slice(0, 10), meta_nome: l.meta_id ? nomeMeta[l.meta_id] || null : null });
  res.json({
    ativo: resumoAtivo(a, ops, contas),
    compras: c.compras.map(mapear),
    vendas: c.vendas.map(mapear),
    proventos: c.proventos_lista.map((p) => ({ ...p, data: String(p.data).slice(0, 10) })),
    rendimentos,
    aviso: c.erro,
  });
});

// --- Operações -------------------------------------------------------------------------------------------------------------
// Corpo: { ativoId | {nome, ticker, tipoAtivo, corretoraContaId}, tipo, data, cotas, preco, total, metaId, contaId, descricao, transacaoId }
function lerOperacao(corpo, usuarioId) {
  let ativo = null;
  if (corpo.ativoId) {
    ativo = ativoDoUsuario(corpo.ativoId, usuarioId);
    if (!ativo) return { erro: 'Ativo não encontrado.', status: 404 };
  }
  const tipoPedido = String(corpo.tipo || '');
  if (!TIPOS_OPERACAO.includes(tipoPedido)) return { erro: 'Tipo de operação inválido.' };

  if (!ativo) {
    const tipoAtivo = corpo.tipoAtivo || corpo.tipoInvestimento;
    if (!TIPOS_INVESTIMENTO[tipoAtivo]) return { erro: 'Escolha o tipo de investimento.' };
    if (!String(corpo.nome || corpo.ticker || '').trim()) return { erro: 'Informe o ticker ou nome do ativo.' };
    const lido = lerAtivo({ nome: String(corpo.nome || corpo.ticker).trim(), ticker: corpo.ticker, tipo: tipoAtivo, corretoraContaId: corpo.corretoraContaId, liquidez: corpo.liquidez }, usuarioId, null);
    if (lido.erro) return { erro: lido.erro };
    ativo = { novo: lido.dados };
  }
  const info = ativo.novo || ativo;

  const dia = corpo.data || carteira.hojeStr();
  if (!dataValida(dia)) return { erro: 'Data inválida.' };
  const descricao = String(corpo.descricao || '').trim().slice(0, 200) || null;

  let cotas = num(corpo.cotas ?? corpo.quantidade);
  let preco = num(corpo.preco ?? corpo.precoUnitario);
  let total = num(corpo.total ?? corpo.valor);
  if (cotas !== null && !(cotas > 0)) return { erro: 'Informe cotas maiores que zero.' };
  if (preco !== null && !(preco > 0)) return { erro: 'Informe um preço maior que zero.' };

  let tipo = tipoPedido;
  const entrada = OPERACOES_ENTRADA.includes(tipoPedido);
  const saida = OPERACOES_SAIDA.includes(tipoPedido);
  if (entrada || saida) {
    if (cotas !== null) {
      if (preco === null && total === null) return { erro: 'Informe o preço por cota (ou o total).' };
      if (preco !== null) total = arredondar(cotas * preco);
      else preco = arredondar(total / cotas);
      tipo = entrada ? 'compra' : 'venda';
    } else {
      if (preco !== null) return { erro: 'Informe também as cotas, ou deixe só o valor total.' };
      tipo = entrada ? 'guardar' : 'resgatar';
    }
  } else if (tipoPedido === 'provento') {
    if (preco !== null && cotas === null) cotas = 'auto';
    if (cotas !== null && cotas !== 'auto' && preco !== null) total = arredondar(cotas * preco);
  }
  if (!(total > 0) && !(tipoPedido === 'provento' && preco > 0)) return { erro: 'Informe um valor maior que zero.' };

  let metaId = null;
  if (corpo.metaId) {
    if (!(entrada || saida || tipoPedido === 'rendimento')) return { erro: 'Só guardar, resgatar e rendimento podem ter meta.' };
    const meta = db
      .prepare(`SELECT m.* FROM metas_reserva m JOIN reserva_liberdade r ON r.id = m.reserva_id WHERE m.id = ? AND r.usuario_id = ? AND m.excluido_em IS NULL AND r.excluido_em IS NULL`)
      .get(String(corpo.metaId), usuarioId);
    if (!meta) return { erro: 'Meta não encontrada.' };
    if (info.liquidez !== 'rapida' || !TIPOS_LIQUIDEZ_RAPIDA.includes(info.tipo)) return { erro: MSG_SO_LIQUIDEZ_RAPIDA };
    if (meta.tipo_investimento && meta.tipo_investimento !== info.tipo) return { erro: `Essa meta é só de ${TIPOS_INVESTIMENTO[meta.tipo_investimento]}.` };
    metaId = meta.id;
  }

  // Conta: a da corretora do ativo por padrão (a compra sai da corretora); outra conta só se informada.
  let contaId = corpo.contaId === undefined ? info.corretora_conta_id || null : corpo.contaId || null;
  if (contaId) {
    const c = db.prepare('SELECT id FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(contaId), usuarioId);
    if (!c) return { erro: 'Conta não encontrada.' };
  }
  let transacaoId = null;
  if (corpo.transacaoId) {
    const t = db.prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(corpo.transacaoId), usuarioId);
    if (!t) return { erro: 'Transação do extrato não encontrada.' };
    if (db.prepare('SELECT 1 AS x FROM operacoes WHERE transacao_id = ? AND excluido_em IS NULL').get(t.id)) return { erro: 'Essa transação do extrato já foi conciliada.' };
    transacaoId = t.id;
    contaId = null; // a transferência já tirou o dinheiro da conta: não mexe no saldo de novo
  }
  return { dados: { ativo, tipo, dia, cotas, preco, total: total === null ? null : arredondar(total), metaId, contaId, transacaoId, descricao } };
}

// A operação nova, como linha, para testar a consolidação antes de gravar
const linhaTeste = (o, id = 'novo') => ({ id, tipo: o.tipo, data: o.dia, cotas: o.cotas === 'auto' ? null : o.cotas, preco: o.preco, total: o.total, criado_em: '9' });

function aplicarOperacao(usuarioId, o, ignorarId = null) {
  const reserva = carteira.buscarReserva(usuarioId);
  let ativo = o.ativo.novo ? null : o.ativo;
  if (!ativo) {
    ativo = carteira.acharOuCriarAtivo(usuarioId, { nome: o.ativo.novo.nome, ticker: o.ativo.novo.ticker, tipo: o.ativo.novo.tipo, liquidez: o.ativo.novo.liquidez, corretoraContaId: o.ativo.novo.corretora_conta_id });
  }
  const existentes = operacoesDe(ativo.id).filter((x) => x.id !== ignorarId);

  // Provento: sem cotas informadas, usa as cotas em carteira na data
  if (o.tipo === 'provento') {
    let cotas = o.cotas === 'auto' ? null : o.cotas;
    if (cotas === null && COM_COTAS.includes(ativo.tipo)) cotas = cotasEm(existentes, o.dia) || null;
    if (cotas === null && o.preco !== null && o.total === null) throw erro(400, 'Sem cotas em carteira nessa data: informe o valor total do provento.');
    if (cotas !== null && o.preco !== null) o.total = arredondar(cotas * o.preco);
    else if (cotas !== null && o.total !== null) o.preco = Math.round((o.total / cotas) * 1e6) / 1e6;
    o.cotas = cotas;
  }
  const teste = consolidarAtivo([...existentes, linhaTeste(o)]);
  if (teste.erro && (OPERACOES_SAIDA.includes(o.tipo) || o.dia < (existentes[existentes.length - 1]?.data || ''))) throw erro(400, teste.erro);

  return dados.transacao(() => {
    if (o.transacaoId) carteira.tirarDosTotais(o.transacaoId, 'transferencia_corretora'); // a transferência do extrato não é gasto
    if (OPERACOES_ENTRADA.includes(o.tipo) || OPERACOES_SAIDA.includes(o.tipo)) {
      const saida = OPERACOES_SAIDA.includes(o.tipo);
      const r = carteira.lancarAporte(usuarioId, reserva, {
        ativoId: ativo.id, tipo: ativo.tipo, tipoOp: o.tipo, operacao: saida ? 'resgate' : 'aporte', movimento: saida ? -o.total : o.total,
        ativoNome: ativo.ticker || ativo.nome, quantidade: o.cotas, preco: o.preco, descricao: o.descricao, dia: o.dia,
        contaId: o.contaId, metaId: o.metaId, transacaoId: o.transacaoId, semChecagem: true,
      });
      return r.operacao;
    }
    const op = dados.inserir('operacoes', {
      ativo_id: ativo.id, usuario_id: usuarioId, tipo: o.tipo, data: o.dia, cotas: o.cotas, preco: o.preco, total: o.total,
      meta_id: o.metaId, conta_id: o.contaId, transacao_id: o.transacaoId, descricao: o.descricao,
    });
    carteira.ajustarConta(o.contaId, o.total); // provento/rendimento cai na conta (corretora)
    return op;
  });
}

// Desfaz os efeitos de uma operação (saldo da conta, valor da reserva, lançamento da meta) e a exclui.
function desfazerOperacao(op) {
  dados.transacao(() => {
    if (op.aporte_id) {
      const ap = dados.buscar('historico_aportes', op.aporte_id);
      if (ap && !ap.excluido_em) {
        if (!op.transacao_id) carteira.ajustarConta(ap.conta_id, ap.valor);
        const r = dados.buscar('reserva_liberdade', ap.reserva_id);
        if (r) dados.atualizar('reserva_liberdade', r.id, { valor_atual: arredondar(r.valor_atual - ap.valor) });
        dados.excluir('historico_aportes', ap.id);
      }
    } else if (op.tipo === 'provento' || op.tipo === 'rendimento') {
      carteira.ajustarConta(op.conta_id, -op.total);
    }
    dados.excluir('operacoes', op.id);
  });
}

function buscarOperacao(id, usuarioId) {
  return db.prepare('SELECT * FROM operacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(id), usuarioId);
}

router.post('/operacoes', (req, res) => {
  const lida = lerOperacao(req.body || {}, req.usuario.id);
  if (lida.erro) return res.status(lida.status || 400).json({ erro: lida.erro });
  try {
    const op = aplicarOperacao(req.usuario.id, lida.dados);
    const resp = montarLista(req.usuario.id);
    const conta = lida.dados.contaId ? db.prepare('SELECT nome, saldo, origem FROM contas WHERE id = ?').get(lida.dados.contaId) : null;
    const aviso = conta && conta.origem === 'manual' && conta.saldo < 0 && (OPERACOES_ENTRADA.includes(lida.dados.tipo)) ? `O saldo de ${conta.nome} ficou negativo: registre a transferência do banco para a corretora.` : null;
    res.status(201).json({ operacao: op, aviso, ...resp });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ erro: e.message });
    throw e;
  }
});

router.put('/operacoes/:id', (req, res) => {
  const antiga = buscarOperacao(req.params.id, req.usuario.id);
  if (!antiga || !antiga.ativo_id) return res.status(404).json({ erro: 'Operação não encontrada.' });
  const corpo = { ativoId: antiga.ativo_id, ...(req.body || {}) };
  corpo.ativoId = antiga.ativo_id;
  const lida = lerOperacao(corpo, req.usuario.id);
  if (lida.erro) return res.status(lida.status || 400).json({ erro: lida.erro });
  try {
    dados.transacao(() => {
      desfazerOperacao(antiga);
      aplicarOperacao(req.usuario.id, lida.dados, antiga.id);
    });
    res.json(montarLista(req.usuario.id));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ erro: e.message });
    throw e;
  }
});

router.delete('/operacoes/:id', (req, res) => {
  const op = buscarOperacao(req.params.id, req.usuario.id);
  if (!op) return res.status(404).json({ erro: 'Operação não encontrada.' });
  if (!op.ativo_id) return res.status(400).json({ erro: 'Esta operação é um movimento do extrato; apague a transação em Transações.' });
  const restantes = operacoesDe(op.ativo_id).filter((x) => x.id !== op.id);
  const teste = consolidarAtivo(restantes);
  if (teste.erro && (OPERACOES_ENTRADA.includes(op.tipo))) return res.status(400).json({ erro: `Não dá para apagar: ${teste.erro}` });
  desfazerOperacao(op);
  res.json(montarLista(req.usuario.id));
});

module.exports = router;
