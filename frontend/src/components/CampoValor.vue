<script setup>
// <CampoValor v-model="valor" tipo="saida" rotulo="Valor" :erro="..." /> — valor monetário GRANDE (R$ 0,00).
// Digita-se só números; entram da direita para a esquerda (como maquininha): 1 -> 0,01 · 12 -> 0,12 · 1234 -> 12,34.
// v-model é um NUMBER em reais (0 quando vazio). Cor do valor segue o tema (entrada azul / saída carmim).
// Props: modelValue (number), rotulo, erro, dica, tipo/tema ('entrada'|'saida'|'meta'|'investimento'|'neutro'; padrão neutro),
// autofocus, disabled, permiteNegativo (tecla "-" alterna o sinal).
import { computed, useId, ref, onMounted } from 'vue';
import CampoBase from './CampoBase.vue';
const props = defineProps({
  modelValue: { type: Number, default: 0 },
  rotulo: { type: String, default: 'Valor' },
  erro: String, dica: String, dicaAoFocar: Boolean, autofocus: Boolean, disabled: Boolean, permiteNegativo: Boolean,
  tipo: { type: String, default: '' },
  tema: { type: String, default: 'neutro' },
});
const emit = defineEmits(['update:modelValue']);
const id = 'cv-' + useId();
const el = ref(null);
const t = computed(() => props.tipo || props.tema);
const texto = computed(() => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(props.modelValue || 0)));
const neg = computed(() => (props.modelValue || 0) < 0);

function aoDigitar(e) {
  const bruto = e.target.value;
  const digitos = bruto.replace(/\D/g, '').slice(0, 12);
  let v = Number(digitos || 0) / 100;
  const sinalNegativo = props.permiteNegativo && (bruto.includes('-') ? !neg.value : neg.value);
  if (sinalNegativo) v = -v;
  e.target.value = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v));
  emit('update:modelValue', v);
}
onMounted(() => { if (props.autofocus) el.value?.focus(); });
</script>

<template>
  <CampoBase :rotulo="rotulo" :erro="erro" :dica="dica" :dica-ao-focar="dicaAoFocar" :tema="t" :para="id">
    <div class="valor-wrap" :class="{ erro: !!erro, zero: !modelValue }">
      <span class="moeda">{{ neg ? '− R$' : 'R$' }}</span>
      <input :id="id" ref="el" class="valor-input numero-tabular" type="text" inputmode="numeric" autocomplete="off" :value="texto" :disabled="disabled" :aria-invalid="!!erro" @input="aoDigitar" />
    </div>
  </CampoBase>
</template>

<style scoped>
.valor-wrap { display: flex; align-items: baseline; gap: 8px; padding: 14px 16px; border-radius: 16px; background: var(--cor-fundo); border: 1.5px solid var(--cor-borda); transition: border-color var(--anim-rapida) ease, box-shadow var(--anim-rapida) ease; }
.valor-wrap:hover { border-color: color-mix(in srgb, var(--tema-cor) 40%, var(--cor-borda)); }
.valor-wrap:focus-within { border-color: var(--tema-cor); box-shadow: 0 0 0 3px color-mix(in srgb, var(--tema-cor) 28%, transparent); }
.valor-wrap.erro { border-color: var(--cor-saida); }
.moeda { font-family: var(--fonte-display); font-size: 18px; font-weight: 600; color: var(--cor-texto-suave); }
.valor-input { flex: 1; min-width: 0; width: 100%; border: none; outline: none; background: transparent; padding: 0; font-family: var(--fonte-display); font-size: clamp(32px, 9vw, 42px); font-weight: 700; line-height: 1.1; color: var(--tema-cor); }
.valor-wrap.zero .valor-input { color: var(--cor-texto-suave); }
</style>
