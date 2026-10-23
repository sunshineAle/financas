<script setup>
// <CampoBase> — casca comum dos campos: rótulo, dica e erro inline. Os Campo* usam este componente;
// use direto para embrulhar um controle próprio (slot padrão recebe o controle).
// Props: rotulo, erro (string; mostra inline em vermelho), dica, obrigatorio, tema, para (id do controle), tag ('div'|'fieldset').
import '../styles/formularios.css';
import { AlertCircle } from 'lucide-vue-next';
defineProps({
  rotulo: { type: String, default: '' },
  erro: { type: String, default: '' },
  dica: { type: String, default: '' },
  obrigatorio: { type: Boolean, default: false },
  tema: { type: String, default: '' },
  para: { type: String, default: '' },
});
</script>

<template>
  <div :class="['sf-campo', tema && 'tema-' + tema, { 'tem-erro': erro }]">
    <label v-if="rotulo" class="sf-rotulo" :for="para || undefined">{{ rotulo }}<span v-if="obrigatorio" class="sf-obrig" aria-hidden="true">*</span></label>
    <slot />
    <p v-if="erro" class="sf-erro" role="alert"><AlertCircle :size="14" />{{ erro }}</p>
    <p v-else-if="dica" class="sf-dica">{{ dica }}</p>
  </div>
</template>
