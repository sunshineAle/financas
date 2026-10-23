<script setup>
// Número que conta rapidamente até o valor final (saldo, total...). Com "reduzir movimento" aparece direto.
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { ocultar, MASCARA } from '../services/privacidade.js';

const props = defineProps({
  valor: { type: Number, default: 0 },
  moeda: { type: Boolean, default: true },
});
const exibido = ref(0);
let raf = null;
const formato = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const texto = (v) => (props.moeda ? formato.format(v) : String(Math.round(v)));

function ir(de, ate) {
  cancelAnimationFrame(raf);
  const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anim-lenta')) || 0;
  if (ms === 0) { exibido.value = ate; return; }
  const dur = Math.min(900, ms + 150);
  let t0 = 0;
  const passo = (ts) => {
    if (!t0) t0 = ts;
    const t = Math.min(1, (ts - t0) / dur);
    exibido.value = de + (ate - de) * (1 - Math.pow(1 - t, 3));
    if (t < 1) raf = requestAnimationFrame(passo);
  };
  raf = requestAnimationFrame(passo);
}
onMounted(() => ir(0, props.valor || 0));
watch(() => props.valor, (novo, antigo) => ir(exibido.value, novo || 0));
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <span class="numero-tabular">{{ ocultar ? MASCARA : texto(exibido) }}</span>
</template>
