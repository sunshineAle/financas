<script setup>
// Reset de demo em 2 passos (Mais e Perfil). Uso: <ResetDemoModal v-model:passo="passo" /> ; abra com passo = 1.
import { ref } from 'vue';
import Modal from './Modal.vue';
import { resetarDemo } from '../services/resetDemo.js';

const passo = defineModel('passo', { type: Number, default: 0 });
const resetando = ref(false);
const erro = ref('');
async function confirmar() {
  resetando.value = true; erro.value = '';
  try { await resetarDemo(); } catch (e) { erro.value = e.message; resetando.value = false; }
}
</script>

<template>
  <Modal :aberto="passo > 0" titulo="Reset de demo" tema="saida" @fechar="passo = 0">
    <p v-if="passo === 1" class="aviso-reset">Isto apaga tudo o que você lançou neste aparelho. Deseja continuar?</p>
    <p v-else class="aviso-reset"><b>Última confirmação.</b> Não dá para desfazer. Se quiser guardar seus dados, faça um backup antes.</p>
    <p v-if="erro" class="aviso-reset erro">{{ erro }}</p>
    <template #rodape>
      <button type="button" class="b-sec" @click="passo = 0">Cancelar</button>
      <button v-if="passo === 1" type="button" class="b-perigo" @click="passo = 2">Continuar</button>
      <button v-else type="button" class="b-perigo" :disabled="resetando" @click="confirmar">{{ resetando ? 'Restaurando…' : 'Apagar e restaurar' }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.aviso-reset { margin: 0 0 8px; font-size: 14.5px; line-height: 1.5; }
.aviso-reset.erro { color: var(--cor-grave); }
.b-sec, .b-perigo { min-height: 44px; padding: 0 18px; border-radius: 12px; font-family: var(--fonte-texto); font-size: 15px; font-weight: 600; cursor: pointer; }
.b-sec { background: none; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.b-perigo { border: none; background: var(--degrade-grave); color: var(--cor-sobre-cor); }
.b-perigo:disabled { opacity: 0.5; }
</style>
