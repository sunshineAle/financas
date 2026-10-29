const express = require('express');
const db = require('../db');
const dados = require('../dados');
const { exigirAutenticacao } = require('../middleware/auth');
const faturas = require('../utils/faturas');
const util = require('../utils/dividas');

const router = express.Router();
router.use(exigirAutenticacao);

const URGENCIAS_VALIDAS = ['vermelho', 'amarelo', 'verde'];
const TIPOS_VALIDOS = ['negativada', 'acordo', 'crediario', 'carne', 'emprestimo', 'financiamento', 'outra'];
const ORIGENS_VALIDAS = util.ORIGENS;
const SITUACOES_ESCOLHA = ['em_dia', 'atrasada', 'negativada', 'em_acordo']; // "quitada" só por pagamento
const r2 = util.r2;

// Acrescenta o que é calculado: risco automático (e a urgência que o Dashboard lê), aba, parcelas restantes e
// os juros implícitos do acordo. A coluna `urgencia` acompanha o risco (só grava quando muda).
function enriquecer(d) {
  const risco = util.riscoDivida(d);
  if (d.urgencia !== risco.urgencia) {
    dados.atualizar('dividas', d.id, { urgencia: risco.urgencia });
    d.urgencia = risco.urgencia;
  }
  d.risco = { pontos: risco.pontos, nivel: risco.nivel, motivos: risco.motivos, diasAtraso: risco.diasAtraso };
  d.vencida = risco.vencida;
  // Origem (de onde veio) e situação (como está) são campos separados; a aba da página é a situação.
  d.origem = util.derivarOrigem(d);
  d.situacao = util.situacaoEfetiva(d);
  d.origem_rotulo = util.ROTULO_ORIGEM[d.origem];
  d.situacao_rotulo = util.ROTULO_SITUACAO[d.situacao];
  d.aba = util.abaDa(d);
  // "Total pago" = só o que saiu do bolso (pagamentos + entrada). "Total do acordo" = entrada + parcelas (em d.acordo).
  d.total_pago = r2((d.historico_pagamentos || []).filter((h) => (h.tipo || 'pagamento') === 'pagamento' || h.tipo === 'entrada').reduce((t, h) => t + (Number(h.valor) || 0), 0));
  d.parcelas_restantes = util.parcelasRestantes(d);
  d.acordo = null;
  if (d.parcelas_total && d.valor_parcela) {
    d.acordo = util.simularAcordo({ valorBase: d.valor_base || (d.saldo_original + (d.desconto || 0)), desconto: d.desconto, entrada: d.entrada, parcelas: d.parcelas_total, valorParcela: d.valor_parcela });
  }
  return d;
}

// Origem/situação vindas do corpo (ou do `tipo` antigo, por compatibilidade). Devolve { origem, situacao } ou { erro }.
function origemSituacao(b, atual = null) {
  let origem = b.origem, situacao = b.situacao;
  if (origem !== undefined && origem !== null && origem !== '' && !ORIGENS_VALIDAS.includes(origem)) return { erro: 'Origem da dívida inválida.' };
  if (situacao !== undefined && situacao !== null && situacao !== '' && !SITUACOES_ESCOLHA.includes(situacao)) return { erro: 'Situação da dívida inválida.' };
  if (!origem && b.tipo) origem = util.derivarOrigem({ tipo: b.tipo });
  if (!situacao && b.tipo === 'acordo') situacao = 'em_acordo';
  if (!situacao && b.tipo === 'negativada') situacao = 'negativada';
  if (!situacao && b.negativada) situacao = 'negativada';
  return { origem: origem || (atual ? util.derivarOrigem(atual) : 'outra'), situacao: situacao || (atual ? (atual.situacao && atual.situacao !== 'quitada' ? atual.situacao : util.derivarSituacao(atual)) : 'em_dia') };
}

function numeroOuNulo(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const dataValida = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);

// Pagamentos com o "como foi pago": quando vieram de uma transação, trazem conta, categoria e subcategoria dela
const SELECT_PAGAMENTOS = `
  SELECT h.*, t.descricao AS tx_descricao, t.subcategoria AS tx_subcategoria, c.nome AS tx_conta, cat.nome AS tx_categoria
  FROM historico_pagamentos h
  LEFT JOIN transacoes t ON t.id = h.transacao_id AND t.excluido_em IS NULL
  LEFT JOIN contas c ON c.id = t.conta_id AND c.excluido_em IS NULL
  LEFT JOIN categorias_orcamento cat ON cat.id = t.categoria_id AND cat.excluido_em IS NULL`;

// Banco/conta vinculado: só aceita conta do próprio usuário
function contaDoUsuario(contaId, usuarioId) {
  if (contaId === undefined || contaId === null || contaId === '') return null;
  const c = db.prepare('SELECT id FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(contaId), usuarioId);
  return c ? c.id : null;
}

function buscarComHistorico(id, usuarioId) {
  const divida = db
    .prepare('SELECT dividas.*, ct.nome AS conta_nome, ct.icone AS conta_icone FROM dividas LEFT JOIN contas ct ON ct.id = dividas.conta_id AND ct.excluido_em IS NULL WHERE dividas.id = ? AND dividas.usuario_id = ? AND dividas.excluido_em IS NULL')
    .get(id, usuarioId);
  if (!divida) return null;

  divida.historico_pagamentos = db
    .prepare(`${SELECT_PAGAMENTOS} WHERE h.divida_id = ? AND h.excluido_em IS NULL ORDER BY date(h.data) DESC, h.criado_em DESC, h.rowid DESC`)
    .all(id);
  return enriquecer(divida);
}

// Ordena por urgência (vermelho > amarelo > verde) e, dentro da mesma
// urgência, pela maior taxa de juros primeiro — a lógica de "avalanche"
// que o roteiro pede, combinada com a prioridade de risco de negativação
// já usada no Dashboard.
router.get('/', (req, res) => {
  const dividas = db
    .prepare(
      `SELECT dividas.*, ct.nome AS conta_nome, ct.icone AS conta_icone FROM dividas LEFT JOIN contas ct ON ct.id = dividas.conta_id AND ct.excluido_em IS NULL WHERE dividas.usuario_id = ? AND dividas.excluido_em IS NULL AND dividas.arquivada = ?
       ORDER BY
         dividas.taxa_juros IS NULL, dividas.taxa_juros DESC`
    )
    .all(req.usuario.id, req.query.arquivadas === '1' ? 1 : 0);

  const ids = dividas.map((d) => d.id);
  const historicos = ids.length
    ? db
        .prepare(
          `${SELECT_PAGAMENTOS} WHERE h.divida_id IN (${ids.map(() => '?').join(',')}) AND h.excluido_em IS NULL ORDER BY date(h.data) DESC, h.criado_em DESC, h.rowid DESC`
        )
        .all(...ids)
    : [];

  const porDivida = {};
  historicos.forEach((h) => {
    (porDivida[h.divida_id] ||= []).push(h);
  });
  dividas.forEach((d) => {
    d.historico_pagamentos = porDivida[d.id] || [];
    enriquecer(d);
  });

  // Maior risco primeiro (quitadas no fim); empate: maior taxa de juros (avalanche), depois maior saldo.
  dividas.sort((a, b) => (b.saldo > 0) - (a.saldo > 0) || b.risco.pontos - a.risco.pontos || (b.taxa_juros || 0) - (a.taxa_juros || 0) || b.saldo - a.saldo);

  res.json(dividas);
});

// Resumo para o topo da página: Total devido = saldo restante de todas as dívidas (faturas dos cartões o front soma)
// e "a pagar este mês" = parcelas que vencem até o fim do mês (inclui as atrasadas). Arquivadas e quitadas ficam fora.
router.get('/resumo', (req, res) => {
  const hoje = util.hojeISO();
  const fimMes = util.somarMeses(hoje.slice(0, 8) + '01', 1);
  const linhas = db.prepare('SELECT * FROM dividas WHERE usuario_id = ? AND arquivada = 0 AND excluido_em IS NULL').all(req.usuario.id);
  const r = { totalDividas: 0, porSituacao: { em_dia: 0, atrasada: 0, negativada: 0, em_acordo: 0 }, parcelasMes: 0, parcelas: [] };
  linhas.forEach((d) => {
    const sit = util.situacaoEfetiva(d, hoje);
    if (sit === 'quitada') return;
    r.totalDividas += d.saldo;
    r.porSituacao[sit] = r2((r.porSituacao[sit] || 0) + d.saldo);
    const p = Number(d.valor_parcela) || 0;
    if (p > 0 && d.proximo_vencimento && d.proximo_vencimento < fimMes) {
      const v = Math.min(p, d.saldo);
      r.parcelasMes += v;
      r.parcelas.push({ id: d.id, nome: d.nome, valor: r2(v), vencimento: d.proximo_vencimento });
    }
  });
  r.totalDividas = r2(r.totalDividas);
  r.parcelasMes = r2(r.parcelasMes);
  res.json(r);
});

// Plano para TODAS as dívidas: avalanche (maior juros primeiro) × bola de neve (menor saldo primeiro), com a ordem,
// o valor e os juros de cada dívida. `mensal` = quanto dá para pagar por mês (padrão: soma das parcelas).
// --- Juros mais caros (anotação 60.5) -------------------------------------------
// Cheque especial (contas com saldo negativo) e rotativo do cartão (fatura vencida sem pagamento, ou fatura paga em
// parte e parcelada) costumam ter os juros mais altos do mercado. Sem taxa informada, usa a referência enviada pela
// tela (média do Bacen) ou um padrão conservador: cheque especial 8% a.m. (teto legal) e rotativo 15% a.m.
const TAXA_CHEQUE_PADRAO = 8;
const TAXA_ROTATIVO_PADRAO = 15;
const FRASE_CARO = {
  cheque: 'Cheque especial cobra juros altos todo dia em que a conta fica negativa.',
  rotativo: 'Fatura não paga inteira vai para o rotativo, um dos juros mais caros do Brasil.',
};
function taxaRef(v, padrao) { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 100 ? r2(n) : padrao; }

function jurosMaisCaros(usuarioId, ref = {}) {
  const taxaCheque = taxaRef(ref.cheque, TAXA_CHEQUE_PADRAO);
  const taxaRotativo = taxaRef(ref.rotativo, TAXA_ROTATIVO_PADRAO);
  const caros = [];
  db.prepare("SELECT id, nome, saldo FROM contas WHERE usuario_id = ? AND excluido_em IS NULL AND saldo < 0 AND COALESCE(tipo, 'corrente') NOT IN ('investimento', 'corretora', 'cartao')")
    .all(usuarioId).forEach((c) => {
      caros.push({ id: `cheque:${c.id}`, tipo: 'cheque', rotulo: 'Cheque especial', nome: `Cheque especial · ${c.nome}`, contaId: c.id,
        saldo: r2(-c.saldo), taxa: taxaCheque, taxaEstimada: true, frase: FRASE_CARO.cheque });
    });
  let vencidas = [];
  try { vencidas = require('./cartoes').faturasVencidas(usuarioId); } catch { vencidas = []; }
  vencidas.forEach((f) => {
    const [a, m] = f.chave.split('-');
    caros.push({ id: `rotativo:${f.cartaoId}:${f.chave}`, tipo: 'rotativo', rotulo: 'Rotativo do cartão', nome: `Fatura ${f.cartao} ${m}/${a} vencida`, cartaoId: f.cartaoId,
      saldo: f.total, taxa: f.taxaJuros > 0 ? f.taxaJuros : taxaRotativo, taxaEstimada: !(f.taxaJuros > 0), frase: FRASE_CARO.rotativo });
  });
  // Fatura paga em parte e parcelada: virou dívida (faturas_pagas.divida_id). Sem taxa cadastrada, usa a do rotativo.
  const dividasDeFatura = new Set(db.prepare('SELECT divida_id FROM faturas_pagas WHERE divida_id IS NOT NULL AND excluido_em IS NULL').all().map((l) => l.divida_id));
  return { caros, dividasDeFatura, taxaRotativo };
}

router.get('/caros', (req, res) => {
  const { caros, dividasDeFatura, taxaRotativo } = jurosMaisCaros(req.usuario.id, req.query || {});
  db.prepare('SELECT * FROM dividas WHERE usuario_id = ? AND arquivada = 0 AND excluido_em IS NULL AND saldo > 0').all(req.usuario.id)
    .filter((d) => dividasDeFatura.has(d.id) && util.situacaoEfetiva(d) !== 'quitada')
    .forEach((d) => caros.push({ id: d.id, tipo: 'rotativo', rotulo: 'Fatura parcelada', nome: d.nome, saldo: r2(d.saldo),
      taxa: Number(d.taxa_juros) > 0 ? Number(d.taxa_juros) : taxaRotativo, taxaEstimada: !(Number(d.taxa_juros) > 0), frase: FRASE_CARO.rotativo }));
  caros.sort((a, b) => b.taxa - a.taxa || b.saldo - a.saldo);
  res.json(caros);
});

router.post('/plano', (req, res) => {
  const { caros, dividasDeFatura, taxaRotativo } = jurosMaisCaros(req.usuario.id, req.body?.taxasReferencia || {});
  const marcas = new Map();
  const linhas = db.prepare('SELECT * FROM dividas WHERE usuario_id = ? AND arquivada = 0 AND excluido_em IS NULL AND saldo > 0').all(req.usuario.id)
    .filter((d) => util.situacaoEfetiva(d) !== 'quitada')
    .map((d) => {
      if (!dividasDeFatura.has(d.id)) return d;
      const estimada = !(Number(d.taxa_juros) > 0);
      marcas.set(d.id, { tipo: 'rotativo', rotulo: 'Fatura parcelada', taxaEstimada: estimada, frase: FRASE_CARO.rotativo });
      return estimada ? { ...d, taxa_juros: taxaRotativo } : d;
    });
  // Cheque especial e fatura vencida entram no plano como "dívidas" sem parcela fixa: mínimo = juros do mês + 10% do saldo.
  caros.forEach((c) => {
    marcas.set(c.id, { tipo: c.tipo, rotulo: c.rotulo, taxaEstimada: c.taxaEstimada, frase: c.frase });
    linhas.push({ id: c.id, nome: c.nome, saldo: c.saldo, taxa_juros: c.taxa, valor_parcela: r2(c.saldo * (c.taxa / 100 + 0.1)) });
  });
  const mensal = numeroOuNulo(req.body?.mensal);
  // Avalanche continua ordenando SÓ pela taxa (o selo apenas destaca; não fura a fila).
  const marcar = (p) => {
    if (p && p.ordem) p.ordem = p.ordem.map((o) => (marcas.has(o.id) ? { ...o, caro: marcas.get(o.id) } : o));
    return p;
  };
  const avalanche = marcar(util.planoGeral(linhas, mensal, 'avalanche'));
  const bolaDeNeve = marcar(util.planoGeral(linhas, mensal, 'neve'));
  res.json({ avalanche, bolaDeNeve, dividas: linhas.length, caros: caros.length + [...marcas.values()].filter((m) => m.rotulo === 'Fatura parcelada').length, mensalUsado: avalanche?.orcamento ?? null });
});

// Simulação de acordo (não grava nada): juros implícitos por acordo. Com `dividaId`, usa a dívida escolhida como base
// (valor base = valor_base ou saldo atual) e compara com seguir pagando como está.
router.post('/simular', (req, res) => {
  const b = req.body || {};
  let divida = null;
  if (b.dividaId) {
    divida = db.prepare('SELECT * FROM dividas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(b.dividaId), req.usuario.id);
    if (!divida) return res.status(404).json({ erro: 'Dívida não encontrada.' });
  }
  const valorBase = numeroOuNulo(b.valorBase) ?? (divida ? divida.valor_base || divida.saldo : null);
  if (!(valorBase > 0)) return res.status(400).json({ erro: 'Informe o valor da dívida (à vista) para simular.' });
  const parcelas = Math.round(Number(b.parcelas) || 0);
  // Sem valor de parcela digitado, calcula: (dívida − desconto − entrada) ÷ parcelas
  const parcelaAuto = util.parcelaDoAcordo({ valorBase, desconto: b.desconto, entrada: b.entrada, parcelas });
  const valorParcela = Number(b.valorParcela) > 0 ? Number(b.valorParcela) : parcelaAuto;
  if (parcelas < 1 || !(valorParcela > 0)) return res.status(400).json({ erro: 'Informe o número de parcelas (e confira desconto e entrada).' });
  const sim = util.simularAcordo({ valorBase, desconto: b.desconto, entrada: b.entrada, parcelas, valorParcela });
  sim.parcelaAutomatica = parcelaAuto;
  sim.parcelaEditada = Number(b.valorParcela) > 0 && Math.abs(Number(b.valorParcela) - parcelaAuto) > 0.005;
  if (divida) {
    const mensal = Number(b.pagamentoMensal) || divida.valor_parcela || 0;
    sim.dividaId = divida.id;
    sim.atual = { saldo: divida.saldo, taxaMensal: divida.taxa_juros, ...(mensal ? util.mesesParaQuitar(divida.saldo, mensal, divida.taxa_juros) : {}), pagamentoMensal: mensal || null };
  }
  res.json(sim);
});

router.post('/', (req, res) => {
  const b = req.body || {};
  const { nome, taxaJuros, urgencia } = b;

  if (!nome || !String(nome).trim()) {
    return res.status(400).json({ erro: 'Informe um nome para a dívida.' });
  }
  const parcelas = b.parcelas === undefined || b.parcelas === '' || b.parcelas === null ? null : Math.round(Number(b.parcelas));
  let valorParcela = numeroOuNulo(b.valorParcela);
  const entrada = Math.max(0, numeroOuNulo(b.entrada) || 0);
  const desconto = Math.max(0, numeroOuNulo(b.desconto) || 0);
  const valorBase = numeroOuNulo(b.valorBase);
  if (parcelas !== null && !(parcelas >= 1)) {
    return res.status(400).json({ erro: 'Informe parcelas maiores que zero.' });
  }
  // Parcela automática: (dívida − desconto − entrada) ÷ parcelas, quando o valor da parcela não foi digitado.
  if (parcelas && !(valorParcela > 0) && valorBase > 0) valorParcela = util.parcelaDoAcordo({ valorBase, desconto, entrada, parcelas }) || null;
  if (valorParcela !== null && !(valorParcela > 0)) {
    return res.status(400).json({ erro: 'Informe o valor da parcela maior que zero.' });
  }
  const temPlano = !!(parcelas && valorParcela);
  let saldoNumero = Number(b.saldo);
  if ((!saldoNumero || saldoNumero <= 0) && temPlano) saldoNumero = r2(parcelas * valorParcela);
  if (!saldoNumero || saldoNumero <= 0) {
    return res.status(400).json({ erro: 'Informe um saldo devedor maior que zero.' });
  }
  if (urgencia && !URGENCIAS_VALIDAS.includes(urgencia)) {
    return res.status(400).json({ erro: 'Urgência inválida.' });
  }
  if (b.tipo && !TIPOS_VALIDOS.includes(b.tipo)) {
    return res.status(400).json({ erro: 'Tipo de dívida inválido.' });
  }
  const os = origemSituacao(b);
  if (os.erro) return res.status(400).json({ erro: os.erro });
  const { origem, situacao } = os;
  let taxa = taxaJuros === undefined || taxaJuros === '' || taxaJuros === null ? null : Number(taxaJuros);
  if (taxa === null && temPlano && valorBase > 0) {
    const sim = util.simularAcordo({ valorBase, desconto, entrada, parcelas, valorParcela });
    taxa = sim.taxaMensal;
  }

  const nova = dados.transacao(() => {
    const criada = dados.inserir('dividas', {
      usuario_id: req.usuario.id,
      nome: String(nome).trim(),
      saldo_original: r2(saldoNumero + entrada),
      saldo: saldoNumero,
      taxa_juros: taxa,
      urgencia: 'amarelo',
      urgencia_base: urgencia || null,
      conta_id: contaDoUsuario(b.contaId, req.usuario.id),
      tipo: util.tipoLegado(origem, situacao),
      origem,
      situacao,
      credor: b.credor ? String(b.credor).trim() || null : null,
      negativada: situacao === 'negativada' || (situacao === 'em_acordo' && b.negativada) ? 1 : 0,
      valor_base: valorBase,
      desconto,
      entrada,
      parcelas_total: temPlano ? parcelas : null,
      valor_parcela: valorParcela,
      proximo_vencimento: dataValida(b.proximoVencimento),
      encargos_pct: numeroOuNulo(b.encargosPct) ?? 5,
    });
    const hoje = util.hojeISO();
    if (entrada > 0) dados.inserir('historico_pagamentos', { divida_id: criada.id, valor: entrada, data: hoje, tipo: 'entrada', observacao: 'Entrada do acordo' });
    if (temPlano && situacao === 'em_acordo') {
      dados.inserir('historico_pagamentos', { divida_id: criada.id, valor: 0, data: hoje, tipo: 'acordo', observacao: `Acordo: ${parcelas}x de ${valorParcela.toFixed(2).replace('.', ',')}${entrada > 0 ? ` + entrada de ${entrada.toFixed(2).replace('.', ',')}` : ''}` });
    }
    return criada;
  });

  res.status(201).json(buscarComHistorico(nova.id, req.usuario.id));
});

router.put('/:id', (req, res) => {
  const divida = db
    .prepare('SELECT * FROM dividas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(req.params.id, req.usuario.id);
  if (!divida) return res.status(404).json({ erro: 'Dívida não encontrada.' });

  const b = req.body || {};
  const { nome, taxaJuros, urgencia, arquivada } = b;
  if (urgencia && urgencia !== 'auto' && !URGENCIAS_VALIDAS.includes(urgencia)) {
    return res.status(400).json({ erro: 'Urgência inválida.' });
  }
  if (b.tipo && !TIPOS_VALIDOS.includes(b.tipo)) {
    return res.status(400).json({ erro: 'Tipo de dívida inválido.' });
  }
  const mudouOS = b.origem !== undefined || b.situacao !== undefined || b.tipo !== undefined;
  const os = mudouOS ? origemSituacao(b, divida) : { origem: util.derivarOrigem(divida), situacao: divida.situacao };
  if (os.erro) return res.status(400).json({ erro: os.erro });
  const quitada = divida.status === 'quitada' || !(divida.saldo > 0);
  const situacao = quitada ? 'quitada' : os.situacao;
  const extras = mudouOS && !quitada
    ? { origem: os.origem, situacao, tipo: util.tipoLegado(os.origem, situacao), negativada: situacao === 'negativada' ? 1 : situacao === 'em_acordo' ? (b.negativada === undefined ? divida.negativada : b.negativada ? 1 : 0) : 0, ...(situacao !== 'negativada' && divida.status === 'quebrada' ? { status: 'ativa', quebrado_em: null } : {}) }
    : { ...(b.negativada === undefined ? {} : { negativada: b.negativada ? 1 : 0 }), origem: util.derivarOrigem(divida), situacao: divida.situacao || util.derivarSituacao(divida) };

  dados.atualizar('dividas', divida.id, {
    ...extras,
    nome: (nome ?? divida.nome).trim() || divida.nome,
    taxa_juros: taxaJuros === undefined ? divida.taxa_juros : taxaJuros === '' ? null : Number(taxaJuros),
    // `urgencia` escolhida à mão vira piso do risco; ''/'auto' volta para o cálculo automático.
    urgencia_base: urgencia === undefined ? divida.urgencia_base : urgencia === '' || urgencia === 'auto' ? null : urgencia,
    arquivada: arquivada === undefined ? divida.arquivada : arquivada ? 1 : 0,
    conta_id: b.contaId === undefined ? divida.conta_id : contaDoUsuario(b.contaId, req.usuario.id),
    credor: b.credor === undefined ? divida.credor : String(b.credor || '').trim() || null,
    encargos_pct: b.encargosPct === undefined ? divida.encargos_pct : numeroOuNulo(b.encargosPct) ?? divida.encargos_pct,
    proximo_vencimento: b.proximoVencimento === undefined ? divida.proximo_vencimento : dataValida(b.proximoVencimento),
    valor_parcela: b.valorParcela === undefined ? divida.valor_parcela : numeroOuNulo(b.valorParcela),
  });

  res.json(buscarComHistorico(divida.id, req.usuario.id));
});

router.delete('/:id', (req, res) => {
  const divida = db
    .prepare('SELECT * FROM dividas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(req.params.id, req.usuario.id);
  if (!divida) return res.status(404).json({ erro: 'Dívida não encontrada.' });

  dados.excluir('dividas', divida.id);
  res.json({ ok: true });
});

// Registrar pagamento: abate do saldo e guarda no histórico. A "simulação"
// de quitação (quantos meses faltam a um dado ritmo) é só aritmética sobre
// o saldo atual — fica no frontend, sem precisar de endpoint próprio.
// --- Pagamentos reconhecidos nas transações -------------------------------
const PALAVRAS_COMUNS = new Set(['fatura', 'cartao', 'em', 'atraso', 'de', 'do', 'da', 'dos', 'das', 'divida', 'parcela', 'parcelas', 'pagamento', 'pgto', 'no', 'na', 'e', 'o', 'a', 'conta']);
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function palavrasChave(nome) {
  return semAcento(nome).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !PALAVRAS_COMUNS.has(p));
}
// Saídas (do Open Finance ou manuais) que parecem pagamento desta dívida e ainda não foram abatidas:
// - a descrição cita uma palavra do nome da dívida (em qualquer conta); ou
// - a dívida tem banco vinculado e a descrição cita o banco junto de uma palavra de pagamento
//   (fatura, parcela, boleto…), como "Pagamento fatura Nubank" saindo de outra conta.
// As que saíram da própria conta vinculada vêm marcadas (no_banco) e primeiro na lista.
const PALAVRAS_PAGAMENTO = ['fatura', 'parcela', 'boleto', 'pagamento', 'pgto', 'financiamento', 'emprestimo', 'quitacao'];
function pagamentosReconhecidos(divida, usuarioId) {
  const chaves = palavrasChave(divida.nome);
  const conta = divida.conta_id ? db.prepare('SELECT nome FROM contas WHERE id = ? AND excluido_em IS NULL').get(divida.conta_id) : null;
  const chavesBanco = conta ? palavrasChave(conta.nome) : [];
  if (!chaves.length && !chavesBanco.length) return [];
  const linhas = db
    .prepare(
      `SELECT t.id, t.data, t.descricao, -t.valor AS valor, t.conta_id, c.nome AS conta_nome
       FROM transacoes t JOIN contas c ON c.id = t.conta_id AND c.excluido_em IS NULL
       WHERE t.usuario_id = ? AND t.valor < 0 AND t.ignorada = 0 AND t.excluido_em IS NULL
         AND t.id NOT IN (SELECT transacao_id FROM historico_pagamentos WHERE transacao_id IS NOT NULL AND excluido_em IS NULL)
       ORDER BY t.data DESC, t.criado_em DESC, t.rowid DESC`
    )
    .all(usuarioId);
  const achadas = linhas.filter((l) => {
    const d = semAcento(l.descricao);
    if (chaves.some((k) => d.includes(k))) return true;
    return chavesBanco.some((k) => d.includes(k)) && PALAVRAS_PAGAMENTO.some((k) => d.includes(k));
  });
  const marcadas = achadas.map((l) => ({ ...l, no_banco: !!divida.conta_id && l.conta_id === divida.conta_id }));
  return [...marcadas.filter((l) => l.no_banco), ...marcadas.filter((l) => !l.no_banco)];
}

// Simular quitação dentro de uma dívida: meses, juros, data final e mini-tabela mês a mês (juros próprios da dívida/acordo).
router.get('/:id/simulacao', (req, res) => {
  const divida = db.prepare('SELECT * FROM dividas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(req.params.id, req.usuario.id);
  if (!divida) return res.status(404).json({ erro: 'Dívida não encontrada.' });
  res.json(util.planoQuitacao(divida, numeroOuNulo(req.query.mensal)));
});

router.get('/:id/pagamentos-reconhecidos', (req, res) => {
  const divida = db.prepare('SELECT * FROM dividas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(req.params.id, req.usuario.id);
  if (!divida) return res.status(404).json({ erro: 'Dívida não encontrada.' });
  res.json(pagamentosReconhecidos(divida, req.usuario.id));
});

router.post('/:id/pagamentos', (req, res) => {
  const divida = db
    .prepare('SELECT * FROM dividas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(req.params.id, req.usuario.id);
  if (!divida) return res.status(404).json({ erro: 'Dívida não encontrada.' });

  // Pagamento vindo de uma transação: usa o valor e a data dela, uma única vez
  let transacao = null;
  if (req.body?.transacaoId !== undefined && req.body?.transacaoId !== null) {
    transacao = db
      .prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND valor < 0 AND excluido_em IS NULL')
      .get(String(req.body.transacaoId), req.usuario.id);
    if (!transacao) return res.status(404).json({ erro: 'Transação de saída não encontrada.' });
    const jaUsada = db.prepare('SELECT id FROM historico_pagamentos WHERE transacao_id = ? AND excluido_em IS NULL').get(transacao.id);
    if (jaUsada) return res.status(409).json({ erro: 'Essa transação já foi abatida de uma dívida.' });
  }

  const valor = transacao ? r2(-transacao.valor) : r2(Number(req.body?.valor));
  if (!valor || valor <= 0) {
    return res.status(400).json({ erro: 'Informe um valor de pagamento maior que zero.' });
  }

  // Desconto por antecipação: o valor pago QUITA a parcela cheia (quitaParcela) mas é menor que ela;
  // a diferença é a economia, abatida do saldo junto com o valor pago.
  const parcela = Number(divida.valor_parcela) || 0;
  const quita = !!req.body?.quitaParcela;
  const desconto = quita && parcela > 0 && valor < parcela - 0.004 ? r2(parcela - valor) : 0;
  const abatido = r2(valor + desconto);
  const novoSaldo = Math.max(0, r2(divida.saldo - abatido));
  const data = transacao ? String(transacao.data).slice(0, 10) : dataValida(req.body?.data);

  dados.transacao(() => {
    const campos = { saldo: novoSaldo };
    if (divida.parcelas_total && parcela > 0) {
      const pagas = Math.max(divida.parcelas_pagas || 0, divida.parcelas_total - util.parcelasRestantes({ saldo: novoSaldo, valor_parcela: parcela }));
      campos.parcelas_pagas = Math.min(divida.parcelas_total, pagas);
      const avancou = campos.parcelas_pagas - (divida.parcelas_pagas || 0);
      if (avancou > 0 && divida.proximo_vencimento) {
        campos.proximo_vencimento = novoSaldo > 0 ? util.somarMeses(divida.proximo_vencimento, avancou) : divida.proximo_vencimento;
      }
    }
    if (novoSaldo <= 0) { campos.status = 'quitada'; campos.situacao = 'quitada'; }
    dados.atualizar('dividas', divida.id, campos);
    const linha = {
      divida_id: divida.id,
      valor,
      tipo: 'pagamento',
      desconto_antecipacao: desconto,
      valor_parcela: quita && parcela > 0 ? parcela : null,
      observacao: req.body?.observacao ? String(req.body.observacao).slice(0, 200) : null,
    };
    if (data) linha.data = data;
    if (transacao) linha.transacao_id = transacao.id;
    dados.inserir('historico_pagamentos', linha);
  });

  const resposta = buscarComHistorico(divida.id, req.usuario.id);
  resposta.desconto_aplicado = desconto;
  res.status(201).json(resposta);
});

// Aplicar um acordo (renegociação) a uma dívida existente: define parcelas, valor da parcela, entrada e desconto,
// recalcula o saldo (parcelas x valor) e os juros implícitos. A dívida passa à situação "em acordo" (reativa um acordo quebrado).
// Sem `valorParcela`, a parcela é calculada: (dívida − desconto − entrada) ÷ parcelas.
router.post('/:id/acordo', (req, res) => {
  const divida = db.prepare('SELECT * FROM dividas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(req.params.id, req.usuario.id);
  if (!divida) return res.status(404).json({ erro: 'Dívida não encontrada.' });
  const b = req.body || {};
  const parcelas = Math.round(Number(b.parcelas) || 0);
  const entrada = Math.max(0, numeroOuNulo(b.entrada) || 0);
  const desconto = Math.max(0, numeroOuNulo(b.desconto) || 0);
  const valorBase = numeroOuNulo(b.valorBase) ?? (divida.valor_base || divida.saldo);
  const valorParcela = Number(b.valorParcela) > 0 ? Number(b.valorParcela) : util.parcelaDoAcordo({ valorBase, desconto, entrada, parcelas });
  if (parcelas < 1 || !(valorParcela > 0)) return res.status(400).json({ erro: 'Informe o número de parcelas (e confira desconto e entrada).' });
  const sim = util.simularAcordo({ valorBase, desconto, entrada, parcelas, valorParcela });
  const saldo = r2(parcelas * valorParcela);
  const hoje = util.hojeISO();

  dados.transacao(() => {
    dados.atualizar('dividas', divida.id, {
      tipo: 'acordo',
      situacao: 'em_acordo',
      status: 'ativa',
      valor_base: valorBase,
      desconto,
      entrada,
      parcelas_total: parcelas,
      parcelas_pagas: 0,
      valor_parcela: valorParcela,
      saldo,
      saldo_original: r2(saldo + entrada),
      taxa_juros: sim.taxaMensal,
      proximo_vencimento: dataValida(b.proximoVencimento) || divida.proximo_vencimento,
      quebrado_em: null,
      negativada: divida.situacao === 'negativada' || divida.negativada ? 1 : 0,
    });
    if (entrada > 0) dados.inserir('historico_pagamentos', { divida_id: divida.id, valor: entrada, data: hoje, tipo: 'entrada', observacao: 'Entrada do acordo' });
    dados.inserir('historico_pagamentos', { divida_id: divida.id, valor: 0, data: hoje, tipo: 'acordo', observacao: `Acordo aplicado: ${parcelas}x de ${valorParcela.toFixed(2).replace('.', ',')}${sim.taxaMensal != null ? ` · juros implícitos de ${sim.taxaMensal.toFixed(2).replace('.', ',')}% ao mês` : ''}` });
  });

  const resposta = buscarComHistorico(divida.id, req.usuario.id);
  resposta.simulacao = sim;
  res.json(resposta);
});

// EDITAR um acordo já salvo: recalcula parcelas, saldo e juros com os novos números SEM perder o que já foi pago.
// O que foi pago (pagamentos + descontos por antecipação) continua abatendo; a entrada, se mudou, atualiza a linha de entrada.
router.put('/:id/acordo', (req, res) => {
  const divida = db.prepare('SELECT * FROM dividas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(req.params.id, req.usuario.id);
  if (!divida) return res.status(404).json({ erro: 'Dívida não encontrada.' });
  if (!divida.parcelas_total) return res.status(409).json({ erro: 'Esta dívida ainda não tem acordo. Use "Propor acordo".' });
  const b = req.body || {};
  const parcelas = b.parcelas === undefined ? divida.parcelas_total : Math.round(Number(b.parcelas) || 0);
  const entrada = b.entrada === undefined ? divida.entrada || 0 : Math.max(0, numeroOuNulo(b.entrada) || 0);
  const desconto = b.desconto === undefined ? divida.desconto || 0 : Math.max(0, numeroOuNulo(b.desconto) || 0);
  const valorBase = numeroOuNulo(b.valorBase) ?? divida.valor_base ?? r2(divida.saldo_original - (divida.entrada || 0) + (divida.desconto || 0));
  const automatica = util.parcelaDoAcordo({ valorBase, desconto, entrada, parcelas });
  const valorParcela = Number(b.valorParcela) > 0 ? Number(b.valorParcela) : automatica;
  if (parcelas < 1 || !(valorParcela > 0)) return res.status(400).json({ erro: 'Informe o número de parcelas (e confira desconto e entrada).' });
  const sim = util.simularAcordo({ valorBase, desconto, entrada, parcelas, valorParcela });

  // O que já abateu o acordo: pagamentos em dinheiro + descontos por antecipação (a entrada não conta: já está fora do saldo).
  const pagos = db
    .prepare("SELECT COALESCE(SUM(valor), 0) AS v, COALESCE(SUM(desconto_antecipacao), 0) AS d FROM historico_pagamentos WHERE divida_id = ? AND excluido_em IS NULL AND COALESCE(tipo, 'pagamento') = 'pagamento'")
    .get(divida.id);
  const abatido = r2(pagos.v + pagos.d);
  const totalParcelas = r2(parcelas * valorParcela);
  const saldo = Math.max(0, r2(totalParcelas - abatido));
  const parcelasPagas = Math.min(parcelas, Math.floor(abatido / valorParcela + 0.01));
  const hoje = util.hojeISO();

  dados.transacao(() => {
    const campos = {
      valor_base: valorBase, desconto, entrada, parcelas_total: parcelas, parcelas_pagas: parcelasPagas, valor_parcela: valorParcela,
      saldo, saldo_original: r2(totalParcelas + entrada), taxa_juros: sim.taxaMensal,
      proximo_vencimento: b.proximoVencimento === undefined ? divida.proximo_vencimento : dataValida(b.proximoVencimento),
    };
    if (saldo <= 0) { campos.status = 'quitada'; campos.situacao = 'quitada'; }
    else if (divida.status === 'quitada') { campos.status = 'ativa'; campos.situacao = 'em_acordo'; }
    dados.atualizar('dividas', divida.id, campos);
    // linha de entrada acompanha o novo valor
    const linhaEntrada = db.prepare("SELECT id FROM historico_pagamentos WHERE divida_id = ? AND tipo = 'entrada' AND excluido_em IS NULL ORDER BY rowid LIMIT 1").get(divida.id);
    if (linhaEntrada && entrada > 0) dados.atualizar('historico_pagamentos', linhaEntrada.id, { valor: entrada });
    else if (linhaEntrada) dados.excluir('historico_pagamentos', linhaEntrada.id);
    else if (entrada > 0) dados.inserir('historico_pagamentos', { divida_id: divida.id, valor: entrada, data: hoje, tipo: 'entrada', observacao: 'Entrada do acordo' });
    dados.inserir('historico_pagamentos', { divida_id: divida.id, valor: 0, data: hoje, tipo: 'acordo', observacao: `Acordo editado: ${parcelas}x de ${valorParcela.toFixed(2).replace('.', ',')}${entrada > 0 ? ` + entrada de ${entrada.toFixed(2).replace('.', ',')}` : ''} · saldo ${saldo.toFixed(2).replace('.', ',')}` });
  });

  const resposta = buscarComHistorico(divida.id, req.usuario.id);
  resposta.simulacao = sim;
  resposta.parcelaAutomatica = automatica;
  res.json(resposta);
});

// Quebra de acordo: a dívida volta ao valor original acrescido dos encargos (% configurável), menos o que já foi
// pago em dinheiro; vira "negativada", as parcelas do acordo deixam de valer e a prioridade sobe.
// Com { simular: true } só mostra o resultado, sem gravar.
router.post('/:id/quebrar', (req, res) => {
  const divida = db.prepare('SELECT * FROM dividas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(req.params.id, req.usuario.id);
  if (!divida) return res.status(404).json({ erro: 'Dívida não encontrada.' });
  if (divida.status === 'quebrada') return res.status(409).json({ erro: 'Este acordo já está marcado como quebrado.' });
  if (!(divida.saldo > 0)) return res.status(409).json({ erro: 'Esta dívida já está quitada.' });
  const encargos = numeroOuNulo(req.body?.encargosPct) ?? divida.encargos_pct ?? 5;
  if (encargos < 0 || encargos > 200) return res.status(400).json({ erro: 'Informe encargos entre 0% e 200%.' });

  const original = divida.valor_base || r2(divida.saldo_original - (divida.entrada || 0) + (divida.desconto || 0));
  const pago = db
    .prepare("SELECT COALESCE(SUM(valor), 0) AS v FROM historico_pagamentos WHERE divida_id = ? AND excluido_em IS NULL AND tipo IN ('pagamento', 'entrada')")
    .get(divida.id).v;
  const comEncargos = r2(original * (1 + encargos / 100));
  const novoSaldo = Math.max(0, r2(comEncargos - pago));
  const previa = { valorOriginal: r2(original), encargosPct: encargos, encargos: r2(comEncargos - original), jaPago: r2(pago), saldoAnterior: divida.saldo, novoSaldo, acrescimo: r2(novoSaldo - divida.saldo) };
  if (req.body?.simular) return res.json(previa);

  dados.transacao(() => {
    dados.atualizar('dividas', divida.id, {
      status: 'quebrada',
      situacao: 'negativada',
      tipo: 'negativada',
      quebrado_em: util.hojeISO(),
      saldo: novoSaldo,
      saldo_original: Math.max(divida.saldo_original, r2(pago + novoSaldo)),
      negativada: 1,
      encargos_pct: encargos,
      desconto: 0,
      parcelas_total: null,
      parcelas_pagas: 0,
      valor_parcela: null,
    });
    dados.inserir('historico_pagamentos', {
      divida_id: divida.id, valor: 0, data: util.hojeISO(), tipo: 'quebra',
      observacao: `Acordo quebrado: dívida volta ao valor original com ${encargos.toFixed(1).replace('.', ',')}% de encargos (${previa.acrescimo >= 0 ? '+' : '-'}${Math.abs(previa.acrescimo).toFixed(2).replace('.', ',')})`,
    });
  });

  const resposta = buscarComHistorico(divida.id, req.usuario.id);
  resposta.recalculo = previa;
  res.json(resposta);
});

// Gastos ligados a esta dívida: as compras feitas no cartão e vinculadas a
// ela, com a data, o cartão e as parcelas (paga / aberta / futura). Uma
// parcela conta como "paga" quando a fatura dela é anterior à aberta, porque
// o sistema ainda não registra o pagamento de cada fatura.
router.get('/:id/gastos', (req, res) => {
  const divida = db
    .prepare('SELECT * FROM dividas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL')
    .get(req.params.id, req.usuario.id);
  if (!divida) return res.status(404).json({ erro: 'Dívida não encontrada.' });

  const hoje = new Date().toLocaleDateString('sv-SE', {
    timeZone: process.env.APP_TIMEZONE || 'America/Sao_Paulo',
  });

  const linhas = db
    .prepare(
      `SELECT l.*, c.nome AS cartao_nome, c.dia_fechamento, c.dia_vencimento
       FROM lancamentos_cartao l JOIN cartoes c ON c.id = l.cartao_id AND c.excluido_em IS NULL
       WHERE l.divida_id = ? AND l.usuario_id = ? AND l.excluido_em IS NULL
       ORDER BY l.data_compra DESC, l.compra_id, l.parcela_numero`
    )
    .all(divida.id, req.usuario.id);

  const porCompra = new Map();
  linhas.forEach((l) => {
    const chave = faturas.faturaDaParcela(l.data_compra, l.dia_fechamento, l.dia_vencimento, l.parcela_numero);
    const datas = faturas.datasDaFatura(chave, l.dia_fechamento, l.dia_vencimento);
    // Mesma régua do extrato do cartão: a fatura "aberta" é onde uma compra
    // feita hoje cairia; antes dela já fechou, depois ainda vai chegar.
    const aberta = faturas.faturaDaParcela(hoje, l.dia_fechamento, l.dia_vencimento, 1);
    const status = chave < aberta ? 'paga' : chave === aberta ? 'aberta' : 'futura';
    if (!porCompra.has(l.compra_id)) {
      porCompra.set(l.compra_id, {
        compraId: l.compra_id,
        cartaoId: l.cartao_id,
        cartao: l.cartao_nome,
        descricao: l.descricao,
        dataCompra: l.data_compra,
        totalParcelas: l.total_parcelas,
        valorTotal: 0,
        parcelas: [],
      });
    }
    const compra = porCompra.get(l.compra_id);
    compra.valorTotal = faturas.arredondar(compra.valorTotal + l.valor);
    compra.parcelas.push({
      numero: l.parcela_numero,
      valor: l.valor,
      fatura: chave,
      vence: datas.vence,
      status,
    });
  });

  const compras = [...porCompra.values()].map((c) => ({
    ...c,
    parcelasPagas: c.parcelas.filter((p) => p.status === 'paga').length,
    valorRestante: faturas.arredondar(
      c.parcelas.filter((p) => p.status !== 'paga').reduce((s, p) => s + p.valor, 0)
    ),
  }));

  res.json({
    totalGasto: faturas.arredondar(compras.reduce((s, c) => s + c.valorTotal, 0)),
    totalRestante: faturas.arredondar(compras.reduce((s, c) => s + c.valorRestante, 0)),
    compras,
  });
});

module.exports = router;
