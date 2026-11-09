<script setup>
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Modal from './Modal.vue';
import { configBackup } from '../services/backup.js';
import { pedidoBackup, abrirBackupRapido, fecharBackupRapido, executarBackupRapido, nomeDestinoBackup } from '../services/backupRapido.js';
const route = useRoute(), router = useRouter();
const destino = computed(() => nomeDestinoBackup(pedidoBackup.value?.destino));
function configurar() { fecharBackupRapido(); router.push('/backup'); }
watch(() => route.query.confirmarBackup, async valor => {
  if (valor !== '1') return;
  abrirBackupRapido();
  const query = { ...route.query }; delete query.confirmarBackup;
  await router.replace({ path: route.path, query, hash: route.hash });
}, { immediate: true });
</script>
<template>
  <Modal :aberto="!!pedidoBackup" titulo="Fazer backup agora?" :camada="1250" @fechar="fecharBackupRapido">
    <div v-if="pedidoBackup" data-backup-rapido>
      <p v-if="destino">Usar {{ destino }}, o destino do seu último backup. A configuração de criptografia escolhida será mantida.</p>
      <p v-if="destino && !configBackup.criptografar" role="note">A criptografia está desligada nas suas configurações: este backup não terá senha.</p>
      <p v-if="!destino">Escolha um destino e faça o primeiro backup uma vez. Nos próximos lembretes, você confirma por aqui.</p>
      <p v-if="pedidoBackup.executando" role="status">Fazendo backup… aguarde a confirmação.</p>
      <p v-if="pedidoBackup.erro" role="alert">{{ pedidoBackup.erro }}</p>
    </div>
    <template #rodape>
      <div class="acoes-backup">
        <button type="button" class="sf-botao secundario" :disabled="pedidoBackup?.executando" @click="fecharBackupRapido">Agora não</button>
        <button v-if="destino" type="button" class="sf-botao primario" :disabled="pedidoBackup?.executando" @click="executarBackupRapido">{{ pedidoBackup?.executando ? 'Fazendo backup…' : 'Fazer backup' }}</button>
        <button v-else type="button" class="sf-botao primario" @click="configurar">Escolher destino</button>
      </div>
      <button v-if="pedidoBackup?.erro" type="button" class="configurar-backup" :disabled="pedidoBackup?.executando" @click="configurar">Revisar destino e permissões</button>
    </template>
  </Modal>
</template>
<style scoped>
p { font-size: 14px; line-height: 1.5; } [role=alert] { color: var(--cor-alerta); }
.acoes-backup { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
.acoes-backup button { min-height: 44px; } .configurar-backup { display: block; margin-top: 12px; padding: 8px; border: 0; background: none; color: var(--cor-primaria); cursor: pointer; }
</style>
