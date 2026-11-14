<script setup>
// Anotação 108: quem perdeu a senha E o código de recuperação pode apagar tudo e recomeçar, pela tela de entrada.
// Alerta grave (borda vermelha, ícone grande) e confirmação digitando APAGAR, no padrão de "Apagar dados" (anotação 34).
//   <ComecarDoZeroModal v-model:aberto="x" :google="true|false" :executando="..." @confirmar="..." />
// `google`: veio da recuperação pelo Google ("Não lembro a senha deste backup"); o texto fala dos backups da conta.
import { ref, watch, computed } from 'vue';
import { TriangleAlert } from 'lucide-vue-next';
import Modal from './Modal.vue';

const aberto = defineModel('aberto', { type: Boolean, default: false });
const props = defineProps({ google: Boolean, executando: Boolean, erro: { type: String, default: '' } });
const emit = defineEmits(['confirmar']);
const texto = ref('');
watch(aberto, (a) => { if (a) texto.value = ''; });
const pode = computed(() => texto.value.trim().toUpperCase() === 'APAGAR');
function confirmar() { if (pode.value && !props.executando) emit('confirmar'); }
</script>

<template>
  <Modal :aberto="aberto" titulo="Começar do zero" tema="saida" @fechar="aberto = false">
    <div class="zerar" data-comecar-do-zero>
      <div class="alerta" role="alert">
        <TriangleAlert :size="40" :stroke-width="2" aria-hidden="true" />
        <b>Você vai perder todos os seus dados.</b>
        <span>Não dá para desfazer.</span>
      </div>
      <p>O Dagda guarda tudo <b>só neste aparelho</b>. Não existe cópia em servidor.</p>
      <p v-if="google">Sem a senha ou o código, os <b>backups desta conta Google não abrem mais</b>. Você começa um cadastro novo.</p>
      <p v-else>Sem a senha ou o código, os <b>backups que você já fez também não abrem</b>.</p>
      <label class="campo">
        <span>Digite <b>APAGAR</b> para confirmar</span>
        <input v-model="texto" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="APAGAR" data-confirmar-zerar @keyup.enter="confirmar" />
      </label>
      <p v-if="erro" class="erro" role="alert">{{ erro }}</p>
    </div>
    <template #rodape>
      <button type="button" class="b-sec" :disabled="executando" @click="aberto = false">Cancelar</button>
      <button type="button" class="b-perigo" data-zerar-agora :disabled="!pode || executando" @click="confirmar">{{ executando ? 'Apagando…' : 'Apagar tudo' }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.zerar { display: flex; flex-direction: column; gap: 12px; }
.zerar p { margin: 0; font-size: 14.5px; line-height: 1.5; }
.alerta { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; padding: 16px 12px; border-radius: 14px; border: 2px solid var(--cor-grave); background: var(--cor-grave-fundo); color: var(--cor-texto); }
.alerta svg { color: var(--cor-grave); }
.alerta b { font: 700 18px var(--fonte-display); line-height: 1.25; }
.alerta span { font-size: 14px; font-weight: 600; color: var(--cor-grave); }
.campo { display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.campo input { min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado); color: var(--cor-texto); font: 600 16px var(--fonte-texto); letter-spacing: 0.08em; text-transform: uppercase; }
.erro { color: var(--cor-grave); }
.b-sec, .b-perigo { min-height: 44px; padding: 0 18px; border-radius: 12px; font-family: var(--fonte-texto); font-size: 15px; font-weight: 600; cursor: pointer; }
.b-sec { background: none; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.b-perigo { border: none; background: var(--degrade-grave); color: var(--cor-sobre-cor); }
.b-perigo:disabled { opacity: 0.5; cursor: default; }
</style>
<!-- Borda vermelha na janela inteira: a janela é montada no body, fora do alcance do estilo com escopo. -->
<style>
.fundo-modal .modal:has([data-comecar-do-zero]) { border: 2px solid var(--cor-grave); }
</style>
