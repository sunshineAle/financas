// Ganchos com os outros setores (cada um pode ainda não existir): tudo via try/catch, com plano B simples.
const texto = require('./texto');

let lancamentos = null;
try { lancamentos = require('../utils/lancamentos'); } catch (e) { lancamentos = null; }
let reservasAuto = null;
try { reservasAuto = require('../utils/reservasAuto'); } catch (e) { reservasAuto = null; }

const REGEX_ESTORNO = /\b(estorno|estornado|devolu[cç][aã]o|devolvid[oa]|cancelamento|cancelad[ao]|reembolso|chargeback|cr[eé]dito (?:de )?compra)\b/i;

function ehEstorno(descricao) {
  try { if (lancamentos && lancamentos.ehEstorno) return !!lancamentos.ehEstorno(descricao) || REGEX_ESTORNO.test(descricao); } catch (e) { /* plano B */ }
  return REGEX_ESTORNO.test(String(descricao || ''));
}

function detectarReserva(descricao) {
  try { return reservasAuto && reservasAuto.detectarReservaAutomatica ? reservasAuto.detectarReservaAutomatica(descricao) : null; } catch (e) { return null; }
}

function detectarDestino(descricao, ctx) {
  try { return lancamentos && lancamentos.detectarDestino ? lancamentos.detectarDestino(descricao, ctx) : { tipo: null, contaId: null }; } catch (e) { return { tipo: null, contaId: null }; }
}

const REGEX_PAG_FATURA = /\b(pag(?:amento|to|\.)?\s*(?:de\s*|da\s*)?(?:fatura|cart[aã]o)|fatura\s+(?:do\s+)?(?:cart[aã]o|nubank|itau|inter|c6|bradesco|santander)|pgto\.?\s*fatura|pagto\s*cartao|cartao de credito|cart[aã]o cr[eé]dito)\b/i;
function pareceFaturaDeCartao(descricao) { return REGEX_PAG_FATURA.test(String(descricao || '')) || /\bfatura\b/i.test(String(descricao || '')); }

const REGEX_PAG_RECEBIDO = /\b(pagamento (?:recebido|efetuado|em conta|on[- ]?line)?|pgto\.? (?:recebido|efetuado)|pag(?:amento)?\.? fatura|obrigado pelo pagamento|pagamento fatura|credito de pagamento|pagto)\b/i;
function pareceCreditoDePagamento(descricao) { return REGEX_PAG_RECEBIDO.test(String(descricao || '')); }

module.exports = { lancamentos: () => lancamentos, ehEstorno, detectarReserva, detectarDestino, pareceFaturaDeCartao, pareceCreditoDePagamento, normalizar: texto.normalizar };
