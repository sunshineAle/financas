<script setup>
// Gráfico mensal compacto (barras Entradas/Saídas + linhas Resultado e Reserva), rolável. Tocar num mês
// emite `escolher` com a chave AAAA-MM (o Dashboard troca o mês compartilhado).
import { ref, computed, onMounted, nextTick } from 'vue';

const props = defineProps({
  fluxo: { type: Array, default: () => [] }, // [{ chave, entradas, saidasTotais, resultadoProj, reserva, futuro }]
  chaveEscolhida: { type: String, default: '' },
});
const emit = defineEmits(['escolher']);

const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const mesCurto = (chave) => { const [a, m] = chave.split('-').map(Number); return m === 1 ? `${MESES[0]}/${String(a).slice(2)}` : MESES[m - 1]; };

const larguraMes = 52;
const altura = 150;
const margemTopo = 10;
const margemBase = 22;
const valoresY = computed(() => props.fluxo.flatMap((m) => [m.entradas, m.saidasTotais, m.resultadoProj, m.reserva]));
const maxY = computed(() => Math.max(1, ...valoresY.value));
const minY = computed(() => Math.min(0, ...valoresY.value));
const yDe = (v) => margemTopo + ((maxY.value - v) / (maxY.value - minY.value)) * (altura - margemBase - margemTopo);
const larguraSvg = computed(() => Math.max(props.fluxo.length * larguraMes, 280));
const centro = (i) => i * larguraMes + larguraMes / 2;
const linhaDe = (fn) => props.fluxo.map((m, i) => `${centro(i)},${yDe(fn(m)).toFixed(1)}`).join(' ');
const iAtual = computed(() => { const f = props.fluxo.findIndex((m) => m.futuro); return f > 0 ? f - 1 : props.fluxo.length - 1; });
const ativo = ref(null);
const emFoco = computed(() => props.fluxo[ativo.value ?? props.fluxo.findIndex((m) => m.chave === props.chaveEscolhida)] || props.fluxo[iAtual.value] || null);
const rolagem = ref(null);

let arrastando = false, foiArrasto = false, inicioX = 0, inicioScroll = 0, idPonteiro = null;
function aoApertar(e) {
  if (e.pointerType === 'touch') return;
  arrastando = true; foiArrasto = false; idPonteiro = e.pointerId; inicioX = e.clientX; inicioScroll = rolagem.value.scrollLeft;
}
function aoMover(e) {
  if (!arrastando) return;
  const dx = e.clientX - inicioX;
  if (!foiArrasto && Math.abs(dx) > 5) { foiArrasto = true; rolagem.value.setPointerCapture?.(idPonteiro); }
  if (foiArrasto) rolagem.value.scrollLeft = inicioScroll - dx;
}
function aoSoltar() { arrastando = false; }
function clicar(m) { if (foiArrasto) { foiArrasto = false; return; } emit('escolher', m.chave); }

onMounted(async () => {
  await nextTick();
  if (rolagem.value) rolagem.value.scrollLeft = Math.max(0, centro(iAtual.value) - rolagem.value.clientWidth * 0.65);
});
</script>

<template>
  <div class="mensal">
    <div class="legenda">
      <span><i class="q entrada"></i>Entradas</span>
      <span><i class="q saida"></i>Saídas</span>
      <span><i class="l resultado"></i>Resultado</span>
      <span><i class="l reserva"></i>Reserva de Liberdade</span>
    </div>
    <p v-if="emFoco" class="detalhe">
      <strong>{{ mesCurto(emFoco.chave) }}{{ emFoco.futuro ? ' (prev.)' : '' }}</strong>
      <span class="c-entrada">{{ moeda(emFoco.entradas) }}</span>
      <span class="c-saida">{{ moeda(emFoco.saidasTotais) }}</span>
      <span class="c-resultado">{{ moeda(emFoco.resultadoProj) }}</span>
    </p>
    <div ref="rolagem" class="rolagem" data-sem-deslizar @pointerdown="aoApertar" @pointermove="aoMover" @pointerup="aoSoltar" @pointercancel="aoSoltar" @pointerleave="aoSoltar">
      <svg :width="larguraSvg" :height="altura" :viewBox="`0 0 ${larguraSvg} ${altura}`" role="img" aria-label="Entradas, saídas, resultado e reserva por mês">
        <line :x1="0" :x2="larguraSvg" :y1="yDe(0)" :y2="yDe(0)" class="eixo" />
        <g v-for="(m, i) in fluxo" :key="m.chave" :class="['mes', { futuro: m.futuro, escolhido: m.chave === chaveEscolhida }]" @mouseenter="ativo = i" @mouseleave="ativo = null" @touchstart.passive="ativo = i" @click="clicar(m)">
          <rect :x="i * larguraMes" y="0" :width="larguraMes" :height="altura" class="faixa" />
          <rect :x="centro(i) - 14" :y="Math.min(yDe(m.entradas), yDe(0))" width="12" :height="Math.max(Math.abs(yDe(0) - yDe(m.entradas)), 2)" rx="4" class="b-entrada" />
          <rect :x="centro(i) + 2" :y="yDe(m.saidasTotais)" width="12" :height="Math.max(yDe(0) - yDe(m.saidasTotais), 2)" rx="4" class="b-saida" />
          <text :x="centro(i)" :y="altura - 6" text-anchor="middle" class="rotulo">{{ mesCurto(m.chave) }}</text>
        </g>
        <polyline :points="linhaDe((m) => m.resultadoProj)" class="linha resultado" fill="none" />
        <polyline :points="linhaDe((m) => m.reserva)" class="linha reserva" fill="none" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.legenda { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--cor-texto-suave); }
.legenda span { display: inline-flex; align-items: center; gap: 6px; }
.q { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.q.entrada { background: var(--cor-entrada); }
.q.saida { background: var(--cor-saida); }
.l { width: 14px; height: 3px; border-radius: 3px; display: inline-block; }
.l.resultado { background: var(--cor-investimento); }
.l.reserva { background: var(--cor-meta); }
.detalhe { margin: 10px 0 0; font-size: 13px; display: flex; gap: 12px; flex-wrap: wrap; align-items: baseline; }
.detalhe span { font-weight: 600; font-variant-numeric: tabular-nums; }
.c-entrada { color: var(--cor-entrada); }
.c-saida { color: var(--cor-saida); }
.c-resultado { color: var(--cor-investimento); }
.rolagem { overflow-x: auto; margin-top: 6px; cursor: grab; user-select: none; -webkit-overflow-scrolling: touch; max-width: 100%; }
.rolagem svg { display: block; }
.eixo { stroke: var(--cor-borda); }
.faixa { fill: transparent; transition: fill var(--anim-rapida) ease; }
.mes:hover .faixa { fill: var(--cor-realce); }
.mes.escolhido .faixa { fill: var(--cor-entrada-fundo); }
.b-entrada { fill: var(--cor-entrada); opacity: 0.9; }
.b-saida { fill: var(--cor-saida); opacity: 0.9; }
.mes.futuro .b-entrada, .mes.futuro .b-saida { opacity: 0.4; }
.mes { cursor: pointer; }
.linha { stroke-width: 2; pointer-events: none; stroke-linejoin: round; stroke-linecap: round; }
.linha.resultado { stroke: var(--cor-investimento); }
.linha.reserva { stroke: var(--cor-meta); }
.rotulo { font-size: 10px; fill: var(--cor-texto-suave); pointer-events: none; }
.mes.escolhido .rotulo { fill: var(--cor-texto); font-weight: 700; }
</style>
