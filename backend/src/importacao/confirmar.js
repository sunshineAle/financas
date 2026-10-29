// Importação — gravação (confirmar) e desfazer. TODA escrita passa pela camada `dados`.
const db = require('../db');
const dados = require('../dados');
const T = require('./texto');
const faturas = require('../utils/faturas');
const integ = require('./integracoes');
const { destinoDe, ErroImportacao } = require('./motor');
const { faturasEmAberto, dentroDaTolerancia, restosDeImportacaoDesfeita } = require('./classificar');

const arred = faturas.arredondar;
const ACOES_GRAVAM = ['importar', 'criar', 'transferencia'];
const dia = (d) => String(d).slice(0, 10);

function somarSaldo(conta, delta) {
  if (conta && conta.origem === 'manual' && delta) dados.somar('contas', conta.id, 'saldo', delta);
}

function registrar(importacaoId, tabela, registroId, formato, acao, antes) {
  dados.inserir('importacao_itens', { importacao_id: importacaoId, tabela, registro_id: registroId, formato, acao, antes: antes ? JSON.stringify(antes) : null });
}

function validarLinha(l) {
  if (!T.parseData(l.data) || String(l.data).length !== 10) return 'Data inválida';
  if (!Number.isFinite(Number(l.valor))) return 'Valor inválido';
  if (!String(l.descricao || '').trim()) return 'Descrição vazia';
  return null;
}

// Em que data_compra uma parcela `n` cai na fatura `alvo` do cartão.
function dataCompraNaFatura(cartao, alvo, dataLinha, n) {
  const f = (d) => faturas.faturaDaParcela(d, cartao.dia_fechamento, cartao.dia_vencimento, n);
  if (!alvo) return { data: dataLinha, ajustada: false };
  if (f(dataLinha) === alvo) return { data: dataLinha, ajustada: false };
  const recuada = T.somarMeses(dataLinha, -(n - 1));
  if (n > 1 && f(recuada) === alvo) return { data: recuada, ajustada: false };
  // plano B: a data de fechamento da fatura da 1ª parcela (cai nela por definição)
  const [a, m] = alvo.split('-').map(Number);
  const t = a * 12 + (m - 1) - (n - 1);
  const chave1 = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  return { data: faturas.datasDaFatura(chave1, cartao.dia_fechamento, cartao.dia_vencimento).fecha, ajustada: true };
}

function confirmar(usuarioId, corpo) {
  const dest = destinoDe(usuarioId, corpo.destino);
  const linhas = Array.isArray(corpo.linhas) ? corpo.linhas : [];
  if (!linhas.length) throw new ErroImportacao('Nada para importar.');
  if (linhas.length > 6000) throw new ErroImportacao('Linhas demais de uma vez (máximo 6.000).');
  const formato = ['ofx', 'csv', 'xlsx', 'pdf'].includes(corpo.formato) ? corpo.formato : 'csv';
  const opcoes = corpo.opcoes || {};
  const periodo = corpo.periodo || {};
  const resultado = { novas: 0, atualizadas: 0, ignoradas: 0, anuladas: 0, faturasPagas: 0, transferencias: 0, avisos: [], reservasPendentes: [], vinculadas: [] };

  for (const l of linhas) {
    if (ACOES_GRAVAM.includes(l.acao) || l.acao === 'atualizar') {
      const erro = validarLinha(l);
      if (erro) throw new ErroImportacao(`Linha ${Number(l.idx) + 1}: ${erro}.`);
    }
  }

  let importacao;
  dados.transacao(() => {
    importacao = dados.inserir('importacoes', {
      usuario_id: usuarioId, tipo: dest.tipo, conta_id: dest.conta ? dest.conta.id : null, cartao_id: dest.cartao ? dest.cartao.id : null,
      formato, arquivo_nome: String(corpo.nomeArquivo || '').slice(0, 200) || null, banco: corpo.banco || null,
      periodo_inicio: periodo.inicio || null, periodo_fim: periodo.fim || null, fatura: corpo.fatura || null, qtd_total: linhas.length,
    });
    // "Impressão digital" do arquivo: fica como item da importação e some quando ela é desfeita (ver motor.importacaoAnterior)
    const impressao = typeof corpo.impressao === 'string' && /^[a-z0-9:]{6,80}$/.test(corpo.impressao) ? corpo.impressao : null;
    if (impressao) registrar(importacao.id, 'arquivo', impressao, formato, 'impressao', { nome: corpo.nomeArquivo || null });
    const ctx = { usuarioId, formato, importacao, resultado, opcoes, fatura: corpo.fatura || null };
    const restos = removerRestos(usuarioId, dest);
    if (restos) resultado.avisos.push(`${restos} lançamento(s) que tinham sobrado de importações desfeitas foram removidos.`);
    if (dest.tipo === 'conta') gravarConta(ctx, dest.conta, linhas, corpo);
    else {
      gravarFatura(ctx, dest.cartao, linhas);
      if (ctx.fatura) {
        const totalApp = totalDaFatura(dest.cartao, ctx.fatura);
        const totalArquivo = arred(linhas.filter((l) => l.status !== 'fora_periodo' && l.status !== 'pagamento_recebido').reduce((t, l) => t - (Number(l.valor) || 0), 0));
        const contam = linhas.filter((l) => l.status !== 'fora_periodo' && l.status !== 'pagamento_recebido' && (ACOES_GRAVAM.includes(l.acao) || l.status === 'duplicada' || l.acao === 'manter' || l.acao === 'atualizar'));
        const compras = arred(contam.filter((l) => Number(l.valor) < 0).reduce((t, l) => t - Number(l.valor), 0));
        const creditos = arred(contam.filter((l) => Number(l.valor) > 0).reduce((t, l) => t + Number(l.valor), 0));
        resultado.fatura = { chave: ctx.fatura, totalApp, totalArquivo, compras, creditos }; // anotação 61: total = compras − créditos
        if (Math.abs(totalApp - totalArquivo) > 0.009) {
          resultado.avisos.push(`A fatura ${ctx.fatura.split('-').reverse().join('/')} soma ${totalApp.toFixed(2).replace('.', ',')} no app e ${totalArquivo.toFixed(2).replace('.', ',')} no arquivo: confira linhas descartadas e lançamentos feitos à mão nessa fatura.`);
        }
      }
    }
    dados.atualizar('importacoes', importacao.id, {
      qtd_novas: resultado.novas, qtd_atualizadas: resultado.atualizadas, qtd_ignoradas: resultado.ignoradas,
    });
    if (opcoes.salvarPerfil && corpo.mapeamento && corpo.assinatura && (formato === 'csv' || formato === 'xlsx')) {
      const nome = String(opcoes.salvarPerfil.nome || corpo.banco || 'Meu banco').slice(0, 60);
      const existente = db.prepare('SELECT id FROM perfis_importacao WHERE usuario_id = ? AND assinatura = ? AND excluido_em IS NULL').get(usuarioId, corpo.assinatura);
      const campos = { nome, formato, assinatura: corpo.assinatura, mapeamento: JSON.stringify(corpo.mapeamento) };
      if (existente) dados.atualizar('perfis_importacao', existente.id, campos);
      else dados.inserir('perfis_importacao', { usuario_id: usuarioId, ...campos });
      resultado.perfilSalvo = nome;
    }
  });
  return { importacaoId: importacao.id, ...resultado };
}

// Total de uma fatura do cartão como o app mostra (soma de todas as parcelas e créditos que caem nela).
function totalDaFatura(cartao, chave) {
  const itens = db.prepare('SELECT data_compra, parcela_numero, valor FROM lancamentos_cartao WHERE cartao_id = ? AND excluido_em IS NULL').all(cartao.id);
  return arred(itens.filter((l) => faturas.faturaDaParcela(l.data_compra, cartao.dia_fechamento, cartao.dia_vencimento, l.parcela_numero) === chave).reduce((t, l) => t + l.valor, 0));
}

// Exclusão suave de uma transação importada, devolvendo saldo da conta e gasto da categoria.
function removerTransacao(t) {
  const conta = db.prepare('SELECT * FROM contas WHERE id = ? AND excluido_em IS NULL').get(t.conta_id);
  // Anotação 56: se estava ligada a uma meta (caixinha), tira o Guardar/Resgatar da meta e a linha de rendimento derivada
  try { const C = integ.caixinhas(); if (C) C.desvincularTransacao(t, { manterTransacao: false }); } catch (e) { /* segue */ }
  if (t.ignorada !== 1) somarSaldo(conta, -t.valor);
  if (t.categoria_id && t.valor < 0 && t.ignorada === 0) dados.somar('categorias_orcamento', t.categoria_id, 'gasto_atual', -Math.abs(t.valor));
  dados.excluirOnde('faturas_pagas', 'transacao_id = ?', [t.id]);
  dados.excluir('transacoes', t.id);
}

// Lançamentos de cartão: exclui a compra inteira (todas as parcelas da mesma compra_id) e os créditos-espelho de um
// estorno feito depois no app (mesmo vínculo). Devolve quantos excluiu.
function removerCompraCartao(l) {
  let n = dados.excluirOnde('lancamentos_cartao', 'compra_id = ? AND cartao_id = ?', [l.compra_id, l.cartao_id]);
  if (l.vinculo && l.tipo_mov === 'estornada') n += dados.excluirOnde('lancamentos_cartao', "vinculo = ? AND tipo_mov = 'estorno' AND id NOT IN (SELECT registro_id FROM importacao_itens WHERE excluido_em IS NULL AND acao = 'inserido')", [l.vinculo]);
  return n;
}

// Restos de importações desfeitas no mesmo destino (registros que deveriam ter saído e continuam ativos).
function removerRestos(usuarioId, dest) {
  let n = 0;
  if (dest.tipo === 'fatura') {
    restosDeImportacaoDesfeita('lancamentos_cartao', usuarioId).forEach((id) => {
      const l = dados.buscar('lancamentos_cartao', id);
      if (l && l.cartao_id === dest.cartao.id && dados.excluir('lancamentos_cartao', l.id)) n++;
    });
  } else {
    restosDeImportacaoDesfeita('transacoes', usuarioId).forEach((id) => {
      const t = dados.buscar('transacoes', id);
      if (t && t.conta_id === dest.conta.id && !t.tipo_mov) { removerTransacao(t); n++; }
    });
  }
  return n;
}

// ------------------------------------------------------------------------------------------- conta
function gravarConta(ctx, conta, linhas, corpo) {
  const { usuarioId, formato, importacao, resultado, opcoes } = ctx;
  const categoriasOk = new Set(db.prepare('SELECT id FROM categorias_orcamento WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId).map((c) => c.id));
  const receitasOk = new Set(db.prepare('SELECT nome FROM categorias_receita WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId).map((c) => c.nome));
  const emAberto = faturasEmAberto(usuarioId);
  const inseridas = new Map();
  const E = integ.lancamentos();
  const caixinhasAVincular = [];

  for (const l of linhas) {
    const valor = arred(Number(l.valor));
    if (l.acao === 'descartar' || l.acao === 'manter' || !l.acao) { resultado.ignoradas++; continue; }
    if (l.acao === 'atualizar') {
      const t = l.existenteId ? db.prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND conta_id = ? AND excluido_em IS NULL').get(String(l.existenteId), usuarioId, conta.id) : null;
      if (!t || t.tipo_mov) { resultado.ignoradas++; resultado.avisos.push(`"${l.descricao}": o lançamento a atualizar não está mais disponível.`); continue; }
      const delta = arred(valor - t.valor);
      dados.atualizar('transacoes', t.id, { valor });
      if (t.ignorada !== 1) {
        somarSaldo(conta, delta);
        if (t.categoria_id && t.ignorada === 0) {
          if (t.valor < 0) dados.somar('categorias_orcamento', t.categoria_id, 'gasto_atual', -Math.abs(t.valor));
          if (valor < 0) dados.somar('categorias_orcamento', t.categoria_id, 'gasto_atual', Math.abs(valor));
        }
      }
      registrar(importacao.id, 'transacoes', t.id, formato, 'atualizado', { valor: t.valor });
      resultado.atualizadas++;
      continue;
    }
    if (!ACOES_GRAVAM.includes(l.acao)) { resultado.ignoradas++; continue; }

    let idExterno = null;
    if (l.fitid) {
      idExterno = `imp:${formato}:${conta.id}:${l.fitid}`;
      if (db.prepare('SELECT 1 FROM transacoes WHERE usuario_id = ? AND id_externo = ? AND excluido_em IS NULL').get(usuarioId, idExterno)) { resultado.ignoradas++; continue; }
    }
    const categoriaId = valor < 0 && l.categoriaId && categoriasOk.has(String(l.categoriaId)) && l.status !== 'reserva' && l.status !== 'pagamento_fatura' ? String(l.categoriaId) : null;
    const t = dados.inserir('transacoes', {
      conta_id: conta.id, usuario_id: usuarioId, categoria_id: categoriaId, descricao: String(l.descricao).trim().slice(0, 200), valor, data: l.data,
      categorizacao_automatica: categoriaId && l.categoriaAuto ? 1 : 0, origem: 'manual', id_externo: idExterno,
      categoria_receita: valor > 0 && l.categoriaReceita && receitasOk.has(String(l.categoriaReceita)) ? String(l.categoriaReceita) : null,
    });
    somarSaldo(conta, valor);
    if (categoriaId) dados.somar('categorias_orcamento', categoriaId, 'gasto_atual', Math.abs(valor));
    registrar(importacao.id, 'transacoes', t.id, formato, 'inserido', null);
    inseridas.set(l.idx, t);
    resultado.novas++;

    if (l.status === 'reserva' && l.reserva && l.reserva.caixinha) {
      // Anotação 56: caixinha ligada a meta. Com meta escolhida, vincula depois do laço (em ordem de data); sem meta, fica
      // "A revisar" já fora dos totais (não conta como entrada/saída enquanto o usuário não decide).
      const sentido = valor < 0 ? 'guardar' : 'resgatar';
      if (l.reserva.metaId) caixinhasAVincular.push({ t, metaId: String(l.reserva.metaId), sentido, data: l.data });
      else {
        require('../utils/carteiraDb').tirarDosTotais(t.id, 'reserva_pendente');
        resultado.reservasPendentes.push({ transacaoId: t.id, rotulo: l.reserva.rotulo, sentido, valor: Math.abs(valor), data: l.data, descricao: l.descricao });
      }
    } else if (l.status === 'reserva' && l.reserva) resultado.reservasPendentes.push({ transacaoId: t.id, rotulo: l.reserva.rotulo, sentido: l.reserva.sentido, valor: Math.abs(valor), data: l.data, descricao: l.descricao });

    if (l.acao === 'transferencia' && l.transferencia && l.transferencia.contaId) {
      try {
        if (!E || !E.converterEmTransferencia) throw new Error('indisponível');
        E.converterEmTransferencia(usuarioId, t.id, String(l.transferencia.contaId));
        resultado.transferencias++;
      } catch (e) { resultado.avisos.push(`"${l.descricao}": não consegui transformar em transferência (${e.message}); ficou como lançamento comum.`); }
    }

    // Anotação 61: saída que é o pagamento adiantado já lançado na fatura do cartão — liga os dois (não conta duas vezes)
    if (l.status === 'pagamento_fatura' && l.fatura && l.fatura.adiantadoId) {
      const lanc = db.prepare("SELECT * FROM lancamentos_cartao WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL AND tipo_mov = 'pagamento' AND vinculo IS NULL").get(String(l.fatura.adiantadoId), usuarioId);
      if (lanc && E && E.ligarPagamentoCartao) {
        const { vinculo } = E.ligarPagamentoCartao(lanc, db.prepare('SELECT * FROM transacoes WHERE id = ?').get(t.id));
        registrar(importacao.id, 'transacoes', t.id, formato, 'anulado', { vinculo, pagamentoCartao: true });
        resultado.pagamentosCasados = (resultado.pagamentosCasados || 0) + 1;
      } else resultado.avisos.push(`"${l.descricao}": o pagamento adiantado do cartão não está mais disponível; ficou como saída comum.`);
    } else if (l.status === 'pagamento_fatura' && l.fatura && l.fatura.cartaoId && l.fatura.chave) {
      const f = emAberto.find((x) => x.cartaoId === String(l.fatura.cartaoId) && x.chave === l.fatura.chave);
      if (f && valor < 0) {
        // 'valor' = o que saiu da conta. Diferença pequena a menos = desconto; diferença maior fica só como aviso
        // (a fatura no app pode estar incompleta). O importante é a saída não contar como gasto em dobro.
        const pago = Math.abs(valor);
        const tol = dentroDaTolerancia(f.total, valor);
        const fp = dados.inserir('faturas_pagas', { cartao_id: f.cartaoId, fatura: f.chave, conta_id: conta.id, transacao_id: t.id, valor: pago, desconto: tol && f.total > pago ? arred(f.total - pago) : 0, data: l.data });
        registrar(importacao.id, 'faturas_pagas', fp.id, formato, 'inserido', null);
        resultado.faturasPagas++;
        if (!tol) resultado.avisos.push(`"${l.descricao}": pagou ${pago.toFixed(2).replace('.', ',')} e a fatura ${f.chave} soma ${f.total.toFixed(2).replace('.', ',')} no app. Confira a fatura (importe a fatura do cartão para conferir).`);
        const i = emAberto.indexOf(f); emAberto.splice(i, 1);
      } else resultado.avisos.push(`"${l.descricao}": a fatura escolhida não está mais em aberto; ficou como saída comum.`);
    }
  }

  // Anotação 56: Guardar/Resgatar nas metas das caixinhas, em ordem de data (o resgate separa o rendimento pelo que já
  // estava guardado, inclusive o que entrou neste mesmo arquivo).
  if (caixinhasAVincular.length) {
    const C = integ.caixinhas();
    const reserva = require('../utils/carteiraDb').buscarReserva(usuarioId);
    resultado.vinculadas = resultado.vinculadas || [];
    caixinhasAVincular.sort((a, b) => String(a.data).localeCompare(String(b.data))).forEach((v) => {
      const meta = db.prepare('SELECT * FROM metas_reserva WHERE id = ? AND reserva_id = ? AND excluido_em IS NULL').get(v.metaId, reserva.id);
      const t = db.prepare('SELECT * FROM transacoes WHERE id = ?').get(v.t.id);
      try {
        if (!C || !meta) throw new Error('meta não encontrada');
        const r = C.vincularTransacao(usuarioId, reserva, t, meta, { sentido: v.sentido });
        resultado.vinculadas.push({ transacaoId: t.id, metaId: meta.id, metaNome: meta.nome, sentido: v.sentido, valor: Math.abs(t.valor), rendimento: r.rendimento, descricao: t.descricao });
      } catch (e) {
        try { require('../utils/carteiraDb').tirarDosTotais(t.id, 'reserva_pendente'); } catch (e2) { /* segue */ }
        resultado.reservasPendentes.push({ transacaoId: t.id, rotulo: v.sentido === 'guardar' ? 'Guardar' : 'Resgatar', sentido: v.sentido, valor: Math.abs(t.valor), data: v.data, descricao: t.descricao });
        resultado.avisos.push(`"${t.descricao}": não consegui vincular à meta (${e.message}); ficou em A revisar.`);
      }
    });
  }

  // Estornos: ligam o estorno à despesa original (existente ou do mesmo arquivo)
  for (const l of linhas) {
    if (!l.anula || !inseridas.has(l.idx) || ACOES_GRAVAM.indexOf(l.acao) < 0) continue;
    const est = inseridas.get(l.idx);
    let ori = null;
    if (l.anula.tipo === 'existente') ori = db.prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(l.anula.id), usuarioId);
    else if (l.anula.tipo === 'linha') ori = inseridas.get(l.anula.idx) || null;
    if (!ori) { resultado.avisos.push(`"${l.descricao}": a despesa original não foi encontrada; o estorno entrou como entrada.`); continue; }
    try {
      if (E && E.vincularEstorno) {
        const { vinculo } = E.vincularEstorno(usuarioId, est.id, ori.id);
        registrar(importacao.id, 'transacoes', est.id, formato, 'anulado', { vinculo, original: ori.id });
      } else {
        const vinculo = dados.novoId();
        const origAtual = db.prepare('SELECT * FROM transacoes WHERE id = ?').get(ori.id);
        if (origAtual.categoria_id && origAtual.valor < 0 && origAtual.ignorada === 0) dados.somar('categorias_orcamento', origAtual.categoria_id, 'gasto_atual', -Math.abs(origAtual.valor));
        dados.atualizar('transacoes', ori.id, { tipo_mov: 'estornada', vinculo, ignorada: 2 });
        dados.atualizar('transacoes', est.id, { tipo_mov: 'estorno', vinculo, ignorada: 2 });
        registrar(importacao.id, 'transacoes', est.id, formato, 'anulado', { vinculo, original: ori.id });
      }
      resultado.anuladas++;
    } catch (e) { resultado.avisos.push(`"${l.descricao}": não consegui anular a despesa original (${e.message}).`); }
  }

  // Saldo do extrato (opcional): ajusta o saldo da conta manual para o saldo informado no arquivo
  if (opcoes.ajustarSaldo && corpo.saldoExtrato && Number.isFinite(Number(corpo.saldoExtrato.valor)) && conta.origem === 'manual') {
    const atual = db.prepare('SELECT saldo FROM contas WHERE id = ?').get(conta.id).saldo;
    const delta = arred(Number(corpo.saldoExtrato.valor) - atual);
    if (delta) {
      dados.somar('contas', conta.id, 'saldo', delta);
      registrar(importacao.id, 'contas', conta.id, formato, 'atualizado', { delta });
      resultado.saldoAjustado = delta;
    }
  }
}

// ------------------------------------------------------------------------------------------- fatura
function gravarFatura(ctx, cartao, linhas) {
  const { usuarioId, formato, importacao, resultado, opcoes, fatura } = ctx;
  const categoriasOk = new Set(db.prepare('SELECT id FROM categorias_orcamento WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId).map((c) => c.id));
  const inseridas = new Map();
  const E = integ.lancamentos();
  const unico = (idExt) => !db.prepare('SELECT 1 FROM lancamentos_cartao WHERE usuario_id = ? AND id_externo = ? AND excluido_em IS NULL').get(usuarioId, idExt);

  for (const l of linhas) {
    const valor = arred(Number(l.valor));
    if (l.acao === 'descartar' || l.acao === 'manter' || !l.acao) { resultado.ignoradas++; continue; }
    if (l.acao === 'atualizar') {
      const e = l.existenteId ? db.prepare('SELECT * FROM lancamentos_cartao WHERE id = ? AND usuario_id = ? AND cartao_id = ? AND excluido_em IS NULL').get(String(l.existenteId), usuarioId, cartao.id) : null;
      if (!e) { resultado.ignoradas++; resultado.avisos.push(`"${l.descricao}": a parcela a atualizar não está mais disponível.`); continue; }
      const paga = db.prepare('SELECT 1 FROM faturas_pagas WHERE cartao_id = ? AND excluido_em IS NULL AND fatura = ?').get(cartao.id, faturas.faturaDaParcela(e.data_compra, cartao.dia_fechamento, cartao.dia_vencimento, e.parcela_numero));
      if (paga) { resultado.ignoradas++; resultado.avisos.push(`"${l.descricao}": a fatura dessa parcela já está paga; valor mantido.`); continue; }
      dados.atualizar('lancamentos_cartao', e.id, { valor: Math.abs(valor) });
      registrar(importacao.id, 'lancamentos_cartao', e.id, formato, 'atualizado', { valor: e.valor });
      resultado.atualizadas++;
      continue;
    }
    if (!ACOES_GRAVAM.includes(l.acao) && l.acao !== 'importar') { resultado.ignoradas++; continue; }

    const ehCredito = valor > 0;
    const p = l.parcela && Number(l.parcela.total) >= 2 && !ehCredito ? { atual: Math.max(1, Number(l.parcela.atual) || 1), total: Number(l.parcela.total) } : null;
    // Anotação 61: o crédito também leva categoria quando é estorno (reduz o gasto da categoria); pagamento e cashback não
    const tipoCredito = !ehCredito ? null : l.status === 'pagamento_adiantado' ? 'pagamento' : l.status === 'cashback' ? 'cashback' : 'estorno';
    const categoriaId = (!ehCredito || tipoCredito === 'estorno') && l.categoriaId && categoriasOk.has(String(l.categoriaId)) ? String(l.categoriaId) : null;
    let idExterno = null;
    if (l.fitid) {
      idExterno = `imp:${formato}:${cartao.id}:${l.fitid}`;
      if (!unico(idExterno)) { resultado.ignoradas++; continue; }
    }
    const descricao = String(l.descricao).trim().slice(0, 200);
    const n = p ? p.atual : 1;
    const { data: dataCompra, ajustada } = dataCompraNaFatura(cartao, fatura, l.data, n);
    if (ajustada) resultado.avisos.push(`"${descricao}": a data foi ajustada para cair na fatura ${fatura}.`);
    const compraId = dados.novoId();
    const ultimaParcela = p && opcoes.projetarParcelas !== false ? p.total : n;
    let primeira = null;
    for (let k = n; k <= ultimaParcela; k++) {
      const rec = dados.inserir('lancamentos_cartao', {
        cartao_id: cartao.id, usuario_id: usuarioId, compra_id: compraId, descricao,
        valor: ehCredito ? -Math.abs(valor) : Math.abs(valor), data_compra: dataCompra, parcela_numero: k, total_parcelas: p ? p.total : 1,
        categoria_id: categoriaId, id_externo: k === n ? idExterno : null,
        // crédito: pagamento adiantado / cashback; estorno sem a compra original = avulso (A revisar) até ser ligado abaixo
        tipo_mov: tipoCredito === 'pagamento' ? 'pagamento' : tipoCredito === 'cashback' ? 'cashback' : tipoCredito === 'estorno' ? 'estorno_avulso' : null,
      });
      registrar(importacao.id, 'lancamentos_cartao', rec.id, formato, 'inserido', null);
      if (k === n) primeira = rec;
      else resultado.projetadas = (resultado.projetadas || 0) + 1;
    }
    inseridas.set(l.idx, primeira);
    resultado.novas++;
    if (tipoCredito === 'cashback') {
      if (!resultado.cashback) E.garantirCashback(usuarioId);
      resultado.cashback = arred((resultado.cashback || 0) + Math.abs(valor));
    }
    if (tipoCredito === 'pagamento') {
      resultado.pagamentosAdiantados = (resultado.pagamentosAdiantados || 0) + 1;
      // casa com a saída da conta (a escolhida na pré-visualização ou, se não veio, a que aparecer agora)
      let t = l.pagamento && l.pagamento.transacaoId
        ? db.prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL AND tipo_mov IS NULL AND ignorada = 0').get(String(l.pagamento.transacaoId), usuarioId)
        : null;
      if (!t) t = E.procurarSaidaDoPagamento(usuarioId, { valor, data: l.data });
      if (t) {
        const { vinculo } = E.ligarPagamentoCartao(primeira, t);
        registrar(importacao.id, 'transacoes', t.id, formato, 'anulado', { vinculo, pagamentoCartao: true });
        resultado.pagamentosCasados = (resultado.pagamentosCasados || 0) + 1;
      }
    }
  }

  for (const l of linhas) {
    if (!l.anula || !inseridas.has(l.idx) || ACOES_GRAVAM.indexOf(l.acao) < 0) continue;
    const est = inseridas.get(l.idx);
    let ori = null;
    if (l.anula.tipo === 'existente') ori = db.prepare('SELECT * FROM lancamentos_cartao WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(l.anula.id), usuarioId);
    else ori = inseridas.get(l.anula.idx) || null;
    if (ori) ori = db.prepare('SELECT * FROM lancamentos_cartao WHERE id = ? AND excluido_em IS NULL').get(ori.id) || null; // estado atual (estorno parcial anterior)
    if (!ori) { resultado.avisos.push(`"${l.descricao}": a compra original não foi encontrada; o estorno ficou em A revisar.`); continue; }
    if (ori.tipo_mov && ori.tipo_mov !== 'estornada_parcial') { resultado.avisos.push(`"${l.descricao}": a compra original já tem estorno; este ficou em A revisar.`); continue; }
    // Anotação 61: estorno total anula a compra; parcial anula só a parte estornada (a compra fica 'estornada_parcial')
    const { vinculo, parcial } = E.ligarEstornoCartao(est, ori);
    registrar(importacao.id, 'lancamentos_cartao', ori.id, formato, 'anulado', { vinculo });
    resultado.anuladas++;
    if (parcial) resultado.anuladasParcial = (resultado.anuladasParcial || 0) + 1;
  }
  resultado.estornosRevisar = db.prepare("SELECT COUNT(*) AS n FROM lancamentos_cartao WHERE id IN (SELECT registro_id FROM importacao_itens WHERE importacao_id = ? AND acao = 'inserido' AND excluido_em IS NULL) AND tipo_mov = 'estorno_avulso' AND excluido_em IS NULL").get(importacao.id).n;
}

// ------------------------------------------------------------------------------------------- desfazer
function desfazer(usuarioId, importacaoId) {
  const imp = db.prepare('SELECT * FROM importacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(importacaoId), usuarioId);
  if (!imp) throw new ErroImportacao('Importação não encontrada.', 404);
  if (imp.desfeita_em) throw new ErroImportacao('Esta importação já foi desfeita.');
  const itens = db.prepare('SELECT * FROM importacao_itens WHERE importacao_id = ? AND excluido_em IS NULL ORDER BY rowid DESC').all(imp.id);
  const E = integ.lancamentos();
  let removidos = 0; let revertidos = 0;
  dados.transacao(() => {
    for (const it of itens) {
      const antes = it.antes ? JSON.parse(it.antes) : null;
      if (it.tabela === 'transacoes') {
        let t = db.prepare('SELECT * FROM transacoes WHERE id = ? AND excluido_em IS NULL').get(it.registro_id);
        if (it.acao === 'anulado') {
          if (t && t.vinculo && E && E.desfazerPar) { try { E.desfazerPar(usuarioId, t.vinculo); revertidos++; } catch (e) { /* já desfeito */ } }
          continue;
        }
        if (!t) continue;
        if (it.acao === 'atualizado' && antes) {
          const conta = db.prepare('SELECT * FROM contas WHERE id = ? AND excluido_em IS NULL').get(t.conta_id);
          const delta = arred(antes.valor - t.valor);
          dados.atualizar('transacoes', t.id, { valor: antes.valor });
          if (t.ignorada !== 1) {
            somarSaldo(conta, delta);
            if (t.categoria_id && t.ignorada === 0) {
              if (t.valor < 0) dados.somar('categorias_orcamento', t.categoria_id, 'gasto_atual', -Math.abs(t.valor));
              if (antes.valor < 0) dados.somar('categorias_orcamento', t.categoria_id, 'gasto_atual', Math.abs(antes.valor));
            }
          }
          revertidos++;
          continue;
        }
        if (t.vinculo && /^transferencia/.test(t.tipo_mov || '') && E && E.desfazerPar) { try { E.desfazerPar(usuarioId, t.vinculo); } catch (e) { /* segue */ } }
        t = db.prepare('SELECT * FROM transacoes WHERE id = ? AND excluido_em IS NULL').get(it.registro_id);
        if (!t) { removidos++; continue; }
        removerTransacao(t);
        removidos++;
      } else if (it.tabela === 'faturas_pagas') {
        if (dados.buscar('faturas_pagas', it.registro_id)) { dados.excluir('faturas_pagas', it.registro_id); removidos++; }
      } else if (it.tabela === 'lancamentos_cartao') {
        const l = dados.buscar('lancamentos_cartao', it.registro_id);
        if (!l) continue;
        if (it.acao === 'inserido') removidos += removerCompraCartao(l);
        else if (it.acao === 'atualizado' && antes) { dados.atualizar('lancamentos_cartao', l.id, { valor: antes.valor }); revertidos++; }
        else if (it.acao === 'anulado') {
          dados.atualizarOnde('lancamentos_cartao', 'vinculo = ?', [antes && antes.vinculo ? antes.vinculo : l.vinculo], { tipo_mov: null, vinculo: null });
          revertidos++;
        }
      } else if (it.tabela === 'arquivo') {
        dados.excluir('importacao_itens', it.id); // a impressão do arquivo sai junto: o mesmo arquivo pode entrar de novo
      } else if (it.tabela === 'contas' && antes && antes.delta) {
        const conta = dados.buscar('contas', it.registro_id);
        if (conta) { dados.somar('contas', conta.id, 'saldo', -antes.delta); revertidos++; }
      }
    }
    dados.atualizar('importacoes', imp.id, { desfeita_em: dados.agora() });
  });
  return { ok: true, removidos, revertidos };
}

module.exports = { confirmar, desfazer };
