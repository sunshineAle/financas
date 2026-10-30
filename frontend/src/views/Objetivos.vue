<script setup>
// Objetivos: a parte positiva do sistema. Duas abas (toque ou arrastar para o lado): Metas e Investimentos.
// Os dados e formulários ficam em ReservaLiberdade (uma carga só); aqui só a casca e as abas.
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import CabecalhoPagina from '../components/CabecalhoPagina.vue';
import AbasSeletor from '../components/AbasSeletor.vue';
import ReservaLiberdade from './ReservaLiberdade.vue';
import { ehTelaLarga } from '../services/layout.js';

const ABAS = [
  { id: 'metas', rotulo: 'Metas' },
  { id: 'investimentos', rotulo: 'Investimentos' },
];
// Extrato da meta (?meta=<id>) e detalhe do ativo (?ativo=<id>) abrem dentro de Objetivos; o botão voltar do navegador fecha.
const route = useRoute();
// ?aba=investimentos abre direto na aba Investimentos (vindo do detalhe do Patrimônio no Início)
const aba = ref(route.query.aba === 'investimentos' ? 'investimentos' : 'metas');
const metaAberta = computed(() => String(route.query.meta || ''));
const ativoAberto = computed(() => String(route.query.ativo || ''));
const emDetalhe = computed(() => !!(metaAberta.value || ativoAberto.value));
</script>

<template>
  <div class="pagina">
    <CabecalhoPagina titulo="Objetivos" sem-mes />
    <!-- Tela grande (22h35): Metas e Investimentos lado a lado, como dois blocos grandes; sem abas -->
    <div v-if="ehTelaLarga && !emDetalhe" class="lado-a-lado" data-objetivos-lado-a-lado>
      <section class="metade" aria-label="Metas"><ReservaLiberdade embutido aba="metas"><template #abas><h2 class="titulo-metade">Metas</h2></template></ReservaLiberdade></section>
      <section class="metade" aria-label="Investimentos"><ReservaLiberdade embutido aba="investimentos"><template #abas><h2 class="titulo-metade">Investimentos</h2></template></ReservaLiberdade></section>
    </div>
    <!-- Homologação 1.0 (29/10, 22h15): as abas saem do topo e ficam abaixo do orbe, junto do bloco do saldo -->
    <ReservaLiberdade v-else embutido :aba="ativoAberto ? 'investimentos' : metaAberta ? 'metas' : aba" :meta-aberta="metaAberta" :ativo-aberto="ativoAberto">
      <template #abas>
        <AbasSeletor v-if="!emDetalhe" v-model="aba" :abas="ABAS" tema="meta" degrade="linear-gradient(135deg, var(--cor-meta), var(--cor-investimento))" bloco />
      </template>
    </ReservaLiberdade>
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 960px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
.pagina:has(.lado-a-lado) { max-width: 1240px; }
.lado-a-lado { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.metade { display: flex; flex-direction: column; gap: var(--espaco-secao); min-width: 0; padding: 16px; border-radius: 22px; background: color-mix(in srgb, var(--cor-fundo-elevado) 55%, var(--cor-fundo)); border: 1px solid var(--cor-borda); }
.titulo-metade { margin: 0 2px; font-family: var(--fonte-display); font-size: 18px; }
</style>
