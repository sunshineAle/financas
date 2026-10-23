<script setup>
// Logos simplificados das nuvens aceitas no restauro. Uso: <NuvemLogo id="google" :tamanho="28" />
// ids: google | microsoft | dropbox | proton | mega | icloud
defineProps({ id: { type: String, required: true }, tamanho: { type: Number, default: 28 } });
</script>

<template>
  <svg :width="tamanho" :height="tamanho" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <template v-if="id === 'google'">
      <path d="M11 4h10l10 17h-10z" fill="#fbbc04" />
      <path d="M11 4 1 21l5 8 10-17z" fill="#34a853" />
      <path d="M6 29h20l5-8H11z" fill="#4285f4" />
    </template>
    <template v-else-if="id === 'microsoft'">
      <path d="M9 25a6 6 0 0 1-.6-12A8 8 0 0 1 23.600 12 5.500 5.500 0 0 1 24 25z" fill="#0f6cbd" />
      <path d="M9 25a6 6 0 0 1-.6-12A8 8 0 0 1 16 8a7 7 0 0 1 3 .8 6 6 0 0 0-3 5.200 6 6 0 0 0 .8 3A5 5 0 0 0 9 25z" fill="#28a8ea" />
    </template>
    <template v-else-if="id === 'dropbox'">
      <path d="M9 4 1 9.500l8 5.500 7-5.500zM23 4l-7 5.500 7 5.500 8-5.500zM1 20.500 9 26l7-5.500L9 15zM23 15l-7 5.500L23 26l8-5.500z" fill="#0061ff" />
      <path d="m9 27.500 7-5.500 7 5.500-7 4.500z" fill="#0061ff" transform="translate(0 -3)" />
    </template>
    <template v-else-if="id === 'proton'">
      <rect x="2" y="2" width="28" height="28" rx="8" fill="#6d4aff" />
      <path d="M11 24V10l10 2.500v6L11 24z" fill="#fff" opacity=".95" />
    </template>
    <template v-else-if="id === 'mega'">
      <circle cx="16" cy="16" r="14" fill="#d9272e" />
      <path d="M8.500 22V11l7.500 7 7.500-7v11h-2.600v-5.300L16 22l-4.900-5.300V22z" fill="#fff" />
    </template>
    <template v-else>
      <path d="M9 25a6 6 0 0 1-.6-12A8 8 0 0 1 23.600 12 5.500 5.500 0 0 1 24 25z" fill="#3b9bf5" />
    </template>
  </svg>
</template>
