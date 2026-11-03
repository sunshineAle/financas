<script setup>
// "Seus saldos" (homologação 1.0, seção 1 — decisão final do usuário, 29/10 21h59). Fica no Início, logo abaixo do
// filtro de meses. Arcos finos em MEIA-LUA, um por número (Contas, Guardado, Faturas, Dívidas), concêntricos e com o
// final sumindo (regra do degradê); o Patrimônio líquido fica no centro e a legenda ao lado, sem quebrar linha.
// É uma POSIÇÃO de hoje (não muda com o mês). O detalhe de cada número fica em Relatórios › Resumo financeiro.
//   <SeusSaldos :saldos="{ contas, guardado, faturas, dividas, patrimonio }" @patrimonio="abrir detalhe" />
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronRight } from 'lucide-vue-next';
import Valor from './Valor.vue';
import AjudaSecao from './AjudaSecao.vue';

const props = defineProps({ saldos: { type: Object, default: null } });
const emit = defineEmits(['patrimonio']);
const router = useRouter();
const pronto = ref(false);
onMounted(() => requestAnimationFrame(() => { pronto.value = true; }));

const ITENS = [
  { chave: 'contas', nome: 'Contas', sinal: '+', de: 'var(--entrada-verde-claro, #4CC27A)', cor: 'var(--cor-entrada)' },
  { chave: 'guardado', nome: 'Guardado', sinal: '+', de: 'var(--meta-violeta-claro, #A87EF1)', cor: 'var(--meta-violeta-medio, #5E18D8)' },
  { chave: 'faturas', nome: 'Faturas', sinal: '−', de: 'var(--saida-ambar-medio, #DFA511)', cor: 'var(--saida-tangerina-medio, #E15F0E)' },
  { chave: 'dividas', nome: 'Dívidas', sinal: '−', de: 'var(--saida-tangerina-medio, #E15F0E)', cor: 'var(--saida-carmim-medio, #CE2239)' },
];
// Pedido de 02/11 (23h06): volta ao padrão dos cards de topo atuais (TopoValor discreto), e o CONTORNO do card vira o
// gráfico — cada cor da legenda ocupa no contorno a fração do seu valor (|contas| + |guardado| + |faturas| + |dívidas| = 100%),
// começando no canto de cima à esquerda e andando no sentido horário. Desenhado num <rect> SVG com pathLength=100.
const caixa = ref(null);
const tam = ref({ w: 0, h: 0 });
let obs = null;
onMounted(() => {
  if (!caixa.value || typeof ResizeObserver === 'undefined') return;
  obs = new ResizeObserver(([e]) => { const r = e.target.getBoundingClientRect(); tam.value = { w: Math.round(r.width), h: Math.round(r.height) }; });
  obs.observe(caixa.value);
});
onBeforeUnmount(() => obs?.disconnect());
const VAO = 0.8; // vão entre as cores, em % do contorno
const arcos = computed(() => {
  const s = props.saldos || {};
  const total = ITENS.reduce((t, i) => t + Math.abs(s[i.chave] || 0), 0) || 1;
  let ini = 0;
  return ITENS.map((i) => {
    const v = s[i.chave] || 0;
    const frac = (Math.abs(v) / total) * 100;
    const len = frac > VAO * 2 ? frac - VAO : frac > 0 ? Math.max(0.6, frac * 0.6) : 0;
    const seg = { ...i, v, pct: Math.round(frac), ini, len };
    ini += frac;
    return seg;
  });
});
const patrimonio = computed(() => props.saldos?.patrimonio || 0);
</script>

<template>
  <section v-if="saldos" ref="caixa" class="seus-saldos" aria-labelledby="t-seus-saldos" data-seus-saldos>
    <svg v-if="tam.w" class="contorno" :viewBox="`0 0 ${tam.w} ${tam.h}`" :width="tam.w" :height="tam.h" aria-hidden="true">
      <rect class="trilho" x="1" y="1" :width="tam.w - 2" :height="tam.h - 2" rx="15" pathLength="100" />
      <rect v-for="a in arcos" v-show="a.len > 0" :key="a.chave" class="seg" x="1" y="1" :width="tam.w - 2" :height="tam.h - 2" rx="15" pathLength="100"
        :stroke="a.cor" :stroke-dasharray="`${pronto ? a.len : 0} ${100 - (pronto ? a.len : 0)}`" :stroke-dashoffset="-a.ini" />
    </svg>
    <div class="rotulo">
      <h2 id="t-seus-saldos">Seus saldos <small>· hoje</small></h2><AjudaSecao secao="inicio.saldos" />
    </div>
    <button type="button" class="valor numero-tabular" :class="{ neg: patrimonio < 0 }" :aria-label="`Patrimônio líquido: ver Ativos e Passivos`" @click="emit('patrimonio')">
      <Valor :valor="patrimonio" /><small>Patrimônio</small>
    </button>
    <dl class="linhas">
      <div v-for="a in arcos" :key="a.chave">
        <dt><i class="ponto" :style="{ background: a.cor }" aria-hidden="true"></i>{{ a.nome }} <small>{{ a.pct }}%</small></dt>
        <dd class="numero-tabular"><span class="sinal" aria-hidden="true">{{ a.sinal }}</span><Valor :valor="Math.abs(a.v)" /></dd>
      </div>
    </dl>
    <button type="button" class="link" data-detalhes-relatorios @click="router.push('/relatorios')">Detalhes em Relatórios<ChevronRight :size="15" :stroke-width="2" /></button>
  </section>
</template>

<style scoped>
/* Mesmo padrão do TopoValor (card discreto: fundo de card, valor de 26 px, linhas embaixo); o contorno é o gráfico. */
.seus-saldos { position: relative; overflow: hidden; background: var(--cor-card); border: 1px solid var(--cor-card-borda, var(--cor-borda)); border-radius: var(--raio-card, 16px); padding: 16px 16px 8px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.seus-saldos::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(120% 70% at 0% 0%, color-mix(in srgb, var(--cor-entrada) 10%, transparent), transparent 60%); }
.seus-saldos > :not(.contorno) { position: relative; z-index: 1; }
.contorno { position: absolute; inset: -1px; z-index: 2; pointer-events: none; overflow: visible; }
.contorno rect { fill: none; stroke-width: 2.5; }
.contorno .trilho { stroke: var(--cor-borda); stroke-width: 1; }
.contorno .seg { stroke-linecap: butt; transition: stroke-dasharray var(--anim-lenta, .6s) var(--anim-curva-suave, ease); }
.rotulo { display: flex; align-items: center; gap: 6px; }
.rotulo h2 { margin: 0; font: 600 13px var(--fonte-texto); color: var(--cor-texto-suave); }
.rotulo small { font-weight: 400; font-size: 13px; }
.valor { align-self: flex-start; display: inline-flex; align-items: baseline; gap: 8px; padding: 0; border: 0; background: none; cursor: pointer; font-family: var(--fonte-display); font-size: 26px; line-height: 1.15; color: var(--cor-texto); border-radius: 8px; }
.valor small { font: 500 12px var(--fonte-texto); color: var(--cor-texto-suave); }
.valor.neg { color: var(--cor-saida-texto, var(--cor-saida)); }
.valor:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
.linhas { margin: 6px 0 0; padding-top: 8px; border-top: 1px solid var(--cor-borda); display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
.linhas > div { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.linhas dt { display: inline-flex; align-items: center; gap: 7px; color: var(--cor-texto-suave); white-space: nowrap; }
.linhas dt small { font-size: 11.5px; opacity: .8; }
.linhas dd { margin: 0; font-weight: 600; white-space: nowrap; }
.ponto { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.sinal { color: var(--cor-texto-suave); font-weight: 500; margin-right: 2px; }
.link { align-self: flex-end; display: inline-flex; align-items: center; gap: 2px; min-height: 36px; padding: 0; border: 0; background: none; color: var(--cor-primaria); font: 600 13px var(--fonte-texto); cursor: pointer; }
.link:hover { text-decoration: underline; }
</style>
