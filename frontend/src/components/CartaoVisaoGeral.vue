<script setup>
// Visão geral de todos os cartões (reutilizável em Relatórios; fora da tela de Cartões).
// Props: cartoes (lista de /api/cartoes). Emite 'escolher' (índice).
import { computed } from 'vue';
import CardPadrao from './CardPadrao.vue';
import BarraDegrade from './BarraDegrade.vue';
import Icone from './Icone.vue';
const props = defineProps({ cartoes: { type: Array, default: () => [] } });
defineEmits(['escolher']);
const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const faturas = computed(() => props.cartoes.reduce((s, c) => s + (c.faturaAberta?.total || 0), 0));
const pct = (c) => (c.limite > 0 ? Math.min(100, (c.limiteUsado / c.limite) * 100) : 0);
</script>
<template>
  <CardPadrao titulo="Visão geral" :subtitulo="`Faturas abertas: ${moeda(faturas)}`">
    <ul class="l">
      <li v-for="(c, i) in cartoes" :key="c.id">
        <button type="button" @click="$emit('escolher', i)">
          <div class="t"><span class="n"><Icone nome="cartoes" :tamanho="14" /> {{ c.nome }}</span><span class="v numero-tabular">{{ moeda(c.faturaAberta?.total) }}</span></div>
          <template v-if="c.limite">
            <BarraDegrade :pct="pct(c)" :altura="6" :marcador="false" de="var(--saida-ambar-medio)" ate="var(--saida-carmim-medio)" />
            <span class="s numero-tabular">{{ moeda(c.limiteUsado) }} de {{ moeda(c.limite) }} · {{ Math.round(pct(c)) }}% do limite</span>
          </template>
          <span v-else class="s">Sem limite definido</span>
        </button>
      </li>
    </ul>
  </CardPadrao>
</template>
<style scoped>
.l { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
button { display: flex; flex-direction: column; gap: 6px; width: 100%; min-height: 44px; padding: 6px 0; background: none; border: none; color: var(--cor-texto); text-align: left; font-family: var(--fonte-texto); cursor: pointer; }
.t { display: flex; justify-content: space-between; gap: 10px; }
.n { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; }
.v { font-size: 13px; font-weight: 600; }
.s { font-size: 12px; color: var(--cor-texto-suave); }
</style>
