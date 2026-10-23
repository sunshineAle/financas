<script setup>
// Rosca (5+ partes), no estilo dos arcos do orbe: pontas arredondadas, trilho apagado e degradê sutil
// (clareia/escurece levemente) mesmo com cores separadas; total no centro e respiro entre as partes.
// Mostra as `maximo` maiores e junta o resto em "Outros" (cinza). A lista ao lado traz todas as partes.
import { ref, computed, onMounted } from 'vue';

const props = defineProps({
  segmentos: { type: Array, default: () => [] }, // [{ nome, valor, cor }]
  rotuloTotal: { type: String, default: 'total' },
  rotuloVazio: { type: String, default: 'Sem dados neste período.' },
  maximo: { type: Number, default: 8 },
});
const emit = defineEmits(['clicar']);

const R = 40;
const C = 2 * Math.PI * R;
const ativo = ref(null);
const pronto = ref(false);
onMounted(() => requestAnimationFrame(() => { pronto.value = true; }));

const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const ordenados = computed(() => [...props.segmentos].filter((s) => s.valor > 0).sort((a, b) => b.valor - a.valor));
const partes = computed(() => {
  const lista = ordenados.value;
  if (lista.length <= props.maximo) return lista;
  const topo = lista.slice(0, props.maximo - 1);
  const resto = lista.slice(props.maximo - 1).reduce((s, x) => s + x.valor, 0);
  return [...topo, { nome: 'Outros', valor: resto, cor: 'var(--cor-texto-suave)' }];
});
const total = computed(() => partes.value.reduce((s, x) => s + x.valor, 0));
// Pontas arredondadas: o arredondamento "come" meia espessura em cada ponta, então o traço é encurtado
// pela espessura mais um respiro entre as partes.
const ESPESSURA = 8;
const RESPIRO = 2.2;
const idBase = 'rosca' + Math.random().toString(36).slice(2, 7);
const fatias = computed(() => {
  let acc = 0;
  const unico = partes.value.length === 1;
  return partes.value.map((p, i) => {
    const frac = total.value ? p.valor / total.value : 0;
    const perda = unico ? 0 : ESPESSURA + RESPIRO;
    const comp = Math.max(0.01, frac * C - perda);
    const f = { ...p, i, frac, pct: Math.round(frac * 100), comp, off: -(acc * C + perda / 2) };
    acc += frac;
    return f;
  });
});
const foco = computed(() => (ativo.value !== null ? fatias.value[ativo.value] : null));
</script>

<template>
  <div class="rosca-bloco">
    <div class="rosca" role="img" :aria-label="`Total ${moeda(total)}`">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient v-for="f in fatias" :id="`${idBase}${f.i}`" :key="'g' + f.i" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" :style="{ stopColor: `color-mix(in srgb, ${f.cor} 90%, white)` }" />
            <stop offset="0.55" :style="{ stopColor: f.cor }" />
            <stop offset="1" :style="{ stopColor: `color-mix(in srgb, ${f.cor} 82%, black)` }" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" :r="R" fill="none" class="trilho" :stroke-width="ESPESSURA" />
        <g transform="rotate(-90 50 50)">
          <circle
            v-for="f in fatias" :key="f.i" cx="50" cy="50" :r="R" fill="none" :stroke="`url(#${idBase}${f.i})`" stroke-linecap="round"
            :stroke-width="ativo === f.i ? ESPESSURA + 2.5 : ESPESSURA"
            :stroke-dasharray="`${pronto ? f.comp : 0.01} ${C}`" :stroke-dashoffset="f.off"
            class="fatia" @mouseenter="ativo = f.i" @mouseleave="ativo = null" @touchstart.passive="ativo = f.i" @click="emit('clicar', f)"
          />
        </g>
      </svg>
      <div class="centro">
        <template v-if="fatias.length">
          <strong class="numero-tabular">{{ foco ? foco.pct + '%' : moeda(total) }}</strong>
          <small>{{ foco ? foco.nome : rotuloTotal }}</small>
        </template>
        <small v-else>—</small>
      </div>
    </div>
    <ul class="legenda">
      <li v-for="f in fatias" :key="f.i" :class="{ ativa: ativo === f.i }" @mouseenter="ativo = f.i" @mouseleave="ativo = null" @click="emit('clicar', f)">
        <i :style="{ background: f.cor }"></i>
        <span class="nome">{{ f.nome }}</span>
        <span class="val numero-tabular">{{ moeda(f.valor) }} <b>{{ f.pct }}%</b></span>
      </li>
      <li v-if="!fatias.length" class="vazio">{{ rotuloVazio }}</li>
    </ul>
  </div>
</template>

<style scoped>
.rosca-bloco { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.rosca { position: relative; width: 168px; height: 168px; flex: none; margin-inline: auto; }
.rosca svg { width: 100%; height: 100%; display: block; }
.trilho { stroke: var(--cor-trilho); opacity: 0.7; } /* trilho apagado */
.fatia { cursor: pointer; transition: stroke-dasharray var(--anim-lenta) var(--anim-curva-suave), stroke-width var(--anim-rapida) ease; }
.centro { position: absolute; inset: 22%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; pointer-events: none; line-height: 1.2; }
.centro strong { font-family: var(--fonte-display); font-size: 15px; }
.centro small { font-size: 11px; color: var(--cor-texto-suave); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.legenda { list-style: none; margin: 0; padding: 0; flex: 1 1 220px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.legenda li { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 4px 8px; border-radius: 10px; font-size: 14px; cursor: pointer; transition: background var(--anim-rapida) ease; }
.legenda li.ativa, .legenda li:hover { background: var(--cor-realce); }
.legenda i { width: 12px; height: 12px; border-radius: 4px; flex: none; background-image: linear-gradient(135deg, rgba(255,255,255,.18), rgba(0,0,0,.18)); }
.nome { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.val { color: var(--cor-texto-suave); font-size: 13px; text-align: right; white-space: nowrap; }
.val b { color: var(--cor-texto); font-weight: 600; margin-left: 4px; }
.vazio { color: var(--cor-texto-suave); cursor: default; }
@media (max-width: 480px) { .val { white-space: normal; } }
</style>
