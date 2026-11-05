<script setup>
// Barra da seleção (05/11): aparece quando a pessoa SEGURA uma transação. Mostra quantas estão marcadas,
// "Todas" (marca as que podem ser apagadas na lista), "Excluir" e o X para sair da seleção.
// <BarraSelecao :quantidade="n" :total="m" :ocupado="x" @todas="…" @excluir="…" @sair="…" />
import { X, Trash2, CheckCheck } from 'lucide-vue-next';
defineProps({ quantidade: { type: Number, default: 0 }, total: { type: Number, default: 0 }, ocupado: { type: Boolean, default: false } });
const emit = defineEmits(['todas', 'excluir', 'sair']);
</script>

<template>
  <Teleport to="body">
    <div class="barra-selecao" role="toolbar" aria-label="Transações selecionadas" data-barra-selecao>
      <button type="button" class="sair" aria-label="Sair da seleção" @click="emit('sair')"><X :size="18" :stroke-width="2" /></button>
      <span class="conta numero-tabular" aria-live="polite">{{ quantidade }} {{ quantidade === 1 ? 'selecionada' : 'selecionadas' }}</span>
      <button v-if="total > quantidade" type="button" class="todas" @click="emit('todas')"><CheckCheck :size="16" :stroke-width="2" />Todas</button>
      <button type="button" class="excluir" :disabled="!quantidade || ocupado" @click="emit('excluir')"><Trash2 :size="16" :stroke-width="2" />Excluir</button>
    </div>
  </Teleport>
</template>

<style scoped>
.barra-selecao { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(96px + env(safe-area-inset-bottom, 0px)); z-index: 60; width: min(560px, calc(100% - 24px));
  display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 6px; border-radius: 18px; background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda);
  box-shadow: 0 18px 40px -18px rgb(0 0 0 / 0.6); font-family: var(--fonte-texto); }
@media (min-width: 769px) { .barra-selecao { bottom: 24px; } }
.sair { width: 38px; height: 38px; border-radius: 50%; border: 0; background: var(--cor-realce); color: var(--cor-texto); display: grid; place-items: center; cursor: pointer; flex: none; }
.conta { flex: 1; min-width: 0; font-weight: 600; font-size: 14px; color: var(--cor-texto); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.todas, .excluir { display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 0 14px; border-radius: 12px; font: 600 13.5px var(--fonte-texto); cursor: pointer; }
.todas { border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); }
.excluir { border: 1px solid color-mix(in srgb, var(--cor-amarelo) 35%, transparent); background: color-mix(in srgb, var(--cor-amarelo) 16%, var(--cor-card)); color: var(--cor-amarelo); }
.excluir:disabled { opacity: .5; cursor: default; }
</style>
