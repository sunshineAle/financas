<script setup>
// <CampoParcelasPilula v-model="parcelas" /> — parcelas COMPACTAS (2 dígitos) ao lado do valor, no lançamento de cartão
// (homologação 1.0, seção 14). 1 a 48.
const props = defineProps({ modelValue: { type: [Number, String], default: 1 }, max: { type: Number, default: 48 } });
const emit = defineEmits(['update:modelValue']);
function aoDigitar(e) {
  const n = String(e.target.value).replace(/\D/g, '').slice(0, 2);
  e.target.value = n;
  emit('update:modelValue', n ? Math.min(props.max, Math.max(1, Number(n))) : '');
}
</script>

<template>
  <label class="pilula-parc" data-parcelas-pilula>
    <input class="numero-tabular" type="text" inputmode="numeric" maxlength="2" :value="modelValue" aria-label="Parcelas" @input="aoDigitar" @blur="!modelValue && emit('update:modelValue', 1)" /><span aria-hidden="true">x</span>
  </label>
</template>

<style scoped>
.pilula-parc { display: inline-flex; align-items: center; gap: 1px; min-height: 34px; padding: 0 10px 0 8px; border-radius: 999px; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado, var(--cor-card)); color: var(--cor-texto-suave); font: 600 13px var(--fonte-texto); cursor: text; }
.pilula-parc:focus-within { border-color: var(--tema-cor, var(--cor-primaria)); }
.pilula-parc input { width: 2.2ch; border: 0; outline: 0; background: none; color: var(--cor-texto); font: inherit; text-align: right; padding: 0; }
</style>
