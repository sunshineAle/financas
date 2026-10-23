<script setup>
// Resumo do mês de UMA conta: TopoValor (tema entrada) com "Saldo do mês", linhas Entradas/Saídas e a barrinha em degradê.
import { computed } from 'vue';
import TopoValor from './TopoValor.vue';
import BarraDegrade from './BarraDegrade.vue';

const props = defineProps({
  entradas: { type: Number, default: 0 },
  saidas: { type: Number, default: 0 },
  periodo: { type: String, default: '' }, // ex.: "outubro de 2026"
});
const saldo = computed(() => props.entradas - props.saidas);
const pct = computed(() => (props.entradas > 0 ? Math.max(0, Math.round((saldo.value / props.entradas) * 100)) : 0));
const texto = computed(() => {
  if (props.entradas <= 0 && props.saidas <= 0) return 'Sem movimentação no período';
  if (props.entradas <= 0) return 'Só saídas no período';
  if (saldo.value < 0) return 'As saídas passaram das entradas';
  return `${pct.value}% das entradas ficou no saldo`;
});
</script>

<template>
  <TopoValor tema="entrada" :variante="2" rotulo="Saldo do mês" :periodo="periodo" :valor="saldo"
    :linhas="[{ rotulo: 'Entradas', valor: entradas }, { rotulo: 'Saídas', valor: saidas }]">
    <div class="barra">
      <BarraDegrade :pct="pct" :altura="8" de="color-mix(in srgb, var(--cor-sobre-cor) 55%, transparent)" ate="var(--cor-sobre-cor)" />
      <span class="txt">{{ texto }}</span>
    </div>
    <template v-if="$slots.acoes" #acoes><slot name="acoes" /></template>
  </TopoValor>
</template>

<style scoped>
.barra { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.txt { font-size: 12px; opacity: 0.9; }
</style>
