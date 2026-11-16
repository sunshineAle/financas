<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronRight, Info, ShieldCheck, TriangleAlert, Undo2 } from 'lucide-vue-next';
import AjudaSecao from '../components/AjudaSecao.vue';
import ListaBackups from '../components/ListaBackups.vue';
import RestaurarBackupModal from '../components/RestaurarBackupModal.vue';
import { confirmar } from '../services/confirmar.js';
import { nomeDestinoBackup } from '../services/backupRapido.js';
import Modal from '../components/Modal.vue';
import OrigemBackup from '../components/OrigemBackup.vue';
import AvisoSenha from '../components/AvisoSenha.vue';
import {
  configBackup, salvarConfig, INTERVALOS, suporte, ocupado, diasDesdeUltimo, backupDevido,
  baixar, compartilhar, lerArquivo, restaurar, desfazerRestauracao, temCopiaDeSeguranca, recarregarApp,
  excluirBackupNuvem, PROVEDORES, estadoNuvem, enviarNuvem, listarBackupsNuvem, abrirBackupNuvem,
} from '../services/backup.js';
import { conectarNuvem, desconectarNuvem } from '../services/nuvem/index.js';
import { estadoArmazenamento, riscoArmazenamento } from '../services/armazenamento.js';
import { avisar } from '../services/avisos.js';

// `embutido`: usada dentro de Dados e backup (sem título próprio).
defineProps({ embutido: { type: Boolean, default: false } });
const route = useRoute();
const msg = ref(''); const erro = ref('');
const destacar = computed(() => route.query.fazer === '1' || backupDevido());
const podeCompartilhar = suporte.compartilhar();
const janela = ref('');
const provedorDaLista = ref('');
const listaNuvem = ref([]);
const listaCarregada = ref(false);
const trabalhando = ref(false);
const emOperacao = computed(() => trabalhando.value || ocupado.value || !!estadoNuvem.ocupado);
const provedores = computed(() => Object.entries(PROVEDORES).filter(([, provedor]) => provedor.configurado()));
const ultimoBackup = computed(() => {
  if (!configBackup.ultimo) return 'Nenhum backup ainda';
  const data = new Date(configBackup.ultimo);
  const dia = data.toDateString() === new Date().toDateString() ? 'Hoje' : data.toLocaleDateString('pt-BR');
  const nome = nomeDestinoBackup(configBackup.ultimoDestino);
  return nome ? `${dia} · ${nome}` : fmt(configBackup.ultimo);
});

function abrirJanela(tipo) {
  erro.value = '';
  msg.value = '';
  janela.value = tipo;
}
function fecharJanela() {
  if (!emOperacao.value) {
    janela.value = '';
    erro.value = '';
  }
}

async function executar(fn, ok) {
  if (emOperacao.value) return;
  erro.value = '';
  msg.value = '';
  trabalhando.value = true;
  try {
    const resultado = await fn();
    if (ok) {
      msg.value = ok(resultado);
      avisar(msg.value, { tipo: 'ok' });
    }
    return resultado;
  } catch (e) {
    if (e?.name !== 'AbortError' && e?.codigo !== 'cancelado') erro.value = e?.message || 'Não foi possível concluir.';
  } finally {
    trabalhando.value = false;
  }
}
async function salvarAparelho() {
  await executar(podeCompartilhar ? compartilhar : baixar, (nome) => (
    podeCompartilhar ? 'Backup pronto para salvar.' : `Arquivo ${nome} gerado.`
  ));
  if (msg.value) fecharJanela();
}
async function salvarNuvem(id) {
  await executar(async () => {
    if (!estadoNuvem[id].conectado || estadoNuvem[id].precisaReconectar) await conectarNuvem(id);
    return enviarNuvem(id);
  }, () => `Backup enviado ao ${PROVEDORES[id].nome}.`);
  if (msg.value) fecharJanela();
}
const conectar = (id) => executar(async () => {
  await conectarNuvem(id);
  return PROVEDORES[id].nome;
}, (nome) => `${nome} conectado.`);
const desconectar = (id) => executar(async () => {
  await desconectarNuvem(id);
  if (configBackup.ultimoDestino === id) {
    configBackup.ultimoDestino = null;
    salvarConfig();
  }
  return PROVEDORES[id].nome;
}, (nome) => `${nome} desconectado.`);
const fmt = (iso) => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const arq = ref(null);
const copiaEm = ref(null);
async function abrirArquivo(arquivo) {
  const lido = await executar(() => lerArquivo(arquivo));
  if (lido) {
    fecharJanela();
    arq.value = lido;
  }
}
async function abrirCopias(id) {
  abrirJanela('copias');
  provedorDaLista.value = id;
  listaNuvem.value = [];
  listaCarregada.value = false;
  trabalhando.value = true;
  try {
    await conectarNuvem(id, { restaurar: true });
    listaNuvem.value = await listarBackupsNuvem(id, { restaurar: true });
    listaCarregada.value = true;
  } catch (e) {
    if (e.codigo === 'cancelado') janela.value = '';
    else erro.value = e.message;
  } finally {
    trabalhando.value = false;
  }
}
async function escolherDaNuvem(item) {
  const lido = await executar(() => abrirBackupNuvem(provedorDaLista.value, item));
  if (lido) {
    fecharJanela();
    arq.value = lido;
  }
}
async function excluirCopia(item) {
  if (!(await confirmar({
    titulo: 'Excluir esta cópia?',
    texto: 'A exclusão só será liberada depois de recuperar outra cópia em um banco de teste, sem alterar seus dados.',
    acao: 'Excluir cópia',
  }))) return;
  trabalhando.value = true;
  erro.value = '';
  try {
    await excluirBackupNuvem(provedorDaLista.value, item);
    listaNuvem.value = listaNuvem.value.filter((copia) => copia.id !== item.id);
    avisar('Cópia excluída. Outra cópia recuperável foi preservada.', { tipo: 'ok' });
  } catch (e) {
    erro.value = e.message;
  } finally {
    trabalhando.value = false;
  }
}
async function restaurarAgora({ dados, modo }) {
  erro.value = ''; trabalhando.value = true;
  try { await restaurar(dados, modo); avisar('Backup restaurado.', { tipo: 'ok' }); await recarregarApp(); }
  catch (e) { erro.value = e.message; } finally { trabalhando.value = false; }
}
async function desfazer() {
  erro.value = ''; trabalhando.value = true;
  try { await desfazerRestauracao(); await recarregarApp(); } catch (e) { erro.value = e.message; } finally { trabalhando.value = false; }
}
onMounted(async () => { copiaEm.value = await temCopiaDeSeguranca(); });
</script>

<template>
  <div class="pagina" :class="{ embutido }">
    <h1 v-if="!embutido" class="titulo-pagina">Dados e backup</h1>
    <h3 v-else class="titulo-secao">Backup</h3>

    <div class="grupo">
      <div class="linha"><span>Último backup</span><strong>{{ ultimoBackup }}</strong></div>
      <label class="linha">
        <span>Lembrar de fazer backup</span>
        <select v-model="configBackup.intervalo" @change="salvarConfig">
          <option v-for="intervalo in INTERVALOS" :key="intervalo.id" :value="intervalo.id">{{ intervalo.rotulo }}</option>
        </select>
      </label>
    </div>
    <p v-if="destacar && configBackup.intervalo !== 'desligado'" class="dica">Hora do backup: já faz {{ Math.floor(diasDesdeUltimo()) }} dia(s).</p>
    <p v-if="riscoArmazenamento" class="faixa alerta" role="alert"><TriangleAlert :size="18" />{{ riscoArmazenamento }}</p>
    <p v-if="erro && !janela && !arq" class="faixa erro" role="alert"><TriangleAlert :size="18" />{{ erro }}</p>
    <p v-if="msg" class="faixa" role="status"><ShieldCheck :size="18" />{{ msg }}</p>

    <div class="acoes">
      <button type="button" class="botao primario" :disabled="emOperacao" @click="abrirJanela('salvar')">Fazer backup</button>
      <button type="button" class="botao secundario" :disabled="emOperacao" @click="abrirJanela('restaurar')">Restaurar</button>
    </div>
    <p class="dica">
      {{ configBackup.criptografar
        ? 'O backup é protegido. Para abrir a cópia, use a senha de acesso ou o código de recuperação.'
        : 'A criptografia está desligada. Quem tiver o arquivo poderá ler seus dados financeiros.' }}
      <AjudaSecao titulo="Opções de backup" :texto="['O lembrete aparece ao abrir ou voltar ao app. Você confirma o backup no último destino utilizado.', 'Se perder a senha e o código de recuperação, não será possível abrir uma cópia protegida.']" />
    </p>

    <div v-for="[id, provedor] in provedores" :key="id" class="provedor" :data-prov="id">
      <div class="grupo">
        <div class="linha">
          <span>{{ provedor.nome }}</span>
          <strong>{{ estadoNuvem[id].precisaReconectar ? 'Reconectar' : estadoNuvem[id].conectado ? 'Conectado' : 'Desconectado' }}</strong>
        </div>
        <button v-if="estadoNuvem[id].conectado" type="button" class="linha link" :disabled="emOperacao" @click="abrirCopias(id)">
          <span>Ver as cópias guardadas</span><ChevronRight :size="18" aria-hidden="true" />
        </button>
      </div>
      <button v-if="estadoNuvem[id].conectado && !estadoNuvem[id].precisaReconectar" type="button" class="botao" :disabled="emOperacao" @click="desconectar(id)">Desconectar</button>
      <button v-else type="button" class="botao" :disabled="emOperacao" @click="conectar(id)">{{ estadoNuvem[id].precisaReconectar ? 'Reconectar' : 'Conectar' }}</button>
      <p v-if="estadoNuvem[id].precisaReconectar" class="dica">
        <button type="button" class="link-texto" :disabled="emOperacao" @click="desconectar(id)">Desconectar {{ provedor.nome }}</button>
      </p>
      <p v-if="id === 'google'" class="faixa" data-drive-oculto>
        <Info :size="18" aria-hidden="true" />
        <span>As cópias novas ficam numa área oculta do Google Drive. O Dagda testa cada envio antes de remover cópias antigas para manter até quatro. Se o teste falhar, preserva as cópias existentes.</span>
      </p>
      <p v-if="estadoNuvem[id].conectado && estadoNuvem[id].avisoRetencao" class="dica" role="status">{{ estadoNuvem[id].avisoRetencao }}</p>
    </div>

    <details class="grupo">
      <summary>Opções de backup</summary>
      <label class="linha"><span>Cifrar com a senha de acesso</span>
        <input v-model="configBackup.criptografar" type="checkbox" @change="salvarConfig" />
      </label>
      <AvisoSenha v-if="configBackup.criptografar" />
      <p class="dica detalhe">Proteção contra limpeza do navegador: <b>{{ estadoArmazenamento.persistente === true ? 'ativa' : estadoArmazenamento.persistente === false ? 'não concedida' : 'indisponível' }}</b><span v-if="estadoArmazenamento.usoMB != null"> · {{ estadoArmazenamento.usoMB }} MB em uso</span>.</p>
    </details>

    <Modal :aberto="!!janela" :titulo="janela === 'salvar' ? 'Fazer backup' : janela === 'copias' ? 'Cópias guardadas' : 'Restaurar'" @fechar="fecharJanela">
      <div class="conteudo-janela">
        <p v-if="erro" class="faixa erro" role="alert"><TriangleAlert :size="18" />{{ erro }}</p>
        <p v-if="emOperacao" class="dica" role="status">Conferindo a operação… aguarde.</p>
        <OrigemBackup v-if="janela === 'salvar'" modo="salvar" :ocupado="emOperacao" :sub-aparelho="podeCompartilhar ? 'salvar em uma pasta ou app de nuvem' : 'baixar o arquivo .sfin'" @aparelho="salvarAparelho" @nuvem="salvarNuvem" />
        <template v-else-if="janela === 'restaurar'">
          <OrigemBackup modo="restaurar" :ocupado="emOperacao" @arquivo="abrirArquivo" @nuvem="abrirCopias" />
          <button v-if="copiaEm" type="button" class="botao" :disabled="emOperacao" @click="desfazer"><Undo2 :size="16" /> Desfazer última restauração ({{ fmt(copiaEm) }})</button>
        </template>
        <template v-else-if="janela === 'copias'">
          <p class="dica">{{ PROVEDORES[provedorDaLista]?.nome }}. Selecione uma cópia para conferir antes de restaurar.</p>
          <ListaBackups v-if="listaNuvem.length" :itens="listaNuvem" :ocupado="emOperacao" :permitir-excluir="provedorDaLista === 'google'" @selecionar="escolherDaNuvem" @excluir="excluirCopia" />
          <p v-else-if="listaCarregada" class="dica" role="status">Nenhuma cópia guardada neste serviço.</p>
          <button v-if="erro && !listaCarregada" type="button" class="botao" :disabled="emOperacao" @click="abrirCopias(provedorDaLista)">Tentar novamente</button>
        </template>
      </div>
    </Modal>
    <RestaurarBackupModal :arquivo="arq" :executando="trabalhando" :erro-executar="erro" permitir-mesclar @fechar="arq = null; erro = ''" @restaurar="restaurarAgora" />
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 640px; margin: 0 auto; display: grid; gap: 12px; }
.pagina.embutido { padding: 0; max-width: none; margin: 0; }
.titulo-pagina { font-family: var(--fonte-display); font-size: 22px; margin: 0; text-align: center; }
.titulo-secao { margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--cor-texto-suave); }
.grupo { border: 1px solid var(--cor-borda); border-radius: 20px; background: var(--cor-fundo-elevado); overflow: hidden; }
.linha { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 58px; padding: 10px 14px; font-size: 15px; }
.linha + .linha { border-top: 1px solid var(--cor-borda); }
.linha strong, select { color: var(--cor-primaria); text-align: end; font-weight: 700; }
.linha strong { overflow-wrap: anywhere; }
select { min-width: 0; max-width: 50%; min-height: 44px; background: var(--cor-fundo-elevado); border: 0; font-family: inherit; }
input[type='checkbox'] { width: 22px; height: 22px; accent-color: var(--cor-primaria); }
.acoes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.botao, .link, .link-texto { background: none; color: var(--cor-texto); font-family: inherit; cursor: pointer; }
.botao { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 50px; padding: 8px 12px; border: 1px solid var(--cor-borda); border-radius: 15px; font-size: 15px; font-weight: 700; }
.botao.primario { background: var(--cor-primaria); color: var(--cor-sobre-cor); border-color: var(--cor-primaria); }
.botao.secundario { color: var(--cor-primaria); border-color: var(--cor-primaria); }
.link { width: 100%; border: 0; text-align: start; }
.provedor > .botao { color: var(--cor-texto-suave); }
.link:hover:not(:disabled) { background: var(--cor-realce); }
.link svg, .faixa svg { flex: none; }
.link-texto { border: 0; padding: 0; text-decoration: underline; min-height: 44px; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible, summary:focus-visible, select:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: -3px; }
.provedor, .conteudo-janela { display: grid; gap: 10px; }
.faixa { display: flex; gap: 10px; align-items: flex-start; margin: 0; padding: 12px 14px; border-radius: 14px; font-size: 13px; line-height: 1.45; background: var(--cor-realce); }
.faixa.alerta { border: 1px solid var(--cor-amarelo); }
.faixa.erro { border: 1px solid var(--cor-grave, var(--cor-saida)); color: var(--cor-grave, var(--cor-saida)); }
.dica { margin: 0; font-size: 13px; line-height: 1.5; color: var(--cor-texto-suave); }
summary { padding: 14px; min-height: 44px; font-size: 14px; cursor: pointer; }
.detalhe { padding: 8px 14px 14px; }
</style>
