// Avisos do sino (TopoApp). As regras ficam em services/alertas.js (faturas, parcelas/acordos, orçamento, backup). Cada aviso: { id, titulo, detalhe, rota, tom: 'saida'|'alerta'|'info' }.
// "Dispensar" é guardado só neste aparelho (localStorage), por id — o id muda quando muda a fatura/dívida.
import { ref, computed } from 'vue';
import { gerarAlertas, notificarNovos, iniciarAlertas } from './alertas.js';

const CHAVE = 'sf:avisos-dispensados';
function lerDispensados() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || '[]') || []; } catch { return []; }
}
const dispensados = ref(lerDispensados());
export const avisosSino = ref([]);
export const carregandoAvisos = ref(false);
export const visiveis = computed(() => avisosSino.value.filter((a) => !dispensados.value.includes(a.id)));

export function dispensarAviso(id) {
  dispensados.value = [...dispensados.value, id].slice(-200);
  try { localStorage.setItem(CHAVE, JSON.stringify(dispensados.value)); } catch { /* sem armazenamento */ }
}
export function limparDispensados() {
  dispensados.value = [];
  try { localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ }
}

let ligadoLoop = false;
export async function carregarAvisos() {
  carregandoAvisos.value = true;
  try {
    const lista = await gerarAlertas();
    avisosSino.value = lista;
    notificarNovos(lista).catch(() => {});
    if (!ligadoLoop) { ligadoLoop = true; iniciarAlertas((l) => { avisosSino.value = l; }); }
  } finally { carregandoAvisos.value = false; }
}
