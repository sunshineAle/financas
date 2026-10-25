<script setup>
// Dados e backup (anotação 34): MESMA estrutura do Restaurar do login. Fazer backup e Restaurar usam os dois botões
// "Deste aparelho" e "Conectar nuvem" (só Google Drive, OneDrive e Dropbox; nuvem sem chave fica oculta). Formato: CONTRATO-SFIN.md.
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ShieldCheck, TriangleAlert, Undo2, CloudUpload, Unlink } from 'lucide-vue-next';
import CardPadrao from '../components/CardPadrao.vue';
import OrigemBackup from '../components/OrigemBackup.vue';
import NuvemLogo from '../components/NuvemLogo.vue';
import AvisoSenha from '../components/AvisoSenha.vue';
import {
  configBackup, salvarConfig, INTERVALOS, suporte, ocupado, textoUltimoBackup, diasDesdeUltimo, backupDevido,
  baixar, compartilhar, lerArquivo, previa, restaurar, desfazerRestauracao, temCopiaDeSeguranca, recarregarApp,
  PROVEDORES, estadoNuvem, enviarNuvem, listarBackupsNuvem, abrirBackupNuvem,
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

async function executar(fn, ok) {
  erro.value = ''; msg.value = '';
  try { const r = await fn(); if (r === undefined) return; msg.value = ok(r); avisar(msg.value, { tipo: 'ok' }); }
  catch (e) { if (e && (e.name === 'AbortError' || e.codigo === 'cancelado')) return; erro.value = (e && e.message) || 'Não foi possível concluir.'; }
}
// Deste aparelho: no celular abre o "Salvar em" (Drive, OneDrive, Dropbox ou outra pasta); no PC baixa o arquivo.
const salvarAparelho = () => executar(podeCompartilhar ? compartilhar : baixar, (n) => (podeCompartilhar ? 'Backup pronto para salvar.' : `Arquivo ${n} gerado.`));
const conectadas = computed(() => Object.keys(PROVEDORES).filter((id) => PROVEDORES[id].configurado() && estadoNuvem[id].conectado));
const salvarNuvem = (id) => executar(async () => {
  if (!estadoNuvem[id].conectado || estadoNuvem[id].precisaReconectar) await conectarNuvem(id);
  configBackup.ultimoDestino = id; salvarConfig();
  return enviarNuvem(id);
}, (n) => `Backup enviado ao ${PROVEDORES[id].nome} (${n}).`);
async function desconectar(id) { await desconectarNuvem(id); if (configBackup.ultimoDestino === id) { configBackup.ultimoDestino = null; salvarConfig(); } }
const fmt = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

function mudou() { salvarConfig(); }
const semCripto = computed(() => !configBackup.criptografar);

// ---- restaurar ----
const arq = ref(null); const senhaArq = ref(''); const pre = ref(null); const modo = ref('substituir');
const trabalhando = ref(false); const copiaEm = ref(null);
const listaNuvem = ref([]); const listaDe = ref('');
async function abrirArquivo(f) {
  erro.value = ''; pre.value = null; arq.value = null; listaNuvem.value = [];
  try { await aceitarLido(await lerArquivo(f)); } catch (e) { erro.value = e.message; }
}
async function aceitarLido(lido) {
  erro.value = ''; pre.value = null; arq.value = lido; senhaArq.value = '';
  if (!lido.cifrado) await verPrevia();
}
const restaurarNuvem = (id) => executar(async () => {
  if (!estadoNuvem[id].conectado || estadoNuvem[id].precisaReconectar) await conectarNuvem(id);
  listaNuvem.value = await listarBackupsNuvem(id); listaDe.value = id;
  if (!listaNuvem.value.length) throw new Error(`Não há backups do app no ${PROVEDORES[id].nome}.`);
  return undefined;
}, () => '');
const escolherDaNuvem = (item) => executar(async () => { const lido = await abrirBackupNuvem(listaDe.value, item); listaNuvem.value = []; await aceitarLido(lido); return undefined; }, () => '');
async function verPrevia() {
  erro.value = ''; trabalhando.value = true;
  try { pre.value = await previa(arq.value.env, senhaArq.value); } catch (e) { erro.value = e.message; } finally { trabalhando.value = false; }
}
async function restaurarAgora() {
  erro.value = ''; trabalhando.value = true;
  try { await restaurar(pre.value.dados, modo.value); avisar('Backup restaurado.', { tipo: 'ok' }); await recarregarApp(); }
  catch (e) { erro.value = e.message; } finally { trabalhando.value = false; }
}
async function desfazer() {
  erro.value = ''; trabalhando.value = true;
  try { await desfazerRestauracao(); await recarregarApp(); } catch (e) { erro.value = e.message; } finally { trabalhando.value = false; }
}
const rotulosTabela = { contas: 'contas', cartoes: 'cartões', transacoes: 'transações', dividas: 'dívidas', lancamentos_cartao: 'compras no cartão', metas_reserva: 'metas', categorias_orcamento: 'categorias de saída', categorias_receita: 'categorias de entrada', investimentos_conectados: 'investimentos' };
const resumo = computed(() => pre.value ? Object.entries(pre.value.contagens).filter(([, n]) => n).map(([t, n]) => `${n} ${rotulosTabela[t] || t.replace(/_/g, ' ')}`) : []);
const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

onMounted(async () => { copiaEm.value = await temCopiaDeSeguranca(); });
</script>

<template>
  <div class="pagina" :class="{ embutido }">
    <h1 v-if="!embutido" class="titulo-pagina">Dados e backup</h1>

    <p v-if="riscoArmazenamento" class="faixa alerta" role="alert"><TriangleAlert :size="18" /><span>{{ riscoArmazenamento }}</span></p>
    <p v-if="erro" class="faixa erro" role="alert"><TriangleAlert :size="18" /><span>{{ erro }}</span></p>
    <p v-if="msg" class="faixa ok"><ShieldCheck :size="18" /><span>{{ msg }}</span></p>

    <CardPadrao titulo="Fazer backup" :subtitulo="textoUltimoBackup()">
      <p v-if="destacar && configBackup.intervalo !== 'desligado'" class="dica forte">Hora do backup: já faz {{ Math.floor(diasDesdeUltimo()) }} dia(s).</p>
      <OrigemBackup modo="salvar" :ocupado="ocupado || !!estadoNuvem.ocupado" :sub-aparelho="podeCompartilhar ? 'salvar em uma pasta ou app de nuvem' : 'baixar o arquivo .sfin'" @aparelho="salvarAparelho" @nuvem="salvarNuvem" />
      <ul v-if="conectadas.length" class="conectadas">
        <li v-for="id in conectadas" :key="id" :data-prov="id">
          <NuvemLogo :id="id" :tamanho="22" />
          <span><b>{{ PROVEDORES[id].nome }}</b><small>{{ estadoNuvem[id].ultimoEnvio ? 'último envio ' + fmt(estadoNuvem[id].ultimoEnvio) : 'conectado' }}<template v-if="estadoNuvem[id].ultimoErro"> · erro: {{ estadoNuvem[id].ultimoErro.mensagem }}</template></small></span>
          <button type="button" class="icone-b" :aria-label="'Enviar agora ao ' + PROVEDORES[id].nome" :disabled="!!estadoNuvem.ocupado" @click="salvarNuvem(id)"><CloudUpload :size="18" /></button>
          <button type="button" class="icone-b" :aria-label="'Desconectar ' + PROVEDORES[id].nome" @click="desconectar(id)"><Unlink :size="18" /></button>
        </li>
      </ul>
    </CardPadrao>

    <CardPadrao id="sec-restaurar" titulo="Restaurar backup" subtitulo="Substitui ou mescla com os dados deste aparelho">
      <OrigemBackup modo="restaurar" :ocupado="trabalhando || !!estadoNuvem.ocupado" @arquivo="abrirArquivo" @nuvem="restaurarNuvem" />
      <ul v-if="listaNuvem.length" class="lista-n">
        <li v-for="i in listaNuvem" :key="i.id"><button type="button" data-backup-item @click="escolherDaNuvem(i)"><span>{{ i.nome }}</span><small>{{ kb(i.tamanho) }}</small></button></li>
      </ul>
      <p v-if="arq" class="dica">Arquivo: <b>{{ arq.nome }}</b></p>
      <template v-if="arq && arq.cifrado">
        <label class="campo-col"><span>Senha do backup ou código de recuperação</span><input v-model="senhaArq" type="password" autocomplete="off" @keyup.enter="verPrevia" /></label>
        <div class="linha-botoes"><button type="button" class="b-sec" :disabled="!senhaArq || trabalhando" @click="verPrevia">Abrir backup</button></div>
      </template>
      <div v-if="pre" class="previa">
        <b>Este backup contém</b>
        <ul><li v-for="r in resumo" :key="r">{{ r }}</li><li v-if="!resumo.length">Nenhum registro</li></ul>
        <small>Criado em {{ fmt(pre.criado_em) }}</small>
        <div class="modo">
          <label><input v-model="modo" type="radio" value="substituir" /> <b>Substituir</b> os dados deste aparelho (guarda uma cópia de segurança antes)</label>
          <label><input v-model="modo" type="radio" value="mesclar" /> <b>Mesclar</b>: junta com o que já existe (vale o registro mais recente)</label>
        </div>
        <button type="button" class="b-prim" :disabled="trabalhando || ocupado" @click="restaurarAgora">{{ trabalhando ? 'Restaurando…' : 'Restaurar agora' }}</button>
      </div>
      <button v-if="copiaEm" type="button" class="b-sec" :disabled="trabalhando" @click="desfazer"><Undo2 :size="16" /> Desfazer última restauração ({{ fmt(copiaEm) }})</button>
    </CardPadrao>

    <CardPadrao titulo="Lembrete e criptografia">
      <label class="campo-linha"><span>Lembrar de fazer backup</span>
        <select v-model="configBackup.intervalo" @change="mudou"><option v-for="i in INTERVALOS" :key="i.id" :value="i.id">{{ i.rotulo }}</option></select>
      </label>
      <label v-if="conectadas.length" class="campo-linha"><span>Enviar sozinho à nuvem quando der a hora</span>
        <input v-model="configBackup.automatico" type="checkbox" @change="mudou" />
      </label>
      <label v-if="conectadas.length" class="campo-linha"><span>Backups mantidos na nuvem</span>
        <select v-model.number="configBackup.manter" @change="mudou"><option :value="5">5</option><option :value="10">10</option><option :value="30">30</option></select>
      </label>
      <label class="campo-linha"><span>Cifrar com a senha de acesso</span>
        <input v-model="configBackup.criptografar" type="checkbox" @change="mudou" />
      </label>
      <p v-if="semCripto" class="dica alerta-txt">Sem criptografia, quem tiver o arquivo lê todos os seus dados financeiros. Recomendamos manter ligada.</p>
      <AvisoSenha v-else />
    </CardPadrao>

    <p class="dica rodape-arm">Proteção contra limpeza do navegador: <b>{{ estadoArmazenamento.persistente === true ? 'ativa' : estadoArmazenamento.persistente === false ? 'não concedida' : 'indisponível' }}</b><span v-if="estadoArmazenamento.usoMB != null"> · {{ estadoArmazenamento.usoMB }} MB em uso</span>.<span v-if="estadoArmazenamento.persistente !== true"> Instale o app e mantenha backups em dia.</span></p>
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
.pagina.embutido { padding: 0; max-width: none; margin: 0; }
.titulo-pagina { font-family: var(--fonte-display); font-size: 22px; margin: 0; text-align: center; }
.faixa { display: flex; gap: 10px; align-items: flex-start; margin: 0; padding: 12px 14px; border-radius: 12px; font-size: 14px; line-height: 1.4; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado); }
.faixa.alerta { border-color: var(--cor-amarelo); }
.faixa.erro { border-color: var(--cor-grave, var(--cor-saida)); color: var(--cor-grave, var(--cor-saida)); }
.faixa.ok { border-color: var(--cor-investimento); }
.dica { margin: 0 0 8px; font-size: 13.5px; line-height: 1.5; color: var(--cor-texto-suave); }
.dica.forte { color: var(--cor-texto); font-weight: 600; }
.alerta-txt { color: var(--cor-amarelo); }
.linha-botoes { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.b-sec, .b-prim { min-height: 44px; padding: 0 16px; border-radius: 12px; font-family: var(--fonte-texto); font-size: 14.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
.b-sec { background: none; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.b-prim { border: none; background: var(--cor-primaria); color: var(--cor-sobre-cor); margin-top: 10px; }
.b-sec:disabled, .b-prim:disabled { opacity: 0.5; cursor: default; }
.campo-linha { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; font-size: 14.5px; }
.campo-linha input[type='checkbox'] { width: 22px; height: 22px; accent-color: var(--cor-primaria); }
select, .campo-col input { font-family: var(--fonte-texto); font-size: 14.5px; padding: 8px 10px; min-height: 40px; border-radius: 10px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); }
.campo-col { display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 500; margin-bottom: 8px; }
.previa { margin: 8px 0; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--cor-borda); font-size: 14px; display: flex; flex-direction: column; gap: 6px; }
.previa ul { margin: 0; padding-left: 18px; }
.previa small { color: var(--cor-texto-suave); }
.modo { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
.modo label { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; line-height: 1.4; }
.lista-pasta { list-style: none; padding: 0; margin: 0 0 8px; display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow: auto; }
.lista-pasta button { width: 100%; text-align: left; min-height: 40px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); font-size: 13.5px; cursor: pointer; }
.indices { list-style: none; margin: 0 0 8px; padding: 0; }
.indices li { display: flex; align-items: baseline; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--cor-borda); font-size: 14px; }
.indices li:last-child { border-bottom: none; }
.indices li span { flex: 1; color: var(--cor-texto-suave); }
.indices small { font-weight: 400; color: var(--cor-texto-suave); }
.indices em { font-style: normal; font-size: 11px; padding: 1px 6px; border-radius: 999px; background: var(--cor-realce); color: var(--cor-texto-suave); }
.conectadas { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.conectadas li { display: flex; align-items: center; gap: 10px; padding: 6px 4px 6px 10px; border-radius: 12px; border: 1px solid var(--cor-borda); }
.conectadas li > span { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.conectadas b { font-size: 14px; }
.conectadas small { font-size: 12px; color: var(--cor-texto-suave); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icone-b { width: 40px; height: 40px; border-radius: 10px; border: none; background: none; color: var(--cor-texto-suave); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.icone-b:hover:not(:disabled) { background: var(--cor-realce); color: var(--cor-texto); }
.lista-n { list-style: none; padding: 0; margin: 10px 0 0; display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow: auto; }
.lista-n button { width: 100%; display: flex; justify-content: space-between; gap: 8px; text-align: left; min-height: 40px; align-items: center; padding: 0 10px; border-radius: 10px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); font-size: 13.5px; cursor: pointer; }
.lista-n small { color: var(--cor-texto-suave); }
.rodape-arm { text-align: center; font-size: 12px; }
#sec-restaurar :deep(.origem), .previa { margin-bottom: 8px; }
</style>
