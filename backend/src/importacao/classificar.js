// Classificação das linhas lidas contra o que já existe no banco: duplicadas, parcelas casadas, divergências,
// estornos, pagamento de fatura, reserva automática, categoria sugerida. Só LÊ o banco (quem grava é confirmar.js).
const db = require('../db');
const T = require('./texto');
const faturas = require('../utils/faturas');
const { categorizarTransacao } = require('../utils/categorizacao');
const integ = require('./integracoes');

const JANELA_DIAS = 5; // parcelas: ±5 dias
const dentroDaTolerancia = (a, b) => {
  const d = Math.abs(Math.abs(a) - Math.abs(b));
  return d <= 0.10 + 1e-9 || d <= 0.01 * Math.max(Math.abs(a), Math.abs(b)) + 1e-9;
};
const mesmoValor = (a, b) => Math.abs(a - b) < 0.005;
const dia = (d) => String(d).slice(0, 10);

// Registros que uma importação JÁ DESFEITA criou e que, por algum motivo (versão antiga, restauro, sincronização), ainda
// estão ativos. Para a checagem de duplicidade eles não existem: desfazer = como se o arquivo nunca tivesse entrado.
// (confirmar.js remove esses restos ao gravar a nova importação no mesmo destino.)
function restosDeImportacaoDesfeita(tabela, usuarioId) {
  return new Set(db.prepare(
    `SELECT i.registro_id AS id FROM importacao_itens i JOIN importacoes m ON m.id = i.importacao_id
     JOIN ${tabela} r ON r.id = i.registro_id AND r.excluido_em IS NULL
     WHERE m.usuario_id = ? AND m.desfeita_em IS NOT NULL AND i.tabela = ? AND i.acao = 'inserido'`
  ).all(usuarioId, tabela).map((r) => r.id));
}

function categoriasDoUsuario(usuarioId) {
  return db.prepare('SELECT id, nome FROM categorias_orcamento WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId);
}

// Faturas ainda não pagas de cartões manuais, com o total (para reconhecer "Pagamento de fatura" no extrato da conta).
function faturasEmAberto(usuarioId) {
  const cartoes = db.prepare("SELECT * FROM cartoes WHERE usuario_id = ? AND excluido_em IS NULL AND origem = 'manual'").all(usuarioId);
  const lista = [];
  cartoes.forEach((c) => {
    const pagas = new Set(db.prepare('SELECT fatura FROM faturas_pagas WHERE cartao_id = ? AND excluido_em IS NULL').all(c.id).map((l) => l.fatura));
    const porFatura = {};
    db.prepare('SELECT * FROM lancamentos_cartao WHERE cartao_id = ? AND excluido_em IS NULL').all(c.id).forEach((l) => {
      const chave = faturas.faturaDaParcela(l.data_compra, c.dia_fechamento, c.dia_vencimento, l.parcela_numero);
      if (!pagas.has(chave)) porFatura[chave] = (porFatura[chave] || 0) + l.valor;
    });
    Object.entries(porFatura).forEach(([chave, total]) => {
      if (total > 0.004) lista.push({ cartaoId: c.id, cartaoNome: c.nome, chave, total: faturas.arredondar(total), vence: faturas.datasDaFatura(chave, c.dia_fechamento, c.dia_vencimento).vence });
    });
  });
  return lista;
}

function limparEstorno(d) {
  return String(d || '').replace(/\b(estorno|estornado|devolu[cç][aã]o|devolvid[oa]|cancelamento|cancelad[ao]|reembolso|chargeback|cr[eé]dito)\b/gi, ' ');
}

// ---------------------------------------------------------------------------------------------- CONTA
function classificarConta(usuarioId, conta, linhas, periodo, opcoes = {}) {
  const ini = T.somarDias(periodo.inicio, -JANELA_DIAS);
  const fim = T.somarDias(periodo.fim, JANELA_DIAS);
  let existentes = db
    .prepare("SELECT * FROM transacoes WHERE usuario_id = ? AND conta_id = ? AND excluido_em IS NULL AND substr(data, 1, 10) BETWEEN ? AND ? ORDER BY data, rowid")
    .all(usuarioId, conta.id, ini, fim)
    .map((t) => ({ ...t, data: dia(t.data) }));
  const restos = restosDeImportacaoDesfeita('transacoes', usuarioId);
  if (restos.size) existentes = existentes.filter((t) => !restos.has(t.id));
  const consumidos = new Set();
  const casamento = new Map(); // idx da linha -> { existente, tipo: 'duplicada'|'casada'|'divergente' }
  const dentro = linhas.filter((l) => !l.foraPeriodo);

  // 1) FITID (id do banco) igual: duplicada com certeza
  const prefixo = (l) => `imp:${l.formatoOrigem || 'ofx'}:${conta.id}:${l.fitid}`;
  dentro.forEach((l) => {
    if (!l.fitid) return;
    const ex = existentes.find((e) => !consumidos.has(e.id) && e.id_externo && (e.id_externo === prefixo(l) || e.id_externo === l.fitid || e.id_externo.endsWith(`:${conta.id}:${l.fitid}`)));
    if (ex) { consumidos.add(ex.id); casamento.set(l.idx, { existente: ex, tipo: 'duplicada' }); }
  });
  const elegivel = (l, e) => !consumidos.has(e.id) && !(l.fitid && e.id_externo && String(e.id_externo).startsWith('imp:')) && Math.sign(e.valor) === Math.sign(l.valor);
  // 2) mesma data e mesmo valor (um para um)
  dentro.filter((l) => !casamento.has(l.idx)).forEach((l) => {
    const cands = existentes.filter((e) => elegivel(l, e) && e.data === l.data && mesmoValor(e.valor, l.valor));
    if (!cands.length) return;
    cands.sort((a, b) => T.semelhanca(l.descricao, b.descricao) - T.semelhanca(l.descricao, a.descricao));
    consumidos.add(cands[0].id);
    casamento.set(l.idx, { existente: cands[0], tipo: 'duplicada' });
  });
  // 3) até ±5 dias: parcela igual / descrição parecida, valor igual ou dentro da tolerância; se o valor diverge, é "divergente"
  dentro.filter((l) => !casamento.has(l.idx)).forEach((l) => {
    const pl = T.extrairParcela(l.descricao, { estrito: true });
    const cands = existentes
      .filter((e) => elegivel(l, e) && Math.abs(T.diasEntre(e.data, l.data)) <= JANELA_DIAS)
      .map((e) => {
        const pe = T.extrairParcela(e.descricao);
        const mesmaParcela = !!(pl && pe && pl.atual === pe.atual && pl.total === pe.total);
        const sim = T.semelhanca(pl ? pl.base : l.descricao, pe ? pe.base : e.descricao);
        return { e, mesmaParcela, sim };
      })
      .filter((c) => {
        const tolOk = dentroDaTolerancia(c.e.valor, l.valor);
        if (tolOk) return c.mesmaParcela || c.sim >= 0.5;
        return (c.mesmaParcela && c.sim >= 0.34) || (c.sim >= 0.8 && !!pl);
      })
      .sort((a, b) => b.sim - a.sim || Math.abs(T.diasEntre(a.e.data, l.data)) - Math.abs(T.diasEntre(b.e.data, l.data)));
    if (!cands.length) return;
    const { e } = cands[0];
    consumidos.add(e.id);
    casamento.set(l.idx, { existente: e, tipo: dentroDaTolerancia(e.valor, l.valor) ? 'casada' : 'divergente' });
  });

  const categorias = categoriasDoUsuario(usuarioId);
  const nomeCat = Object.fromEntries(categorias.map((c) => [c.id, c.nome]));
  const emAberto = faturasEmAberto(usuarioId);
  const contas = db.prepare('SELECT id, nome FROM contas WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId);
  const nomeTitular = (db.prepare('SELECT nome FROM usuarios WHERE id = ?').get(usuarioId) || {}).nome || null;
  // Anotação 56: metas ligadas a caixinhas desta conta. O guardado de cada meta anda junto com as linhas (em ordem de data)
  // para a pré-visualização já separar o rendimento dos resgates.
  // Anotação 61: pagamentos adiantados lançados no cartão e ainda sem a saída da conta ligada
  const adiantados = db.prepare(
    `SELECT l.id, l.cartao_id, l.valor, l.data_compra, k.nome AS cartao_nome FROM lancamentos_cartao l JOIN cartoes k ON k.id = l.cartao_id AND k.excluido_em IS NULL
     WHERE l.usuario_id = ? AND l.excluido_em IS NULL AND l.tipo_mov = 'pagamento' AND l.vinculo IS NULL`
  ).all(usuarioId);
  const adiantadosUsados = new Set();
  const pagamentoAdiantadoSolto = (l) => {
    const a = adiantados.find((x) => !adiantadosUsados.has(x.id) && mesmoValor(-x.valor, -l.valor) && Math.abs(T.diasEntre(x.data_compra, l.data)) <= 5
      && (integ.pareceFaturaDeCartao(l.descricao) || /\b(pag|pgto|pagto|cart)/.test(integ.normalizar(l.descricao)) || T.semelhanca(l.descricao, x.cartao_nome) >= 0.34));
    if (a) adiantadosUsados.add(a.id);
    return a || null;
  };
  const metasCaixinha = integ.metasDaConta(usuarioId, conta.id);
  const caixinhaPorIdx = new Map();
  // Homologação 1.0, seção 15: regras de metas e investimentos (tipo 'reserva') valem antes das caixinhas.
  const RG = require('../utils/regras');
  const temRegraReserva = !!db.prepare("SELECT 1 FROM regras_categorias WHERE usuario_id = ? AND tipo = 'reserva' AND ativa = 1 AND excluido_em IS NULL LIMIT 1").get(usuarioId);
  const investimentoPorIdx = new Map();
  const metaPorId = {};
  const metaDaRegra = (id) => (metaPorId[id] ||= db.prepare('SELECT m.* FROM metas_reserva m JOIN reserva_liberdade r ON r.id = m.reserva_id WHERE m.id = ? AND r.usuario_id = ? AND m.excluido_em IS NULL').get(id, usuarioId) || null);
  if (metasCaixinha.length || temRegraReserva) {
    const guardado = {};
    metasCaixinha.forEach((m) => { guardado[m.id] = integ.guardadoNaMeta(m.reserva_id, m.id); });
    linhas.filter((l) => !l.foraPeriodo && !casamento.has(l.idx)).slice().sort((a, b) => String(a.data).localeCompare(String(b.data)))
      .forEach((l) => {
        let c = null;
        const rr = temRegraReserva ? RG.acharRegraReserva(usuarioId, { descricao: l.descricao, valor: l.valor, contaId: conta.id }) : null;
        if (rr && rr.ativo_id) {
          const a = db.prepare('SELECT id, nome, ticker FROM ativos WHERE id = ?').get(rr.ativo_id);
          if (a) { investimentoPorIdx.set(l.idx, { regraId: rr.id, ativoId: a.id, nome: a.ticker || a.nome, sentido: rr.destino }); return; }
        }
        if (rr && rr.meta_id && metaDaRegra(rr.meta_id)) {
          const meta = metaDaRegra(rr.meta_id);
          if (guardado[meta.id] === undefined) guardado[meta.id] = integ.guardadoNaMeta(meta.reserva_id, meta.id);
          c = { sentido: rr.destino, meta, porNome: true, porRegra: true, opcoes: [meta] };
        }
        if (!c && metasCaixinha.length) c = integ.casarCaixinha(l.descricao, l.valor, metasCaixinha);
        if (!c) return;
        let rendimento = 0;
        if (c.meta) {
          const g = guardado[c.meta.id] || 0;
          if (c.sentido === 'guardar') guardado[c.meta.id] = faturas.arredondar(g + Math.abs(l.valor));
          else {
            rendimento = g > 0 ? faturas.arredondar(Math.max(0, Math.abs(l.valor) - g)) : 0;
            guardado[c.meta.id] = faturas.arredondar(Math.max(0, g - (Math.abs(l.valor) - rendimento)));
          }
        }
        caixinhaPorIdx.set(l.idx, { ...c, rendimento });
      });
  }

  const saida = linhas.map((l) => {
    const r = {
      idx: l.idx, data: l.data, descricao: l.descricao, valor: l.valor, fitid: l.fitid || null, confianca: l.confianca,
      bruto: l.bruto, status: 'nova', acao: 'importar', parcela: null, existente: null, anula: null, fatura: null,
      reserva: null, transferencia: null, categoriaId: null, categoriaNome: null, categoriaAuto: false, observacao: '',
    };
    if (l.foraPeriodo) { r.status = 'fora_periodo'; r.acao = 'descartar'; r.observacao = 'Fora do período escolhido.'; return r; }
    const p = T.extrairParcela(l.descricao, { estrito: true });
    if (p) r.parcela = { atual: p.atual, total: p.total };
    const m = casamento.get(l.idx);
    if (m) {
      r.existente = { id: m.existente.id, descricao: m.existente.descricao, valor: m.existente.valor, data: m.existente.data };
      if (m.tipo === 'duplicada') { r.status = 'duplicada'; r.acao = 'descartar'; r.observacao = 'Já existe neste período.'; }
      else if (m.tipo === 'casada') { r.status = 'casada'; r.acao = 'manter'; r.observacao = 'Parcela já registrada (valor dentro da tolerância).'; }
      else { r.status = 'divergente'; r.acao = 'atualizar'; r.observacao = `Valor diferente do que está registrado (${m.existente.valor}).`; }
      return r;
    }
    if (l.valor < 0) {
      const c = categorizarTransacao(l.descricao, categorias, { usuarioId, valor: l.valor, contaId: conta.id });
      if (c) { r.categoriaId = c; r.categoriaNome = nomeCat[c]; r.categoriaAuto = true; }
    }
    // Seção 15: regra de investimento — aporte/resgate de um ativo, fora das entradas e saídas
    const inv = investimentoPorIdx.get(l.idx);
    if (inv) {
      r.status = 'investimento';
      r.categoriaId = null; r.categoriaNome = null; r.categoriaAuto = false;
      r.investimento = inv;
      r.observacao = `${inv.sentido === 'aporte' ? 'Aporte em' : 'Resgate de'} ${inv.nome} (pela regra): não conta como ${inv.sentido === 'aporte' ? 'saída' : 'entrada'}. Registre as cotas em Investimentos.`;
      return r;
    }
    // Anotação 56: caixinha do banco ligada a uma meta (Guardar/Resgatar fora das entradas e saídas)
    const cx = caixinhaPorIdx.get(l.idx);
    if (cx) {
      const v = Math.abs(l.valor);
      r.status = 'reserva';
      r.categoriaId = null; r.categoriaNome = null; r.categoriaAuto = false;
      r.reserva = {
        caixinha: true, sentido: cx.sentido, produto: 'Caixinha', porNome: cx.porNome,
        metaId: cx.meta ? cx.meta.id : null, metaNome: cx.meta ? cx.meta.nome : null,
        rotulo: `${cx.sentido === 'guardar' ? 'Guardar' : 'Resgatar'}${cx.meta ? ' · ' + cx.meta.nome : ''}`,
        rendimento: cx.rendimento || 0,
        opcoes: cx.opcoes.map((m) => ({ id: m.id, nome: m.nome })),
      };
      const reais = (n) => n.toFixed(2).replace('.', ',');
      if (cx.meta && cx.sentido === 'guardar') r.observacao = `Guardar na meta ${cx.meta.nome}: não conta como saída.`;
      else if (cx.meta) r.observacao = `Resgatar da meta ${cx.meta.nome}: não conta como entrada${cx.rendimento > 0 ? `; o rendimento de R$ ${reais(cx.rendimento)} entra em Rendimentos` : ''}.`;
      else r.observacao = `${cx.sentido === 'guardar' ? 'Aplicação' : 'Resgate'} sem o nome da caixinha (R$ ${reais(v)}): escolha a meta ou deixe para A revisar.`;
      return r;
    }
    // estorno / cancelamento / devolução (crédito) anula a despesa original
    if (l.valor > 0 && integ.ehEstorno(l.descricao)) {
      r.status = 'estorno';
      let ori = null;
      try { const E = integ.lancamentos(); if (E && E.procurarOriginalDoEstorno) ori = E.procurarOriginalDoEstorno(usuarioId, { contaId: conta.id, valor: l.valor, descricao: limparEstorno(l.descricao), data: l.data }); } catch (e) { ori = null; }
      if (ori) {
        r.anula = { tipo: 'existente', id: ori.id, descricao: ori.descricao, valor: ori.valor, data: dia(ori.data) };
        r.observacao = `Anula a despesa "${ori.descricao}" de ${dia(ori.data)}.`;
      } else {
        const par = linhas.find((o) => o.idx !== l.idx && !o.foraPeriodo && o.valor < 0 && mesmoValor(-o.valor, l.valor) && o.data <= l.data && T.semelhanca(limparEstorno(l.descricao), o.descricao) >= 0.34 && !casamento.has(o.idx));
        if (par) { r.anula = { tipo: 'linha', idx: par.idx, descricao: par.descricao, valor: par.valor, data: par.data }; r.observacao = `Anula "${par.descricao}" (${par.data}) do mesmo arquivo.`; }
        else r.observacao = 'Estorno sem despesa original encontrada: entra como entrada.';
      }
      return r;
    }
    // pagamento de fatura do cartão (sai da conta)
    // Anotação 61: pagamento ADIANTADO já lançado na fatura (crédito 'pagamento' ainda sem a saída da conta): casa com ele,
    // e a saída não conta como gasto (nem dobra o pagamento)
    const adiant = l.valor < 0 ? pagamentoAdiantadoSolto(l) : null;
    if (adiant) {
      r.status = 'pagamento_fatura';
      r.fatura = { adiantadoId: adiant.id, cartaoId: adiant.cartao_id, cartaoNome: adiant.cartao_nome, chave: null, total: Math.abs(adiant.valor) };
      r.candidatasFatura = [];
      r.observacao = `Pagamento adiantado da fatura do ${adiant.cartao_nome} (já está na fatura): não conta como gasto.`;
      r.categoriaId = null; r.categoriaNome = null; r.categoriaAuto = false;
      return r;
    }
    if (l.valor < 0 && integ.pareceFaturaDeCartao(l.descricao)) {
      // Todas as faturas abertas viram opção (as de valor igual primeiro). Se nenhuma bate o valor, mas há uma que vence
      // perto da data do pagamento, ela é sugerida: sem o vínculo o pagamento contaria como gasto EM CIMA das compras do
      // cartão (gasto em dobro e saldo do mês negativo sem motivo).
      const cand = emAberto
        .map((f) => ({ ...f, tol: dentroDaTolerancia(f.total, l.valor), sim: T.semelhanca(l.descricao, f.cartaoNome), prox: Math.abs(T.diasEntre(f.vence, l.data)) }))
        .sort((a, b) => (b.tol ? 1 : 0) - (a.tol ? 1 : 0) || b.sim - a.sim || a.prox - b.prox);
      r.status = 'pagamento_fatura';
      r.candidatasFatura = cand.slice(0, 6).map((f) => ({ cartaoId: f.cartaoId, cartaoNome: f.cartaoNome, chave: f.chave, total: f.total, vence: f.vence }));
      const pertos = cand.filter((f) => !f.tol && f.prox <= 12);
      const escolhida = cand.find((f) => f.tol) || (pertos.length === 1 || (pertos[0] && pertos[0].sim >= 0.5) ? pertos[0] : null);
      if (escolhida) {
        r.fatura = { cartaoId: escolhida.cartaoId, cartaoNome: escolhida.cartaoNome, chave: escolhida.chave, total: escolhida.total };
        r.observacao = escolhida.tol ? `Pagamento da fatura ${escolhida.chave} do ${escolhida.cartaoNome}.`
          : `Pagamento da fatura ${escolhida.chave} do ${escolhida.cartaoNome} (no app ela soma ${escolhida.total.toFixed(2).replace('.', ',')}: confira).`;
      } else r.observacao = cand.length ? 'Parece pagamento de fatura: escolha qual fatura foi paga para não contar o gasto em dobro.' : 'Parece pagamento de fatura, mas não há fatura aberta. Entra como saída comum.';
      r.categoriaId = null; r.categoriaNome = null; r.categoriaAuto = false;
      return r;
    }
    // reserva automática (Caixinha, Porquinho, Resgate CDB)
    const rv = integ.detectarReserva(l.descricao);
    if (rv && ((rv.sentido === 'guardar' && l.valor < 0) || (rv.sentido === 'resgatar' && l.valor > 0))) {
      r.status = 'reserva'; r.reserva = { rotulo: rv.rotulo, sentido: rv.sentido, produto: rv.produto };
      r.categoriaId = null; r.categoriaNome = null; r.categoriaAuto = false;
      r.observacao = `${rv.rotulo}: depois de importar, você pode vincular a uma meta.`;
      return r;
    }
    // Pix/TED para conta própria vira transferência
    const dest = integ.detectarDestino(l.descricao, { nomeTitular, contas, contaAtualId: conta.id });
    if (dest && dest.tipo === 'propria' && dest.contaId) {
      r.transferencia = { contaId: dest.contaId, contaNome: dest.contaNome };
      r.acao = 'transferencia'; r.observacao = `Parece transferência para sua conta ${dest.contaNome}.`;
      r.categoriaId = null; r.categoriaNome = null; r.categoriaAuto = false;
    } else if (dest && dest.tipo === 'terceiro' && l.valor < 0) {
      r.observacao = 'Pix/TED para outra pessoa: conta como despesa.';
    }
    return r;
  });
  return { linhas: saida, existentesNoPeriodo: existentes.length };
}

// ---------------------------------------------------------------------------------------------- FATURA
function classificarFatura(usuarioId, cartao, linhas, periodo, fatura, opcoes = {}) {
  const restos = restosDeImportacaoDesfeita('lancamentos_cartao', usuarioId);
  const lancs = db.prepare('SELECT * FROM lancamentos_cartao WHERE cartao_id = ? AND usuario_id = ? AND excluido_em IS NULL').all(cartao.id, usuarioId)
    .filter((e) => !restos.has(e.id));
  const consumidos = new Set();
  const casamento = new Map();
  // Pagamento da fatura (crédito "Pagamento recebido" ou, com descrição inequívoca, qualquer sinal). Anotação 61: o pagamento
  // da fatura ANTERIOR fica de fora (como na 0.8); o pagamento ADIANTADO desta fatura (texto "adiantado/antecipado" ou
  // feito mais de 5 dias depois do vencimento da fatura anterior) abate esta fatura, sem ser entrada nem gasto.
  const ehPagamento = (l) => (l.valor > 0
    ? l.tipoCredito === 'pagamento' || (integ.pareceCreditoDePagamento(l.descricao) && !integ.ehEstorno(l.descricao) && !l.tipoCredito)
    : integ.pareceTextoDePagamentoDaFatura(l.descricao));
  const vencAnterior = (() => {
    if (!fatura) return null;
    const [a, m] = fatura.split('-').map(Number); const t = a * 12 + (m - 1) - 1;
    return faturas.datasDaFatura(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`, cartao.dia_fechamento, cartao.dia_vencimento).vence;
  })();
  const dentro = linhas.filter((l) => !l.foraPeriodo && !ehPagamento(l));
  // Pela data, só é adiantado se não deixar a fatura negativa (pagamento maior que as compras é da fatura anterior)
  const liquidoSemPagamentos = dentro.reduce((s, l) => s - l.valor, 0);
  const ehAdiantado = (l) => ehPagamento(l) && l.valor > 0 && (integ.pareceAdiantado(l.descricao)
    || (!!vencAnterior && T.diasEntre(vencAnterior, l.data) > 5 && l.valor <= liquidoSemPagamentos + 0.005));
  const chaveDe = (l) => faturas.faturaDaParcela(l.data_compra, cartao.dia_fechamento, cartao.dia_vencimento, l.parcela_numero);
  const dataParcela = (l) => T.somarMeses(l.data_compra, l.parcela_numero - 1);
  const compras = dentro.filter((l) => l.valor < 0);
  const parcelaDe = (l) => {
    const p = T.extrairParcela(l.descricao);
    if (p) return p;
    const q = l.parcelaTexto ? T.extrairParcela(String(l.parcelaTexto)) || T.extrairParcela(`x ${l.parcelaTexto}`) : null;
    return q;
  };

  // FITID
  compras.forEach((l) => {
    if (!l.fitid) return;
    const ex = lancs.find((e) => !consumidos.has(e.id) && e.id_externo && e.id_externo.endsWith(`:${cartao.id}:${l.fitid}`));
    if (ex) { consumidos.add(ex.id); casamento.set(l.idx, { e: ex, tipo: 'duplicada' }); }
  });
  // Parcelas: n/N casa com a parcela n de uma compra de N parcelas já registrada (mesma fatura ou ±5 dias)
  compras.filter((l) => !casamento.has(l.idx)).forEach((l) => {
    const p = parcelaDe(l);
    if (!p) return;
    const valor = -l.valor;
    const cands = lancs
      .filter((e) => !consumidos.has(e.id) && e.parcela_numero === p.atual && e.total_parcelas === p.total && !e.tipo_mov)
      .map((e) => ({
        e, sim: T.semelhanca(p.base, e.descricao),
        naFatura: !!fatura && chaveDe(e) === fatura,
        perto: Math.abs(T.diasEntre(dataParcela(e), l.data)) <= JANELA_DIAS || Math.abs(T.diasEntre(e.data_compra, l.data)) <= JANELA_DIAS,
        tol: dentroDaTolerancia(e.valor, valor),
      }))
      .filter((c) => (c.naFatura || c.perto) && (c.sim >= 0.34 || c.tol))
      .sort((a, b) => b.sim - a.sim || (b.tol ? 1 : 0) - (a.tol ? 1 : 0));
    if (!cands.length) return;
    const c = cands[0];
    consumidos.add(c.e.id);
    casamento.set(l.idx, { e: c.e, tipo: c.tol ? 'casada' : 'divergente' });
  });
  // À vista: mesma data (±1 dia), mesmo valor, um para um, só dentro do período do arquivo
  compras.filter((l) => !casamento.has(l.idx) && !parcelaDe(l)).forEach((l) => {
    const valor = -l.valor;
    const cands = lancs
      .filter((e) => !consumidos.has(e.id) && e.total_parcelas === 1 && e.tipo_mov !== 'estorno' && e.valor > 0 && e.data_compra >= T.somarDias(periodo.inicio, -1) && e.data_compra <= T.somarDias(periodo.fim, 1) && mesmoValor(e.valor, valor) && Math.abs(T.diasEntre(e.data_compra, l.data)) <= 1)
      .filter((e) => !(l.fitid && e.id_externo && String(e.id_externo).startsWith('imp:')))
      .sort((a, b) => T.semelhanca(l.descricao, b.descricao) - T.semelhanca(l.descricao, a.descricao));
    if (!cands.length) return;
    const e = cands.find((x) => x.data_compra === l.data) || (T.semelhanca(l.descricao, cands[0].descricao) >= 0.25 ? cands[0] : null);
    if (!e) return;
    consumidos.add(e.id);
    casamento.set(l.idx, { e, tipo: 'duplicada' });
  });

  // Créditos (estornos) já lançados antes: valor negativo no cartão, mesma data (±1 dia), um para um
  // (inclui pagamento adiantado e cashback já gravados, que também ficam negativos no cartão)
  linhas.filter((l) => !l.foraPeriodo && l.valor > 0 && !casamento.has(l.idx) && (!ehPagamento(l) || ehAdiantado(l))).forEach((l) => {
    const e = lancs.find((x) => !consumidos.has(x.id) && x.valor < 0 && mesmoValor(-x.valor, l.valor) && Math.abs(T.diasEntre(x.data_compra, l.data)) <= 1);
    if (e) { consumidos.add(e.id); casamento.set(l.idx, { e: { ...e, valor: -e.valor }, tipo: 'duplicada' }); }
  });

  const categorias = categoriasDoUsuario(usuarioId);
  const nomeCat = Object.fromEntries(categorias.map((c) => [c.id, c.nome]));
  const anuladas = new Set(); // compras do arquivo já ligadas a um estorno (um estorno para cada compra)
  const restante = new Map(); // anotação 61: quanto de cada compra ainda pode ser estornado (estorno parcial anula só parte)
  const reais = (n) => Number(n).toFixed(2).replace('.', ',');
  const dataBr = (d) => String(d).slice(0, 10).split('-').reverse().join('/');

  // Pagamento adiantado: a saída correspondente no extrato de alguma conta (mesmo valor, até 5 dias), ainda solta
  let saidasConta = null;
  const usadasConta = new Set();
  function pagamentoNaConta(l) {
    if (!saidasConta) {
      saidasConta = db.prepare(
        `SELECT t.id, t.descricao, t.valor, substr(t.data, 1, 10) AS data, t.conta_id, c.nome AS conta_nome FROM transacoes t
         JOIN contas c ON c.id = t.conta_id AND c.excluido_em IS NULL
         WHERE t.usuario_id = ? AND t.excluido_em IS NULL AND t.valor < 0 AND t.tipo_mov IS NULL AND t.ignorada = 0
           AND t.id NOT IN (SELECT transacao_id FROM faturas_pagas WHERE transacao_id IS NOT NULL AND excluido_em IS NULL)`
      ).all(usuarioId);
    }
    const t = saidasConta
      .filter((x) => !usadasConta.has(x.id) && mesmoValor(-x.valor, l.valor) && Math.abs(T.diasEntre(x.data, l.data)) <= 5)
      .filter((x) => integ.pareceFaturaDeCartao(x.descricao) || /\b(pag|pgto|pagto|cart)/i.test(integ.normalizar(x.descricao)) || T.semelhanca(x.descricao, cartao.nome) >= 0.34)
      .sort((a, b) => Math.abs(T.diasEntre(a.data, l.data)) - Math.abs(T.diasEntre(b.data, l.data)))[0];
    if (!t) return null;
    usadasConta.add(t.id);
    return { transacaoId: t.id, contaId: t.conta_id, contaNome: t.conta_nome, data: t.data, descricao: t.descricao };
  }

  // Anotação 61: crédito na fatura (valor positivo aqui) — pagamento adiantado, cashback ou estorno
  function classificarCredito(l, r) {
    const tipo = l.tipoCredito || (integ.ehEstorno(l.descricao) ? 'estorno' : null);
    if (ehAdiantado(l)) {
      r.status = 'pagamento_adiantado'; r.credito = { tipo: 'pagamento' };
      r.pagamento = pagamentoNaConta(l);
      r.observacao = r.pagamento
        ? `Pagamento adiantado: abate a fatura, não é entrada nem gasto. Casa com "${r.pagamento.descricao}" de ${dataBr(r.pagamento.data)} na conta ${r.pagamento.contaNome}.`
        : 'Pagamento adiantado: abate a fatura, não é entrada nem gasto. Ao importar o extrato da conta, a saída casa com ele.';
      return r;
    }
    if (tipo === 'cashback') {
      r.status = 'cashback'; r.credito = { tipo: 'cashback' }; r.categoriaReceita = 'Cashback';
      r.observacao = 'Cashback: abate a fatura e entra como entrada em Cashback.';
      return r;
    }
    // estorno / devolução / cancelamento (ou crédito sem palavra-chave): procura a compra original, até 90 dias antes
    r.status = 'estorno'; r.credito = { tipo: 'estorno' };
    const alvo = limparEstorno(l.descricao);
    const nota = (valorCompra, desc, data) => ({ exato: mesmoValor(valorCompra, l.valor) ? 1 : 0, sim: T.semelhanca(alvo, desc), dias: T.diasEntre(String(data).slice(0, 10), l.data) });
    const serve = (c) => c.sim >= 0.34 && c.dias >= 0 && c.dias <= 90;
    const cands = [];
    lancs.filter((e) => !consumidos.has(e.id) && !e.tipo_mov && e.valor > 0).forEach((e) => {
      const resta = restante.has(`e${e.id}`) ? restante.get(`e${e.id}`) : e.valor;
      if (resta + 0.005 < l.valor) return;
      const c = { tipo: 'existente', e, chave: `e${e.id}`, valorOriginal: e.valor, resta, ...nota(e.valor, e.descricao, e.data_compra) };
      if (serve(c)) cands.push(c);
    });
    dentro.filter((o) => o.idx !== l.idx && o.valor < 0 && !casamento.has(o.idx) && !anuladas.has(o.idx)).forEach((o) => {
      const resta = restante.has(`l${o.idx}`) ? restante.get(`l${o.idx}`) : -o.valor;
      if (resta + 0.005 < l.valor) return;
      const c = { tipo: 'linha', o, chave: `l${o.idx}`, valorOriginal: -o.valor, resta, ...nota(-o.valor, o.descricao, o.data) };
      if (serve(c)) cands.push(c);
    });
    cands.sort((a, b) => b.exato - a.exato || b.sim - a.sim || a.dias - b.dias);
    const best = cands[0];
    if (best) {
      const parcial = l.valor < best.valorOriginal - 0.005;
      const sobra = faturas.arredondar(best.resta - l.valor);
      restante.set(best.chave, sobra);
      const desc = best.tipo === 'existente' ? best.e.descricao : best.o.descricao;
      const data = best.tipo === 'existente' ? best.e.data_compra : best.o.data;
      if (sobra <= 0.005) { if (best.tipo === 'existente') consumidos.add(best.e.id); else anuladas.add(best.o.idx); }
      r.anula = best.tipo === 'existente'
        ? { tipo: 'existente', id: best.e.id, descricao: desc, valor: best.e.valor, data, parcial }
        : { tipo: 'linha', idx: best.o.idx, descricao: desc, valor: best.o.valor, data, parcial };
      const catId = best.tipo === 'existente' ? best.e.categoria_id : categorizarTransacao(best.o.descricao, categorias);
      if (catId && nomeCat[catId]) { r.categoriaId = catId; r.categoriaNome = nomeCat[catId]; }
      r.observacao = parcial
        ? `Estorno parcial: anula R$ ${reais(l.valor)} da compra "${desc}" de ${dataBr(data)} (sobra R$ ${reais(best.valorOriginal - l.valor)} de gasto).`
        : `Anula a compra "${desc}" de ${dataBr(data)}${best.tipo === 'linha' ? ' (deste arquivo)' : ''}.`;
      return r;
    }
    r.revisar = true;
    const c = categorizarTransacao(alvo, categorias);
    if (c) { r.categoriaId = c; r.categoriaNome = nomeCat[c]; r.categoriaAuto = true; }
    r.observacao = 'Estorno sem a compra original (até 90 dias antes): reduz os gastos da categoria e fica em A revisar.';
    return r;
  }

  const saida = linhas.map((l) => {
    const r = {
      idx: l.idx, data: l.data, descricao: l.descricao, valor: l.valor, fitid: l.fitid || null, confianca: l.confianca, bruto: l.bruto,
      status: 'nova', acao: 'importar', parcela: null, existente: null, anula: null, fatura: null, reserva: null, transferencia: null,
      categoriaId: null, categoriaNome: null, categoriaAuto: false, observacao: '',
    };
    if (l.foraPeriodo) { r.status = 'fora_periodo'; r.acao = 'descartar'; r.observacao = 'Fora do período escolhido.'; return r; }
    if (l.creditoPorTexto) r.creditoPorTexto = true;
    if (ehPagamento(l) && !ehAdiantado(l)) {
      r.status = 'pagamento_recebido'; r.acao = 'descartar'; r.observacao = 'Pagamento da fatura anterior: não é compra nem entrada, fica de fora.';
      if (l.valor > 0) r.pagamento = pagamentoNaConta(l); // dados para, se a pessoa disser que foi adiantado, casar com o extrato
      return r;
    }
    const p = parcelaDe(l);
    if (p) r.parcela = { atual: p.atual, total: p.total };
    const m = casamento.get(l.idx);
    if (m) {
      r.existente = { id: m.e.id, descricao: m.e.descricao, valor: -m.e.valor, data: m.e.data_compra, parcela: m.e.total_parcelas > 1 ? `${m.e.parcela_numero}/${m.e.total_parcelas}` : null };
      if (m.tipo === 'duplicada') { r.status = 'duplicada'; r.acao = 'descartar'; r.observacao = l.valor > 0 ? 'Crédito já registrado.' : 'Compra já registrada.'; }
      else if (m.tipo === 'casada') { r.status = 'casada'; r.acao = 'manter'; r.observacao = `Parcela ${m.e.parcela_numero}/${m.e.total_parcelas} já registrada (valor dentro da tolerância).`; }
      else { r.status = 'divergente'; r.acao = 'atualizar'; r.observacao = `A parcela registrada é ${m.e.valor.toFixed(2).replace('.', ',')}; a fatura traz ${(-l.valor).toFixed(2).replace('.', ',')}.`; }
      return r;
    }
    if (l.valor > 0) return classificarCredito(l, r);
    const c = categorizarTransacao(l.descricao, categorias, { usuarioId, valor: l.valor, contaId: null });
    if (c) { r.categoriaId = c; r.categoriaNome = nomeCat[c]; r.categoriaAuto = true; }
    return r;
  });
  // Total da fatura segundo o arquivo (compras + IOF/encargos − créditos; sem o pagamento da fatura anterior)
  const contam = saida.filter((r) => r.status !== 'fora_periodo' && r.status !== 'pagamento_recebido');
  const totalArquivo = faturas.arredondar(contam.reduce((s, r) => s - r.valor, 0));
  const somaCompras = faturas.arredondar(contam.filter((r) => r.valor < 0).reduce((s, r) => s - r.valor, 0));
  const somaCreditos = faturas.arredondar(contam.filter((r) => r.valor > 0).reduce((s, r) => s + r.valor, 0));
  return { linhas: saida, totalArquivo, compras: somaCompras, creditos: somaCreditos };
}

module.exports = { classificarConta, classificarFatura, faturasEmAberto, dentroDaTolerancia, categoriasDoUsuario, restosDeImportacaoDesfeita, JANELA_DIAS };
