<script setup>
// <Valor :valor="1234.5" /> — valor TOTAL em R$ que respeita o "ocultar valores" (mostra •••• quando ativo).
// Use só em totais (saldos, faturas, patrimônio...). Transações individuais ficam sempre visíveis.
// Com `texto` mostra um texto já formatado (ex.: "R$ 10,00 de R$ 50,00") no lugar do valor numérico.
import { computed } from 'vue';
import { ocultar, MASCARA } from '../services/privacidade.js';

const props = defineProps({
  valor: { type: Number, default: 0 },
  texto: { type: String, default: '' },
});
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const saida = computed(() => (ocultar.value ? MASCARA : props.texto || fmt.format(props.valor || 0)));
</script>

<template>
  <span class="valor-total" :class="{ oculto: ocultar }" :aria-label="ocultar ? 'valor oculto' : undefined">{{ saida }}</span>
</template>
