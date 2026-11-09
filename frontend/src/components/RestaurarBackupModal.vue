<script setup>
import { ref, watch } from 'vue';
import Modal from './Modal.vue';
import { previa } from '../services/backup.js';
const props = defineProps({ arquivo: Object, executando: Boolean, erroExecutar: String, permitirMesclar: Boolean });
const emit = defineEmits(['fechar','restaurar']);
const senha=ref(''), resultado=ref(null), erro=ref(''), conferindo=ref(false), modo=ref('substituir');
let versao=0;
watch(()=>props.arquivo, () => { versao++;senha.value='';resultado.value=null;erro.value='';conferindo.value=false;modo.value='substituir'; });
watch(senha,()=>{resultado.value=null;erro.value='';});
async function conferir() {
  const atual=versao;
  conferindo.value=true;erro.value='';resultado.value=null;
  try { const r=await previa(props.arquivo.env,senha.value);if(atual===versao)resultado.value=r; }
  catch(e){if(atual===versao)erro.value=e.message;}
  finally{if(atual===versao)conferindo.value=false;}
}
const rotulos={contas:'contas',cartoes:'cartões',transacoes:'transações',metas_reserva:'metas',dividas:'dívidas',lancamentos_cartao:'compras no cartão'};
function fechar(){if(!props.executando&&!conferindo.value)emit('fechar');}
</script>
<template>
  <Modal :aberto="!!arquivo" titulo="Restaurar backup" :camada="1100" @fechar="fechar">
    <form v-if="arquivo" data-confirmar-restauro @submit.prevent="conferir">
      <p>{{ arquivo.cifrado ? 'Confirme a senha desta cópia.' : 'Confira o conteúdo antes de restaurar.' }}</p>
      <label v-if="arquivo.cifrado">Senha do backup ou código de recuperação<input v-model="senha" type="password" autocomplete="off" required placeholder="Senha da época do backup ou o código" :disabled="conferindo || executando" /></label>
      <button type="submit" class="sf-botao secundario" :disabled="conferindo || executando || (arquivo.cifrado && !senha)">{{ conferindo ? 'Testando recuperação…' : 'Conferir backup' }}</button>
      <section v-if="resultado" data-resultado-validacao><b>Conteúdo recuperado no teste isolado</b>
        <ul><li v-for="[t,n] in Object.entries(resultado.contagens).filter(([t,n])=>n && t!=='diario_alteracoes')" :key="t">{{ n }} {{ rotulos[t] || t.replaceAll('_',' ') }}</li></ul>
        <small>Um banco descartável recebeu esta cópia. Seus dados ativos continuam intactos. A confirmação abaixo aplica a restauração neste aparelho.</small>
        <fieldset v-if="permitirMesclar && resultado.dados.formato !== 'sqlite-bruto'"><label><input v-model="modo" type="radio" value="substituir" /> Substituir</label><label><input v-model="modo" type="radio" value="mesclar" /> Mesclar</label></fieldset>
      </section>
      <p v-if="erro || erroExecutar" role="alert">{{ erro || erroExecutar }}</p>
    </form>
    <template #rodape><button v-if="resultado" type="button" class="sf-botao primario" :disabled="executando || conferindo" @click="emit('restaurar',{ ...resultado, senha, modo })">{{ executando ? 'Restaurando…' : 'Restaurar e continuar' }}</button><button type="button" class="sf-botao secundario" :disabled="executando || conferindo" @click="fechar">Voltar</button></template>
  </Modal>
</template>
<style scoped>
form{display:flex;flex-direction:column;gap:14px}p{margin:0;font-size:14px}label{display:flex;flex-direction:column;gap:6px;font-size:14px}input[type=password]{min-height:44px;padding:10px;border:1px solid var(--cor-borda);border-radius:10px;background:var(--cor-fundo);color:var(--cor-texto);font:inherit}small{font-size:12px;line-height:1.4;color:var(--cor-texto-suave)}[role=alert]{color:var(--cor-alerta)}fieldset{display:flex;gap:14px;border:0;padding:10px 0}fieldset label{flex-direction:row}button{min-height:44px}
</style>
