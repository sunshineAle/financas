// Ganchos com os outros setores (cada um pode ainda não existir): tudo via try/catch, com plano B simples.
const texto = require('./texto');

let lancamentos = null;
try { lancamentos = require('../utils/lancamentos'); } catch (e) { lancamentos = null; }
let reservasAuto = null;
try { reservasAuto = require('../utils/reservasAuto'); } catch (e) { reservasAuto = null; }
// Anotação 56: metas ligadas às caixinhas do banco
let caixinhas = null;
try { caixinhas = require('../utils/caixinhas'); } catch (e) { caixinhas = null; }
function metasDaConta(usuarioId, contaId) { try { return caixinhas ? caixinhas.metasDaConta(usuarioId, contaId) : []; } catch (e) { return []; } }
function casarCaixinha(descricao, valor, metas) { try { return caixinhas ? caixinhas.casarCaixinha(descricao, valor, metas) : null; } catch (e) { return null; } }
function guardadoNaMeta(reservaId, metaId) { try { return caixinhas ? caixinhas.guardadoNaMeta(reservaId, metaId) : 0; } catch (e) { return 0; } }

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

// Crédito na fatura que é o PAGAMENTO da fatura anterior (não é compra nem estorno). "Pagamento" sozinho também vale
// (antes exigia um espaço depois da palavra e "PAGAMENTO" no fim da descrição escapava).
const REGEX_PAG_RECEBIDO = /\b(pagamentos?(?: (?:recebido|efetuado|em conta|on[- ]?line))?|pgto\.?(?: (?:recebido|efetuado|fatura))?|pag(?:amento)?\.? (?:de |da )?fatura|obrigado pelo pagamento|credito de pagamento|pagto|d[eé]bito autom[aá]tico|pag(?:amento)? boleto)\b/i;
function pareceCreditoDePagamento(descricao) { return REGEX_PAG_RECEBIDO.test(String(descricao || '')); }
// Pagamento da fatura com descrição inequívoca: vale mesmo quando o arquivo traz o pagamento com o MESMO sinal das
// compras (alguns bancos exportam tudo positivo). Sem isso, o pagamento entrava como "compra" e a fatura dobrava.
const REGEX_PAG_FORTE = /\b(pagamento (?:recebido|efetuado|on[- ]?line|da fatura|de fatura|fatura)|pgto\.? (?:recebido|efetuado|fatura)|pagto (?:recebido|efetuado|fatura|debito automatico)|obrigado pelo pagamento|credito de pagamento|pagamento debito automatico|d[eé]bito autom[aá]tico fatura)\b/i;
function pareceTextoDePagamentoDaFatura(descricao) { return REGEX_PAG_FORTE.test(texto.normalizar(descricao)); }

// Anotação 61: CRÉDITO na fatura do cartão pelo texto (vale em OFX, CSV, planilha e PDF, qualquer que seja o sinal).
//  - 'estorno'   estorno, devolução, cancelamento, reembolso, chargeback
//  - 'pagamento' pagamento da fatura (anterior ou adiantado), pgto, pagto
//  - 'cashback'  cashback, ajuste a crédito, crédito avulso/promocional
// Cobranças da própria fatura (IOF, juros, encargos, multa, anuidade, tarifa, seguro) nunca são crédito pelo texto.
const RE_COBRANCA = /\b(iof|juros|encargos?|multa|mora|anuidade|tarifa|seguro|rotativo|parcelamento de fatura)\b/;
const RE_CRED_ESTORNO = /\b(estorn\w*|devolu[cç](?:ao|oes)|devolvid[oa]|cancelament\w*|cancelad[ao]|reembolso|chargeback|contestac\w*)\b/;
const RE_CRED_PAGAMENTO = /\b(pagamentos?|pgto|pagto|pag fatura|obrigado pelo pagamento)\b/;
const RE_CRED_CASHBACK = /\b(cash ?back|ajuste (?:a |de )?credito|credito (?:de |em |na |por |promocional|avulso|ajuste|cashback)|bonificac\w*|^credito\b)/;
const RE_ADIANTADO = /\b(adiantad[oa]|antecipad[oa]|antecipacao|parcial)\b/;
function tipoDeCredito(descricao) {
  const d = texto.normalizar(descricao);
  if (!d || RE_COBRANCA.test(d)) return null;
  if (RE_CRED_ESTORNO.test(d)) return 'estorno';
  if (RE_CRED_CASHBACK.test(d)) return 'cashback';
  if (RE_CRED_PAGAMENTO.test(d)) return 'pagamento';
  return null;
}
const pareceAdiantado = (descricao) => RE_ADIANTADO.test(texto.normalizar(descricao));

module.exports = { caixinhas: () => caixinhas, metasDaConta, casarCaixinha, guardadoNaMeta, lancamentos: () => lancamentos, ehEstorno, detectarReserva, detectarDestino, pareceFaturaDeCartao, pareceCreditoDePagamento, pareceTextoDePagamentoDaFatura, tipoDeCredito, pareceAdiantado, normalizar: texto.normalizar };
