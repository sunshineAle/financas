// Carteira (setor G) — parte que fala com o banco, compartilhada por routes/reserva.js e routes/investimentos.js.
// Toda gravação passa pela camada `dados`. Código JS puro: roda também no navegador (PWA).
const db = require('../db');
const dados = require('../dados');
const { arredondar } = require('./faturas');
const { liquidezPadrao } = require('./carteira');

const hojeStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: process.env.APP_TIMEZONE || 'America/Sao_Paulo' });

const ehTicker = (t) => /^[A-Z]{3,5}\d{1,2}[A-Z]?$/.test(String(t || '').trim());

function buscarReserva(usuarioId) {
  let reserva = db.prepare('SELECT * FROM reserva_liberdade WHERE usuario_id = ? AND excluido_em IS NULL').get(usuarioId);
  if (!reserva) reserva = dados.inserir('reserva_liberdade', { usuario_id: usuarioId, meta: 3000 });
  return reserva;
}

// Acha o ativo do usuário pelo ticker ou nome (sem diferenciar maiúsculas); cria se não existir.
function acharOuCriarAtivo(usuarioId, { nome, ticker, tipo, liquidez, corretoraContaId }) {
  const nomeLimpo = String(nome || '').trim().slice(0, 60);
  const tk = ticker ? String(ticker).trim().toUpperCase().slice(0, 20) : ehTicker(nomeLimpo.toUpperCase()) ? nomeLimpo.toUpperCase() : null;
  const chave = (tk || nomeLimpo).toLowerCase();
  const existentes = db.prepare('SELECT * FROM ativos WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId);
  const achado = existentes.find((a) => (a.ticker || a.nome).toLowerCase() === chave || a.nome.toLowerCase() === chave);
  if (achado) return achado;
  return dados.inserir('ativos', {
    usuario_id: usuarioId,
    nome: nomeLimpo || tk,
    ticker: tk,
    tipo,
    liquidez: liquidez || liquidezPadrao(tipo),
    corretora_conta_id: corretoraContaId || null,
  });
}

// O saldo de contas manuais é mexido por aqui; em conta conectada o saldo vem do banco.
function ajustarConta(contaId, delta) {
  if (!contaId || !delta) return;
  const conta = dados.buscar('contas', contaId);
  if (conta && conta.origem === 'manual') dados.somar('contas', contaId, 'saldo', delta);
}

// Lança um guardar/compra (operacao 'aporte') ou resgatar/venda (operacao 'resgate'):
//   valor_atual da reserva + historico_aportes (extrato das metas) + saldo da conta + operação do ativo.
// `a`: { movimento (+/-), tipo (tipo de investimento), operacao, ativoNome, ticker, quantidade, preco, descricao, dia, contaId, metaId,
//        ativoId?, tipoOp? ('compra'|'venda'|'guardar'|'resgatar'), transacaoId? , ajustarSaldo (padrão true) }
// Devolve { aporte, operacao, ativo }. Lança Error se o resgate passa do valor da reserva.
function lancarAporte(usuarioId, reserva, a) {
  if (!a.semChecagem && a.movimento < 0 && -a.movimento > reserva.valor_atual + 0.005) {
    const e = new Error('O resgate é maior que o valor atual da reserva.');
    e.status = 400;
    throw e;
  }
  return dados.transacao(() => {
    let ativo = a.ativoId ? dados.buscar('ativos', a.ativoId) : null;
    if (!ativo) {
      ativo = acharOuCriarAtivo(usuarioId, {
        nome: a.ativoNome || a.rotuloTipo || a.tipo,
        ticker: a.ticker,
        tipo: a.tipo,
        corretoraContaId: null,
      });
    }
    dados.somar('reserva_liberdade', reserva.id, 'valor_atual', a.movimento);
    const aporte = dados.inserir('historico_aportes', {
      reserva_id: reserva.id, valor: a.movimento, tipo: a.tipo, operacao: a.operacao, ativo: a.ativoNome || null,
      quantidade: a.quantidade, preco_unitario: a.preco, descricao: a.descricao, conta_id: a.contaId, meta_id: a.metaId,
      ...(a.dia ? { data: a.dia } : {}),
    });
    if (a.ajustarSaldo !== false) ajustarConta(a.contaId, -a.movimento);
    const saida = a.movimento < 0;
    const operacao = dados.inserir('operacoes', {
      ativo_id: ativo.id, usuario_id: usuarioId,
      tipo: a.tipoOp || (saida ? (a.quantidade ? 'venda' : 'resgatar') : a.quantidade ? 'compra' : 'guardar'),
      data: a.dia || hojeStr(), cotas: a.quantidade ?? null, preco: a.preco ?? null, total: arredondar(Math.abs(a.movimento)),
      meta_id: a.metaId || null, conta_id: a.contaId || null, aporte_id: aporte.id, transacao_id: a.transacaoId || null, descricao: a.descricao || null,
    });
    return { aporte, operacao, ativo };
  });
}

// Exclui as operações ligadas a um lançamento (usado ao editar/apagar pela tela de metas).
function removerOperacoesDoAporte(aporteId) {
  const ops = db.prepare('SELECT id FROM operacoes WHERE aporte_id = ? AND excluido_em IS NULL').all(aporteId);
  ops.forEach((o) => dados.excluir('operacoes', o.id));
  return ops.length;
}

// Refaz a operação de um lançamento já gravado (após editar pela tela de metas).
function refazerOperacaoDoAporte(usuarioId, aporte) {
  const antes = db.prepare('SELECT transacao_id FROM operacoes WHERE aporte_id = ? AND excluido_em IS NULL').get(aporte.id);
  removerOperacoesDoAporte(aporte.id);
  const ativo = acharOuCriarAtivo(usuarioId, { nome: aporte.ativo || aporte.tipo, tipo: aporte.tipo });
  const saida = aporte.valor < 0;
  return dados.inserir('operacoes', {
    ativo_id: ativo.id, usuario_id: usuarioId,
    tipo: saida ? (aporte.quantidade ? 'venda' : 'resgatar') : aporte.quantidade ? 'compra' : 'guardar',
    data: String(aporte.data).slice(0, 10), cotas: aporte.quantidade ?? null, preco: aporte.preco_unitario ?? null,
    total: arredondar(Math.abs(aporte.valor)), meta_id: aporte.meta_id || null, conta_id: aporte.conta_id || null,
    aporte_id: aporte.id, transacao_id: antes?.transacao_id || null, descricao: aporte.descricao || null,
  });
}

// Tira uma transação do extrato dos totais e do orçamento (convenção do setor E1: ignorada = 2 = "fora dos totais, mas o saldo
// da conta continua valendo"). tipoMov: 'reserva_vinculada' | 'reserva_recusada' | 'transferencia_corretora'.
function tirarDosTotais(transacaoId, tipoMov) {
  const t = dados.buscar('transacoes', transacaoId);
  if (!t || t.excluido_em) return null;
  if (t.ignorada === 0 && t.categoria_id && t.valor < 0) dados.somar('categorias_orcamento', t.categoria_id, 'gasto_atual', -Math.abs(t.valor));
  return dados.atualizar('transacoes', t.id, { ignorada: 2, tipo_mov: tipoMov, categoria_id: null, categoria_receita: null });
}

module.exports = { tirarDosTotais, hojeStr, ehTicker, buscarReserva, acharOuCriarAtivo, ajustarConta, lancarAporte, removerOperacoesDoAporte, refazerOperacaoDoAporte };
