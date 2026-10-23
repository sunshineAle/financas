<script setup>
// Avatar redondo só de exibição (foto do perfil ou inicial sobre o degradê da cor escolhida). `tamanho` em px.
import { perfil, gradienteAvatar } from '../services/perfil.js';
defineProps({ inicial: { type: String, default: 'A' }, tamanho: { type: Number, default: 40 } });
</script>

<template>
  <span class="avatar-mini" :style="{ width: tamanho + 'px', height: tamanho + 'px', fontSize: Math.round(tamanho * 0.42) + 'px', background: perfil.foto ? 'var(--cor-fundo-elevado)' : gradienteAvatar(perfil.cor) }" aria-hidden="true">
    <img v-if="perfil.foto" :src="perfil.foto" alt="" />
    <template v-else>{{ inicial }}</template>
  </span>
</template>

<style scoped>
.avatar-mini { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; flex-shrink: 0; overflow: hidden; color: var(--cor-sobre-cor); font-family: var(--fonte-display); font-weight: 700; line-height: 1; }
.avatar-mini img { width: 100%; height: 100%; object-fit: cover; }
</style>
