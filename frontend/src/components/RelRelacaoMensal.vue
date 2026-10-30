<script setup>
// Relação mensal (homologação 1.0, seção 19): gráfico de LINHA com Entradas, Saídas e Resultado por mês (ou por ano).
// Nesta página não há filtro de meses: TOCAR ou ARRASTAR no gráfico escolhe o período, e a página mostra aquele período.
// Setas ‹ › nas pontas andam um período (a janela acompanha). Regra do degradê: cada linha esmaece no início.
//   <RelRelacaoMensal :pontos="[{ chave, rotulo, entradas, saidas }]" :selecionado="i" :formato="fn" @escolher="i => …" />
import { computed, ref } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';

const props = defineProps({
  pontos: { type: Array, default: () => [] },
  selecionado: { type: Number, default: -1 },
  formato: { type: Function, default: (v) => String(v) },
  podeAvancar: { type: Boolean, default: true },
});
const emit = defineEmits(['escolher', 'passo']);

const id = 'rm' + Math.random().toString(36).slice(2, 8);
const L = 320, A = 150, PX = 14, PT = 14, PB = 10;

const series = computed(() => props.pontos.map((p) => ({ ...p, resultado: Math.round(((p.entradas || 0) - (p.saidas || 0)) * 100) / 100 })));
const escala = computed(() => {
  const v = series.value.flatMap((p) => [p.entradas, p.saidas, p.resultado]);
  let min = Math.min(0, ...v), max = Math.max(0, ...v);
  if (max === min) max = min + 1;
  return { min, max };
});
const xDe = (i) => { const n = series.value.length; return n <= 1 ? L / 2 : PX + (i * (L - PX * 2)) / (n - 1); };
const yDe = (v) => { const { min, max } = escala.value; return PT + (1 - (v - min) / (max - min)) * (A - PT - PB); };
function curva(chave) {
  const p = series.value.map((s, i) => ({ x: xDe(i), y: yDe(s[chave] || 0) }));
  if (!p.length) return '';
  if (p.length === 1) return `M ${p[0].x - 6} ${p[0].y} L ${p[0].x + 6} ${p[0].y}`;
  let d = `M ${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)}, ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}
const LINHAS = [
  { chave: 'entradas', nome: 'Entradas', cor: 'var(--cor-entrada)', classe: 'ent' },
  { chave: 'saidas', nome: 'Saídas', cor: 'var(--cor-saida)', classe: 'sai' },
  { chave: 'resultado', nome: 'Resultado', cor: 'var(--cor-texto)', classe: 'res' },
];
const yZero = computed(() => yDe(0));
const sel = computed(() => series.value[props.selecionado] || null);
const xSel = computed(() => (sel.value ? xDe(props.selecionado) : 0));

// toque/arraste: o ponto mais próximo do dedo vira o período escolhido
const area = ref(null);
let arrastando = false;
function indiceNoPonto(e) {
  const r = area.value?.getBoundingClientRect();
  if (!r || !series.value.length) return -1;
  const x = ((e.clientX - r.left) / r.width) * L;
  const n = series.value.length;
  return Math.max(0, Math.min(n - 1, Math.round(((x - PX) / (L - PX * 2)) * (n - 1))));
}
function escolherNo(e) { const i = indiceNoPonto(e); if (i >= 0 && i !== props.selecionado) emit('escolher', i); }
function desce(e) { arrastando = true; area.value?.setPointerCapture?.(e.pointerId); escolherNo(e); }
function move(e) { if (arrastando) escolherNo(e); }
function sobe() { arrastando = false; }
function tecla(e) {
  if (e.key === 'ArrowLeft') { e.preventDefault(); emit('passo', -1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); emit('passo', 1); }
}
</script>

<template>
  <div class="rel-mensal">
    <ul class="legenda" aria-hidden="true">
      <li v-for="l in LINHAS" :key="l.chave" :class="l.classe"><i :style="{ background: l.cor }"></i>{{ l.nome }}<b v-if="sel" class="numero-tabular">{{ formato(sel[l.chave]) }}</b></li>
    </ul>
    <div class="corpo">
      <button type="button" class="passo" aria-label="Período anterior" @click="emit('passo', -1)"><ChevronLeft :size="18" :stroke-width="2" /></button>
      <div ref="area" class="area-grafico" tabindex="0" role="slider" :aria-valuemin="0" :aria-valuemax="Math.max(0, series.length - 1)" :aria-valuenow="selecionado"
        :aria-valuetext="sel ? `${sel.rotulo}: entradas ${formato(sel.entradas)}, saídas ${formato(sel.saidas)}, resultado ${formato(sel.resultado)}` : ''"
        aria-label="Escolha o período: toque ou arraste no gráfico" data-relacao-mensal
        @pointerdown="desce" @pointermove="move" @pointerup="sobe" @pointercancel="sobe" @keydown="tecla">
        <svg :viewBox="`0 0 ${L} ${A}`" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient v-for="l in LINHAS" :id="`${id}-${l.classe}`" :key="l.chave" gradientUnits="userSpaceOnUse" x1="0" y1="0" :x2="L" y2="0">
              <stop offset="0" :stop-color="l.cor" stop-opacity="0.25" />
              <stop offset="0.45" :stop-color="l.cor" stop-opacity="0.85" />
              <stop offset="1" :stop-color="l.cor" />
            </linearGradient>
          </defs>
          <line :x1="PX" :x2="L - PX" :y1="yZero" :y2="yZero" class="zero" />
          <line v-if="sel" :x1="xSel" :x2="xSel" :y1="PT - 6" :y2="A" class="guia" />
          <path v-for="l in LINHAS" :key="l.chave" :d="curva(l.chave)" fill="none" :stroke="`url(#${id}-${l.classe})`" :stroke-width="l.chave === 'resultado' ? 2.6 : 2" stroke-linejoin="round" vector-effect="non-scaling-stroke" :class="['linha', l.classe]" />
        </svg>
        <span v-for="l in (sel ? LINHAS : [])" :key="l.chave" class="marca" :style="{ left: (xSel / L * 100) + '%', top: (yDe(sel[l.chave] || 0) / A * 100) + '%', '--c': l.cor }"></span>
      </div>
      <button type="button" class="passo" aria-label="Próximo período" :disabled="!podeAvancar" @click="emit('passo', 1)"><ChevronRight :size="18" :stroke-width="2" /></button>
    </div>
    <div class="rotulos" aria-hidden="true">
      <span v-for="(p, i) in series" :key="p.chave" :class="{ sel: i === selecionado }">{{ p.rotulo }}</span>
    </div>
  </div>
</template>

<style scoped>
.rel-mensal { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.legenda { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12.5px; color: var(--cor-texto-suave); }
.legenda li { display: inline-flex; align-items: center; gap: 6px; }
.legenda i { width: 8px; height: 8px; border-radius: 50%; }
.legenda b { color: var(--cor-texto); font-weight: 600; }
.corpo { display: grid; grid-template-columns: 28px minmax(0, 1fr) 28px; align-items: center; gap: 2px; }
.passo { width: 28px; height: 44px; display: grid; place-items: center; padding: 0; border: 0; background: none; color: var(--cor-texto-suave); border-radius: 8px; cursor: pointer; }
.passo:hover:not(:disabled) { background: var(--cor-realce); color: var(--cor-texto); }
.passo:disabled { opacity: 0.3; cursor: default; }
.area-grafico { position: relative; touch-action: pan-y; cursor: ew-resize; border-radius: 10px; outline: none; }
.area-grafico:focus-visible { box-shadow: 0 0 0 2px var(--cor-primaria); }
svg { display: block; width: 100%; height: 150px; overflow: visible; }
.zero { stroke: var(--cor-borda); stroke-width: 1; stroke-dasharray: 3 4; vector-effect: non-scaling-stroke; }
.guia { stroke: var(--cor-texto-suave); stroke-opacity: 0.45; stroke-width: 1; stroke-dasharray: 2 3; vector-effect: non-scaling-stroke; }
.linha { transition: d var(--anim-padrao) var(--anim-curva-suave, ease); }
.marca { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 22%, transparent); pointer-events: none; transition: left var(--anim-padrao) ease, top var(--anim-padrao) ease; }
.rotulos { display: flex; justify-content: space-between; padding: 0 30px; }
.rotulos span { flex: 1; text-align: center; font-size: 10px; font-weight: 600; color: var(--cor-texto-suave); letter-spacing: 0.02em; }
.rotulos span.sel { color: var(--cor-texto); }
@media (max-width: 480px) { .rotulos span { font-size: 9px; } }
</style>
