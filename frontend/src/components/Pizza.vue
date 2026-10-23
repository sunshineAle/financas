<script setup>
import { ref, computed } from 'vue';

// Gráfico de pizza (rosca) em SVG. Ao passar o mouse ou o dedo numa fatia,
// ela se destaca e o centro mostra o nome, a porcentagem e o valor.
const props = defineProps({
  segmentos: { type: Array, default: () => [] }, // [{ nome, valor, cor }]
  rotuloVazio: { type: String, default: 'Sem dados' },
});
const emit = defineEmits(['clicar']);

const idBase = 'pizza' + Math.random().toString(36).slice(2, 7);
const R = 40;
const C = 2 * Math.PI * R;
const ativo = ref(null);

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const total = computed(() => props.segmentos.reduce((s, x) => s + x.valor, 0));
const fatias = computed(() => {
  let acumulado = 0;
  return props.segmentos.map((seg, i) => {
    const frac = total.value ? seg.valor / total.value : 0;
    const f = { ...seg, i, frac, pct: Math.round(frac * 100), comprimento: frac * C, deslocamento: -acumulado * C };
    acumulado += frac;
    return f;
  });
});
const foco = computed(() => (ativo.value !== null ? fatias.value[ativo.value] : null));
</script>

<template>
  <div class="pizza-bloco">
    <svg viewBox="0 0 100 100" class="pizza" role="img" :aria-label="rotuloVazio">
      <defs>
        <!-- degradê sutil por fatia (~18% mais escuro no fim): nenhuma cor termina seca -->
        <linearGradient v-for="f in fatias" :id="`${idBase}${f.i}`" :key="'g' + f.i" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" :style="{ stopColor: `color-mix(in srgb, ${f.cor} 92%, white)` }" />
          <stop offset="1" :style="{ stopColor: `color-mix(in srgb, ${f.cor} 82%, black)` }" />
        </linearGradient>
      </defs>
      <circle v-if="!fatias.length" cx="50" cy="50" :r="R" fill="none" stroke="var(--cor-trilho)" stroke-width="14" />
      <g transform="rotate(-90 50 50)">
        <circle
          v-for="f in fatias"
          :key="f.i"
          cx="50" cy="50" :r="R" fill="none"
          :stroke="`url(#${idBase}${f.i})`"
          :stroke-width="ativo === f.i ? 18 : 14"
          :stroke-dasharray="`${Math.max(f.comprimento - 0.6, 0)} ${C}`"
          :stroke-dashoffset="f.deslocamento"
          class="fatia"
          @mouseenter="ativo = f.i"
          @mouseleave="ativo = null"
          @touchstart.passive="ativo = f.i"
          @click="emit('clicar', f)"
        />
      </g>
      <text x="50" y="47" text-anchor="middle" class="centro-titulo">{{ foco ? foco.pct + '%' : fatias.length ? formatoMoeda.format(total).replace(/\s/g, ' ') : '—' }}</text>
      <text x="50" y="59" text-anchor="middle" class="centro-sub">{{ foco ? foco.nome.slice(0, 16) : fatias.length ? 'total' : '' }}</text>
    </svg>
    <ul class="legenda">
      <li
        v-for="f in fatias"
        :key="f.i"
        :class="{ ativa: ativo === f.i }"
        @mouseenter="ativo = f.i"
        @mouseleave="ativo = null"
        @click="emit('clicar', f)"
      >
        <i :style="{ background: `linear-gradient(135deg, ${f.cor}, color-mix(in srgb, ${f.cor} 82%, black))` }"></i>
        <span class="texto">
          <span class="nome">{{ f.nome }}</span>
          <span class="val numero-tabular">{{ formatoMoeda.format(f.valor) }} · {{ f.pct }}%</span>
        </span>
      </li>
      <li v-if="!fatias.length" class="vazio">{{ rotuloVazio }}</li>
    </ul>
  </div>
</template>

<style scoped>
.pizza-bloco { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.pizza { width: 140px; height: 140px; flex: none; }
.fatia { cursor: pointer; transition: stroke-width .12s; }
.centro-titulo { font-size: 9px; font-weight: 700; fill: var(--cor-texto); font-family: var(--fonte-display); }
.centro-sub { font-size: 5.5px; fill: var(--cor-texto-suave); }
.legenda { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 140px; }
.legenda li { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; padding: 4px 6px; border-radius: 8px; cursor: pointer; transition: background .12s; }
.legenda li.ativa, .legenda li:hover { background: var(--cor-fundo); }
.legenda i { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.texto { display: flex; flex-direction: column; min-width: 0; }
.nome { overflow-wrap: anywhere; }
.legenda i { margin-top: 4px; }
.val { color: var(--cor-texto-suave); font-size: 12px; white-space: nowrap; }
.vazio { color: var(--cor-texto-suave); cursor: default; }
</style>
