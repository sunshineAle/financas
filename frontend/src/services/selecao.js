// Seleção de transações para apagar várias de uma vez (05/11). Segurar uma linha liga a seleção e já marca ela;
// tocar marca/desmarca; "Todas" marca as que podem ser apagadas; sair limpa. Só as "simples" podem ser marcadas.
import { ref, computed } from 'vue';
import { podeExcluirEmLote, excluirVarias } from './excluirTransacoes.js';
import { avisar } from './avisos.js';

export function useSelecao(lista, depois) {
  const ativa = ref(false);
  const ids = ref(new Set());
  const ocupado = ref(false);
  const marcaveis = computed(() => (lista.value || []).filter(podeExcluirEmLote));
  const quantidade = computed(() => ids.value.size);
  function marcar(t, sim) {
    const s = new Set(ids.value);
    if (sim) s.add(t.id); else s.delete(t.id);
    ids.value = s;
  }
  function segurar(t) {
    if (!podeExcluirEmLote(t)) { avisar('Esta transação não entra na seleção: desfaça ou edite pelo detalhe dela.', { tipo: 'info' }); return; }
    ativa.value = true; marcar(t, true);
  }
  function alternar(t) {
    if (!podeExcluirEmLote(t)) { avisar('Esta não pode ser apagada junto com as outras.', { tipo: 'info' }); return; }
    marcar(t, !ids.value.has(t.id));
    if (!ids.value.size) ativa.value = false;
  }
  const todas = () => { ids.value = new Set(marcaveis.value.map((t) => t.id)); };
  const sair = () => { ativa.value = false; ids.value = new Set(); };
  const marcada = (t) => ids.value.has(t.id);
  async function excluir() {
    const escolhidas = (lista.value || []).filter((t) => ids.value.has(t.id));
    if (!escolhidas.length) return;
    if (!confirm(`Apagar ${escolhidas.length} ${escolhidas.length === 1 ? 'transação' : 'transações'}? Os saldos voltam ao que eram sem elas.`)) return;
    ocupado.value = true;
    try {
      const r = await excluirVarias(escolhidas);
      avisar(r.falhas ? `${r.ok} apagada(s); ${r.falhas} não puderam ser apagadas.` : `${r.ok} ${r.ok === 1 ? 'transação apagada' : 'transações apagadas'}.`, { tipo: r.falhas ? 'aviso' : 'ok' });
      sair();
      if (depois) await depois();
    } finally { ocupado.value = false; }
  }
  return { ativa, ocupado, quantidade, total: computed(() => marcaveis.value.length), segurar, alternar, todas, sair, marcada, excluir };
}
