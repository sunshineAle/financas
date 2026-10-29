// Lançamentos especiais (setor E1): transferência entre contas próprias, estorno/devolução/cancelamento
// e pagamento de dívida/acordo por antecipação. JS puro (roda no servidor e no navegador/PWA).
//
// Convenção (ver CONTRATO-TRANSACOES.md):
//  - transacoes.ignorada: 0 = vale nos totais; 1 = ignorada pelo usuário (sai de tudo, inclusive do saldo);
//    2 = "fora dos totais" (transferência / estorno): o SALDO da conta continua valendo, mas Saldo do mês,
//    categorias, relatórios e dashboard não contam (todas as consultas já filtram `ignorada = 0`).
//  - tipo_mov: transferência = 'transferencia_interna' (par criado pelo app) | 'transferencia_vinculada' (lançamento que já existia/veio
//    de importação e foi ligado); estorno = 'estorno' (lançamento criado pelo app) | 'estorno_vinculado' (lançamento que já existia e foi ligado)
//    | 'estornada' (a despesa original). Ao desfazer, os "criados" são apagados e os "vinculados" só voltam ao normal.
//  - vinculo: UUID compartilhado pelo par.
//  - Toda gravação passa por `dados`.
const db = require('../db');
const dados = require('../dados');
const { arredondar } = require('./faturas');
const utilDividas = require('./dividas');

const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: process.env.APP_TIMEZONE || 'America/Sao_Paulo' });
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

class ErroLancamento extends Error {
  constructor(mensagem, status = 400) { super(mensagem); this.status = status; }
}
const falha = (m, s) => { throw new ErroLancamento(m, s); };

const ehTransferencia = (tipoMov) => tipoMov === 'transferencia_interna' || tipoMov === 'transferencia_vinculada';
const ehLinhaDeEstorno = (tipoMov) => tipoMov === 'estorno' || tipoMov === 'estorno_vinculado';

function contaDoUsuario(contaId, usuarioId) {
  if (contaId === undefined || contaId === null || contaId === '') return null;
  return db.prepare('SELECT * FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(contaId), usuarioId) || null;
}

// O saldo guardado só é mexido nas contas manuais (nas conectadas o saldo vem do banco).
function somarSaldo(contaId, delta) {
  const c = db.prepare('SELECT origem FROM contas WHERE id = ? AND excluido_em IS NULL').get(contaId);
  if (c && c.origem === 'manual') dados.somar('contas', contaId, 'saldo', delta);
}

// ---------------------------------------------------------------- transferência entre contas próprias
function criarTransferencia(usuarioId, { origemId, destinoId, valor, data, descricao }) {
  const origem = contaDoUsuario(origemId, usuarioId);
  const destino = contaDoUsuario(destinoId, usuarioId);
  if (!origem) falha('Escolha a conta de origem.');
  if (!destino) falha('Escolha a conta de destino.');
  if (origem.id === destino.id) falha('A conta de origem e a de destino precisam ser diferentes.');
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) falha('Informe um valor maior que zero.');
  const dia = data || hoje();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia))) falha('Data inválida.');
  const nota = String(descricao || '').trim().slice(0, 120);
  const vinculo = dados.novoId();
  let saida; let entrada;
  dados.transacao(() => {
    saida = dados.inserir('transacoes', {
      conta_id: origem.id, usuario_id: usuarioId, descricao: nota || `Transferência para ${destino.nome}`, valor: arredondar(-v), data: dia,
      origem: 'manual', ignorada: 2, tipo_mov: 'transferencia_interna', vinculo,
    });
    entrada = dados.inserir('transacoes', {
      conta_id: destino.id, usuario_id: usuarioId, descricao: nota || `Transferência de ${origem.nome}`, valor: arredondar(v), data: dia,
      origem: 'manual', ignorada: 2, tipo_mov: 'transferencia_interna', vinculo,
    });
    somarSaldo(origem.id, -v);
    somarSaldo(destino.id, v);
  });
  return { vinculo, saida, entrada };
}

// Transforma um lançamento que já existe (ex.: Pix/TED importado) em transferência entre contas próprias.
// `contaOutraId` = a outra ponta (destino, se o lançamento é saída; origem, se é entrada).
// Casa com um lançamento já existente na outra conta (mesmo valor, até 3 dias de diferença) ou cria a contrapartida.
function converterEmTransferencia(usuarioId, transacaoId, contaOutraId, { parceiraId } = {}) {
  const t = db.prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(transacaoId), usuarioId);
  if (!t) falha('Transação não encontrada.', 404);
  if (t.tipo_mov) falha('Este lançamento já faz parte de uma transferência ou estorno.');
  if (t.ignorada === 1) falha('Reative o lançamento antes de transformá-lo em transferência.');
  if (db.prepare('SELECT 1 FROM faturas_pagas WHERE transacao_id = ? AND excluido_em IS NULL').get(t.id)) falha('Esta saída é o pagamento de uma fatura de cartão: não é uma transferência.');
  const outra = contaDoUsuario(contaOutraId, usuarioId);
  if (!outra) falha('Escolha a outra conta da transferência.');
  if (outra.id === t.conta_id) falha('As duas contas precisam ser diferentes.');
  const abs = Math.abs(t.valor);
  const sinalOposto = t.valor < 0 ? 1 : -1;
  let parceira = null;
  if (parceiraId) {
    parceira = db.prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(parceiraId), usuarioId);
    if (!parceira || parceira.tipo_mov || parceira.ignorada === 1) falha('O lançamento par não está disponível.');
  } else {
    const ms = (d) => Date.parse(`${String(d).slice(0, 10)}T12:00:00Z`);
    parceira = db
      .prepare('SELECT * FROM transacoes WHERE usuario_id = ? AND conta_id = ? AND excluido_em IS NULL AND tipo_mov IS NULL AND ignorada <> 1 AND valor * ? > 0')
      .all(usuarioId, outra.id, sinalOposto)
      .find((p) => Math.abs(Math.abs(p.valor) - abs) < 0.005 && Math.abs(ms(p.data) - ms(t.data)) <= 3 * 86400000) || null;
  }
  if (parceira && (parceira.conta_id !== outra.id || Math.sign(parceira.valor) !== sinalOposto || Math.abs(Math.abs(parceira.valor) - abs) > 0.005)) {
    falha('O lançamento par precisa ter o mesmo valor, em sentido oposto, na outra conta.');
  }
  const vinculo = dados.novoId();
  const origemConta = db.prepare('SELECT nome FROM contas WHERE id = ?').get(t.conta_id);
  dados.transacao(() => {
    tirarDosTotais(t);
    dados.atualizar('transacoes', t.id, { tipo_mov: 'transferencia_vinculada', vinculo, ignorada: 2, categoria_id: null, categoria_receita: null });
    if (parceira) {
      tirarDosTotais(parceira);
      dados.atualizar('transacoes', parceira.id, { tipo_mov: 'transferencia_vinculada', vinculo, ignorada: 2, categoria_id: null, categoria_receita: null });
    } else {
      const v = -t.valor;
      dados.inserir('transacoes', {
        conta_id: outra.id, usuario_id: usuarioId, valor: v, data: String(t.data).slice(0, 10), origem: 'manual', ignorada: 2, tipo_mov: 'transferencia_interna', vinculo,
        descricao: v > 0 ? `Transferência de ${origemConta ? origemConta.nome : 'conta própria'}` : `Transferência para ${origemConta ? origemConta.nome : 'conta própria'}`,
      });
      somarSaldo(outra.id, v);
    }
  });
  return { vinculo, casouComExistente: !!parceira };
}

// Retira o efeito do lançamento sobre o gasto da categoria (ele deixa de contar nos totais).
function tirarDosTotais(t) {
  if (t.ignorada === 0 && t.categoria_id && t.valor < 0) dados.somar('categorias_orcamento', t.categoria_id, 'gasto_atual', -Math.abs(t.valor));
}
function devolverAosTotais(t) {
  if (t.categoria_id && t.valor < 0) dados.somar('categorias_orcamento', t.categoria_id, 'gasto_atual', Math.abs(t.valor));
}

// Desfaz o par (apaga os que o app criou; os que vieram de importação/banco só voltam ao normal).
function desfazerPar(usuarioId, vinculo) {
  const linhas = db.prepare('SELECT * FROM transacoes WHERE usuario_id = ? AND vinculo = ? AND excluido_em IS NULL').all(usuarioId, String(vinculo));
  if (!linhas.length) falha('Par não encontrado.', 404);
  dados.transacao(() => {
    linhas.forEach((t) => {
      const criadoAqui = t.tipo_mov === 'transferencia_interna' || t.tipo_mov === 'estorno'; // os 'vinculados' já existiam: só voltam ao normal
      if (criadoAqui) {
        if (t.ignorada !== 1) somarSaldo(t.conta_id, -t.valor);
        dados.excluirOnde('faturas_pagas', 'transacao_id = ?', [t.id]);
        dados.excluir('transacoes', t.id);
      } else {
        // Original (ou lançamento importado): volta a contar como antes
        dados.atualizar('transacoes', t.id, { tipo_mov: null, vinculo: null, ignorada: 0 });
        if (t.tipo_mov === 'estornada') devolverAosTotais(t);
      }
    });
  });
  return linhas.length;
}

// ---------------------------------------------------------------- estorno / cancelamento / devolução
// Liga um lançamento de estorno que já existe (ex.: linha importada "ESTORNO ...") à despesa original.
function vincularEstorno(usuarioId, estornoId, originalId, { criado = false } = {}) {
  const buscar = (id) => db.prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(id), usuarioId);
  const est = buscar(estornoId);
  const ori = buscar(originalId);
  if (!est || !ori) falha('Transação não encontrada.', 404);
  if (est.id === ori.id) falha('O estorno e a despesa original precisam ser lançamentos diferentes.');
  if (est.tipo_mov || ori.tipo_mov) falha('Algum dos lançamentos já está ligado a uma transferência ou estorno.');
  if (est.ignorada === 1 || ori.ignorada === 1) falha('Reative os lançamentos ignorados antes de estornar.');
  if (est.conta_id !== ori.conta_id) falha('O estorno precisa estar na mesma conta da despesa original.');
  if (Math.sign(est.valor) === Math.sign(ori.valor) || Math.abs(Math.abs(est.valor) - Math.abs(ori.valor)) > 0.005) {
    falha('O estorno precisa ter o mesmo valor da despesa original, em sentido oposto.');
  }
  const vinculo = dados.novoId();
  dados.transacao(() => {
    tirarDosTotais(ori);
    dados.atualizar('transacoes', ori.id, { tipo_mov: 'estornada', vinculo, ignorada: 2 });
    dados.atualizar('transacoes', est.id, { tipo_mov: criado ? 'estorno' : 'estorno_vinculado', vinculo, ignorada: 2, categoria_id: null, categoria_receita: null });
  });
  return { vinculo };
}

// Cria o lançamento de estorno (valor oposto, mesma conta) e liga à original: ambas saem dos totais, o saldo volta.
function estornarTransacao(usuarioId, transacaoId, { data, descricao } = {}) {
  const t = db.prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(transacaoId), usuarioId);
  if (!t) falha('Transação não encontrada.', 404);
  if (t.tipo_mov) falha(ehTransferencia(t.tipo_mov) ? 'Transferências não se estornam: desfaça a transferência.' : 'Este lançamento já foi estornado.');
  if (t.ignorada === 1) falha('Reative o lançamento antes de estornar.');
  const dia = data || hoje();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia))) falha('Data inválida.');
  if (db.prepare('SELECT 1 FROM faturas_pagas WHERE transacao_id = ? AND excluido_em IS NULL').get(t.id)) {
    falha('Esta saída é o pagamento de uma fatura de cartão: desfaça o pagamento da fatura em vez de estornar.');
  }
  const texto = String(descricao || '').trim().slice(0, 120) || `Estorno: ${t.descricao}`;
  let vinculo; let estorno;
  dados.transacao(() => {
    desfazerPagamentoDaTransacao(t.id); // se era pagamento de dívida/acordo, o saldo da dívida volta
    estorno = dados.inserir('transacoes', { conta_id: t.conta_id, usuario_id: usuarioId, descricao: texto, valor: arredondar(-t.valor), data: dia, origem: 'manual' });
    somarSaldo(t.conta_id, estorno.valor);
    ({ vinculo } = vincularEstorno(usuarioId, estorno.id, t.id, { criado: true }));
  });
  return { vinculo, estornoId: estorno.id };
}

// Estorno de uma compra no cartão: cria parcelas espelho com valor negativo (líquido zero, em cada fatura).
function estornarCompraCartao(usuarioId, compraId, { descricao } = {}) {
  const linhas = db
    .prepare('SELECT * FROM lancamentos_cartao WHERE usuario_id = ? AND compra_id = ? AND excluido_em IS NULL ORDER BY parcela_numero')
    .all(usuarioId, String(compraId));
  if (!linhas.length) falha('Compra não encontrada.', 404);
  if (linhas.some((l) => l.tipo_mov)) falha('Esta compra já foi estornada (ou é um estorno).');
  const vinculo = dados.novoId();
  const novaCompra = dados.novoId();
  dados.transacao(() => {
    linhas.forEach((l) => {
      dados.inserir('lancamentos_cartao', {
        cartao_id: l.cartao_id, usuario_id: usuarioId, compra_id: novaCompra, descricao: String(descricao || '').trim().slice(0, 120) || `Estorno: ${l.descricao}`,
        valor: arredondar(-l.valor), data_compra: l.data_compra, parcela_numero: l.parcela_numero, total_parcelas: l.total_parcelas,
        categoria_id: l.categoria_id, subcategoria: l.subcategoria, tipo_mov: 'estorno', vinculo,
      });
      dados.atualizar('lancamentos_cartao', l.id, { tipo_mov: 'estornada', vinculo });
    });
  });
  return { vinculo, compraId: novaCompra, parcelas: linhas.length };
}

// Desfaz o vínculo de um crédito do cartão. 'estorno' (espelho criado pelo app) é apagado; o resto volta ao normal:
// estorno importado/marcado à mão, pagamento adiantado e cashback continuam como crédito comum (valor negativo), a compra
// estornada volta a contar. Do lado da conta (pagamento adiantado): a saída criada pelo app sai (o saldo volta); a que
// veio do extrato volta a ser saída comum.
function desfazerEstornoCartao(usuarioId, vinculo) {
  const linhas = db.prepare('SELECT * FROM lancamentos_cartao WHERE usuario_id = ? AND vinculo = ? AND excluido_em IS NULL').all(usuarioId, String(vinculo));
  if (!linhas.length) falha('Estorno não encontrado.', 404);
  const daConta = db.prepare("SELECT * FROM transacoes WHERE usuario_id = ? AND vinculo = ? AND excluido_em IS NULL AND tipo_mov IN ('pagamento_cartao', 'pagamento_cartao_criado')").all(usuarioId, String(vinculo));
  dados.transacao(() => {
    linhas.forEach((l) => {
      if (l.tipo_mov === 'estorno') dados.excluir('lancamentos_cartao', l.id);
      else dados.atualizar('lancamentos_cartao', l.id, { tipo_mov: null, vinculo: null });
    });
    daConta.forEach((t) => {
      if (t.tipo_mov === 'pagamento_cartao_criado') { somarSaldo(t.conta_id, -t.valor); dados.excluir('transacoes', t.id); }
      else dados.atualizar('transacoes', t.id, { tipo_mov: null, vinculo: null, ignorada: 0 });
    });
  });
  return linhas.length;
}

// ---------------------------------------------------------------- créditos na fatura do cartão (anotação 61)
// Modelo (o mesmo do estorno de cartão): crédito = lançamento com valor NEGATIVO em lancamentos_cartao (abate a fatura).
//  tipo_mov do crédito: 'estorno' (espelho criado pelo app) | 'estorno_vinculado' (crédito do arquivo/marcado à mão ligado à
//  compra) | 'estorno_avulso' (estorno sem a compra: reduz o gasto da categoria e fica "A revisar") | 'pagamento' (pagamento
//  adiantado: abate a fatura, não é gasto nem entrada) | 'cashback' (abate a fatura e é ENTRADA na categoria Cashback).
//  tipo_mov da compra: 'estornada' (estorno total) | 'estornada_parcial' (estorno de parte do valor; o resto continua gasto).
//  Pagamento adiantado + saída da conta: mesmo `vinculo`; a saída fica fora dos totais (ignorada = 2) com tipo_mov
//  'pagamento_cartao' (veio do extrato) ou 'pagamento_cartao_criado' (criada aqui, ao marcar à mão).
const CASHBACK = 'Cashback';
function garantirCashback(usuarioId) {
  try { return require('./categoriasReceita').garantirCategoriaReceita(usuarioId, CASHBACK, 'cat-entrada-cashback'); } catch (e) { return CASHBACK; }
}

// Liga o crédito (estorno) à compra original. Parcial quando o crédito é menor que a compra.
// Uma compra pode receber mais de um estorno parcial: todos ficam no mesmo vínculo e, quando a soma chega ao valor da compra,
// ela passa a 'estornada'.
function ligarEstornoCartao(est, ori, { vinculo = null } = {}) {
  let ja = 0;
  if (ori.tipo_mov === 'estornada_parcial' && ori.vinculo) {
    vinculo = ori.vinculo;
    ja = db.prepare("SELECT COALESCE(SUM(-valor), 0) AS s FROM lancamentos_cartao WHERE vinculo = ? AND id <> ? AND valor < 0 AND excluido_em IS NULL").get(vinculo, est.id).s;
  }
  vinculo = vinculo || dados.novoId();
  const parcial = ja + Math.abs(est.valor) < Math.abs(ori.valor) - 0.005;
  dados.atualizar('lancamentos_cartao', est.id, { tipo_mov: 'estorno_vinculado', vinculo, categoria_id: ori.categoria_id || est.categoria_id || null });
  dados.atualizar('lancamentos_cartao', ori.id, { tipo_mov: parcial ? 'estornada_parcial' : 'estornada', vinculo });
  return { vinculo, parcial };
}

// Liga o pagamento adiantado (no cartão) à saída da conta: a saída sai dos totais (o saldo da conta continua valendo).
function ligarPagamentoCartao(lanc, t, { vinculo = dados.novoId() } = {}) {
  tirarDosTotais(t);
  dados.atualizar('transacoes', t.id, { tipo_mov: 'pagamento_cartao', vinculo, ignorada: 2, categoria_id: null, categoria_receita: null });
  dados.atualizar('lancamentos_cartao', lanc.id, { vinculo });
  return { vinculo };
}

// Saída de uma conta que parece ser o pagamento adiantado (mesmo valor, até 5 dias), ainda solta.
function procurarSaidaDoPagamento(usuarioId, { contaId = null, valor, data }) {
  const v = Math.abs(Number(valor));
  const ms = (d) => Date.parse(`${String(d).slice(0, 10)}T12:00:00Z`);
  return db
    .prepare(`SELECT * FROM transacoes WHERE usuario_id = ? AND excluido_em IS NULL AND valor < 0 AND tipo_mov IS NULL AND ignorada = 0
      AND id NOT IN (SELECT transacao_id FROM faturas_pagas WHERE transacao_id IS NOT NULL AND excluido_em IS NULL)${contaId ? ' AND conta_id = ?' : ''}`)
    .all(...(contaId ? [usuarioId, String(contaId)] : [usuarioId]))
    .filter((t) => Math.abs(Math.abs(t.valor) - v) < 0.005 && Math.abs(ms(t.data) - ms(data)) <= 5 * 86400000)
    .sort((a, b) => Math.abs(ms(a.data) - ms(data)) - Math.abs(ms(b.data) - ms(data)))[0] || null;
}

// Compras do mesmo cartão que podem ter sido estornadas por este crédito: até 90 dias antes, valor maior ou igual,
// ainda sem estorno; as de descrição mais parecida e valor igual primeiro.
function comprasParecidas(usuarioId, credito, { limite = 8 } = {}) {
  const v = Math.abs(credito.valor);
  const limpar = (s) => new Set(semAcento(s).replace(/\b(estorno|estornado|devolucao|cancelamento|cancelada|reembolso|cred|credito|parcial)\b/g, ' ').split(/[^a-z0-9]+/).filter((p) => p.length >= 3));
  const alvo = limpar(credito.descricao);
  const ms = (d) => Date.parse(`${String(d).slice(0, 10)}T12:00:00Z`);
  const porCompra = new Map();
  db.prepare('SELECT * FROM lancamentos_cartao WHERE usuario_id = ? AND cartao_id = ? AND excluido_em IS NULL AND tipo_mov IS NULL AND valor > 0 AND compra_id <> ?')
    .all(usuarioId, credito.cartao_id, credito.compra_id)
    .forEach((l) => {
      const c = porCompra.get(l.compra_id) || { compraId: l.compra_id, id: l.id, descricao: l.descricao, data: l.data_compra, valor: 0, categoriaId: l.categoria_id || null, parcelas: l.total_parcelas };
      c.valor = arredondar(c.valor + l.valor);
      porCompra.set(l.compra_id, c);
    });
  return [...porCompra.values()]
    .filter((c) => c.valor + 0.005 >= v && ms(c.data) <= ms(credito.data_compra) + 86400000 && ms(credito.data_compra) - ms(c.data) <= 90 * 86400000)
    .map((c) => ({ ...c, nota: [...limpar(c.descricao)].filter((p) => alvo.has(p)).length, igual: Math.abs(c.valor - v) < 0.005 }))
    .sort((a, b) => b.nota - a.nota || (b.igual ? 1 : 0) - (a.igual ? 1 : 0) || ms(b.data) - ms(a.data))
    .slice(0, limite);
}

// "Marcar como crédito" (edição manual de um lançamento do cartão). tipo:
//  'estorno'   + originalCompraId (opcional): liga à compra (total ou parcial); sem compra, fica estorno avulso (A revisar)
//  'pagamento' + contaId: pagamento adiantado; casa com a saída da conta (mesmo valor, até 5 dias) ou cria a saída
//  'cashback'  : abate a fatura e entra em Cashback
//  'compra'    : desfaz (volta a ser compra/despesa)
function marcarCreditoCartao(usuarioId, compraId, { tipo, originalCompraId = null, contaId = null, data = null } = {}) {
  const linhas = db.prepare('SELECT * FROM lancamentos_cartao WHERE usuario_id = ? AND compra_id = ? AND excluido_em IS NULL ORDER BY parcela_numero').all(usuarioId, String(compraId));
  if (!linhas.length) falha('Lançamento não encontrado.', 404);
  if (linhas.length > 1) falha('Crédito na fatura não tem parcelas: este lançamento está parcelado.');
  const l = linhas[0];
  if (l.tipo_mov && !['estorno_avulso', 'estorno_vinculado', 'pagamento', 'cashback'].includes(l.tipo_mov)) falha('Este lançamento já está ligado a um estorno.');
  if (!['estorno', 'pagamento', 'cashback', 'compra'].includes(tipo)) falha('Escolha que crédito é este.');
  if (tipo === 'compra') {
    // desfaz a marcação: volta a ser compra (despesa) comum
    dados.transacao(() => {
      if (l.vinculo) desfazerEstornoCartao(usuarioId, l.vinculo);
      dados.atualizar('lancamentos_cartao', l.id, { valor: Math.abs(l.valor), tipo_mov: null, vinculo: null });
    });
    return { tipo };
  }
  const valor = -Math.abs(l.valor);
  let resultado = { tipo };
  dados.transacao(() => {
    if (l.vinculo) desfazerEstornoCartao(usuarioId, l.vinculo); // reclassificar: solta o vínculo anterior
    dados.atualizar('lancamentos_cartao', l.id, { valor, tipo_mov: null, vinculo: null });
    const cred = { ...l, valor, tipo_mov: null, vinculo: null };
    if (tipo === 'cashback') {
      garantirCashback(usuarioId);
      dados.atualizar('lancamentos_cartao', l.id, { tipo_mov: 'cashback', categoria_id: null, subcategoria: null });
    } else if (tipo === 'pagamento') {
      const conta = contaDoUsuario(contaId, usuarioId);
      if (!conta) falha('Escolha a conta de onde saiu o pagamento.');
      dados.atualizar('lancamentos_cartao', l.id, { tipo_mov: 'pagamento', categoria_id: null, subcategoria: null });
      const t = procurarSaidaDoPagamento(usuarioId, { contaId: conta.id, valor, data: data || l.data_compra });
      if (t) { ligarPagamentoCartao(cred, t); resultado.casouComExtrato = true; } else {
        const cartao = db.prepare('SELECT nome FROM cartoes WHERE id = ?').get(l.cartao_id);
        const vinculo = dados.novoId();
        dados.inserir('transacoes', {
          conta_id: conta.id, usuario_id: usuarioId, descricao: `Pagamento adiantado da fatura ${cartao ? cartao.nome : ''}`.trim(), valor, data: data || l.data_compra,
          origem: 'manual', ignorada: 2, tipo_mov: 'pagamento_cartao_criado', vinculo,
        });
        somarSaldo(conta.id, valor);
        dados.atualizar('lancamentos_cartao', l.id, { vinculo });
        resultado.criouSaida = true;
      }
    } else {
      const ori = originalCompraId
        ? db.prepare('SELECT * FROM lancamentos_cartao WHERE usuario_id = ? AND compra_id = ? AND cartao_id = ? AND excluido_em IS NULL AND tipo_mov IS NULL AND valor > 0 ORDER BY parcela_numero LIMIT 1').get(usuarioId, String(originalCompraId), l.cartao_id)
        : null;
      if (originalCompraId && !ori) falha('A compra escolhida não está mais disponível para estorno.');
      if (ori) {
        const total = db.prepare('SELECT SUM(valor) AS s FROM lancamentos_cartao WHERE compra_id = ? AND excluido_em IS NULL').get(ori.compra_id).s;
        if (Math.abs(valor) > total + 0.005) falha('O estorno é maior que a compra escolhida.');
        resultado = { ...resultado, ...ligarEstornoCartao(cred, { ...ori, valor: total }) };
      } else dados.atualizar('lancamentos_cartao', l.id, { tipo_mov: 'estorno_avulso' });
    }
  });
  return resultado;
}

// Sugere a despesa original de um estorno (usado pela importação): mesma conta, valor igual e oposto,
// antes (ou no mesmo dia) do estorno, ainda sem vínculo; a de descrição mais parecida / mais próxima primeiro.
function procurarOriginalDoEstorno(usuarioId, { contaId, valor, descricao, data }) {
  const v = Number(valor);
  const candidatas = db
    .prepare('SELECT * FROM transacoes WHERE usuario_id = ? AND conta_id = ? AND excluido_em IS NULL AND tipo_mov IS NULL AND ignorada = 0 AND valor * ? < 0')
    .all(usuarioId, String(contaId), v)
    .filter((t) => Math.abs(Math.abs(t.valor) - Math.abs(v)) < 0.005 && (!data || String(t.data).slice(0, 10) <= String(data).slice(0, 10)));
  const limpar = (s) => new Set(semAcento(s).replace(/\b(estorno|devolucao|cancelamento|cancelada|reembolso|cred|credito)\b/g, ' ').split(/[^a-z0-9]+/).filter((p) => p.length >= 3));
  const alvo = limpar(descricao);
  const nota = (t) => [...limpar(t.descricao)].filter((p) => alvo.has(p)).length;
  return candidatas.sort((a, b) => nota(b) - nota(a) || (a.data < b.data ? 1 : -1))[0] || null;
}

// Descrição de estorno/devolução/cancelamento (para a importação reconhecer sozinha).
const ehEstorno = (descricao) => /\b(estorno|estornado|devolu[cç][aã]o|cancelamento|cancelad[ao]|reembolso)\b/i.test(String(descricao || ''));

// ---------------------------------------------------------------- pagamento de dívida/acordo/crediário
// Mesma regra do `POST /api/dividas/:id/pagamentos` do setor F (CONTRATO-DIVIDAS.md) com `quitaParcela: true`:
// se o valor pago for menor que a parcela, a diferença vira "desconto por antecipação" (economia) e a parcela
// inteira é abatida do saldo; atualiza parcelas pagas, próximo vencimento e a situação (quitada).
// (O cálculo fica aqui, na mesma transação do lançamento, para o saldo nunca divergir se a gravação falhar.)
function pagarDividaComTransacao(usuarioId, { dividaId, transacao, valorParcela }) {
  const divida = db.prepare('SELECT * FROM dividas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(dividaId), usuarioId);
  if (!divida) falha('Dívida ou acordo não encontrado.', 404);
  const pago = arredondar(Math.abs(transacao.valor));
  const informada = valorParcela === undefined || valorParcela === null || valorParcela === '' ? null : Number(valorParcela);
  if (informada !== null && (!Number.isFinite(informada) || informada <= 0)) falha('Valor da parcela inválido.');
  const parcela = informada || Number(divida.valor_parcela) || null;
  const desconto = parcela && pago < parcela - 0.004 ? arredondar(parcela - pago) : 0;
  const abatimento = arredondar(pago + desconto);
  const novoSaldo = Math.max(0, arredondar(divida.saldo - abatimento));
  const campos = { saldo: novoSaldo };
  const pc = Number(divida.valor_parcela) || 0;
  if (divida.parcelas_total && pc > 0) {
    const pagas = Math.max(divida.parcelas_pagas || 0, divida.parcelas_total - utilDividas.parcelasRestantes({ saldo: novoSaldo, valor_parcela: pc }));
    campos.parcelas_pagas = Math.min(divida.parcelas_total, pagas);
    const avancou = campos.parcelas_pagas - (divida.parcelas_pagas || 0);
    if (avancou > 0 && divida.proximo_vencimento) {
      campos.proximo_vencimento = novoSaldo > 0 ? utilDividas.somarMeses(divida.proximo_vencimento, avancou) : divida.proximo_vencimento;
    }
  }
  if (novoSaldo <= 0) campos.status = 'quitada';
  dados.atualizar('dividas', divida.id, campos);
  dados.inserir('historico_pagamentos', {
    divida_id: divida.id, valor: pago, data: String(transacao.data).slice(0, 10), transacao_id: transacao.id, tipo: 'pagamento',
    desconto_antecipacao: desconto, valor_parcela: parcela,
  });
  return { dividaId: divida.id, nome: divida.nome, pago, parcela, desconto, abatimento: arredondar(Math.min(abatimento, divida.saldo)), novoSaldo };
}

// Desfaz o efeito de um pagamento ligado à transação (quando ela é apagada ou estornada).
function desfazerPagamentoDaTransacao(transacaoId) {
  const pags = db.prepare('SELECT * FROM historico_pagamentos WHERE transacao_id = ? AND excluido_em IS NULL').all(transacaoId);
  pags.forEach((h) => {
    const d = db.prepare('SELECT * FROM dividas WHERE id = ? AND excluido_em IS NULL').get(h.divida_id);
    if (d) {
      const saldo = arredondar(Math.min(Math.max(d.saldo_original, d.saldo), d.saldo + h.valor + (h.desconto_antecipacao || 0)));
      const campos = { saldo };
      const pc = Number(d.valor_parcela) || 0;
      if (d.parcelas_total && pc > 0) {
        const pagas = Math.max(0, d.parcelas_total - utilDividas.parcelasRestantes({ saldo, valor_parcela: pc }));
        const recuou = (d.parcelas_pagas || 0) - Math.min(d.parcelas_pagas || 0, pagas);
        campos.parcelas_pagas = Math.min(d.parcelas_pagas || 0, pagas);
        if (recuou > 0 && d.proximo_vencimento) campos.proximo_vencimento = utilDividas.somarMeses(d.proximo_vencimento, -recuou);
      }
      if (d.status === 'quitada' && saldo > 0) campos.status = 'ativa';
      dados.atualizar('dividas', d.id, campos);
    }
    dados.excluir('historico_pagamentos', h.id);
  });
  return pags.length;
}

// Dívidas, acordos e crediários ativos (não quitados), com a parcela sugerida (editável na tela).
function listarVinculaveis(usuarioId) {
  const dividas = db
    .prepare("SELECT d.*, ct.nome AS conta_nome FROM dividas d LEFT JOIN contas ct ON ct.id = d.conta_id AND ct.excluido_em IS NULL WHERE d.usuario_id = ? AND d.excluido_em IS NULL AND d.arquivada = 0 AND d.saldo > 0 AND COALESCE(d.status, 'ativa') <> 'quitada' ORDER BY d.nome")
    .all(usuarioId);
  return dividas.map((d) => {
    const ultimo = db.prepare('SELECT valor, valor_parcela FROM historico_pagamentos WHERE divida_id = ? AND excluido_em IS NULL AND valor > 0 ORDER BY data DESC, rowid DESC LIMIT 1').get(d.id);
    // Parcela do acordo/crediário (setor F); sem ela, a do último pagamento.
    const sugerida = [d.valor_parcela, ultimo && (ultimo.valor_parcela || ultimo.valor)].find((x) => Number(x) > 0);
    return {
      id: d.id, nome: d.nome, saldo: d.saldo, taxa_juros: d.taxa_juros ?? null, urgencia: d.urgencia,
      tipo: d.tipo ?? null, status: d.status ?? null, conta_nome: d.conta_nome || null,
      valor_parcela: sugerida ? arredondar(Number(sugerida)) : null,
    };
  });
}

// ---------------------------------------------------------------- Pix/TED: terceiro ou conta própria?
const PALAVRAS_PIX = /\b(pix|ted|doc|transf(erencia|\.)?|tev)\b/;
// Devolve { tipo: 'propria' | 'terceiro' | null, contaId, contaNome }. 'propria' quando a descrição cita uma conta do
// próprio usuário (nome da conta/banco) ou o nome do titular; 'terceiro' para os demais Pix/TED (= despesa).
function detectarDestino(descricao, { nomeTitular, contas, contaAtualId }) {
  const d = semAcento(descricao);
  if (!PALAVRAS_PIX.test(d)) return { tipo: null, contaId: null, contaNome: null };
  const achada = (contas || []).find((c) => c.id !== contaAtualId && semAcento(c.nome).split(/[^a-z0-9]+/).filter((p) => p.length >= 4).some((p) => d.includes(p)));
  if (achada) return { tipo: 'propria', contaId: achada.id, contaNome: achada.nome };
  const partes = semAcento(nomeTitular).split(/[^a-z]+/).filter((p) => p.length >= 3);
  if (partes.length >= 2 && partes.every((p) => d.includes(p))) return { tipo: 'propria', contaId: null, contaNome: null };
  if (partes.length === 1 && partes[0].length >= 5 && d.includes(partes[0])) return { tipo: 'propria', contaId: null, contaNome: null };
  return { tipo: 'terceiro', contaId: null, contaNome: null };
}

module.exports = {
  ErroLancamento, ehTransferencia, ehLinhaDeEstorno, criarTransferencia, converterEmTransferencia, desfazerPar, vincularEstorno, estornarTransacao,
  estornarCompraCartao, desfazerEstornoCartao, procurarOriginalDoEstorno, ehEstorno, pagarDividaComTransacao,
  desfazerPagamentoDaTransacao, listarVinculaveis, detectarDestino, tirarDosTotais, devolverAosTotais, somarSaldo,
  CASHBACK, garantirCashback, ligarEstornoCartao, ligarPagamentoCartao, procurarSaidaDoPagamento, comprasParecidas, marcarCreditoCartao,
};
