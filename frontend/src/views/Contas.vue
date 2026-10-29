<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { abrirLancamento, lancamentoSalvo } from '../services/lancamento.js';
import { useRouter } from 'vue-router';
import { RefreshCw, Plus } from 'lucide-vue-next';
import Modal from '../components/Modal.vue';
import Carrossel from '../components/Carrossel.vue';
import CabecalhoPagina from '../components/CabecalhoPagina.vue';
import CardPadrao from '../components/CardPadrao.vue';
import FormularioModal from '../components/FormularioModal.vue';
import CampoTexto from '../components/CampoTexto.vue';
import CampoValor from '../components/CampoValor.vue';
import CampoSelecao from '../components/CampoSelecao.vue';
import CampoInstituicao from '../components/CampoInstituicao.vue';
import CampoBase from '../components/CampoBase.vue';
import CampoData from '../components/CampoData.vue';
import { avisar } from '../services/avisos.js';
import { aplicarOrdem, moverItem } from '../services/ordem.js';
import ContaCartao from '../components/ContaCartao.vue';
import ContaResumo from '../components/ContaResumo.vue';
import ContaAcoes from '../components/ContaAcoes.vue';
import ContaExtrato from '../components/ContaExtrato.vue';
import { conectarBanco, sincronizarTudo, textoResumo } from '../utils/openFinance.js';
import { temRecurso } from '../config/destino.js';
const temOpenFinance = temRecurso('openFinance'); // no app local (PWA) o Open Finance é opcional/futuro
import { corPorNome, corDoBanco } from '../utils/corBanco.js';
import { periodo, anoInteiro, rotuloPeriodo, ehAtual } from '../services/mes.js';

const router = useRouter();
const props = defineProps({ embutido: { type: Boolean, default: false }, fluxo: { type: Boolean, default: false } });
const emit = defineEmits(['fluxo-fim']); // fluxo: usada pelo modal de primeiro cadastro (abre só o formulário)
let salvouNoFluxo = false;

const contas = ref([]);
const carregando = ref(true);
const salvando = ref(false);
const erro = ref('');
const sel = ref(0);
const pilha = ref(false);
const coresBanco = reactive({});
const ultimas = reactive({}); // conta_id -> { descricao, valor, data }

const tipos = [
  { valor: 'corrente', rotulo: 'Conta corrente' },
  { valor: 'poupanca', rotulo: 'Poupança' },
  { valor: 'corretora', rotulo: 'Corretora (investimentos)' },
  { valor: 'dinheiro', rotulo: 'Dinheiro em espécie' },
  { valor: 'beneficio', rotulo: 'Benefício (vale alimentação, vale presente…)' },
  { valor: 'outra', rotulo: 'Outra' },
];
const rotuloTipo = (t) => ({ corrente: 'Corrente', poupanca: 'Poupança', corretora: 'Corretora', dinheiro: 'Dinheiro', beneficio: 'Benefício', outra: 'Outra' }[t] || t);

const hojeIso = () => new Date().toLocaleDateString('sv-SE');
const dataBR = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const diaMesBR = (d) => dataBR(d).slice(0, 5);
// Anotação 55: no cadastro/edição o saldo é o "Saldo inicial" (data de início + valor), lançado fora das entradas e saídas.
const formVazio = () => ({ nome: '', tipo: 'corrente', saldo: 0, saldoData: hojeIso(), icone: '🏦', cor: '' });
const formulario = ref(formVazio());
const saldoOriginal = ref(null); // { data, valor } ao abrir a edição: só envia se mudou
const erros = reactive({ nome: '' });
const categorias = ref([]);
const editandoId = ref(null);
const modalAberto = ref(false);

const conectando = ref(false);
const modalConexao = ref(null); // { ok } | { erro }
const sincronizandoId = ref(null);

import { moedaTotal } from '../services/privacidade.js';
const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (v) => formatoMoeda.format(v);
const totalContas = computed(() => contas.value.reduce((soma, c) => soma + c.saldo, 0));
const contaSel = computed(() => contas.value[sel.value] || null);

// ---- dados ----
async function carregarContas() {
  const resposta = await fetch('/api/contas', { credentials: 'include' });
  if (resposta.status === 401) { router.push('/login'); return; }
  contas.value = aplicarOrdem('contas', await resposta.json());
  if (sel.value > contas.value.length - 1) sel.value = Math.max(0, contas.value.length - 1);
  carregando.value = false;
  contas.value.forEach((c) => {
    coresBanco[c.id] = coresBanco[c.id] || corPorNome(c.nome);
    if (c.cor) coresBanco[c.id] = c.cor; else corDoBanco(c.nome, c.icone).then((cor) => { if (cor) coresBanco[c.id] = cor; });
  });
  carregarUltimas();
}
// Última transação de cada conta (uma consulta só: as mais recentes de todas as contas)
async function carregarUltimas() {
  try {
    const r = await fetch('/api/transacoes', { credentials: 'include' });
    if (!r.ok) return;
    const { transacoes } = await r.json();
    for (const t of transacoes) {
      if (t.conta_id && !ultimas[t.conta_id]) ultimas[t.conta_id] = { descricao: t.descricao, valor: t.valor, data: t.data };
    }
  } catch { /* sem a última transação o card só mostra "Sem transações" */ }
}

const transacoesConta = ref([]);
const resumoConta = ref({ entradas: 0, saidas: 0 });
const carregandoTx = ref(false);
let pedido = 0;
async function carregarExtrato() {
  const conta = contaSel.value;
  if (!conta) { transacoesConta.value = []; return; }
  const meu = ++pedido;
  carregandoTx.value = true;
  try {
    const p = periodo.value;
    const url = `/api/transacoes?contaId=${conta.id}${p.tipo === 'mes' ? `&mes=${p.chave}` : ''}`;
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok || meu !== pedido) return;
    const dados = await r.json();
    let lista = dados.transacoes;
    if (p.tipo === 'ano') lista = lista.filter((t) => String(t.data).startsWith(`${p.ano}-`));
    transacoesConta.value = lista;
    const ativas = lista.filter((t) => !t.ignorada);
    resumoConta.value = {
      entradas: ativas.filter((t) => t.valor > 0).reduce((s, t) => s + t.valor, 0),
      saidas: ativas.filter((t) => t.valor < 0).reduce((s, t) => s - t.valor, 0),
    };
  } finally {
    if (meu === pedido) carregandoTx.value = false;
  }
}
watch(() => [contaSel.value?.id, periodo.value.chave], carregarExtrato);

// ---- ações ----
function lancar() {
  if (!contaSel.value) return;
  abrirLancamento({ tipo: 'saida', contaId: contaSel.value.id }); // janela sobre esta página: Despesa e Entrada nesta conta
}
function abrirEmTransacoes() {
  if (contaSel.value) router.push({ name: 'transacoes', query: { conta: contaSel.value.id } });
}
function abrirNova() {
  editandoId.value = null;
  erro.value = '';
  formulario.value = formVazio();
  saldoOriginal.value = null;
  erros.nome = '';
  modalAberto.value = true;
}
function editar(conta) {
  editandoId.value = conta.id;
  erro.value = '';
  const temInicial = conta.saldo_inicial_data != null;
  formulario.value = {
    nome: conta.nome, tipo: conta.tipo, icone: conta.icone || '🏦', cor: conta.cor || '',
    saldo: temInicial ? Number(conta.saldo_inicial_valor) || 0 : 0, saldoData: temInicial ? conta.saldo_inicial_data : hojeIso(),
  };
  saldoOriginal.value = { data: formulario.value.saldoData, valor: formulario.value.saldo };
  erros.nome = '';
  modalAberto.value = true;
}
function cancelarEdicao() {
  editandoId.value = null;
  erro.value = '';
  modalAberto.value = false;
  formulario.value = formVazio();
}
async function salvar() {
  erro.value = '';
  erros.nome = '';
  if (!formulario.value.nome.trim()) { erros.nome = 'Informe um nome para a conta.'; return; }
  if (formulario.value.saldo && formulario.value.saldoData > hojeIso()) { erro.value = 'A data do saldo não pode ser no futuro.'; return; }
  salvando.value = true;
  try {
    const novo = !editandoId.value;
    const url = editandoId.value ? `/api/contas/${editandoId.value}` : '/api/contas';
    const resposta = await fetch(url, {
      method: editandoId.value ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        nome: formulario.value.nome,
        tipo: formulario.value.tipo,
        icone: formulario.value.icone,
        cor: formulario.value.cor || null,
        ...(saldoMudou() ? { saldoInicial: { data: formulario.value.saldoData || hojeIso(), valor: Number(formulario.value.saldo) || 0 } } : {}),
      }),
    });
    if (!resposta.ok) {
      const dados = await resposta.json();
      erro.value = dados.erro || 'Não foi possível salvar a conta.';
      return;
    }
    const salva = await resposta.json();
    salvouNoFluxo = true;
    cancelarEdicao();
    await carregarContas();
    if (novo) { const i = contas.value.findIndex((c) => c.id === salva.id); sel.value = i >= 0 ? i : 0; }
    carregarExtrato();
  } finally {
    salvando.value = false;
  }
}
function saldoMudou() {
  const o = saldoOriginal.value; const f = formulario.value;
  if (!o) return !!Number(f.saldo);
  return o.data !== f.saldoData || Number(o.valor) !== Number(f.saldo);
}
function pularSaldo() { formulario.value.saldo = 0; salvar(); }
const ehEdicaoConectada = computed(() => !!editandoId.value && contas.value.find((c) => c.id === editandoId.value)?.origem !== 'manual');

// ---- Anotação 55: Ajustar saldo (conciliação) ----
const ajuste = ref({ aberto: false, valor: 0, salvando: false, erro: '', resultado: null });
function abrirAjuste() {
  if (!contaSel.value) return;
  ajuste.value = { aberto: true, valor: Number(contaSel.value.saldo) || 0, salvando: false, erro: '', resultado: null };
}
async function salvarAjuste() {
  const conta = contaSel.value;
  if (!conta) return;
  if (ajuste.value.resultado) { ajuste.value.aberto = false; return; }
  ajuste.value.salvando = true; ajuste.value.erro = '';
  try {
    const r = await fetch(`/api/contas/${conta.id}/ajustar-saldo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saldo: Number(ajuste.value.valor) || 0 }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { ajuste.value.erro = d.erro || 'Não foi possível ajustar.'; return; }
    await carregarContas();
    carregarExtrato();
    if (!d.diferenca) { ajuste.value.aberto = false; avisar('O saldo já estava certo.', { tipo: 'ok' }); return; }
    if (d.faltando) ajuste.value.resultado = d; // mostra o aviso de lançamentos faltando, com atalho para importar
    else { ajuste.value.aberto = false; avisar(`Ajuste de saldo de ${moeda(d.diferenca)} lançado (fora das entradas e saídas).`, { tipo: 'ok' }); }
  } finally { ajuste.value.salvando = false; }
}
function importarDoAjuste() { ajuste.value.aberto = false; importar(); }

async function remover(conta) {
  if (!confirm(`Arquivar a conta "${conta.nome}"? Ela sai da lista (por enquanto não há como restaurar).`)) return;
  await fetch(`/api/contas/${conta.id}`, { method: 'DELETE', credentials: 'include' });
  await carregarContas();
  carregarExtrato();
}
async function conectarNovoBanco() {
  conectando.value = true;
  modalConexao.value = null;
  try {
    const resumo = await conectarBanco();
    if (resumo) modalConexao.value = { ok: textoResumo(resumo) };
    await carregarContas();
  } catch (e) {
    modalConexao.value = { erro: e.message };
  } finally {
    conectando.value = false;
  }
}
async function sincronizarAgora(conta) {
  sincronizandoId.value = conta.id;
  modalConexao.value = null;
  try {
    const resumo = await sincronizarTudo();
    modalConexao.value = { ok: textoResumo(resumo) };
    await carregarContas();
    carregarExtrato();
  } catch (e) {
    modalConexao.value = { erro: e.message };
  } finally {
    sincronizandoId.value = null;
  }
}

// "há 2 h", "há 3 dias"… a partir do texto de data do banco (UTC)
function haQuanto(texto) {
  if (!texto) return 'nunca';
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(texto) ? texto : texto.replace(' ', 'T') + 'Z';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (Number.isNaN(min)) return 'nunca';
  if (min < 2) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
  const d = Math.round(min / 1440);
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}
const periodoCurto = computed(() => (anoInteiro.value ? 'no ano' : ehAtual.value ? 'neste mês' : 'no mês'));

function importar() { router.push({ path: '/importar', query: { tipo: 'conta', id: contaSel.value.id } }); }
function transferir() { abrirLancamento({ tipo: 'transferencia', contaId: contaSel.value ? contaSel.value.id : '' }); }
function abrirTransacao(t) { router.push({ name: 'transacoes', query: { conta: t.conta_id } }); }
async function carregarCategorias() {
  try { const r = await fetch('/api/categorias', { credentials: 'include' }); if (r.ok) categorias.value = await r.json(); } catch { /* sem ícones personalizados */ }
}
const rotuloMes = computed(() => rotuloPeriodo.value);

watch(modalAberto, (v) => { if (props.fluxo && !v) emit('fluxo-fim', salvouNoFluxo); });
onMounted(async () => { if (props.fluxo) abrirNova(); carregarCategorias(); await carregarContas(); carregarExtrato(); });
watch(lancamentoSalvo, async () => { await carregarContas(); carregarExtrato(); }); // lançou pela janela: números da conta atualizam sem sair daqui
</script>

<template>
  <div :class="['pagina', { embutido }]">
    <CabecalhoPagina titulo="Contas" cor="var(--cor-entrada)">
      <button v-if="contaSel && contaSel.origem === 'conectada'" type="button" class="icone-topo" aria-label="Sincronizar contas conectadas" title="Sincronizar" :disabled="!!sincronizandoId" @click="contaSel && sincronizarAgora(contaSel)">
        <RefreshCw :size="18" :stroke-width="1.9" :class="{ gira: sincronizandoId }" />
      </button>
      <template #corpo>
        <div v-deslizar-mes class="conteudo-mes">
          <div v-if="modalConexao || conectando" class="caixa-modal">
            <p v-if="conectando" class="nota">Conectando…</p>
            <p v-else-if="modalConexao.erro" class="mensagem-erro">{{ modalConexao.erro }}</p>
            <p v-else class="nota">{{ modalConexao.ok }}</p>
            <button v-if="modalConexao" type="button" class="botao-secundario" @click="modalConexao = null">Fechar</button>
          </div>

          <button v-if="!carregando && contas.length === 0" type="button" class="cartao-fantasma" @click="abrirNova">
            <span class="mais" aria-hidden="true"><Plus :size="26" :stroke-width="2" /></span>
            <span class="txt">Adicione sua primeira conta</span>
          </button>

          <div v-else-if="contas.length" class="corpo" :class="{ pilha }">
            <div class="area-carr">
              <Carrossel
                v-model:indice="sel"
                v-model:empilhado="pilha"
                :itens="contas"
                :chave="(c) => c.id"
                :tem-novo="true"
                rotulo-novo="Nova conta"
                reordenavel
                @novo="abrirNova"
                @reordenar="({ de, para }) => { contas = moverItem('contas', contas, de, para); }"
              >
                <template #item="{ item }">
                  <ContaCartao :conta="item" :cor="coresBanco[item.id] || corPorNome(item.nome)" :tipo="rotuloTipo(item.tipo)" :ultima="ultimas[item.id] || null" />
                </template>
                <template #total>
                  <div class="total-contas"><span class="rotulo">Total em contas</span><strong class="numero-tabular">{{ moedaTotal(totalContas) }}</strong></div>
                </template>
              </Carrossel>
            </div>

            <section v-if="!pilha && contaSel" class="area-resumo">
              <ContaResumo :entradas="resumoConta.entradas" :saidas="resumoConta.saidas" :periodo="contaSel.nome">
                <template #acoes>
                  <ContaAcoes
                    :conectada="contaSel.origem === 'conectada'"
                    :sincronizando="sincronizandoId === contaSel.id"
                    @lancar="lancar"
                    @transferir="transferir"
                    @importar="importar"
                    @editar="editar(contaSel)"
                    @ajustar="abrirAjuste"
                    @sincronizar="sincronizarAgora(contaSel)"
                    @arquivar="remover(contaSel)"
                  />
                </template>
              </ContaResumo>
              <p v-if="contaSel.origem === 'conectada'" class="sinc">Conectada · última sincronização {{ haQuanto(contaSel.ultima_sincronizacao) }}</p>
            </section>

            <CardPadrao v-if="!pilha && contaSel" class="area-extrato" titulo="Extrato" :subtitulo="rotuloMes">
              <ContaExtrato :transacoes="transacoesConta" :carregando="carregandoTx" :por-mes="anoInteiro" :categorias="categorias" @abrir="abrirTransacao" />
            </CardPadrao>
          </div>
        </div>
      </template>
    </CabecalhoPagina>

    <FormularioModal :aberto="modalAberto" :titulo="editandoId ? 'Editar conta' : 'Nova conta'" :ajuda="ehEdicaoConectada ? '' : 'contas.saldo-inicial'" tema="entrada" :carregando="salvando" :erro="erro" :rotulo-salvar="editandoId ? 'Salvar alterações' : 'Adicionar conta'" @salvar="salvar" @fechar="cancelarEdicao">
      <CampoInstituicao v-model:nome="formulario.nome" v-model:icone="formulario.icone" v-model:cor="formulario.cor" rotulo="Instituição" :erro="erros.nome" obrigatorio tema="entrada" />
      <CampoSelecao v-model="formulario.tipo" rotulo="Tipo" :opcoes="tipos" />
      <template v-if="!ehEdicaoConectada">
        <div class="duas">
          <CampoData v-model="formulario.saldoData" rotulo="Saldo em" :max="hojeIso()" tema="entrada" dica="Data de início" />
          <CampoValor v-model="formulario.saldo" rotulo="Saldo inicial" tema="entrada" permite-negativo dica="Não conta como entrada do mês." dica-ao-focar />
        </div>
      </template>
      <template v-if="fluxo && !editandoId" #extra>
        <button type="button" class="sf-botao secundario" :disabled="salvando" @click="pularSaldo">Pular</button>
      </template>
    </FormularioModal>

    <FormularioModal :aberto="ajuste.aberto" titulo="Ajustar saldo" ajuda="contas.ajustar-saldo" tema="entrada" :carregando="ajuste.salvando" :erro="ajuste.erro" :rotulo-salvar="ajuste.resultado ? 'Fechar' : 'Ajustar'" :sem-cancelar="!!ajuste.resultado" @salvar="salvarAjuste" @fechar="ajuste.aberto = false">
      <template v-if="!ajuste.resultado">
        <p class="nota">Saldo no app: <b>{{ contaSel ? moeda(contaSel.saldo) : '' }}</b></p>
        <CampoValor v-model="ajuste.valor" rotulo="Saldo real de hoje" tema="entrada" permite-negativo autofocus dica="O que o banco mostra hoje." dica-ao-focar />
      </template>
      <div v-else class="aviso-ajuste" data-aviso-faltando>
        <p>Ajuste de <b>{{ moeda(ajuste.resultado.diferenca) }}</b> lançado.</p>
        <p>Pode haver lançamentos faltando entre {{ diaMesBR(ajuste.resultado.desde) }} e hoje.</p>
        <button type="button" class="botao-secundario" @click="importarDoAjuste">Importar extrato</button>
      </div>
    </FormularioModal>
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 1040px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
.pagina.embutido { max-width: 1040px; }
.rotulo { font-size: 13px; color: var(--cor-texto-suave); }
.nota { font-size: 13px; color: var(--cor-texto-suave); margin: 0; }
.icone-topo { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; padding: 0; background: var(--cor-card); border: 1px solid var(--cor-card-borda); color: var(--cor-texto-suave); cursor: pointer; }
.icone-topo:disabled { opacity: 0.6; }
.cartao-fantasma { width: 100%; max-width: 380px; aspect-ratio: 1.586 / 1; align-self: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; border-radius: 20px; border: 2px dashed var(--cor-borda); background: var(--cor-card); color: var(--cor-texto-suave); font: 600 15px var(--fonte-texto); cursor: pointer; padding: 16px; text-align: center; }
.cartao-fantasma:hover, .cartao-fantasma:focus-visible { border-color: var(--cor-entrada); color: var(--cor-texto); outline: none; }
.cartao-fantasma .mais { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--cor-entrada-fundo); color: var(--cor-entrada); }
.corpo { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; }
.conteudo-mes { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.area-carr, .area-resumo { min-width: 0; }
.area-resumo { display: flex; flex-direction: column; gap: 8px; }
.total-contas { display: flex; flex-direction: column; gap: 2px; }
.total-contas strong { font-family: var(--fonte-display); font-size: clamp(24px, 6vw, 32px); line-height: 1.15; }
.sinc { margin: 0; text-align: center; font-size: 12px; color: var(--cor-texto-suave); }
.gira { animation: gira 1s linear infinite; }
@keyframes gira { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .gira { animation: none; } }
@media (min-width: 1180px) {
  .corpo { grid-template-columns: minmax(0, 380px) minmax(0, 1fr); align-items: start; grid-template-areas: 'carr res' 'ext ext'; }
  .corpo.pilha { grid-template-areas: 'carr carr'; }
  .area-carr { grid-area: carr; }
  .area-resumo { grid-area: res; }
  .area-extrato { grid-area: ext; }
}
.duas { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
@media (max-width: 480px) { .duas { grid-template-columns: 1fr; } }
.aviso-ajuste { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.aviso-ajuste p { margin: 0; font-size: 14.5px; line-height: 1.45; }
.escolhas { display: flex; flex-direction: column; gap: 10px; }
.escolha { display: flex; align-items: center; gap: 14px; min-height: 64px; padding: 12px 14px; border-radius: 16px; background: var(--cor-fundo); border: 1.5px solid var(--cor-borda); color: var(--cor-texto); cursor: pointer; text-align: left; font-family: var(--fonte-texto); }
.escolha:hover, .escolha:focus-visible { border-color: var(--cor-entrada); background: var(--cor-entrada-fundo); outline: none; }
.escolha span { display: flex; flex-direction: column; gap: 2px; font-size: 15px; }
.escolha small { font-size: 12px; color: var(--cor-texto-suave); }
.mensagem-erro { margin: 0; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--cor-alerta) 14%, transparent); color: var(--cor-alerta); font-size: 14px; }
.caixa-modal { padding: 14px; border-radius: 16px; border: 1px solid var(--cor-card-borda); background: var(--cor-card); display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.botao-secundario { min-height: 44px; padding: 0 16px; border-radius: 12px; background: transparent; border: 1px solid var(--cor-borda); color: var(--cor-texto); font: 600 14px var(--fonte-texto); cursor: pointer; }
</style>
