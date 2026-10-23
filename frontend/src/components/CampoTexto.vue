<script setup>
// <CampoTexto v-model="nome" rotulo="Nome" placeholder="Ex.: Nubank" :erro="erros.nome" obrigatorio />
// Props: modelValue, rotulo, placeholder, erro, dica, obrigatorio, tema, type ('text'|'email'|'number'...), maxlength,
// multilinha (boolean -> textarea), autofocus, disabled, inputmode. Emite update:modelValue. Atributos extras vão ao <input>.
import { useId } from 'vue';
import CampoBase from './CampoBase.vue';
defineOptions({ inheritAttrs: false });
defineProps({
  modelValue: { type: [String, Number], default: '' },
  rotulo: String, placeholder: String, erro: String, dica: String, tema: String,
  obrigatorio: Boolean, multilinha: Boolean, disabled: Boolean,
  type: { type: String, default: 'text' },
});
defineEmits(['update:modelValue']);
const id = 'ct-' + useId();
</script>

<template>
  <CampoBase :rotulo="rotulo" :erro="erro" :dica="dica" :obrigatorio="obrigatorio" :tema="tema" :para="id">
    <textarea v-if="multilinha" :id="id" class="sf-entrada" rows="3" :value="modelValue" :placeholder="placeholder" :disabled="disabled" :aria-invalid="!!erro" v-bind="$attrs" @input="$emit('update:modelValue', $event.target.value)"></textarea>
    <input v-else :id="id" class="sf-entrada" :type="type" :value="modelValue" :placeholder="placeholder" :disabled="disabled" :required="obrigatorio" :aria-invalid="!!erro" v-bind="$attrs" @input="$emit('update:modelValue', $event.target.value)" />
  </CampoBase>
</template>
