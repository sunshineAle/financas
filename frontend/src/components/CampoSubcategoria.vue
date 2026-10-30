<script setup>
// <CampoSubcategoria v-model="sub" :sugestoes="['Uber do trabalho', …]" /> — subcategoria em PÍLULAS embaixo da categoria
// (homologação 1.0, seção 14): as existentes + "+ Nova", numa fileira só que desliza para o lado (22h35).
// Tocar na escolhida de novo tira a escolha.
import { ref, computed, nextTick } from 'vue';
import { Plus, Check } from 'lucide-vue-next';
import CampoBase from './CampoBase.vue';

const props = defineProps({ modelValue: { type: String, default: '' }, sugestoes: { type: Array, default: () => [] }, rotulo: { type: String, default: 'Subcategoria (opcional)' }, tema: String });
const emit = defineEmits(['update:modelValue']);
const opcoes = computed(() => {
  const l = [...new Set((props.sugestoes || []).map((s) => String(s || '').trim()).filter(Boolean))];
  if (props.modelValue && !l.includes(props.modelValue)) l.unshift(props.modelValue);
  return l.slice(0, 12);
});
const criando = ref(false);
const nova = ref('');
const campo = ref(null);
function alternar(s) { emit('update:modelValue', props.modelValue === s ? '' : s); }
async function abrirNova() { criando.value = true; nova.value = ''; await nextTick(); campo.value?.focus(); }
function confirmar() { const n = nova.value.trim().slice(0, 80); if (n) emit('update:modelValue', n); criando.value = false; }
</script>

<template>
  <CampoBase :rotulo="rotulo" :tema="tema">
    <div class="pilulas" role="group" :aria-label="rotulo">
      <button v-for="s in opcoes" :key="s" type="button" class="pil" :class="{ on: modelValue === s }" :aria-pressed="modelValue === s" @click="alternar(s)">
        <Check v-if="modelValue === s" :size="13" :stroke-width="2.4" aria-hidden="true" />{{ s }}
      </button>
      <span v-if="criando" class="pil nova-campo">
        <input ref="campo" v-model="nova" type="text" maxlength="80" placeholder="Ex.: Uber do trabalho" aria-label="Nova subcategoria" @keydown.enter.prevent.stop="confirmar" @blur="confirmar" @keydown.esc.stop.prevent="criando = false" />
      </span>
      <button v-else type="button" class="pil nova" @click="abrirNova"><Plus :size="13" :stroke-width="2.4" aria-hidden="true" />Nova</button>
    </div>
  </CampoBase>
</template>

<style scoped>
.pilulas { display: flex; flex-wrap: nowrap; gap: 6px; overflow-x: auto; padding: 2px 2px 4px; scrollbar-width: none; overscroll-behavior-x: contain; }
.pilulas::-webkit-scrollbar { display: none; }
.pil { flex: none; white-space: nowrap; }
.pil { display: inline-flex; align-items: center; gap: 4px; min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); font: 600 12.5px var(--fonte-texto); cursor: pointer; }
.pil.on { border-color: var(--tema-cor, var(--cor-primaria)); background: var(--tema-fundo, var(--cor-realce)); }
.pil.nova { border-style: dashed; color: var(--tema-cor, var(--cor-primaria)); }
.nova-campo { padding: 0 6px; cursor: text; border-color: var(--tema-cor, var(--cor-primaria)); }
.nova-campo input { width: 150px; border: 0; outline: 0; background: none; color: var(--cor-texto); font: inherit; }
</style>
