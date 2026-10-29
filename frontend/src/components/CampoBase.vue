<script setup>
// <CampoBase> — casca comum dos campos: rótulo, dica e erro inline. Os Campo* usam este componente;
// use direto para embrulhar um controle próprio (slot padrão recebe o controle).
// Props: rotulo, erro (string; mostra inline em vermelho), dica, obrigatorio, tema, para (id do controle), tag ('div'|'fieldset'),
// dicaAoFocar (boolean, opt-in): a dica só aparece enquanto o campo (ou algo dentro dele) está com o foco — formulário limpo,
// dica na hora certa. Sem ela a dica fica sempre visível (padrão, para não esconder dicas importantes).
import '../styles/formularios.css';
import { ref } from 'vue';
import { AlertCircle } from 'lucide-vue-next';
const focado = ref(false);
function aoSair(e) { if (!e.currentTarget.contains(e.relatedTarget)) focado.value = false; }
defineProps({
  rotulo: { type: String, default: '' },
  erro: { type: String, default: '' },
  dica: { type: String, default: '' },
  obrigatorio: { type: Boolean, default: false },
  tema: { type: String, default: '' },
  para: { type: String, default: '' },
  dicaAoFocar: { type: Boolean, default: false },
});
</script>

<template>
  <div :class="['sf-campo', tema && 'tema-' + tema, { 'tem-erro': erro }]" @focusin="focado = true" @focusout="aoSair">
    <label v-if="rotulo" class="sf-rotulo" :for="para || undefined">{{ rotulo }}<span v-if="obrigatorio" class="sf-obrig" aria-hidden="true">*</span></label>
    <slot />
    <p v-if="erro" class="sf-erro" role="alert"><AlertCircle :size="14" />{{ erro }}</p>
    <p v-else-if="dica && (!dicaAoFocar || focado)" class="sf-dica" :class="{ 'ao-focar': dicaAoFocar }">{{ dica }}</p>
  </div>
</template>
