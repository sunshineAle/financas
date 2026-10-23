<script setup>
// Barra de progresso com transição em DEGRADÊ entre a parte atingida e a que falta (identidade do sistema).
// A parte cheia vai de `de` até `ate`; na ponta ela se dissolve suavemente no trilho; um marcador fino
// mostra o ponto exato. Preenche do zero ao abrir. O valor exato deve sempre vir escrito por quem usa.
//   <BarraDegrade :pct="64" de="var(--saida-ambar-medio)" ate="var(--saida-carmim-medio)" />
// v2: DEGRADÊ obrigatório (nenhuma cor termina seca). Saída: de carmim, meio tangerina, ate âmbar; entrada: verde; ver tokens.css.
// Para barras de quitação (dívida): parte que FALTA em vermelho, parte quitada clareando para âmbar → use
// :invertida="true" com de/ate já na ordem desejada.
import { ref, computed, onMounted } from 'vue';

const props = defineProps({
  pct: { type: Number, default: 0 },
  de: { type: String, default: 'var(--entrada-ceu-medio)' }, // padrão v2 = degradê de ENTRADA (verde claro -> escuro)
  ate: { type: String, default: 'var(--entrada-azul-escuro)' },
  meio: { type: String, default: '' }, // 3ª cor opcional (ex.: carmim -> laranja -> âmbar)
  altura: { type: Number, default: 10 },
  marcador: { type: Boolean, default: true },
  invertida: { type: Boolean, default: false },
});
const pronto = ref(false);
onMounted(() => requestAnimationFrame(() => { pronto.value = true; }));
const p = computed(() => Math.min(100, Math.max(0, props.pct || 0)));
</script>

<template>
  <div class="barra" :style="{ height: altura + 'px' }" role="progressbar" :aria-valuenow="Math.round(p)" aria-valuemin="0" aria-valuemax="100">
    <div class="cheia" :style="{ width: pronto ? p + '%' : '0%', background: `linear-gradient(90deg, ${invertida ? ate : de}${meio ? ', ' + meio : ''}, ${invertida ? de : ate})` }"></div>
    <span v-if="marcador && p > 0 && p < 100" class="marca" :style="{ left: pronto ? p + '%' : '0%' }"></span>
  </div>
</template>

<style scoped>
.barra { position: relative; border-radius: 999px; background: var(--cor-borda); overflow: visible; }
.cheia {
  height: 100%; border-radius: 999px; transition: width var(--anim-lenta) var(--anim-curva-suave);
  /* a ponta se dissolve no trilho: zona de transição curta */
  -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 16px), rgba(0, 0, 0, 0.35));
  mask-image: linear-gradient(90deg, #000 calc(100% - 16px), rgba(0, 0, 0, 0.35));
}
.marca { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; border-radius: 2px; background: var(--cor-texto); opacity: 0.75; transition: left var(--anim-lenta) var(--anim-curva-suave); }
</style>
