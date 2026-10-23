<script setup>
// Botão de olho: liga/desliga o "ocultar valores" (services/privacidade.js). `claro` = sobre fundo em degradê (texto branco).
import { Eye, EyeOff } from 'lucide-vue-next';
import { ocultar, alternarOcultar } from '../services/privacidade.js';

defineProps({ claro: { type: Boolean, default: false }, tamanho: { type: Number, default: 40 } });
</script>

<template>
  <button type="button" class="botao-olho" :class="{ claro }" :style="{ '--olho': tamanho + 'px' }" :aria-pressed="ocultar"
    :aria-label="ocultar ? 'Mostrar valores' : 'Ocultar valores'" :title="ocultar ? 'Mostrar valores' : 'Ocultar valores'" @click.stop="alternarOcultar">
    <EyeOff v-if="ocultar" :size="19" :stroke-width="1.9" />
    <Eye v-else :size="19" :stroke-width="1.9" />
  </button>
</template>

<style scoped>
.botao-olho { display: inline-flex; align-items: center; justify-content: center; width: var(--olho); height: var(--olho); padding: 0; border: none; border-radius: 50%; background: none; color: var(--cor-texto-suave); cursor: pointer; flex: none; -webkit-tap-highlight-color: transparent; transition: background var(--anim-rapida) ease, color var(--anim-rapida) ease; }
.botao-olho:hover { background: var(--cor-realce); color: var(--cor-texto); }
.botao-olho:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
.botao-olho.claro { color: var(--cor-sobre-cor); background: color-mix(in srgb, var(--cor-sobre-cor) 14%, transparent); }
.botao-olho.claro:hover { background: color-mix(in srgb, var(--cor-sobre-cor) 26%, transparent); color: var(--cor-sobre-cor); }
</style>
