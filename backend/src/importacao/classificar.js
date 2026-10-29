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
  // Pagamento da fatura anterior: fica fora da fatura (crédito "Pagamento recebido" ou, com descrição inequívoca, qualquer sinal)
  const ehPagamento = (l) => (l.valor > 0
    ? integ.pareceCreditoDePagamento(l.descricao) && !integ.ehEstorno(l.descricao)
    : integ.pareceTextoDePagamentoDaFatura(l.descricao));
  const dentro = linhas.filter((l) => !l.foraPeriodo && !ehPagamento(l));
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
  dentro.filter((l) => l.valor > 0 && !casamento.has(l.idx)).forEach((l) => {
    const e = lancs.find((x) => !consumidos.has(x.id) && x.valor < 0 && mesmoValor(-x.valor, l.valor) && Math.abs(T.diasEntre(x.data_compra, l.data)) <= 1);
    if (e) { consumidos.add(e.id); casamento.set(l.idx, { e: { ...e, valor: -e.valor }, tipo: 'duplicada' }); }
  });

  const categorias = categoriasDoUsuario(usuarioId);
  const nomeCat = Object.fromEntries(categorias.map((c) => [c.id, c.nome]));
  const anuladas = new Set(); // compras do arquivo já ligadas a um estorno (um estorno para cada compra)
  const saida = linhas.map((l) => {
    const r = {
      idx: l.idx, data: l.data, descricao: l.descricao, valor: l.valor, fitid: l.fitid || null, confianca: l.confianca, bruto: l.bruto,
      status: 'nova', acao: 'importar', parcela: null, existente: null, anula: null, fatura: null, reserva: null, transferencia: null,
      categoriaId: null, categoriaNome: null, categoriaAuto: false, observacao: '',
    };
    if (l.foraPeriodo) { r.status = 'fora_periodo'; r.acao = 'descartar'; r.observacao = 'Fora do período escolhido.'; return r; }
    if (ehPagamento(l)) { r.status = 'pagamento_recebido'; r.acao = 'descartar'; r.observacao = 'Pagamento da fatura: não é compra, fica de fora.'; return r; }
    const p = parcelaDe(l);
    if (p) r.parcela = { atual: p.atual, total: p.total };
    const m = casamento.get(l.idx);
    if (m) {
      r.existente = { id: m.e.id, descricao: m.e.descricao, valor: -m.e.valor, data: m.e.data_compra, parcela: m.e.total_parcelas > 1 ? `${m.e.parcela_numero}/${m.e.total_parcelas}` : null };
      if (m.tipo === 'duplicada') { r.status = 'duplicada'; r.acao = 'descartar'; r.observacao = 'Compra já registrada.'; }
      else if (m.tipo === 'casada') { r.status = 'casada'; r.acao = 'manter'; r.observacao = `Parcela ${m.e.parcela_numero}/${m.e.total_parcelas} já registrada (valor dentro da tolerância).`; }
      else { r.status = 'divergente'; r.acao = 'atualizar'; r.observacao = `A parcela registrada é ${m.e.valor.toFixed(2).replace('.', ',')}; a fatura traz ${(-l.valor).toFixed(2).replace('.', ',')}.`; }
      return r;
    }
    if (l.valor > 0) {
      // crédito que não é pagamento: estorno, devolução, cashback...
      r.status = 'estorno';
      const ori = lancs.find((e) => !consumidos.has(e.id) && !e.tipo_mov && mesmoValor(e.valor, l.valor) && e.data_compra <= l.data && T.semelhanca(limparEstorno(l.descricao), e.descricao) >= 0.34);
      if (ori) {
        consumidos.add(ori.id);
        r.anula = { tipo: 'existente', id: ori.id, descricao: ori.descricao, valor: ori.valor, data: ori.data_compra };
        r.observacao = `Anula a compra "${ori.descricao}" de ${ori.data_compra}.`;
      } else {
        const par = dentro.find((o) => o.idx !== l.idx && o.valor < 0 && mesmoValor(-o.valor, l.valor) && T.semelhanca(limparEstorno(l.descricao), o.descricao) >= 0.34 && !casamento.has(o.idx) && !anuladas.has(o.idx));
        if (par) anuladas.add(par.idx);
        if (par) { r.anula = { tipo: 'linha', idx: par.idx, descricao: par.descricao, valor: par.valor, data: par.data }; r.observacao = `Anula "${par.descricao}" do mesmo arquivo.`; }
        else r.observacao = 'Crédito/estorno sem compra original encontrada: entra como crédito na fatura.';
      }
      return r;
    }
    const c = categorizarTransacao(l.descricao, categorias, { usuarioId, valor: l.valor, contaId: null });
    if (c) { r.categoriaId = c; r.categoriaNome = nomeCat[c]; r.categoriaAuto = true; }
    return r;
  });
  // Total da fatura segundo o arquivo (compras + IOF/encargos − créditos; sem o pagamento da fatura anterior)
  const totalArquivo = faturas.arredondar(saida.filter((r) => r.status !== 'fora_periodo' && r.status !== 'pagamento_recebido').reduce((s, r) => s - r.valor, 0));
  return { linhas: saida, totalArquivo };
}

module.exports = { classificarConta, classificarFatura, faturasEmAberto, dentroDaTolerancia, categoriasDoUsuario, restosDeImportacaoDesfeita, JANELA_DIAS };
