<script setup>
// <CampoTipo v-model="tipo" /> — alternador Entrada | Saída em abas; a aba ativa ganha o DEGRADÊ do próprio tipo
// (entrada = azuis, saída = quentes). Também serve para outros pares: passe `opcoes`.
// v-model: 'entrada' | 'saida' (ou o id da opção). Props:
//   opcoes  [{ id, rotulo, tema, icone? }]  padrão: Entrada (tema entrada, seta p/ baixo) e Saída (tema saida, seta p/ cima)
//   rotulo  texto acima (opcional)   erro, dica   desabilitado (boolean)
// Dica: ao mudar o tipo, a página pode trocar o `tema` dos demais campos (ex.: <CampoValor :tipo="tipo">).
import { computed } from 'vue';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-vue-next';
import CampoBase from './CampoBase.vue';
const props = defineProps({
  modelValue: { type: String, default: 'saida' },
  opcoes: { type: Array, default: () => [{ id: 'entrada', rotulo: 'Entrada', tema: 'entrada', icone: ArrowDownLeft }, { id: 'saida', rotulo: 'Saída', tema: 'saida', icone: ArrowUpRight }] },
  rotulo: String, erro: String, dica: String, desabilitado: Boolean,
});
const emit = defineEmits(['update:modelValue']);
const indice = computed(() => Math.max(0, props.opcoes.findIndex((o) => o.id === props.modelValue)));
const atual = computed(() => props.opcoes[indice.value]);
</script>

<template>
  <CampoBase :rotulo="rotulo" :erro="erro" :dica="dica">
    <div :class="['alt', 'tema-' + (atual?.tema || 'neutro')]" role="tablist" :style="{ '--n': opcoes.length, '--i': indice }">
      <span class="ind" aria-hidden="true"></span>
      <button v-for="o in opcoes" :key="o.id" type="button" role="tab" :aria-selected="modelValue === o.id" :disabled="desabilitado" :class="{ ativa: modelValue === o.id }" @click="emit('update:modelValue', o.id)">
        <component :is="o.icone" v-if="o.icone" :size="17" :stroke-width="2.2" />{{ o.rotulo }}
      </button>
    </div>
  </CampoBase>
</template>

<style scoped>
.alt { position: relative; display: grid; grid-template-columns: repeat(var(--n), 1fr); padding: 4px; border-radius: 16px; background: var(--cor-fundo); border: 1.5px solid var(--cor-borda); }
.alt button { position: relative; z-index: 1; min-height: 46px; border: none; background: none; border-radius: 12px; color: var(--cor-texto-suave); font: 700 15px var(--fonte-texto); display: inline-flex; align-items: center; justify-content: center; gap: 7px; cursor: pointer; transition: color var(--anim-padrao) ease; }
.alt button:hover:not(.ativa):not(:disabled) { color: var(--cor-texto); }
.alt button.ativa { color: var(--cor-sobre-cor); }
.alt button:disabled { cursor: not-allowed; opacity: 0.6; }
.alt button:focus-visible { outline: 2px solid var(--tema-cor); outline-offset: 1px; }
.ind { position: absolute; z-index: 0; top: 4px; bottom: 4px; left: 4px; width: calc((100% - 8px) / var(--n)); border-radius: 12px; background: var(--tema-degrade); transform: translateX(calc(var(--i) * 100%)); transition: transform var(--anim-padrao) var(--anim-curva), background var(--anim-padrao) ease; }
</style>
