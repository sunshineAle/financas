<script setup>
// Assinatura do estúdio (05/11): "Dagda Capital · um projeto Alt Design Creative". Discreta, no fim das telas
// institucionais (Apoie, Sobre o app, tela Mais) e na tela de entrada. `compacta` = uma linha só, menor.
defineProps({ compacta: { type: Boolean, default: false } });
</script>

<template>
  <p class="assinatura" :class="{ compacta }" data-assinatura-alt>
    <span class="marca">Dagda Capital</span>
    <span class="sep" aria-hidden="true">·</span>
    <span>um projeto <b>Alt Design Creative</b></span>
  </p>
</template>

<style scoped>
.assinatura { margin: 8px auto 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px 8px; font: 500 12.5px var(--fonte-texto); color: var(--cor-texto-suave); text-align: center; }
.assinatura b { font-weight: 700; background: linear-gradient(90deg, #8a5cf0, #1fb3c4); -webkit-background-clip: text; background-clip: text; color: transparent; }
.marca { font-family: var(--fonte-display); font-weight: 600; color: var(--cor-texto); }
.sep { opacity: .6; }
.compacta { font-size: 11.5px; margin-top: 4px; }
</style>
