<script setup>
// Linha com marcador de valor (REF-06, tela 5): curva suave em degradê, área que esmaece e balão no ponto
// selecionado. Usada em Relatórios para a evolução do saldo. Se desenha da esquerda para a direita.
//   <RelLinha :pontos="[{ rotulo: 'JAN', valor: 1200 }, ...]" :selecionado="3" />
import { ref, computed, onMounted } from 'vue';

const props = defineProps({
  pontos: { type: Array, default: () => [] }, // [{ rotulo, valor }]
  selecionado: { type: Number, default: -1 },
  de: { type: String, default: 'var(--entrada-ceu-medio)' },
  ate: { type: String, default: 'var(--entrada-royal-medio)' },
  formato: { type: Function, default: (v) => String(v) },
});
const emit = defineEmits(['escolher']);

const id = 'rl' + Math.random().toString(36).slice(2, 8);
const L = 300;
const A = 120;
const PAD_X = 14;
const PAD_T = 22;
const PAD_B = 12;
const pronto = ref(false);
onMounted(() => requestAnimationFrame(() => { pronto.value = true; }));

const escala = computed(() => {
  const v = props.pontos.map((p) => p.valor);
  let min = Math.min(0, ...v);
  let max = Math.max(0, ...v);
  if (max === min) { max = min + 1; }
  return { min, max };
});
const xy = computed(() => {
  const n = props.pontos.length;
  const { min, max } = escala.value;
  return props.pontos.map((p, i) => ({
    x: n === 1 ? L / 2 : PAD_X + (i * (L - PAD_X * 2)) / (n - 1),
    y: PAD_T + (1 - (p.valor - min) / (max - min)) * (A - PAD_T - PAD_B),
  }));
});
const yZero = computed(() => {
  const { min, max } = escala.value;
  return PAD_T + (1 - (0 - min) / (max - min)) * (A - PAD_T - PAD_B);
});
// curva suave (Catmull-Rom → Bézier)
const caminho = computed(() => {
  const p = xy.value;
  if (!p.length) return '';
  if (p.length === 1) return `M ${p[0].x - 6} ${p[0].y} L ${p[0].x + 6} ${p[0].y}`;
  let d = `M ${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
});
const area = computed(() => {
  const p = xy.value;
  if (p.length < 2) return '';
  return `${caminho.value} L ${p[p.length - 1].x.toFixed(1)} ${A} L ${p[0].x.toFixed(1)} ${A} Z`;
});
const sel = computed(() => (props.selecionado >= 0 && xy.value[props.selecionado] ? xy.value[props.selecionado] : null));
const rotuloSel = computed(() => (sel.value ? props.formato(props.pontos[props.selecionado].valor) : ''));
const baloEsq = computed(() => (sel.value ? Math.min(86, Math.max(14, (sel.value.x / L) * 100)) : 0));
</script>

<template>
  <div class="rel-linha">
    <div class="area-grafico">
      <svg :viewBox="`0 0 ${L} ${A}`" preserveAspectRatio="xMidYMid meet" role="img" :aria-label="`Evolução: ${pontos.map((p) => `${p.rotulo} ${formato(p.valor)}`).join(', ')}`">
        <defs>
          <linearGradient :id="`${id}-l`" gradientUnits="userSpaceOnUse" x1="0" y1="0" :x2="L" y2="0">
            <stop offset="0" :stop-color="de" />
            <stop offset="1" :stop-color="ate" />
          </linearGradient>
          <linearGradient :id="`${id}-a`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" :stop-color="ate" stop-opacity="0.28" />
            <stop offset="1" :stop-color="ate" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line :x1="PAD_X" :x2="L - PAD_X" :y1="yZero" :y2="yZero" class="zero" />
        <path :d="area" :style="{ d: `path('${area}')` }" :fill="`url(#${id}-a)`" class="area" :class="{ ok: pronto }" />
        <path :d="caminho" :style="{ d: `path('${caminho}')` }" pathLength="1" fill="none" :stroke="`url(#${id}-l)`" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="tracado" :class="{ ok: pronto }" />
        <g v-if="sel" class="marca" :class="{ ok: pronto }">
          <line :x1="sel.x" :x2="sel.x" :y1="sel.y" :y2="A" class="guia" />
          <circle :cx="sel.x" :cy="sel.y" r="6.5" class="miolo" />
          <circle :cx="sel.x" :cy="sel.y" r="3" :fill="ate" />
        </g>
      </svg>
      <span v-if="sel" class="balao" :class="{ ok: pronto }" :style="{ left: baloEsq + '%', top: Math.max(0, (sel.y / A) * 100 - 20) + '%' }">{{ rotuloSel }}</span>
    </div>
    <div class="rotulos" role="group" aria-label="Escolher mês do gráfico">
      <button v-for="(p, i) in pontos" :key="i" type="button" :class="{ sel: i === selecionado }" :aria-pressed="i === selecionado" @click="emit('escolher', i)">{{ p.rotulo }}</button>
    </div>
  </div>
</template>

<style scoped>
.rel-linha { display: flex; flex-direction: column; gap: 6px; }
.area-grafico { position: relative; }
svg { width: 100%; height: auto; display: block; overflow: visible; }
.zero { stroke: var(--cor-borda); stroke-width: 1; stroke-dasharray: 3 4; }
.tracado { stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset calc(var(--anim-lenta) * 1.6) var(--anim-curva-suave), d var(--anim-lenta) var(--anim-curva-suave); }
.tracado.ok { stroke-dashoffset: 0; }
.area { opacity: 0; transition: opacity var(--anim-lenta) var(--anim-curva-suave) var(--anim-lenta), d var(--anim-lenta) var(--anim-curva-suave); }
.area.ok { opacity: 1; }
.guia { stroke: var(--cor-borda); stroke-width: 1.5; stroke-dasharray: 2 3; }
.miolo { fill: var(--cor-fundo-elevado); stroke: var(--cor-borda); stroke-width: 1; }
.marca { opacity: 0; transition: opacity var(--anim-padrao) var(--anim-curva) var(--anim-lenta); }
.marca.ok { opacity: 1; }
.balao {
  position: absolute; transform: translate(-50%, 0); padding: 3px 9px; border-radius: 8px; white-space: nowrap; pointer-events: none;
  font-family: var(--fonte-display); font-size: 12px; font-weight: 700; color: var(--cor-sobre-cor);
  background: linear-gradient(135deg, v-bind(de), v-bind(ate)); opacity: 0; transition: opacity var(--anim-padrao) var(--anim-curva) var(--anim-lenta), left var(--anim-padrao) var(--anim-curva);
}
.balao.ok { opacity: 1; }
.rotulos { display: flex; justify-content: space-between; gap: 2px; }
.rotulos button {
  flex: 1; min-width: 0; min-height: 44px; padding: 0; border: none; background: none; border-radius: 8px; cursor: pointer;
  font-family: var(--fonte-texto); font-size: 10px; font-weight: 600; letter-spacing: 0.02em; color: var(--cor-texto-suave);
}
.rotulos button.sel { color: var(--cor-primaria); background: var(--cor-entrada-fundo); }
@media (max-width: 480px) { .rotulos button { font-size: 9px; } }
</style>
