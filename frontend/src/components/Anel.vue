<script setup>
// Anel de progresso em degradê CÔNICO com conteúdo no centro (slot). Ex.: meta atingida, limite usado.
// v2: anel de meta = cônico Violeta -> Púrpura -> Orquídea (padrões abaixo). Para outros temas passe de/meio/ate.
// Pontas arredondadas por duas "tampas" nas cores inicial e final; nenhuma cor termina seca.
import { ref, computed, onMounted } from 'vue';

const props = defineProps({
  pct: { type: Number, default: 0 },
  tamanho: { type: Number, default: 110 },
  espessura: { type: Number, default: 10 },
  de: { type: String, default: 'var(--meta-violeta-medio)' },
  meio: { type: String, default: '' }, // vazio = mistura de/ate; no anel de meta use o Púrpura
  ate: { type: String, default: 'var(--meta-orquidea-medio)' },
});
const pronto = ref(false);
onMounted(() => requestAnimationFrame(() => { pronto.value = true; }));
const p = computed(() => Math.min(100, Math.max(0, props.pct || 0)));
const pv = computed(() => (pronto.value ? p.value : 0));
// espessura em % do diâmetro; tampas no meio da faixa do anel
const esp = computed(() => (props.espessura / 100) * 100);
const raio = computed(() => 50 - props.espessura / 2); // em % do lado
function ponto(grau) {
  const a = (grau * Math.PI) / 180;
  return { left: 50 + Math.sin(a) * raio.value + '%', top: 50 - Math.cos(a) * raio.value + '%' };
}
const capIni = computed(() => ponto(0));
const corAte = computed(() => props.ate);
const PADRAO_META = 'var(--meta-violeta-medio)|var(--meta-orquidea-medio)';
const corMeio = computed(() => props.meio || (`${props.de}|${props.ate}` === PADRAO_META ? 'var(--meta-purpura-medio)' : null) || `color-mix(in oklab, ${props.de}, ${props.ate})`);
</script>

<template>
  <div class="anel" :style="{ width: tamanho + 'px', height: tamanho + 'px', '--esp': esp + '%', '--anel-p': pv, '--de': de, '--meio': corMeio, '--ate': corAte }" role="img" :aria-label="`${Math.round(p)}%`">
    <div class="trilho" aria-hidden="true"></div>
    <div v-if="p > 0" class="arco" aria-hidden="true"></div>
    <i v-if="p > 0" class="cap" :style="{ ...capIni, background: de }" aria-hidden="true"></i>
    <i v-if="p > 0" class="cap fim" :style="{ background: ate, '--raio': raio + '%' }" aria-hidden="true"></i>
    <div class="centro"><slot /></div>
  </div>
</template>

<style scoped>
@property --anel-p { syntax: '<number>'; inherits: true; initial-value: 0; }
.anel { position: relative; flex-shrink: 0; transition: --anel-p var(--anim-lenta) var(--anim-curva-suave); }
.trilho, .arco { position: absolute; inset: 0; border-radius: 50%; }
.trilho {
  background: var(--cor-trilho);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - var(--esp)), #000 calc(100% - var(--esp) + 0.5px));
  mask: radial-gradient(farthest-side, transparent calc(100% - var(--esp)), #000 calc(100% - var(--esp) + 0.5px));
}
.arco {
  /* cônico: as três cores se distribuem pelo trecho preenchido, que termina em degradê (sem corte seco) */
  background: conic-gradient(from 0deg, var(--de) 0deg, var(--meio) calc(var(--anel-p) * 1.8deg), var(--ate) calc(var(--anel-p) * 3.6deg), transparent calc(var(--anel-p) * 3.6deg));
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - var(--esp)), #000 calc(100% - var(--esp) + 0.5px));
  mask: radial-gradient(farthest-side, transparent calc(100% - var(--esp)), #000 calc(100% - var(--esp) + 0.5px));
}
.cap { position: absolute; width: var(--esp); height: var(--esp); transform: translate(-50%, -50%); border-radius: 50%; }
.cap.fim { left: calc(50% + sin(var(--anel-p) * 3.6deg) * var(--raio)); top: calc(50% - cos(var(--anel-p) * 3.6deg) * var(--raio)); }
.centro { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; line-height: 1.15; }
</style>
