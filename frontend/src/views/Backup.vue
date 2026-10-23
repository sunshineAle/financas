<script setup>
// Backup e segurança: gerar .sfin (baixar, salvar na pasta da nuvem, compartilhar), lembretes, restaurar,
// risco de limpeza de cache, bloqueio do app e índices do Bacen. Formato: CONTRATO-SFIN.md.
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { Download, FolderUp, Share2, FolderCog, ShieldCheck, TriangleAlert, Undo2, RefreshCw, Lock, KeyRound } from 'lucide-vue-next';
import CardPadrao from '../components/CardPadrao.vue';
import BarraAcoes from '../components/BarraAcoes.vue';
import BotaoAcao from '../components/BotaoAcao.vue';
import AlterarSenhaAcesso from '../components/AlterarSenhaAcesso.vue';
import {
  configBackup, salvarConfig, INTERVALOS, estadoPasta, suporte, ocupado, textoUltimoBackup, diasDesdeUltimo, backupDevido,
  baixar, compartilhar, salvarNaPasta, escolherPasta, esquecerPasta, carregarPasta, listarDaPasta,
  lerArquivo, previa, restaurar, desfazerRestauracao, temCopiaDeSeguranca, recarregarApp,
} from '../services/backup.js';
import { estadoArmazenamento, riscoArmazenamento } from '../services/armazenamento.js';
import { modoPWA, bloquear, minutosAutoBloqueio, definirAutoBloqueio } from '../services/acesso.js';
import { SERIES, getSerie, atualizar, estadoBacen, ultimaAtualizacao, DATA_SNAPSHOT } from '../services/bacen.js';
import { avisar } from '../services/avisos.js';

// `embutido`: usada dentro do Perfil e configurações (sem título; Segurança e Índices ficam no Perfil).
const props = defineProps({ embutido: { type: Boolean, default: false } });
const route = useRoute();
const msg = ref(''); const erro = ref('');
const destacar = computed(() => route.query.fazer === '1' || backupDevido());
const podeCompartilhar = suporte.compartilhar();

async function executar(fn, ok) {
  erro.value = ''; msg.value = '';
  try { const nome = await fn(); msg.value = ok(nome); avisar(msg.value, { tipo: 'ok' }); }
  catch (e) { if (e && e.name === 'AbortError') return; erro.value = (e && e.message) || 'Não foi possível concluir.'; }
}
const fazerBaixar = () => executar(baixar, (n) => `Arquivo ${n} gerado.`);
const fazerPasta = () => executar(async () => { if (!estadoPasta.nome) await escolherPasta(); return salvarNaPasta(); }, (n) => `Backup salvo na pasta "${estadoPasta.nome}" (${n}).`);
const fazerCompartilhar = () => executar(compartilhar, () => 'Backup compartilhado.');
const trocarPasta = () => executar(escolherPasta, (n) => `Pasta "${n}" vinculada.`);

const semCripto = computed(() => !configBackup.criptografar);
function mudou() { salvarConfig(); }
const abrirSenha = ref(false);
const autoMin = ref(minutosAutoBloqueio());
function mudarAuto() { definirAutoBloqueio(Number(autoMin.value)); }

// ---- restaurar ----
const arq = ref(null); const senhaArq = ref(''); const pre = ref(null); const modo = ref('substituir');
const trabalhando = ref(false); const copiaEm = ref(null); const daPasta = ref([]);
async function escolherArq(ev) {
  erro.value = ''; pre.value = null; arq.value = null;
  const f = ev.target.files && ev.target.files[0]; if (!f) return;
  await abrirArquivo(f);
}
async function abrirArquivo(f) {
  try { arq.value = await lerArquivo(f); if (!arq.value.cifrado) await verPrevia(); } catch (e) { erro.value = e.message; }
}
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
async function verPasta() {
  erro.value = '';
  try { daPasta.value = await listarDaPasta(); if (!daPasta.value.length) erro.value = 'Não há arquivos .sfin nesta pasta.'; } catch (e) { erro.value = e.message; }
}
async function usarDaPasta(i) { daPasta.value = []; await abrirArquivo(i.file); }
const rotulosTabela = { contas: 'contas', cartoes: 'cartões', transacoes: 'transações', dividas: 'dívidas', lancamentos_cartao: 'compras no cartão', metas_reserva: 'metas', categorias_orcamento: 'categorias de saída', categorias_receita: 'categorias de entrada', investimentos_conectados: 'investimentos' };
const resumo = computed(() => pre.value ? Object.entries(pre.value.contagens).filter(([, n]) => n).map(([t, n]) => `${n} ${rotulosTabela[t] || t.replace(/_/g, ' ')}`) : []);

// ---- Bacen ----
const indices = ref([]);
const fmtData = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
async function carregarIndices() {
  const out = [];
  for (const id of ['selic_meta', 'cdi_diaria', 'ipca_mensal', 'ipca_12m']) {
    const s = await getSerie(id);
    const u = s.dados[s.dados.length - 1];
    out.push({ id, nome: s.nome, unidade: s.unidade, valor: u ? u.valor : null, data: u ? u.data : null, origem: s.origem });
  }
  indices.value = out;
}
async function atualizarAgora() { await atualizar({ forcar: true }); await carregarIndices(); }
const fmtNum = (v) => v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

onMounted(async () => {
  await carregarPasta();
  copiaEm.value = await temCopiaDeSeguranca();
  await ultimaAtualizacao();
  await carregarIndices();
  if (route.query.restaurar === '1') document.getElementById('sec-restaurar')?.scrollIntoView({ behavior: 'smooth' });
});
</script>

<template>
  <div class="pagina" :class="{ embutido }">
    <h1 v-if="!embutido" class="titulo-pagina">Backup e segurança</h1>

    <p v-if="riscoArmazenamento" class="faixa alerta" role="alert"><TriangleAlert :size="18" /><span>{{ riscoArmazenamento }}</span></p>
    <p v-if="erro" class="faixa erro" role="alert"><TriangleAlert :size="18" /><span>{{ erro }}</span></p>
    <p v-if="msg" class="faixa ok"><ShieldCheck :size="18" /><span>{{ msg }}</span></p>

    <CardPadrao titulo="Fazer backup agora" :subtitulo="textoUltimoBackup()">
      <p v-if="destacar && configBackup.intervalo !== 'desligado'" class="dica forte">Hora do backup: já faz {{ Math.floor(diasDesdeUltimo()) }} dia(s).</p>
      <p class="dica">O backup é um arquivo <b>.sfin</b> com todos os seus dados, {{ semCripto ? 'sem criptografia' : 'cifrado com a sua senha de acesso' }}. Guarde-o numa pasta da sua nuvem (Drive, OneDrive, Proton, Mega).</p>
      <template #rodape>
        <BarraAcoes compacto>
          <BotaoAcao compacto :icone="FolderUp" :rotulo="estadoPasta.nome ? 'Salvar na pasta' : 'Escolher pasta'" tema="investimento" :destaque="destacar" :disabled="!suporte.pasta || ocupado" :titulo="suporte.pasta ? '' : 'Este navegador não permite escolher pasta'" @click="fazerPasta" />
          <BotaoAcao compacto :icone="Download" rotulo="Baixar arquivo" tema="entrada" :disabled="ocupado" @click="fazerBaixar" />
          <BotaoAcao v-if="podeCompartilhar" compacto :icone="Share2" rotulo="Compartilhar" tema="meta" :disabled="ocupado" @click="fazerCompartilhar" />
        </BarraAcoes>
      </template>
    </CardPadrao>

    <CardPadrao titulo="Pasta da nuvem">
      <p v-if="estadoPasta.nome" class="dica">Pasta vinculada: <b>{{ estadoPasta.nome }}</b> <span v-if="estadoPasta.permissao && estadoPasta.permissao !== 'granted'">(o navegador vai pedir permissão no próximo backup)</span></p>
      <p v-else class="dica">Nenhuma pasta vinculada. Escolha uma pasta que a sua nuvem sincroniza e o app salva os arquivos lá.</p>
      <div class="linha-botoes">
        <button v-if="suporte.pasta" type="button" class="b-sec" @click="trocarPasta"><FolderCog :size="16" /> {{ estadoPasta.nome ? 'Trocar pasta' : 'Escolher pasta' }}</button>
        <button v-if="estadoPasta.nome" type="button" class="b-sec" @click="esquecerPasta">Desvincular</button>
      </div>
      <p v-if="!suporte.pasta" class="dica">Este navegador não permite gravar numa pasta. Use "Baixar arquivo" (e mova para a nuvem) ou "Compartilhar".</p>
    </CardPadrao>

    <CardPadrao titulo="Lembrete e criptografia">
      <label class="campo-linha"><span>Lembrar de fazer backup</span>
        <select v-model="configBackup.intervalo" @change="mudou"><option v-for="i in INTERVALOS" :key="i.id" :value="i.id">{{ i.rotulo }}</option></select>
      </label>
      <label class="campo-linha"><span>Salvar sozinho na pasta quando der a hora</span>
        <input v-model="configBackup.automatico" type="checkbox" :disabled="!estadoPasta.nome" @change="mudou" />
      </label>
      <label class="campo-linha"><span>Backups mantidos na pasta</span>
        <select v-model.number="configBackup.manter" @change="mudou"><option :value="5">5</option><option :value="10">10</option><option :value="30">30</option></select>
      </label>
      <label class="campo-linha"><span>Cifrar com a senha de acesso</span>
        <input v-model="configBackup.criptografar" type="checkbox" @change="mudou" />
      </label>
      <p v-if="semCripto" class="dica alerta-txt">Sem criptografia, quem tiver o arquivo lê todos os seus dados financeiros. Recomendamos manter ligada.</p>
      <p class="dica">Quando o app abre (ou volta ao primeiro plano) e passou o prazo, ele avisa. Se houver pasta com permissão, salva sozinho.</p>
    </CardPadrao>

    <CardPadrao id="sec-restaurar" titulo="Restaurar backup" subtitulo="Substitui ou mescla com os dados deste aparelho">
      <label class="campo-col"><span>Arquivo .sfin</span><input type="file" accept=".sfin,application/octet-stream" @change="escolherArq" /></label>
      <div v-if="estadoPasta.nome" class="linha-botoes"><button type="button" class="b-sec" @click="verPasta">Escolher da pasta "{{ estadoPasta.nome }}"</button></div>
      <ul v-if="daPasta.length" class="lista-pasta"><li v-for="i in daPasta" :key="i.nome"><button type="button" @click="usarDaPasta(i)">{{ i.nome }}</button></li></ul>
      <template v-if="arq && arq.cifrado">
        <label class="campo-col"><span>Senha usada no backup</span><input v-model="senhaArq" type="password" autocomplete="off" @keyup.enter="verPrevia" /></label>
        <div class="linha-botoes"><button type="button" class="b-sec" :disabled="!senhaArq || trabalhando" @click="verPrevia">Abrir backup</button></div>
      </template>
      <div v-if="pre" class="previa">
        <b>Este backup contém</b>
        <ul><li v-for="r in resumo" :key="r">{{ r }}</li><li v-if="!resumo.length">Nenhum registro</li></ul>
        <small>Criado em {{ fmtData(pre.criado_em) }}</small>
        <div class="modo">
          <label><input v-model="modo" type="radio" value="substituir" /> <b>Substituir</b> os dados deste aparelho (guarda uma cópia de segurança antes)</label>
          <label><input v-model="modo" type="radio" value="mesclar" /> <b>Mesclar</b>: junta com o que já existe (vale o registro mais recente)</label>
        </div>
        <button type="button" class="b-prim" :disabled="trabalhando || ocupado" @click="restaurarAgora">{{ trabalhando ? 'Restaurando…' : 'Restaurar agora' }}</button>
      </div>
      <button v-if="copiaEm" type="button" class="b-sec" :disabled="trabalhando" @click="desfazer"><Undo2 :size="16" /> Desfazer última restauração ({{ fmtData(copiaEm) }})</button>
    </CardPadrao>

    <CardPadrao titulo="Armazenamento do aparelho">
      <p class="dica">Proteção contra limpeza do navegador: <b>{{ estadoArmazenamento.persistente === true ? 'ativa' : estadoArmazenamento.persistente === false ? 'não concedida' : 'indisponível neste navegador' }}</b>.
        <span v-if="estadoArmazenamento.usoMB != null"> Em uso: {{ estadoArmazenamento.usoMB }} MB.</span></p>
      <p v-if="estadoArmazenamento.persistente !== true" class="dica">Instale o app na tela inicial (menu do navegador → Instalar) e mantenha backups em dia.</p>
    </CardPadrao>

    <CardPadrao v-if="modoPWA && !embutido" titulo="Segurança do app">
      <label class="campo-linha"><span>Bloquear ao ficar fora do app por</span>
        <select v-model.number="autoMin" @change="mudarAuto"><option :value="0">Nunca</option><option :value="1">1 min</option><option :value="5">5 min</option><option :value="15">15 min</option><option :value="60">1 hora</option></select>
      </label>
      <div class="linha-botoes"><button type="button" class="b-sec" @click="bloquear"><Lock :size="16" /> Bloquear agora</button><button type="button" class="b-sec" @click="abrirSenha = true"><KeyRound :size="16" /> Alterar senha de acesso</button></div>
      <AlterarSenhaAcesso :aberto="abrirSenha" @fechar="abrirSenha = false" />
    </CardPadrao>

    <CardPadrao v-if="!embutido" titulo="Índices do Banco Central" :subtitulo="estadoBacen.ultima ? 'Atualizado em ' + fmtData(estadoBacen.ultima) : 'Valores de reserva (aproximados, de ' + DATA_SNAPSHOT.split('-').reverse().join('/') + ')'">
      <ul class="indices">
        <li v-for="i in indices" :key="i.id"><span>{{ i.nome }}</span><b>{{ fmtNum(i.valor) }} <small>{{ i.unidade }}</small></b><em v-if="i.origem === 'snapshot'">snapshot</em></li>
      </ul>
      <p v-if="estadoBacen.erro" class="dica">{{ estadoBacen.erro }}</p>
      <div class="linha-botoes"><button type="button" class="b-sec" :disabled="estadoBacen.atualizando" @click="atualizarAgora"><RefreshCw :size="16" /> {{ estadoBacen.atualizando ? 'Atualizando…' : 'Atualizar agora' }}</button></div>
    </CardPadrao>
  </div>
</template>

<style scoped>
.pagina { padding: 40px; max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
@media (max-width: 480px) { .pagina { padding: 20px 16px; } }
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
</style>
