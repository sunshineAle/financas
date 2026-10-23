<script setup>
import { useRoute } from 'vue-router';
import AppLayout from './components/AppLayout.vue';
import PrimeiroCadastro from './components/PrimeiroCadastro.vue';

const route = useRoute();
</script>

<template>
  <router-view v-if="route.name === 'login'" />
  <AppLayout v-else>
    <router-view />
  </AppLayout>
  <PrimeiroCadastro v-if="route.name !== 'login'" />
</template>
