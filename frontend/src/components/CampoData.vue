<script setup>
// <CampoData v-model="data" rotulo="Data" :atalhos="true" /> — data no formato 'AAAA-MM-DD' (o mesmo do <input type=date>).
// Props: modelValue, rotulo, erro, dica, tema, obrigatorio, min, max, atalhos (boolean: botões "Hoje" e "Ontem"), disabled.
import { useId } from 'vue';
import CampoBase from './CampoBase.vue';
const props = defineProps({
  modelValue: { type: String, default: '' },
  rotulo: { type: String, default: 'Data' },
  erro: String, dica: String, tema: String, obrigatorio: Boolean, disabled: Boolean,
  min: String, max: String, atalhos: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
const id = 'cd-' + useId();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoje = () => iso(new Date());
const ontem = () => { const d = new Date(); d.setDate(d.getDate() - 1); return iso(d); };
</script>

<template>
  <CampoBase :rotulo="rotulo" :erro="erro" :dica="dica" :tema="tema" :obrigatorio="obrigatorio" :para="id">
    <input :id="id" class="sf-entrada" type="date" :value="modelValue" :min="min" :max="max" :disabled="disabled" :required="obrigatorio" :aria-invalid="!!erro" @input="emit('update:modelValue', $event.target.value)" />
    <div v-if="atalhos" class="atalhos">
      <button type="button" :class="{ on: modelValue === hoje() }" @click="emit('update:modelValue', hoje())">Hoje</button>
      <button type="button" :class="{ on: modelValue === ontem() }" @click="emit('update:modelValue', ontem())">Ontem</button>
    </div>
  </CampoBase>
</template>

<style scoped>
.atalhos { display: flex; gap: 8px; }
.atalhos button { min-height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--cor-borda); background: transparent; color: var(--cor-texto-suave); font: 600 13px var(--fonte-texto); cursor: pointer; transition: all var(--anim-rapida) ease; }
.atalhos button:hover { color: var(--cor-texto); background: var(--cor-realce); }
.atalhos button.on { background: var(--tema-fundo, var(--cor-realce)); border-color: var(--tema-cor, var(--cor-primaria)); color: var(--tema-cor, var(--cor-primaria)); }
.atalhos button:focus-visible { outline: 2px solid var(--tema-cor, var(--cor-primaria)); outline-offset: 1px; }
</style>
