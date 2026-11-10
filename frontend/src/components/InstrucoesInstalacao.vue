<script setup>
import Modal from './Modal.vue';
import { orientacaoInstalacao } from '../services/instalacao.js';
defineProps({ aberto: Boolean, previa: Boolean });
const emit = defineEmits(['fechar']);
const orientacao = orientacaoInstalacao();
</script>
<template>
  <Modal :aberto="aberto" :titulo="orientacao.titulo" @fechar="emit('fechar')">
    <p v-if="previa" class="nota" data-instalacao-previa>Esta prévia é só para testes e não será instalada. Estes são os passos para instalar o app oficial.</p>
    <p class="nota">Para deixar o Dagda {{ orientacao.titulo === 'Instalar no Mac' ? 'no Dock' : 'na Tela de Início' }} e acessá-lo como aplicativo, siga os passos abaixo usando o recurso do seu navegador.</p>
    <ol class="passos"><li v-for="passo in orientacao.passos" :key="passo">{{ passo }}</li></ol>
    <template #rodape><button type="button" class="concluir" @click="emit('fechar')">Entendi</button></template>
  </Modal>
</template>
<style scoped>
.nota { margin: 0 0 14px; color: var(--cor-texto-suave); line-height: 1.5; }
.passos { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 14px; line-height: 1.5; }
.concluir { min-height: 44px; padding: 10px 18px; border: 0; border-radius: 10px; background: var(--cor-primaria); color: #fff; font: 600 15px var(--fonte-texto); cursor: pointer; }
.concluir:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 3px; }
</style>
