<script setup>
import { useRoute } from 'vue-router';
import AppLayout from './components/AppLayout.vue';
import TourPagina from './components/TourPagina.vue';
import ConfirmacaoApp from './components/ConfirmacaoApp.vue';
import NovidadesVersao from './components/NovidadesVersao.vue';

const route = useRoute();
</script>

<template>
  <router-view v-if="route.name === 'login'" />
  <AppLayout v-else>
    <router-view />
  </AppLayout>
  <!-- 1.0: a janela "Vamos começar?" saiu; no lugar, o card Primeiros passos no Início e o tour de cada página -->
  <TourPagina v-if="route.name !== 'login'" />
  <NovidadesVersao v-if="route.name !== 'login'" />
  <ConfirmacaoApp />
</template>
