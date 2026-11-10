<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import '../styles/formularios.css';
import Modal from './Modal.vue';
import { previa } from '../services/backup.js';
const props = defineProps({ arquivo: Object, executando: Boolean, erroExecutar: String, permitirMesclar: Boolean });
const emit = defineEmits(['fechar', 'restaurar']);
const senha = ref(''), resultado = ref(null), erro = ref(''), conferindo = ref(false), modo = ref('substituir');
let versao = 0, solicitada = -1, timer = null, fila = Promise.resolve();
let resultadoVersao = -1, senhaConferida = '';
function invalidar() {
  versao++;
  clearTimeout(timer); timer = null;
  resultado.value = null; resultadoVersao = -1; senhaConferida = '';
  erro.value = ''; conferindo.value = false;
}
function agendar() {
  clearTimeout(timer);
  if (!props.arquivo || props.executando || (props.arquivo.cifrado && !senha.value)) return;
  timer = setTimeout(conferir, props.arquivo.cifrado ? 700 : 0);
}
watch(() => props.arquivo, () => {
  invalidar(); senha.value = ''; modo.value = 'substituir'; agendar();
}, { immediate: true, flush: 'sync' });
watch(senha, () => { invalidar(); agendar(); }, { flush: 'sync' });
async function conferir() {
  clearTimeout(timer); timer = null;
  const arquivo = props.arquivo, segredo = senha.value, atual = versao;
  if (!arquivo || props.executando || (arquivo.cifrado && !segredo) || (solicitada === atual && conferindo.value)) return;
  solicitada = atual; conferindo.value = true; erro.value = ''; resultado.value = null;
  // Serializa as tentativas: uma validação antiga não deve terminar depois da que habilitou a confirmação.
  fila = fila.catch(() => {}).then(async () => {
    if (atual !== versao || arquivo !== props.arquivo) return;
    try {
      // previa inclui a recuperação real em SQLite descartável antes de devolver o conteúdo.
      const r = await previa(arquivo.env, segredo);
      if (atual !== versao || arquivo !== props.arquivo || segredo !== senha.value) return;
      resultadoVersao = atual; senhaConferida = segredo; resultado.value = r;
    } catch (e) {
      if (atual === versao && arquivo === props.arquivo && segredo === senha.value) erro.value = e.message;
    } finally {
      if (atual === versao) conferindo.value = false;
    }
  });
  await fila;
}
function restaurarConfirmado() {
  if (!resultado.value || resultadoVersao !== versao || senhaConferida !== senha.value || props.executando || conferindo.value) return;
  emit('restaurar', { ...resultado.value, senha: senhaConferida, modo: modo.value });
}
function fechar() { if (!props.executando) { invalidar(); emit('fechar'); } }
onBeforeUnmount(invalidar);
const rotulos = { contas: 'contas', cartoes: 'cartões', transacoes: 'transações', metas_reserva: 'metas', dividas: 'dívidas', lancamentos_cartao: 'compras no cartão' };
</script>
<template>
  <Modal :aberto="!!arquivo" titulo="Restaurar backup" tema="neutro" :camada="1100" @fechar="fechar">
    <form v-if="arquivo" data-confirmar-restauro @submit.prevent="conferir">
      <p>{{ arquivo.cifrado ? 'Digite a senha desta cópia.' : 'Confira o conteúdo antes de restaurar.' }}</p>
      <label v-if="arquivo.cifrado">Senha do backup ou código de recuperação<input v-model="senha" class="sf-entrada" type="password" autocomplete="off" required placeholder="Senha da época do backup ou o código" :disabled="executando" /></label>
      <p v-if="conferindo" role="status" aria-live="polite" data-conferindo-backup>Conferindo backup…</p>
      <section v-if="resultado" data-resultado-validacao><b>Conteúdo do backup</b>
        <ul><li v-for="[t,n] in Object.entries(resultado.contagens).filter(([t,n]) => n && t !== 'diario_alteracoes')" :key="t">{{ n }} {{ rotulos[t] || t.replaceAll('_',' ') }}</li></ul>
        <small>Seus dados só serão alterados quando você confirmar a restauração.</small>
        <fieldset v-if="permitirMesclar && resultado.dados.formato !== 'sqlite-bruto'"><label><input v-model="modo" type="radio" value="substituir" /> Substituir</label><label><input v-model="modo" type="radio" value="mesclar" /> Mesclar</label></fieldset>
      </section>
      <p v-if="erro || (resultado && erroExecutar)" role="alert">{{ erro || erroExecutar }}</p>
    </form>
    <template #rodape>
      <div class="acoes-restaurar tema-neutro">
        <button v-if="resultado" type="button" class="sf-botao primario restaurar-principal" :disabled="executando || conferindo" @click="restaurarConfirmado">{{ executando ? 'Restaurando…' : 'Restaurar e continuar' }}</button>
        <button type="button" class="sf-botao secundario" :disabled="executando" @click="fechar">Voltar</button>
      </div>
    </template>
  </Modal>
</template>
<style scoped>
form { display: flex; flex-direction: column; gap: 14px; }
p { margin: 0; font-size: 14px; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
small { font-size: 12px; line-height: 1.4; color: var(--cor-texto-suave); }
[role=alert] { color: var(--cor-alerta); }
[role=status] { color: var(--cor-texto-suave); }
fieldset { display: flex; gap: 14px; border: 0; padding: 10px 0; }
fieldset label { flex-direction: row; }
.acoes-restaurar { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.acoes-restaurar .sf-botao { width: 100%; max-width: 380px; }
.restaurar-principal { min-height: 54px; }
</style>
