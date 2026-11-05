// Confirmação no visual do app (05/11): substitui o confirm()/alert() do navegador em todo o sistema.
//   if (!(await confirmar({ titulo: 'Excluir transação?', texto: '…', acao: 'Excluir' }))) return;
// A janela é a ConfirmacaoApp.vue (montada uma vez no App.vue). `perigo` (padrão: true) pinta o botão na cor do excluir.
import { ref } from 'vue';

export const pedidoConfirmacao = ref(null); // { titulo, texto, acao, cancelar, perigo, detalhes, resolver }

export function confirmar({ titulo = 'Tem certeza?', texto = '', acao = 'Excluir', cancelar = 'Cancelar', perigo = true, detalhes = [] } = {}) {
  if (pedidoConfirmacao.value) pedidoConfirmacao.value.resolver(false);
  return new Promise((resolver) => { pedidoConfirmacao.value = { titulo, texto, acao, cancelar, perigo, detalhes, resolver }; });
}
export function responderConfirmacao(sim) {
  const p = pedidoConfirmacao.value;
  pedidoConfirmacao.value = null;
  if (p) p.resolver(!!sim);
}
