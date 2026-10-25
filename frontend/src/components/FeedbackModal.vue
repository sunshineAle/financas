<script setup>
// Enviar feedback (Sobre o app, anotação 40). Componente de formulário padrão; versão, aparelho e tela vão sozinhos.
//   <FeedbackModal v-model:aberto="x" />
import { ref, watch } from 'vue';
import FormularioModal from './FormularioModal.vue';
import CampoTexto from './CampoTexto.vue';
import { avisar } from '../services/avisos.js';
import { enviarFeedback } from '../services/feedback.js';

const aberto = defineModel('aberto', { type: Boolean, default: false });
const TIPOS = [{ id: 'erro', rotulo: 'Erro' }, { id: 'sugestao', rotulo: 'Sugestão' }, { id: 'duvida', rotulo: 'Dúvida' }, { id: 'elogio', rotulo: 'Elogio' }];
const f = ref({});
const erro = ref('');
const enviando = ref(false);
watch(aberto, (a) => { if (a) { f.value = { tipo: 'sugestao', mensagem: '', nome: '', contato: '', site: '' }; erro.value = ''; } });

async function enviar() {
  erro.value = '';
  if (!f.value.mensagem.trim()) { erro.value = 'Escreva a mensagem.'; return; }
  enviando.value = true;
  try {
    const r = await enviarFeedback(f.value);
    aberto.value = false;
    avisar(r === 'enviado' ? 'Recebido, obrigado!' : 'Será enviado quando houver internet.', { tipo: r === 'enviado' ? 'ok' : 'info' });
  } catch (e) { erro.value = e.message || 'Não foi possível enviar agora. Vamos tentar de novo depois.'; }
  finally { enviando.value = false; }
}
</script>

<template>
  <FormularioModal :aberto="aberto" titulo="Enviar feedback" rotulo-salvar="Enviar" :carregando="enviando" :erro="erro" @salvar="enviar" @fechar="aberto = false">
    <div class="tipos" role="radiogroup" aria-label="Tipo">
      <button v-for="t in TIPOS" :key="t.id" type="button" role="radio" :aria-checked="f.tipo === t.id" :class="{ ativo: f.tipo === t.id }" @click="f.tipo = t.id">{{ t.rotulo }}</button>
    </div>
    <label class="campo-msg">
      <span>Mensagem</span>
      <textarea v-model="f.mensagem" rows="5" maxlength="2000" placeholder="Conte o que aconteceu ou o que você sugere" data-feedback-msg></textarea>
    </label>
    <p class="aviso">Não escreva valores, senhas, códigos de recuperação ou dados das suas contas.</p>
    <CampoTexto v-model="f.nome" rotulo="Nome (opcional)" maxlength="80" />
    <CampoTexto v-model="f.contato" rotulo="Contato para resposta (opcional)" maxlength="120" />
    <!-- campo invisível contra robôs (honeypot) -->
    <input v-model="f.site" class="pote" type="text" name="site" tabindex="-1" autocomplete="off" aria-hidden="true" />
  </FormularioModal>
</template>

<style scoped>
.tipos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 4px; border-radius: 14px; background: var(--cor-fundo); border: 1px solid var(--cor-borda); }
.tipos button { min-height: 40px; border: none; border-radius: 10px; background: none; color: var(--cor-texto-suave); font: 600 13px var(--fonte-texto); cursor: pointer; }
.tipos button.ativo { color: var(--cor-sobre-cor); background: linear-gradient(135deg, var(--cor-primaria), var(--cor-violeta)); }
.campo-msg { display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 500; }
.campo-msg textarea { font: 400 15px/1.45 var(--fonte-texto); padding: 10px 12px; border-radius: 12px; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado); color: var(--cor-texto); resize: vertical; min-height: 110px; }
.campo-msg textarea:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 1px; }
.aviso { margin: -4px 0 0; font-size: 12.5px; color: var(--cor-texto-suave); }
.pote { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
</style>
