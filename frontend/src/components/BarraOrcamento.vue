<script setup>
// Barra do orçamento (v2, onda 5). Preenchimento = quanto já foi gasto, SEMPRE em degradê:
//   < 95%      degradê de saída (carmim -> tangerina -> âmbar), rótulo "NN% do orçamento"
//   95–100%    MENTA (nunca cinza), rótulo "No limite · NN%"
//   > 100%     degradê de alerta (#D5211A -> #9E1610), rótulo "Estourado · NN%"
// O ponto marca a posição atual. Pensada para ficar sobre um card (TopoValor): trilho translúcido na cor do texto do card.
// `pct` = % consumido do orçamento (pode passar de 100). `semRotulo` esconde a linha de texto.
import { computed } from 'vue';
const props = defineProps({ pct: { type: Number, default: 0 }, altura: { type: Number, default: 10 }, semRotulo: { type: Boolean, default: false } });
const real = computed(() => Math.max(0, props.pct || 0));
const p = computed(() => Math.min(100, real.value));
const estado = computed(() => (real.value > 100 ? 'estourou' : real.value >= 95 ? 'limite' : 'dentro'));
const pctTxt = computed(() => Math.round(real.value) + '%');
const rotulo = computed(() => ({ dentro: `${pctTxt.value} do orçamento`, limite: `No limite · ${pctTxt.value}`, estourou: `Estourado · ${pctTxt.value}` }[estado.value]));
</script>

<template>
  <div :class="['barra-orc', estado]" role="img" :aria-label="rotulo">
    <div class="trilho" :style="{ '--p': p + '%', height: altura + 'px' }">
      <span class="preenchimento"></span>
      <span class="ponto"></span>
    </div>
    <span v-if="!semRotulo" class="rotulo numero-tabular">{{ rotulo }}</span>
  </div>
</template>

<style scoped>
.barra-orc { margin: 6px 0; }
.trilho { position: relative; border-radius: 999px; background: color-mix(in srgb, var(--cor-sobre-cor) 20%, transparent); }
.preenchimento { position: absolute; left: 0; top: 0; bottom: 0; width: var(--p); border-radius: inherit; transition: width var(--anim-lenta) var(--anim-curva-suave); }
.dentro .preenchimento { background: linear-gradient(90deg, #CE2239, #E15F0E, #DFA511); }
.limite .preenchimento { background: linear-gradient(90deg, #E6F9F1, #B9EBD6, #9FE3C8); box-shadow: inset 0 0 0 1px color-mix(in srgb, #1E5E47 38%, transparent); }
.estourou .preenchimento { background: linear-gradient(90deg, #D5211A, #9E1610); }
.ponto { position: absolute; top: 50%; left: var(--p); width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; background: #fff;
  box-shadow: 0 0 0 3px color-mix(in srgb, black 22%, transparent), 0 2px 6px color-mix(in srgb, black 30%, transparent); transition: left var(--anim-lenta) var(--anim-curva-suave); }
.estourou .ponto { left: calc(100% - 8px); }
.rotulo { display: block; margin-top: 6px; font-size: 12px; font-weight: 600; color: var(--cor-sobre-cor); }
@media (prefers-reduced-motion: reduce) { .ponto, .preenchimento { transition: none; } }
</style>
