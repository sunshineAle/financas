// Avisos breves (toast): aparecem por alguns segundos e somem sozinhos; tocar abre a tela relacionada.
//   import { avisar } from '../services/avisos.js';
//   avisar('3 transações para revisar', { rota: '/transacoes' });
// O mesmo texto não se repete enquanto ainda estiver na tela.
import { ref } from 'vue';

export const avisos = ref([]);
let seq = 0;

export function avisar(texto, { rota = null, tipo = 'info', duracao = 4500 } = {}) {
  if (avisos.value.some((a) => a.texto === texto)) return;
  const id = ++seq;
  avisos.value.push({ id, texto, rota, tipo });
  setTimeout(() => dispensar(id), duracao);
}
export function dispensar(id) {
  avisos.value = avisos.value.filter((a) => a.id !== id);
}
