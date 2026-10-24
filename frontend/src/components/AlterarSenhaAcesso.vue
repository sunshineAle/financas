<script setup>
// Janela "Alterar senha de acesso" (só no PWA). Uso na tela Perfil:
//   <AlterarSenhaAcesso :aberto="abrirSenha" @fechar="abrirSenha = false" />
// Mostrar o botão só quando `modoPWA` (import { modoPWA } from '../services/acesso.js').
import { ref, watch } from 'vue';
import FormularioModal from './FormularioModal.vue';
import CampoTexto from './CampoTexto.vue';
import AvisoSenha from './AvisoSenha.vue';
import { alterarSenha, validarNovaSenha } from '../services/acesso.js';
import { avisar } from '../services/avisos.js';

const props = defineProps({ aberto: Boolean });
const emit = defineEmits(['fechar']);
const atual = ref(''); const nova = ref(''); const conf = ref('');
const erros = ref({}); const geral = ref(''); const salvando = ref(false);
watch(() => props.aberto, (a) => { if (a) { atual.value = nova.value = conf.value = ''; erros.value = {}; geral.value = ''; } });

async function salvar() {
  const e = {};
  if (!atual.value) e.atual = 'Informe a senha atual.';
  const v = validarNovaSenha(nova.value); if (v) e.nova = v;
  if (conf.value !== nova.value) e.conf = 'A confirmação não bate com a nova senha.';
  erros.value = e; geral.value = '';
  if (Object.keys(e).length) return;
  salvando.value = true;
  try {
    await alterarSenha(atual.value, nova.value);
    // Backups antigos continuam abrindo com a senha antiga (e com o código de recuperação). Oferece um backup novo na hora.
    avisar('Senha alterada. Backups antigos abrem com a senha antiga ou com o código de recuperação. Toque para fazer um backup novo agora.', { tipo: 'ok', rota: '/backup?fazer=1', duracao: 12000 });
    emit('fechar');
  } catch (x) { geral.value = x.message; } finally { salvando.value = false; }
}
</script>

<template>
  <FormularioModal :aberto="aberto" titulo="Alterar senha de acesso" rotulo-salvar="Alterar senha" :carregando="salvando" :erro="geral" @salvar="salvar" @fechar="emit('fechar')">
    <CampoTexto v-model="atual" type="password" rotulo="Senha atual" autocomplete="current-password" :erro="erros.atual" obrigatorio />
    <CampoTexto v-model="nova" type="password" rotulo="Nova senha" autocomplete="new-password" dica="PIN de 4 a 12 números ou senha com 6+ caracteres. Backups antigos continuam abrindo com a senha antiga." :erro="erros.nova" obrigatorio />
    <CampoTexto v-model="conf" type="password" rotulo="Repita a nova senha" autocomplete="new-password" :erro="erros.conf" obrigatorio />
    <AvisoSenha />
  </FormularioModal>
</template>
