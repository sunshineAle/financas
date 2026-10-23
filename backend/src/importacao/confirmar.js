// Importação — gravação (confirmar) e desfazer. TODA escrita passa pela camada `dados`.
const db = require('../db');
const dados = require('../dados');
const T = require('./texto');
const faturas = require('../utils/faturas');
const integ = require('./integracoes');
const { destinoDe, ErroImportacao } = require('./motor');
const { faturasEmAberto, dentroDaTolerancia } = require('./classificar');

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
  const resultado = { novas: 0, atualizadas: 0, ignoradas: 0, anuladas: 0, faturasPagas: 0, transferencias: 0, avisos: [], reservasPendentes: [] };

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
    const ctx = { usuarioId, formato, importacao, resultado, opcoes, fatura: corpo.fatura || null };
    if (dest.tipo === 'conta') gravarConta(ctx, dest.conta, linhas, corpo);
    else gravarFatura(ctx, dest.cartao, linhas);
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

// ------------------------------------------------------------------------------------------- conta
function gravarConta(ctx, conta, linhas, corpo) {
  const { usuarioId, formato, importacao, resultado, opcoes } = ctx;
  const categoriasOk = new Set(db.prepare('SELECT id FROM categorias_orcamento WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId).map((c) => c.id));
  const receitasOk = new Set(db.prepare('SELECT nome FROM categorias_receita WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId).map((c) => c.nome));
  const emAberto = faturasEmAberto(usuarioId);
  const inseridas = new Map();
  const E = integ.lancamentos();

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

    if (l.status === 'reserva' && l.reserva) resultado.reservasPendentes.push({ transacaoId: t.id, rotulo: l.reserva.rotulo, sentido: l.reserva.sentido, valor: Math.abs(valor), data: l.data, descricao: l.descricao });

    if (l.acao === 'transferencia' && l.transferencia && l.transferencia.contaId) {
      try {
        if (!E || !E.converterEmTransferencia) throw new Error('indisponível');
        E.converterEmTransferencia(usuarioId, t.id, String(l.transferencia.contaId));
        resultado.transferencias++;
      } catch (e) { resultado.avisos.push(`"${l.descricao}": não consegui transformar em transferência (${e.message}); ficou como lançamento comum.`); }
    }

    if (l.status === 'pagamento_fatura' && l.fatura && l.fatura.cartaoId && l.fatura.chave) {
      const f = emAberto.find((x) => x.cartaoId === String(l.fatura.cartaoId) && x.chave === l.fatura.chave);
      if (f && valor < 0 && dentroDaTolerancia(f.total, valor)) {
        const fp = dados.inserir('faturas_pagas', { cartao_id: f.cartaoId, fatura: f.chave, conta_id: conta.id, transacao_id: t.id, valor: f.total, data: l.data });
        registrar(importacao.id, 'faturas_pagas', fp.id, formato, 'inserido', null);
        resultado.faturasPagas++;
        const i = emAberto.indexOf(f); emAberto.splice(i, 1);
      } else resultado.avisos.push(`"${l.descricao}": a fatura escolhida não está mais em aberto com esse valor; ficou como saída comum.`);
    }
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
    const categoriaId = !ehCredito && l.categoriaId && categoriasOk.has(String(l.categoriaId)) ? String(l.categoriaId) : null;
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
      });
      registrar(importacao.id, 'lancamentos_cartao', rec.id, formato, 'inserido', null);
      if (k === n) primeira = rec;
      else resultado.projetadas = (resultado.projetadas || 0) + 1;
    }
    inseridas.set(l.idx, primeira);
    resultado.novas++;
  }

  for (const l of linhas) {
    if (!l.anula || !inseridas.has(l.idx) || ACOES_GRAVAM.indexOf(l.acao) < 0) continue;
    const est = inseridas.get(l.idx);
    let ori = null;
    if (l.anula.tipo === 'existente') ori = db.prepare('SELECT * FROM lancamentos_cartao WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(l.anula.id), usuarioId);
    else ori = inseridas.get(l.anula.idx) || null;
    if (!ori) { resultado.avisos.push(`"${l.descricao}": a compra original não foi encontrada; o crédito entrou na fatura.`); continue; }
    const vinculo = dados.novoId();
    dados.atualizar('lancamentos_cartao', est.id, { tipo_mov: 'estorno', vinculo });
    dados.atualizar('lancamentos_cartao', ori.id, { tipo_mov: 'estornada', vinculo });
    registrar(importacao.id, 'lancamentos_cartao', ori.id, formato, 'anulado', { vinculo });
    resultado.anuladas++;
  }
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
        const conta = db.prepare('SELECT * FROM contas WHERE id = ? AND excluido_em IS NULL').get(t.conta_id);
        if (t.ignorada !== 1) somarSaldo(conta, -t.valor);
        if (t.categoria_id && t.valor < 0 && t.ignorada === 0) dados.somar('categorias_orcamento', t.categoria_id, 'gasto_atual', -Math.abs(t.valor));
        dados.excluirOnde('faturas_pagas', 'transacao_id = ?', [t.id]);
        dados.excluir('transacoes', t.id);
        removidos++;
      } else if (it.tabela === 'faturas_pagas') {
        if (dados.buscar('faturas_pagas', it.registro_id)) { dados.excluir('faturas_pagas', it.registro_id); removidos++; }
      } else if (it.tabela === 'lancamentos_cartao') {
        const l = dados.buscar('lancamentos_cartao', it.registro_id);
        if (!l) continue;
        if (it.acao === 'inserido') { dados.excluir('lancamentos_cartao', l.id); removidos++; }
        else if (it.acao === 'atualizado' && antes) { dados.atualizar('lancamentos_cartao', l.id, { valor: antes.valor }); revertidos++; }
        else if (it.acao === 'anulado') {
          dados.atualizarOnde('lancamentos_cartao', 'vinculo = ?', [antes && antes.vinculo ? antes.vinculo : l.vinculo], { tipo_mov: null, vinculo: null });
          revertidos++;
        }
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
