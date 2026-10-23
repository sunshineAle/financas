<script setup>
// Gráficos do cartão (REF-04) em degradê quente: anel de limite usado, barras à vista × parcelado
// (abas 3/6/12 meses) e evolução da fatura no mês (área com marcador no valor de hoje).
import { ref, computed, watch, onMounted } from 'vue';
import Anel from './Anel.vue';

const props = defineProps({
  cartao: { type: Object, required: true },
  faturas: { type: Array, default: () => [] },
  chave: { type: String, required: true }, // 'AAAA-MM' do mês mostrado
  buscar: { type: Function, required: true }, // (chave) => Promise<{ fatura, lancamentos }>
  versao: { type: Number, default: 0 },
  semLimite: { type: Boolean, default: false }, // o anel de limite agora fica no card próprio da tela
});

const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const curto = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')} mil` : String(Math.round(v)));
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const hojeISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

// ---------- 1. Anel de limite usado ----------
const pct = computed(() => (props.cartao.limite > 0 ? (props.cartao.limiteUsado / props.cartao.limite) * 100 : 0));

// ---------- 2. Barras à vista × parcelado ----------
const periodo = ref(6);
const barras = ref([]);
function chavesJanela(n) {
  const [a, m] = props.chave.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = a * 12 + (m - 1) - i;
    out.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}
let seq = 0;
async function montarBarras() {
  const meu = ++seq;
  const existentes = new Set(props.faturas.map((f) => f.chave));
  const res = await Promise.all(chavesJanela(periodo.value).map(async (k) => {
    let aVista = 0, parcelado = 0;
    if (existentes.has(k)) {
      const e = await props.buscar(k);
      (e?.lancamentos || []).forEach((l) => { if (l.totalParcelas > 1) parcelado += l.valor; else aVista += l.valor; });
    }
    return { chave: k, rotulo: MESES[Number(k.slice(5)) - 1], aVista, parcelado, total: aVista + parcelado };
  }));
  if (meu === seq) barras.value = res;
}
const maximo = computed(() => Math.max(1, ...barras.value.map((b) => b.total)));
const montou = ref(false);
onMounted(() => requestAnimationFrame(() => { montou.value = true; }));

// ---------- 3. Evolução da fatura no mês ----------
const evolucao = ref(null);
const iso = (d) => d.toLocaleDateString('sv-SE');
const parse = (s) => new Date(`${s}T12:00:00`);
async function montarEvolucao() {
  const e = await props.buscar(props.chave);
  if (!e || !e.fatura || !e.lancamentos.length) { evolucao.value = null; return; }
  const fecha = parse(e.fatura.fecha);
  const ini = new Date(fecha); ini.setMonth(ini.getMonth() - 1); ini.setDate(ini.getDate() + 1);
  const dias = Math.max(1, Math.round((fecha - ini) / 864e5));
  // parcelas de compras antigas entram no começo do ciclo
  const porDia = new Array(dias + 1).fill(0);
  e.lancamentos.forEach((l) => {
    let d = Math.round((parse(l.dataCompra) - ini) / 864e5);
    d = Math.min(dias, Math.max(0, d));
    porDia[d] += l.valor;
  });
  let acc = 0;
  const acum = porDia.map((v) => (acc += v));
  const hojeIdx = Math.min(dias, Math.max(0, Math.round((parse(hojeISO) - ini) / 864e5)));
  evolucao.value = { acum, dias, hojeIdx, total: acc, valorHoje: acum[hojeIdx], inicio: iso(ini), fim: e.fatura.fecha };
}
const W = 300, H = 110, PAD = 8;
const pts = computed(() => {
  const e = evolucao.value;
  if (!e) return [];
  const max = Math.max(1, e.total);
  return e.acum.map((v, i) => [PAD + (i / e.dias) * (W - 2 * PAD), H - 14 - (v / max) * (H - 36)]);
});
const caminho = computed(() => pts.value.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '));
const area = computed(() => (pts.value.length ? `${caminho.value} L${pts.value.at(-1)[0].toFixed(1)} ${H - 14} L${pts.value[0][0].toFixed(1)} ${H - 14} Z` : ''));
const marcador = computed(() => (evolucao.value ? pts.value[evolucao.value.hojeIdx] : null));
const dm = (s) => { const [, m, d] = s.split('-'); return `${d}/${m}`; };
const idG = 'g' + Math.random().toString(36).slice(2, 7);

watch(() => [props.cartao.id, props.chave, props.versao, props.faturas.length], () => { montarBarras(); montarEvolucao(); }, { immediate: true });
watch(periodo, montarBarras);
</script>

<template>
  <div class="graficos">
    <!-- Limite usado -->
    <section v-if="!semLimite" class="bloco">
      <h3>Limite usado</h3>
      <div v-if="cartao.limite" class="limite">
        <Anel :pct="pct" :tamanho="116" :espessura="11" de="var(--saida-ambar-medio)" ate="var(--saida-carmim-medio)">
          <strong class="pct">{{ Math.round(pct) }}%</strong><span class="peq">usado</span>
        </Anel>
        <dl class="legenda">
          <div><dt>Usado</dt><dd class="numero-tabular">{{ moeda(cartao.limiteUsado) }}</dd></div>
          <div><dt>Disponível</dt><dd class="numero-tabular">{{ moeda(cartao.limiteDisponivel) }}</dd></div>
          <div><dt>Limite total</dt><dd class="numero-tabular">{{ moeda(cartao.limite) }}</dd></div>
        </dl>
      </div>
      <p v-else class="vazio">Defina um limite para este cartão para ver o anel de limite usado.</p>
    </section>

    <!-- À vista x parcelado -->
    <section class="bloco">
      <div class="cab">
        <h3>Gastos por mês</h3>
        <div class="abas" role="tablist" aria-label="Período do gráfico">
          <button v-for="n in [3, 6, 12]" :key="n" type="button" role="tab" :aria-selected="periodo === n" :class="{ ativa: periodo === n }" @click="periodo = n">{{ n }}m</button>
        </div>
      </div>
      <div class="barras" :style="{ '--n': barras.length }">
        <div v-for="b in barras" :key="b.chave" class="col" :class="{ atual: b.chave === chave }" :title="`${b.rotulo}: à vista ${moeda(b.aVista)} · parcelado ${moeda(b.parcelado)}`">
          <span class="topo numero-tabular">{{ b.total > 0 && (barras.length <= 6 || b.chave === chave) ? curto(b.total) : '' }}</span>
          <div class="pilha">
            <i class="parc" :style="{ height: montou ? (b.parcelado / maximo) * 100 + '%' : '0%' }"></i>
            <i class="vista" :style="{ height: montou ? (b.aVista / maximo) * 100 + '%' : '0%' }"></i>
          </div>
          <span class="mes">{{ b.rotulo }}</span>
        </div>
      </div>
      <div class="leg"><span><i class="p vista"></i> À vista</span><span><i class="p parc"></i> Parcelado</span></div>
    </section>

    <!-- Evolução da fatura -->
    <section class="bloco">
      <h3>Evolução da fatura no mês</h3>
      <template v-if="evolucao">
        <svg :viewBox="`0 0 ${W} ${H}`" class="area" role="img" :aria-label="`Fatura acumulada até ${moeda(evolucao.valorHoje)}`">
          <defs>
            <linearGradient :id="idG + 'l'" x1="0" x2="1"><stop offset="0" stop-color="var(--saida-ambar-medio)" /><stop offset="1" stop-color="var(--saida-carmim-medio)" /></linearGradient>
            <linearGradient :id="idG + 'a'" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--saida-coral-medio)" stop-opacity="0.38" /><stop offset="1" stop-color="var(--saida-coral-medio)" stop-opacity="0" /></linearGradient>
          </defs>
          <path :d="area" :fill="`url(#${idG}a)`" class="preench" :class="{ on: montou }" />
          <path :d="caminho" fill="none" :stroke="`url(#${idG}l)`" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" pathLength="1" class="linha" :class="{ on: montou }" />
          <g v-if="marcador">
            <line :x1="marcador[0]" :x2="marcador[0]" :y1="marcador[1]" :y2="H - 14" class="guia" />
            <circle :cx="marcador[0]" :cy="marcador[1]" r="5" class="ponto" />
          </g>
        </svg>
        <div class="eixo"><span>{{ dm(evolucao.inicio) }}</span><strong class="numero-tabular">{{ moeda(evolucao.valorHoje) }} até hoje</strong><span>{{ dm(evolucao.fim) }}</span></div>
      </template>
      <p v-else class="vazio">Sem compras nesta fatura para desenhar a evolução.</p>
    </section>
  </div>
</template>

<style scoped>
.graficos { display: grid; gap: 14px; }
.bloco { background: var(--cor-card); border: 1px solid var(--cor-card-borda); border-radius: var(--raio-card); padding: var(--espaco-card); min-width: 0; }
h3 { margin: 0 0 12px; font-family: var(--fonte-display); font-size: 14px; font-weight: 600; }
.cab { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.cab h3 { margin: 0; }
.vazio { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.limite { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.pct { font-family: var(--fonte-display); font-size: 24px; }
.peq { font-size: 11px; color: var(--cor-texto-suave); }
.legenda { margin: 0; display: grid; gap: 8px; flex: 1; min-width: 140px; }
.legenda div { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
.legenda dt { color: var(--cor-texto-suave); }
.legenda dd { margin: 0; font-weight: 600; }
.abas { display: inline-flex; padding: 3px; gap: 2px; border-radius: 999px; background: var(--cor-fundo); border: 1px solid var(--cor-borda); }
.abas button { min-width: 44px; min-height: 32px; border: none; border-radius: 999px; background: none; color: var(--cor-texto-suave); font: 600 12px var(--fonte-texto); cursor: pointer; transition: background var(--anim-padrao) ease, color var(--anim-padrao) ease; }
.abas button.ativa { background: var(--degrade-saida); color: var(--cor-sobre-cor); }
.barras { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 6px; align-items: end; height: 170px; margin-top: 6px; }
.col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 3px; min-width: 0; }
.topo { font-size: 10px; color: var(--cor-texto-suave); height: 14px; white-space: nowrap; }
.pilha { width: 100%; max-width: 34px; flex: 1; display: flex; flex-direction: column; justify-content: flex-end; border-radius: 8px 8px 4px 4px; overflow: hidden; background: var(--cor-realce); }
.pilha i { display: block; width: 100%; transition: height var(--anim-lenta) var(--anim-curva-suave); }
.vista { background: linear-gradient(180deg, var(--saida-ambar-medio), var(--saida-laranja-medio)); }
.parc { background: linear-gradient(180deg, var(--saida-coral-medio), var(--saida-carmim-medio)); }
.mes { font-size: 11px; color: var(--cor-texto-suave); text-transform: capitalize; }
.col.atual .mes { color: var(--cor-texto); font-weight: 700; }
.col:not(.atual) .pilha { opacity: 0.62; }
.leg { display: flex; gap: 14px; margin-top: 10px; font-size: 12px; color: var(--cor-texto-suave); }
.leg span { display: inline-flex; align-items: center; gap: 6px; }
.leg .p { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.area { width: 100%; height: auto; display: block; }
.linha { stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset var(--anim-lenta) var(--anim-curva-suave); }
.linha.on { stroke-dashoffset: 0; }
.preench { opacity: 0; transition: opacity var(--anim-lenta) ease var(--anim-padrao); }
.preench.on { opacity: 1; }
.guia { stroke: var(--cor-texto-suave); stroke-width: 1; stroke-dasharray: 3 3; opacity: 0.6; }
.ponto { fill: var(--cor-card); stroke: var(--saida-carmim-medio); stroke-width: 3; }
.eixo { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 11px; color: var(--cor-texto-suave); margin-top: 4px; }
.eixo strong { color: var(--cor-texto); font-size: 12px; }
</style>
