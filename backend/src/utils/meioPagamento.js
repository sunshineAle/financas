// Meio de pagamento de uma transação (anotação 53), para a pílula da linha: Crédito, Crediário, Débito, Pix,
// Boleto, Dinheiro ou Transferência. Função PURA (sem banco).
//
//   meioDaTransacao({ descricao, tipo_mov, cartao, tipo_credito, conta_tipo })
//     → 'credito' | 'crediario' | 'debito' | 'pix' | 'boleto' | 'dinheiro' | 'transferencia' | null
//
// Regras:
//  - compra no cartão → 'credito' (cartão do tipo crediário → 'crediario');
//  - na conta, pela descrição: PIX → pix; BOLETO / pagamento de título → boleto; compra no débito / "débito" → debito;
//    saque / dinheiro, ou conta do tipo dinheiro → dinheiro; transferência interna (ou TED/DOC) → transferencia;
//  - guardar/resgatar (reserva) e o que não for reconhecido → null (sem pílula).

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const RE_PIX = /\bpix\b/;
const RE_BOLETO = /\bboleto\b|\bpag(amento|to)?\.?\s+(de\s+)?titulo|\btitulo\s+(pago|bancario)|\bliquidacao\s+de\s+titulo/;
const RE_DEBITO = /\bcompra\s+(no\s+|com\s+)?(cartao\s+)?(de\s+)?debito\b|\bcartao\s+(de\s+)?debito\b|\belo\s+debito\b|\bvisa\s+electron\b|\bmaestro\b|\bdebito\b/;
const RE_DINHEIRO = /\bsaque\b|\bdinheiro\b|\bem\s+especie\b/;
const RE_TRANSF = /\btransfer[e]?ncia\b|\btransf\b|\bted\b|\bdoc\b|\btev\b/;

function meioDaTransacao(t) {
  if (!t) return null;
  if (t.cartao) return String(t.tipo_credito || '').toLowerCase() === 'crediario' ? 'crediario' : 'credito';
  const mov = String(t.tipo_mov || '');
  if (/^reserva_/.test(mov)) return null;
  if (mov.startsWith('transferencia')) return 'transferencia';
  const d = semAcento(t.descricao);
  if (RE_PIX.test(d)) return 'pix';
  if (RE_BOLETO.test(d)) return 'boleto';
  if (RE_DEBITO.test(d)) return 'debito';
  if (RE_DINHEIRO.test(d) || t.conta_tipo === 'dinheiro') return 'dinheiro';
  if (RE_TRANSF.test(d)) return 'transferencia';
  return null;
}

module.exports = { meioDaTransacao };
