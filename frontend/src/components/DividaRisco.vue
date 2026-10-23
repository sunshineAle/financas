<script setup>
// <DividaRisco :risco="divida.risco" /> — selo do grau de risco automático: Baixo · Médio · Alto · Crítico.
// Crítico (e vencida) usa o vermelho de pendência grave (--cor-grave); os demais seguem a paleta quente das saídas.
defineProps({ risco: { type: Object, default: null }, compacto: Boolean });
</script>

<template>
  <span v-if="risco" :class="['selo-risco', 'nivel-' + risco.nivel.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), { compacto }]" :title="(risco.motivos || []).join(' · ') || 'Sem alertas'">
    <span class="ponto" aria-hidden="true"></span>Risco {{ risco.nivel.toLowerCase() }}
  </span>
</template>

<style scoped>
.selo-risco { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; line-height: 1; padding: 4px 9px; border-radius: 999px; white-space: nowrap; color: color-mix(in srgb, var(--selo-cor) 62%, var(--cor-texto)); background: color-mix(in srgb, var(--selo-cor) 14%, transparent); border: 1px solid color-mix(in srgb, var(--selo-cor) 38%, transparent); }
.ponto { width: 6px; height: 6px; border-radius: 50%; background: var(--selo-cor); }
.nivel-baixo { --selo-cor: var(--cor-texto-suave); }
.nivel-medio { --selo-cor: var(--saida-ambar-medio); }
.nivel-alto { --selo-cor: var(--cor-saida-texto); }
.nivel-critico { --selo-cor: var(--cor-grave); }
.nivel-critico .ponto { box-shadow: 0 0 0 3px color-mix(in srgb, var(--cor-grave) 25%, transparent); }
.compacto { font-size: 10.5px; padding: 3px 8px; }
</style>
