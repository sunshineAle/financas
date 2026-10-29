<script setup>
// Objetivos: a parte positiva do sistema. Duas abas (toque ou arrastar para o lado): Metas e Investimentos.
// Os dados e formulários ficam em ReservaLiberdade (uma carga só); aqui só a casca e as abas.
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import CabecalhoPagina from '../components/CabecalhoPagina.vue';
import AbasSeletor from '../components/AbasSeletor.vue';
import ReservaLiberdade from './ReservaLiberdade.vue';

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
    <AbasSeletor v-if="!emDetalhe" v-model="aba" :abas="ABAS" tema="meta" degrade="linear-gradient(135deg, var(--cor-meta), var(--cor-investimento))" swipe bloco />
    <ReservaLiberdade embutido :aba="ativoAberto ? 'investimentos' : metaAberta ? 'metas' : aba" :meta-aberta="metaAberta" :ativo-aberto="ativoAberto" />
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 960px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
</style>
