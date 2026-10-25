<script setup>
// Apoie o desenvolvedor: texto institucional (config/apoio.js > TEXTO_INSTITUCIONAL) + botão Buy Me a Coffee.
import { computed } from 'vue';
import { Heart, Coffee, ExternalLink } from 'lucide-vue-next';
import CardPadrao from '../components/CardPadrao.vue';
import { APOIO, TEXTO_INSTITUCIONAL } from '../config/apoio.js';

const paragrafos = computed(() => String(TEXTO_INSTITUCIONAL || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean));
</script>

<template>
  <div class="pagina">
    <h1 class="titulo-pagina">Apoie o desenvolvedor</h1>

    <header class="intro">
      <span class="coracao"><Heart :size="26" :stroke-width="1.8" /></span>
      <p v-for="(p, i) in paragrafos" :key="i">{{ p }}</p>
    </header>

    <CardPadrao titulo="Apoiar" subtitulo="um café, sem compromisso">
      <a v-if="APOIO.buyMeACoffee" class="linha" :href="APOIO.buyMeACoffee" target="_blank" rel="noopener noreferrer">
        <span class="quadro"><Coffee :size="20" :stroke-width="1.8" /></span>
        <span class="texto"><b>Apoiar no Buy Me a Coffee</b><small>apoio único pelo cartão</small></span>
        <ExternalLink :size="18" :stroke-width="1.8" class="seta" />
      </a>
      <div v-else class="linha off">
        <span class="quadro"><Coffee :size="20" :stroke-width="1.8" /></span>
        <span class="texto"><b>Apoiar no Buy Me a Coffee</b><small>link a preencher pelo desenvolvedor</small></span>
      </div>
    </CardPadrao>
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
.titulo-pagina { font-family: var(--fonte-display); font-size: 22px; margin: 0; text-align: center; }
.intro { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 4px 8px; }
.intro p { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--cor-texto); }
.coracao { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--cor-entrada-fundo); color: var(--cor-primaria); }
.linha { display: flex; align-items: center; gap: 14px; min-height: 56px; }
.linha { text-decoration: none; color: var(--cor-texto); border-radius: 12px; padding: 4px 6px; }
a.linha:hover, a.linha:active { background: var(--cor-realce); }
.linha.off { opacity: 0.6; }
.quadro { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--cor-entrada-fundo); color: var(--cor-primaria); flex-shrink: 0; }
.texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.texto b { font-size: 15px; font-weight: 600; }
.texto small { font-size: 12.5px; color: var(--cor-texto-suave); }
.seta { color: var(--cor-texto-suave); flex-shrink: 0; }
</style>
