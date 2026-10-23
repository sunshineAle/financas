<script setup>
import { Check } from 'lucide-vue-next';
// Escolha de cor da categoria: bolinhas de uma paleta fixa (frias para entrada, quentes para saída).
// Alvos de toque de 44px (a bolinha visual é menor), seleção com anel + check, foco visível, claro/escuro.
// "padrao" é a cor usada quando nada foi escolhido; escolher a mesma de novo volta ao padrão.
defineProps({ modelValue: { type: String, default: '' }, paleta: { type: Array, required: true }, padrao: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <div class="seletor-cor" role="radiogroup" aria-label="Cor da categoria">
    <button
      v-for="c in paleta"
      :key="c"
      type="button"
      role="radio"
      class="bolinha"
      :class="{ ativa: (modelValue || padrao) === c }"
      :style="{ '--c': c }"
      :aria-checked="(modelValue || padrao) === c"
      :aria-label="`Cor ${c}`"
      @click="emit('update:modelValue', c)"
    ><Check v-if="(modelValue || padrao) === c" :size="14" :stroke-width="3" /></button>
  </div>
</template>

<style scoped>
.seletor-cor { display: flex; flex-wrap: wrap; gap: 2px; margin: -6px; }
.bolinha { width: 44px; height: 44px; padding: 0; border: none; background: transparent; cursor: pointer; display: grid; place-items: center; border-radius: 50%; position: relative; color: var(--cor-sobre-cor); }
.bolinha::before { content: ''; position: absolute; width: 28px; height: 28px; border-radius: 50%; background: var(--c); box-shadow: inset 0 0 0 1px color-mix(in srgb, black 12%, transparent); transition: transform var(--anim-rapida) ease, box-shadow var(--anim-rapida) ease; }
.bolinha:hover::before { transform: scale(1.1); }
.bolinha.ativa::before { box-shadow: 0 0 0 2px var(--cor-fundo-elevado), 0 0 0 4px var(--c); }
.bolinha > * { position: relative; }
.bolinha:focus-visible { outline: 2px solid var(--cor-texto); outline-offset: -4px; }
</style>
