<script setup>
// Versão 1.0 (modelo unificado): página Patrimônio no rodapé. Mesmo conteúdo da antiga janela do Início
// (GET /api/patrimonio): líquido, Ativos | Passivos, gráfico e blocos; no PC, Ativos e Passivos lado a lado.
// Contas e Objetivos (Metas e Investimentos) moram aqui: atalhos no topo e o "›" de cada bloco.
import { useRouter } from 'vue-router';
import { Landmark, Target, ChevronRight } from 'lucide-vue-next';
import PatrimonioDetalhe from '../components/PatrimonioDetalhe.vue';
const router = useRouter();
</script>

<template>
  <div class="pag-pat">
    <nav class="atalhos-pat" aria-label="Partes do patrimônio">
      <button type="button" @click="router.push('/contas')"><Landmark :size="18" :stroke-width="1.8" />Contas<ChevronRight :size="15" :stroke-width="2" /></button>
      <button type="button" @click="router.push('/objetivos')"><Target :size="18" :stroke-width="1.8" />Metas e Investimentos<ChevronRight :size="15" :stroke-width="2" /></button>
    </nav>
    <PatrimonioDetalhe pagina aberto />
  </div>
</template>

<style scoped>
.pag-pat { display: flex; flex-direction: column; gap: 10px; }
.atalhos-pat { display: flex; gap: 8px; max-width: 1200px; width: 100%; margin: 0 auto; padding: 4px 16px 0; }
.atalhos-pat button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 42px; border-radius: 12px; border: 1px solid var(--cor-borda); background: var(--cor-card); color: var(--cor-texto); font: 600 13.5px var(--fonte-texto); cursor: pointer; }
.atalhos-pat button:hover { background: var(--cor-realce); }
.atalhos-pat button svg:last-child { color: var(--cor-texto-suave); }
</style>
