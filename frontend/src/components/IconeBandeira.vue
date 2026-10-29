<script setup>
// Ícone da bandeira do cartão (Mastercard, Visa, Elo, Amex, Hipercard).
// Formas genéricas desenhadas para o app (não são os logos oficiais).
// Uso: <IconeBandeira bandeira="mastercard" :tamanho="16" colorido />
//  - tamanho = altura em px (a largura segue a proporção 5:3)
//  - sem `colorido`: monocromático, na cor do texto (currentColor) — para a face do cartão
//  - com `colorido`: versão pequena colorida sobre plaquinha clara — para pílulas e linhas
// Bandeira vazia/desconhecida não desenha nada.
import { computed } from 'vue';

const props = defineProps({
  bandeira: { type: String, default: '' },
  tamanho: { type: Number, default: 16 },
  colorido: { type: Boolean, default: false },
});

const NOMES = { mastercard: 'Mastercard', visa: 'Visa', elo: 'Elo', amex: 'Amex', hipercard: 'Hipercard' };
const chave = computed(() => String(props.bandeira || '').toLowerCase().trim());
const nome = computed(() => NOMES[chave.value] || '');
const largura = computed(() => Math.round((props.tamanho * 40) / 24));
</script>

<template>
  <svg
    v-if="nome"
    class="icone-bandeira"
    :class="{ colorido }"
    :width="largura"
    :height="tamanho"
    viewBox="0 0 40 24"
    role="img"
    :aria-label="`bandeira ${nome}`"
  >
    <title>bandeira {{ nome }}</title>
    <rect v-if="colorido" x="0.5" y="0.5" width="39" height="23" rx="4" fill="#ffffff" stroke="rgb(0 0 0 / 0.14)" />

    <!-- Mastercard: dois círculos sobrepostos -->
    <g v-if="chave === 'mastercard'">
      <template v-if="colorido">
        <circle cx="16" cy="12" r="7" fill="#EB001B" />
        <circle cx="24" cy="12" r="7" fill="#F79E1B" />
        <path d="M20 6.25a7 7 0 0 1 0 11.5a7 7 0 0 1 0-11.5z" fill="#FF5F00" />
      </template>
      <template v-else>
        <circle cx="15" cy="12" r="8" fill="currentColor" opacity="0.9" />
        <circle cx="25" cy="12" r="8" fill="currentColor" opacity="0.55" />
      </template>
    </g>

    <!-- Visa: texto em itálico -->
    <text
      v-else-if="chave === 'visa'"
      x="20" y="16.6" text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="900" font-style="italic" letter-spacing="0.4"
      :fill="colorido ? '#1A1F71' : 'currentColor'"
    >VISA</text>

    <!-- Elo: três pontos + texto -->
    <g v-else-if="chave === 'elo'">
      <circle cx="7" cy="7.5" r="2.3" :fill="colorido ? '#FFCB05' : 'currentColor'" />
      <circle cx="7" cy="12" r="2.3" :fill="colorido ? '#00A4E0' : 'currentColor'" :opacity="colorido ? 1 : 0.7" />
      <circle cx="7" cy="16.5" r="2.3" :fill="colorido ? '#EF4123' : 'currentColor'" :opacity="colorido ? 1 : 0.45" />
      <text x="23.5" y="16.8" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="800"
        :fill="colorido ? '#111111' : 'currentColor'">elo</text>
    </g>

    <!-- Amex: placa com texto -->
    <g v-else-if="chave === 'amex'">
      <rect x="3" y="4" width="34" height="16" rx="2.5" :fill="colorido ? '#2E77BC' : 'none'" :stroke="colorido ? 'none' : 'currentColor'" stroke-width="1.6" />
      <text x="20" y="15.8" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="900" letter-spacing="0.6"
        :fill="colorido ? '#ffffff' : 'currentColor'">AMEX</text>
    </g>

    <!-- Hipercard: placa com texto -->
    <g v-else-if="chave === 'hipercard'">
      <rect x="3" y="4" width="34" height="16" rx="2.5" :fill="colorido ? '#B3131B' : 'none'" :stroke="colorido ? 'none' : 'currentColor'" stroke-width="1.6" />
      <text x="20" y="15.6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="8.5" font-weight="900" font-style="italic"
        :fill="colorido ? '#ffffff' : 'currentColor'">Hiper</text>
    </g>
  </svg>
</template>

<style scoped>
.icone-bandeira { display: inline-block; flex-shrink: 0; vertical-align: middle; }
</style>
