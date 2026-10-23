<script setup>
// Ícone puro do manifesto de categorias (24x24, currentColor). <IconeCat chave="cat-saida-mercado" :tamanho="20" preenchido />
import { computed } from 'vue';
import { iconeCat } from '../utils/iconesCategoria.js';
const props = defineProps({ chave: { type: String, default: '' }, tamanho: { type: [Number, String], default: 20 }, preenchido: Boolean, titulo: { type: String, default: '' } });
const miolo = computed(() => { const i = iconeCat(props.chave); return i ? (props.preenchido ? i.filled : i.outline) : ''; });
</script>

<template>
  <svg class="icone-cat-svg" :width="tamanho" :height="tamanho" viewBox="0 0 24 24" :role="titulo ? 'img' : null" :aria-label="titulo || null" :aria-hidden="titulo ? null : 'true'" v-html="miolo" />
</template>

<style scoped>
.icone-cat-svg { flex: none; display: inline-block; vertical-align: middle; }
</style>
