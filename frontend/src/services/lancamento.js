// Janela de lançamento ÚNICA do app (REGRA: adicionar nunca troca de página).
// Qualquer "+" / "Lançar" chama abrirLancamento() com o contexto; a janela (LancamentoModal, montada no AppLayout)
// abre por cima da página atual, já preenchida, e ao salvar só avisa (lancamentoSalvo) — quem quiser recarrega.
//   import { abrirLancamento, lancamentoSalvo } from '../services/lancamento.js';
//   abrirLancamento({ tipo: 'saida', contaId })                 Conta: Despesa e Entrada, sem forma de pagamento
//   abrirLancamento({ cartaoId })                                Cartão: só Despesa/Compra naquele cartão
//   abrirLancamento({ tipo: 'saida', categoriaId })              Categoria de despesa já escolhida
//   abrirLancamento({ tipo: 'entrada', categoriaReceita: 'Salário' })
//   abrirLancamento({ tipo: 'transferencia', contaId })          Transferência entre contas próprias
//   watch(lancamentoSalvo, recarregar)                           a página de origem atualiza os próprios números
import { reactive, ref } from 'vue';

export const lancamento = reactive({
  aberto: false, tipo: 'saida', contaId: '', cartaoId: '', categoriaId: '', categoriaReceita: '', dividaId: '',
  descricao: '', valor: 0, limitar: '', token: 0,
});
export const lancamentoSalvo = ref(0); // sobe a cada lançamento salvo
export const avisoLancamento = ref(null); // { texto, cartaoId?, desfazer?: { url } } — Transações mostra com "Desfazer"

export function abrirLancamento(opcoes = {}) {
  const o = opcoes || {};
  const cartaoId = o.cartaoId ? String(o.cartaoId) : '';
  const contaId = o.contaId ? String(o.contaId) : '';
  Object.assign(lancamento, {
    aberto: true,
    tipo: cartaoId ? 'saida' : (o.tipo === 'entrada' || o.tipo === 'transferencia' ? o.tipo : 'saida'),
    contaId, cartaoId,
    categoriaId: o.categoriaId ? String(o.categoriaId) : '',
    categoriaReceita: o.categoriaReceita || '',
    dividaId: o.dividaId ? String(o.dividaId) : '',
    descricao: o.descricao || '', valor: Number(o.valor) || 0,
    limitar: o.limitar !== undefined ? o.limitar : cartaoId ? 'cartao' : contaId ? 'conta' : '',
    token: lancamento.token + 1,
  });
}
export function fecharLancamento() { lancamento.aberto = false; }
export function lancamentoFoiSalvo() { lancamentoSalvo.value += 1; }
