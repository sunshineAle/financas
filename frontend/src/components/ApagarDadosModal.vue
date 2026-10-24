<script setup>
// "Apagar dados e redefinir o app" (Dados e backup, anotação 34). Passo 1: alerta para fazer um backup atualizado antes.
// Passo 2: confirmação dupla (digitar APAGAR) e lembrete de que a senha (ou o código de recuperação) é necessária para restaurar.
//   <ApagarDadosModal v-model:aberto="x" />
import { ref, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import { DatabaseBackup } from 'lucide-vue-next';
import Modal from './Modal.vue';
import { apagarTudo, modoPWA } from '../services/acesso.js';
import { resetarDemo } from '../services/resetDemo.js';
import { textoUltimoBackup } from '../services/backup.js';

const aberto = defineModel('aberto', { type: Boolean, default: false });
const router = useRouter();
const passo = ref(1);
const texto = ref('');
const apagando = ref(false);
const erro = ref('');
watch(aberto, (a) => { if (a) { passo.value = 1; texto.value = ''; erro.value = ''; } });
const pode = computed(() => texto.value.trim().toUpperCase() === 'APAGAR');
const ultimo = computed(() => textoUltimoBackup());

function fazerBackup() { aberto.value = false; router.push('/backup?fazer=1'); }
async function confirmar() {
  if (!pode.value) return;
  apagando.value = true; erro.value = '';
  try { if (modoPWA) await apagarTudo(); else await resetarDemo(); }
  catch (e) { erro.value = e.message || 'Não foi possível apagar.'; apagando.value = false; }
}
</script>

<template>
  <Modal :aberto="aberto" titulo="Apagar dados e redefinir o app" tema="saida" @fechar="aberto = false">
    <template v-if="passo === 1">
      <p class="aviso"><b>Isto apaga todos os dados deste aparelho</b>: contas, cartões, transações, metas, investimentos, a senha e as configurações. O app volta à tela de boas-vindas.</p>
      <p class="aviso">Antes, faça um <b>backup atualizado</b>. {{ ultimo }}.</p>
      <button type="button" class="b-backup" @click="fazerBackup"><DatabaseBackup :size="18" :stroke-width="2" /> Fazer backup agora</button>
    </template>
    <template v-else>
      <p class="aviso">Para restaurar depois, você vai precisar do arquivo de backup e da <b>senha</b> usada nele (ou do <b>código de recuperação</b>). Sem eles, ninguém consegue recuperar os dados.</p>
      <label class="campo">
        <span>Digite <b>APAGAR</b> para confirmar</span>
        <input v-model="texto" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="APAGAR" data-confirmar-apagar @keyup.enter="confirmar" />
      </label>
      <p v-if="erro" class="aviso erro" role="alert">{{ erro }}</p>
    </template>
    <template #rodape>
      <button type="button" class="b-sec" @click="aberto = false">Cancelar</button>
      <button v-if="passo === 1" type="button" class="b-perigo" @click="passo = 2">Continuar</button>
      <button v-else type="button" class="b-perigo" :disabled="!pode || apagando" @click="confirmar">{{ apagando ? 'Apagando…' : 'Apagar tudo' }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.aviso { margin: 0 0 10px; font-size: 14.5px; line-height: 1.5; }
.aviso.erro { color: var(--cor-grave); }
.b-backup { width: 100%; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); font: 600 15px var(--fonte-texto); cursor: pointer; margin-bottom: 6px; }
.campo { display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.campo input { min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado); color: var(--cor-texto); font: 600 16px var(--fonte-texto); letter-spacing: 0.08em; text-transform: uppercase; }
.b-sec, .b-perigo { min-height: 44px; padding: 0 18px; border-radius: 12px; font-family: var(--fonte-texto); font-size: 15px; font-weight: 600; cursor: pointer; }
.b-sec { background: none; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.b-perigo { border: none; background: var(--degrade-grave); color: var(--cor-sobre-cor); }
.b-perigo:disabled { opacity: 0.5; cursor: default; }
</style>
