<script setup>
// Rosca (5+ partes): pontas retas, trilho apagado e degradê com transparência por parte (início sólido, final sumindo);
// total no centro e respiro entre as partes.
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
// Homologação 1.0, seção 3: pontas RETAS e degradê com transparência em cada parte (início sólido, final sumindo).
// Desenho em conic-gradient recortado em anel (o degradê acompanha o arco, o que um traço SVG não faz).
// Respiro de RESPIRO graus entre as partes; a parte em foco fica inteira e as outras esmaecem um pouco.
const RESPIRO = 2.4; // graus
const fatias = computed(() => {
  let acc = 0;
  const unico = partes.value.length === 1;
  return partes.value.map((p, i) => {
    const frac = total.value ? p.valor / total.value : 0;
    const ini = acc * 360 + (unico ? 0 : RESPIRO / 2);
    const fim = (acc + frac) * 360 - (unico ? 0 : RESPIRO / 2);
    acc += frac;
    return { ...p, i, frac, pct: Math.round(frac * 100), ini, fim: Math.max(ini + 0.5, fim) };
  });
});
const fundoRosca = computed(() => {
  if (!fatias.value.length) return 'none';
  const pv = pronto.value ? 1 : 0;
  const partesCss = [];
  fatias.value.forEach((f) => {
    const ini = f.ini * pv, fim = f.fim * pv, comp = fim - ini;
    const apaga = ativo.value !== null && ativo.value !== f.i ? 45 : 100;
    const c = (alfa) => `color-mix(in srgb, ${f.cor} ${Math.round(alfa * apaga / 100)}%, transparent)`;
    partesCss.push(`transparent ${ini.toFixed(2)}deg`, `${c(100)} ${ini.toFixed(2)}deg`, `${c(92)} ${(ini + comp * 0.45).toFixed(2)}deg`, `${c(f.frac >= 0.999 ? 80 : 22)} ${fim.toFixed(2)}deg`, `transparent ${fim.toFixed(2)}deg`);
  });
  return `conic-gradient(from 0deg, ${partesCss.join(', ')}, transparent 360deg)`;
});
// toque/ponteiro: descobre a parte pelo ângulo em relação ao centro
const elRosca = ref(null);
function parteNoPonto(e) {
  const r = elRosca.value?.getBoundingClientRect();
  if (!r) return null;
  const pt = e.touches ? e.touches[0] : e;
  const dx = pt.clientX - (r.left + r.width / 2), dy = pt.clientY - (r.top + r.height / 2);
  const dist = Math.hypot(dx, dy) / (r.width / 2);
  if (dist < 0.62 || dist > 1.05) return null;
  const ang = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  const f = fatias.value.find((x) => ang >= x.ini - RESPIRO / 2 && ang <= x.fim + RESPIRO / 2);
  return f ? f.i : null;
}
function aoMover(e) { ativo.value = parteNoPonto(e); }
function aoClicar(e) { const i = parteNoPonto(e); if (i !== null) emit('clicar', fatias.value[i]); }
const foco = computed(() => (ativo.value !== null ? fatias.value[ativo.value] : null));
</script>

<template>
  <div class="rosca-bloco">
    <div class="rosca" role="img" :aria-label="`Total ${moeda(total)}`">
      <div ref="elRosca" class="anel-rosca" :style="{ background: fundoRosca }" aria-hidden="true"
        @pointermove="aoMover" @pointerleave="ativo = null" @touchstart.passive="aoMover" @click="aoClicar"></div>
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
.rosca::before, .anel-rosca { content: ''; position: absolute; inset: 0; border-radius: 50%;
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 13px), #000 calc(100% - 12.5px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 13px), #000 calc(100% - 12.5px)); }
.rosca::before { background: var(--cor-trilho); opacity: 0.7; } /* trilho apagado */
.anel-rosca { cursor: pointer; }
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
