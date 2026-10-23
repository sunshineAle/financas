// Estado pequeno de navegação compartilhado entre o rodapé e o AppLayout.
import { ref } from 'vue';

// Transacoes.vue só lê `?novo=entrada|saida` ao montar. Se o usuário já está em /transacoes e pede
// "Lançar entrada/saída", o AppLayout remonta a tela (a chave muda) para o pop-up abrir.
export const remontagemTransacoes = ref(0);
export function pedirNovoLancamento(rota, router, rotaAtual) {
  if (rotaAtual === '/transacoes') remontagemTransacoes.value += 1;
  return router.push(rota);
}
