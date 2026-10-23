<script setup>
// Parcelamentos em andamento do cartão (reutilizável em Relatórios; fora da tela de Cartões).
// Props: parcelamentos [{ id, descricao, atual, total, falta, fim('AAAA-MM'), pct }]
import CardPadrao from './CardPadrao.vue';
import BarraDegrade from './BarraDegrade.vue';
defineProps({ parcelamentos: { type: Array, default: () => [] }, titulo: { type: String, default: 'Parcelamentos em andamento' } });
const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const M = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotulo = (k) => { const [a, m] = k.split('-').map(Number); return `${M[m - 1]}/${a}`; };
</script>
<template>
  <CardPadrao :titulo="titulo">
    <p v-if="!parcelamentos.length" class="nota">Nenhuma compra parcelada em aberto.</p>
    <ul v-else class="l">
      <li v-for="p in parcelamentos" :key="p.id">
        <div class="t"><span class="n">{{ p.descricao }}</span><span class="pc">{{ p.atual }}</span></div>
        <BarraDegrade :pct="p.pct" :altura="6" :marcador="false" de="var(--saida-ambar-medio)" ate="var(--saida-carmim-medio)" />
        <span class="s numero-tabular">Faltam {{ moeda(p.falta) }} · termina em {{ rotulo(p.fim) }}</span>
      </li>
    </ul>
  </CardPadrao>
</template>
<style scoped>
.nota { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.l { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.l li { display: flex; flex-direction: column; gap: 6px; }
.t { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.n { font-size: 13.5px; font-weight: 600; overflow-wrap: anywhere; }
.pc { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--cor-borda); color: var(--cor-texto-suave); white-space: nowrap; }
.s { font-size: 12px; color: var(--cor-texto-suave); }
</style>
