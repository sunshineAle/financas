<script setup>
// Medidor em meia-lua (orçamento por categoria: "68% do orçamento de Mercado"). Slot = texto central.
import { ref, computed, onMounted } from 'vue';

const props = defineProps({
  pct: { type: Number, default: 0 }, // pode passar de 100 (estourou); o arco para em 100
  largura: { type: Number, default: 160 },
  de: { type: String, default: 'var(--saida-carmim-medio)' }, // v2: degradê de saída carmim -> tangerina -> âmbar
  meio: { type: String, default: 'var(--saida-tangerina-medio)' },
  ate: { type: String, default: 'var(--saida-ambar-medio)' },
});
const id = 'med' + Math.random().toString(36).slice(2, 8);
const L = Math.PI * 40; // comprimento do arco (r = 40)
const pronto = ref(false);
onMounted(() => requestAnimationFrame(() => { pronto.value = true; }));
const p = computed(() => Math.min(100, Math.max(0, props.pct || 0)));
</script>

<template>
  <div class="medidor" :style="{ width: largura + 'px' }">
    <svg viewBox="0 0 100 56" aria-hidden="true">
      <defs>
        <linearGradient :id="id" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" :stop-color="de" />
          <stop v-if="meio" offset="0.55" :stop-color="meio" />
          <stop offset="1" :stop-color="ate" />
        </linearGradient>
      </defs>
      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" class="trilho" stroke-width="9" stroke-linecap="round" />
      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" :stroke="`url(#${id})`" stroke-width="9" stroke-linecap="round" :stroke-dasharray="L" :stroke-dashoffset="pronto ? L * (1 - p / 100) : L" class="valor" />
    </svg>
    <div class="centro"><slot /></div>
  </div>
</template>

<style scoped>
.medidor { position: relative; flex-shrink: 0; max-width: 100%; }
svg { width: 100%; display: block; }
.trilho { stroke: var(--cor-trilho); }
.valor { transition: stroke-dashoffset var(--anim-lenta) var(--anim-curva-suave); }
.centro { position: absolute; left: 0; right: 0; bottom: 0; text-align: center; line-height: 1.1; }
</style>
