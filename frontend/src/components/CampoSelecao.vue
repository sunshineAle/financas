<script setup>
// <CampoSelecao v-model="tipo" rotulo="Tipo" :opcoes="[{valor:'corrente', rotulo:'Conta corrente'}]" placeholder="Escolha..." />
// Seleção simples (select nativo estilizado: no celular abre o seletor do sistema, ótimo para toque).
// Props: modelValue, opcoes [{valor, rotulo, desabilitado?}] (ou array de strings), rotulo, placeholder, erro, dica, tema, obrigatorio, disabled.
import { computed, useId } from 'vue';
import CampoBase from './CampoBase.vue';
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  opcoes: { type: Array, default: () => [] },
  rotulo: String, placeholder: String, erro: String, dica: String, tema: String, obrigatorio: Boolean, disabled: Boolean, dicaAoFocar: Boolean,
});
const emit = defineEmits(['update:modelValue']);
const id = 'cs-' + useId();
const lista = computed(() => props.opcoes.map((o) => (typeof o === 'object' ? o : { valor: o, rotulo: String(o) })));
function mudou(e) {
  const o = lista.value.find((x) => String(x.valor) === e.target.value);
  emit('update:modelValue', o ? o.valor : e.target.value);
}
</script>

<template>
  <CampoBase :rotulo="rotulo" :erro="erro" :dica="dica" :dica-ao-focar="dicaAoFocar" :tema="tema" :obrigatorio="obrigatorio" :para="id">
    <select :id="id" class="sf-entrada" :value="modelValue" :disabled="disabled" :required="obrigatorio" :aria-invalid="!!erro" @change="mudou">
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option v-for="o in lista" :key="o.valor" :value="o.valor" :disabled="o.desabilitado">{{ o.rotulo }}</option>
    </select>
  </CampoBase>
</template>
