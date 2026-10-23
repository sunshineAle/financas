<script setup>
// Cartões e Crédito (onda 2): carrossel -> ações -> cards Fatura | Limite usado -> filtro -> extrato -> próximas faturas
// -> 'Análises' recolhida. Parcelamentos e visão geral viraram componentes (CartaoParcelamentos/CartaoVisaoGeral) p/ Relatórios.
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { FileText, Wallet, ShoppingBag, Ellipsis, Check, Undo2, Pencil, Trash2, List, ArrowUpRight, ArrowDownRight, ChevronDown, FileUp, Plus } from 'lucide-vue-next';
import Modal from '../components/Modal.vue';
import Carrossel from '../components/Carrossel.vue';
import { aplicarOrdem, moverItem } from '../services/ordem.js';
import CabecalhoPagina from '../components/CabecalhoPagina.vue';
import CardPadrao from '../components/CardPadrao.vue';
import AbasSeletor from '../components/AbasSeletor.vue';
import BarraAcoes from '../components/BarraAcoes.vue';
import BotaoAcao from '../components/BotaoAcao.vue';
import BarraDegrade from '../components/BarraDegrade.vue';
import Icone from '../components/Icone.vue';
import CampoInstituicao from '../components/CampoInstituicao.vue';
import FormularioModal from '../components/FormularioModal.vue';
import CampoTexto from '../components/CampoTexto.vue';
import CampoValor from '../components/CampoValor.vue';
import CampoSelecao from '../components/CampoSelecao.vue';
import CampoBase from '../components/CampoBase.vue';
import CartaoFace from '../components/CartaoFace.vue';
import CartaoGraficos from '../components/CartaoGraficos.vue';
import CartaoLista from '../components/CartaoLista.vue';
import CartaoCompraModal from '../components/CartaoCompraModal.vue';
import CartaoPagarModal from '../components/CartaoPagarModal.vue';
import Valor from '../components/Valor.vue';
import { corDoBanco, corPorNome } from '../utils/corBanco.js';
import { mes, ano, anoInteiro, periodo, MESES } from '../services/mes.js';

const router = useRouter();
const route = useRoute();

const cartoes = ref([]);
const contas = ref([]);
const categorias = ref([]);
const coresBanco = reactive({});
const carregando = ref(true);
const sel = ref(0);
const pilha = ref(false);
const versao = ref(0);

const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const dm = (iso) => { if (!iso) return ''; const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };
const MESES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (chave) => { const [a, m] = chave.split('-').map(Number); return `${MESES_C[m - 1]}/${a}`; };
const rotuloMesLongo = (chave) => { const [a, m] = chave.split('-').map(Number); return `${MESES[m - 1]} de ${a}`; };
const mesAnterior = (chave) => { const [a, m] = chave.split('-').map(Number); const t = a * 12 + (m - 1) - 1; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
const rotuloStatus = { aberta: 'Aberta', futura: 'Futura', paga: 'Paga', fechada: 'Fechada' };

async function pedir(url, opcoes = {}) {
  const r = await fetch(url, { credentials: 'include', ...opcoes });
  if (r.status === 401) { router.push('/login'); throw new Error('não autenticado'); }
  return r;
}

// ---------- Dados ----------
const cartao = computed(() => cartoes.value[sel.value] || null);
const manual = computed(() => cartao.value?.origem === 'manual');

async function carregarCartoes() {
  const idAtual = cartao.value?.id;
  const [rc, rk] = await Promise.all([pedir('/api/cartoes'), pedir('/api/contas')]);
  cartoes.value = aplicarOrdem('cartoes', await rc.json());
  contas.value = await rk.json();
  try { const r = await pedir('/api/categorias'); categorias.value = r.ok ? await r.json() : []; } catch { categorias.value = []; }
  const alvo = route.params.id ? String(route.params.id) : idAtual;
  const i = cartoes.value.findIndex((c) => c.id === alvo);
  sel.value = i >= 0 ? i : Math.min(sel.value, Math.max(0, cartoes.value.length - 1));
  carregando.value = false;
  cache.clear();
  versao.value++;
  cartoes.value.forEach(async (k) => {
    // cor do PRÓPRIO cartão (k.cor, quando o backend passar a guardar); senão, derivada do nome/ícone do cartão (não do banco vinculado)
    coresBanco[k.id] = k.cor || await corDoBanco(k.nome, k.icone);
  });
}
const corDe = (c) => c.cor || coresBanco[c.id] || corPorNome(c.nome);

// Cache de extratos por cartão e fatura (gráficos, parcelamentos e extrato do mês usam o mesmo)
const cache = new Map();
function buscarExtrato(chave, id = cartao.value?.id) {
  if (!id) return Promise.resolve(null);
  const k = `${id}|${chave}`;
  if (!cache.has(k)) {
    cache.set(k, pedir(`/api/cartoes/${id}/extrato?fatura=${chave}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return cache.get(k);
}

const faturas = ref([]);
const todos = ref([]); // extratos de todas as faturas (parcelamentos)
const visto = ref(null); // extrato do período mostrado
let seqF = 0;
let seqV = 0;
async function carregarFaturas() {
  const c = cartao.value;
  const meu = ++seqF;
  if (!c) { faturas.value = []; todos.value = []; visto.value = null; return; }
  const r = await pedir(`/api/cartoes/${c.id}/faturas`);
  const lista = r.ok ? await r.json() : [];
  if (meu !== seqF) return;
  faturas.value = lista;
  await carregarVisto();
  const ext = await Promise.all(lista.map((f) => buscarExtrato(f.chave, c.id)));
  if (meu === seqF) todos.value = ext.filter(Boolean);
}
async function carregarVisto() {
  const c = cartao.value;
  const meu = ++seqV;
  if (!c) { visto.value = null; return; }
  let res;
  if (anoInteiro.value) {
    const chaves = faturas.value.filter((f) => f.chave.startsWith(`${ano.value}-`)).map((f) => f.chave);
    const ex = (await Promise.all(chaves.map((k) => buscarExtrato(k, c.id)))).filter(Boolean);
    const lanc = ex.flatMap((e) => e.lancamentos).sort((a, b) => (a.dataCompra < b.dataCompra ? 1 : -1));
    res = { anual: true, fatura: null, total: lanc.reduce((s, l) => s + l.valor, 0), lancamentos: lanc };
  } else {
    const e = await buscarExtrato(mes.value, c.id);
    res = e ? { anual: false, fatura: e.fatura, total: e.fatura.total, lancamentos: e.lancamentos } : null;
  }
  if (meu === seqV) visto.value = res;
}

watch(() => [cartao.value?.id, versao.value], carregarFaturas);
watch(() => periodo.value.chave, carregarVisto);
watch(() => route.params.id, (id) => { const i = cartoes.value.findIndex((c) => c.id === String(id)); if (i >= 0) sel.value = i; });

// ---------- Fatura do período ----------
const fat = computed(() => visto.value?.fatura || null);
const selo = computed(() => {
  const f = fat.value;
  if (!f) return null;
  if (f.paga) return { texto: 'Paga', cls: 'paga' };
  return { texto: rotuloStatus[f.status] || f.status, cls: f.status };
});
const anterior = computed(() => {
  if (anoInteiro.value || !visto.value) return null;
  const f = faturas.value.find((x) => x.chave === mesAnterior(mes.value));
  return f ? f.total : 0;
});
const variacao = computed(() => {
  if (!fat.value || !anterior.value) return null;
  return ((fat.value.total - anterior.value) / anterior.value) * 100;
});
// Pagamento identificado (vindo de QUALQUER conta, à mão ou por importação/Open Finance): data + conta de origem.
const textoPagamento = (f) => `Pagamento identificado · ${f.pagaEm ? dm(f.pagaEm) : 'data não informada'}${f.pagaComConta ? ` · pela conta ${f.pagaComConta}` : ''}`;
// Diferença entre a fatura e o que foi pago. DESCONTO (a menos) e FATURA PARCELADA (restante vira dívida) são coisas
// diferentes e nunca se misturam: parcelamento jamais aparece como desconto.
const acerto = (f) => {
  if (!f || !f.paga) return null;
  if (!(f.desconto > 0) && !(f.parcelado > 0)) return null;
  return { pago: f.pagoValor ?? Math.max(0, f.total - (f.desconto || 0) - (f.parcelado || 0)), desconto: f.desconto || 0, parcelado: f.parcelado || 0 };
};
const verDividas = () => router.push('/dividas');
const pctTxt = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}%`;
const podePagar = computed(() => manual.value && fat.value && fat.value.total > 0 && !fat.value.paga);

// ---------- Extrato ----------
const filtroTipo = ref('');
const filtroCat = ref('');
watch(sel, () => { filtroTipo.value = ''; filtroCat.value = ''; });
const lista = computed(() => {
  let l = visto.value?.lancamentos || [];
  if (filtroTipo.value === 'vista') l = l.filter((x) => x.totalParcelas <= 1);
  if (filtroTipo.value === 'parc') l = l.filter((x) => x.totalParcelas > 1);
  if (filtroCat.value) l = l.filter((x) => String(x.categoriaId) === String(filtroCat.value));
  return l;
});
const catsUsadas = computed(() => {
  const ids = new Set((visto.value?.lancamentos || []).map((l) => l.categoriaId).filter(Boolean));
  return categorias.value.filter((c) => ids.has(c.id));
});

// ---------- Próximas faturas ----------
const proximas = computed(() => {
  const aberta = cartao.value?.faturaAberta?.chave;
  return faturas.value.filter((f) => f.chave >= aberta && f.total > 0).slice(0, 6);
});
const maxProx = computed(() => Math.max(1, ...proximas.value.map((f) => f.total)));
const totais = computed(() => ({
  usado: cartoes.value.reduce((s, c) => s + (c.limiteUsado || 0), 0),
  limite: cartoes.value.reduce((s, c) => s + (c.limite || 0), 0),
  faturas: cartoes.value.reduce((s, c) => s + (c.faturaAberta?.total || 0), 0),
}));
const pctLimite = computed(() => (cartao.value?.limite > 0 ? Math.min(100, (cartao.value.limiteUsado / cartao.value.limite) * 100) : 0));
const analises = ref(false);
const abasTipo = [{ id: '', rotulo: 'Todas' }, { id: 'vista', rotulo: 'À vista' }, { id: 'parc', rotulo: 'Parcelado' }];

// ---------- Ações ----------
function verFatura() {
  const c = cartao.value; if (!c) return;
  router.push({ name: 'cartao-extrato', params: { id: c.id }, query: { fatura: anoInteiro.value ? c.faturaAberta?.chave : mes.value } });
}
const menuMais = ref(false);
const fecharMenu = () => { menuMais.value = false; };
onMounted(() => window.addEventListener('click', fecharMenu));
onUnmounted(() => window.removeEventListener('click', fecharMenu));

const pagarAberto = ref(false);
const pagarChave = ref('');
const pagarTotal = ref(0);
function abrirPagar(chave, total) { pagarChave.value = chave; pagarTotal.value = total; pagarAberto.value = true; }
async function pagamentoSalvo() { pagarAberto.value = false; await carregarCartoes(); }
async function desfazerPagar(chave) {
  await pedir(`/api/cartoes/${cartao.value.id}/faturas/${chave}/pagar`, { method: 'DELETE' });
  await carregarCartoes();
}

const compraAberta = ref(false);
const compraEditando = ref(null);
function lancarCompra() { compraEditando.value = null; compraAberta.value = true; }
function editarCompra(l) { compraEditando.value = l; compraAberta.value = true; }
async function compraSalva() { compraAberta.value = false; await carregarCartoes(); }
const removendo = ref(null);
async function removerCompra() {
  const l = removendo.value; if (!l) return;
  await pedir(`/api/cartoes/${cartao.value.id}/lancamentos/${l.compraId}`, { method: 'DELETE' });
  removendo.value = null;
  await carregarCartoes();
}

// Detalhes e faturas (pop-up): dados do cartão + lista de faturas com pagar/desfazer
const props = defineProps({ fluxo: { type: Boolean, default: false } });
const emit = defineEmits(['fluxo-fim']); // fluxo: usado pelo modal de primeiro cadastro (abre só o formulário)
let salvouNoFluxo = false;
const detalhe = ref(false);
function extratoDeFatura(chave) { detalhe.value = false; router.push({ name: 'cartao-extrato', params: { id: cartao.value.id }, query: { fatura: chave } }); }

// ---------- Cadastro / edição ----------
const modalAberto = ref(false);
const editandoId = ref(null);
const erro = ref('');
const erros = ref({});
const salvando = ref(false);
const formVazio = () => ({ nome: '', contaId: '', limite: 0, diaFechamento: '', diaVencimento: '', icone: '💳', cor: '' });
const formulario = ref(formVazio());
function abrirNovo() { editandoId.value = null; erro.value = ''; erros.value = {}; formulario.value = formVazio(); modalAberto.value = true; }
function editar(c) {
  editandoId.value = c.id; erro.value = ''; erros.value = {};
  formulario.value = { nome: c.nome, contaId: c.contaId ?? '', limite: c.limite ?? 0, diaFechamento: c.diaFechamento, diaVencimento: c.diaVencimento, icone: c.icone || '💳', cor: c.cor || '' };
  modalAberto.value = true;
}
function fecharModal() { modalAberto.value = false; editandoId.value = null; erro.value = ''; erros.value = {}; }
const diaOk = (v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 31;
async function salvar() {
  erro.value = ''; erros.value = {};
  const f = formulario.value;
  if (!f.nome.trim()) erros.value.nome = 'Informe um nome para o cartão.';
  if (!diaOk(f.diaFechamento)) erros.value.diaFechamento = 'Dia de 1 a 31.';
  if (!diaOk(f.diaVencimento)) erros.value.diaVencimento = 'Dia de 1 a 31.';
  if (Object.keys(erros.value).length) return;
  salvando.value = true;
  try {
    const r = await pedir(editandoId.value ? `/api/cartoes/${editandoId.value}` : '/api/cartoes', {
      method: editandoId.value ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: f.nome, contaId: f.contaId === '' ? null : f.contaId, limite: Number(f.limite) > 0 ? Number(f.limite) : null, diaFechamento: Number(f.diaFechamento), diaVencimento: Number(f.diaVencimento), icone: f.icone, cor: f.cor || null }),
    });
    const d = await r.json();
    if (!r.ok) { erro.value = d.erro || 'Não foi possível salvar o cartão.'; return; }
    const novo = !editandoId.value;
    salvouNoFluxo = true;
    fecharModal();
    await carregarCartoes();
    if (novo) { const i = cartoes.value.findIndex((c) => c.id === d.id); if (i >= 0) sel.value = i; }
  } finally { salvando.value = false; }
}
async function remover(c) {
  if (!confirm(`Remover o cartão "${c.nome}" e todas as compras dele?`)) return;
  await pedir(`/api/cartoes/${c.id}`, { method: 'DELETE' });
  sel.value = 0;
  await carregarCartoes();
}

watch(modalAberto, (v) => { if (props.fluxo && !v) emit('fluxo-fim', salvouNoFluxo); });
onMounted(() => { if (props.fluxo) abrirNovo(); carregarCartoes(); });
</script>

<template>
  <div class="pagina">
    <CabecalhoPagina titulo="Cartões e Crédito" cor="var(--cor-saida-texto)">
     <template #corpo>
    <div v-deslizar-mes class="corpo">
      <Carrossel v-if="carregando || cartoes.length" :itens="cartoes" v-model:indice="sel" v-model:empilhado="pilha" :chave="(c) => c.id" temNovo rotuloNovo="Novo cartão" reordenavel @novo="abrirNovo" @reordenar="({ de, para }) => { cartoes = moverItem('cartoes', cartoes, de, para); }">
        <template #item="{ item }"><CartaoFace :cartao="item" :cor="corDe(item)" /></template>
        <template #total>
          <div class="total-pilha">
            <span class="rotulo">Limite usado</span>
            <strong class="numero-tabular"><Valor :valor="totais.usado" /></strong>
            <span class="sub numero-tabular"><Valor :texto="`de ${moeda(totais.limite)} · faturas abertas ${moeda(totais.faturas)}`" /></span>
          </div>
        </template>
      </Carrossel>

      <button v-if="!carregando && cartoes.length === 0" type="button" class="cartao-fantasma" @click="abrirNovo">
        <span class="mais" aria-hidden="true"><Plus :size="26" :stroke-width="2" /></span>
        <span class="txt">Adicione seu primeiro cartão</span>
      </button>

      <template v-if="cartao && !pilha">
        <transition name="troca" mode="out-in">
          <div :key="cartao.id" class="nome-fora">
            <strong>{{ cartao.nome }}</strong>
            <span>Cartão de crédito<template v-if="cartao.contaNome"> · paga pela {{ cartao.contaNome }}</template><template v-if="cartao.origem === 'conectada'"> · conectado</template></span>
          </div>
        </transition>

        <div class="dois">
          <CardPadrao class="c-fatura tema-saida" :titulo="visto?.anual ? `Faturas de ${ano}` : 'Fatura'" :subtitulo="visto && !visto.anual ? rotuloMesLongo(mes) : ''" aria-label="Fatura">
            <template v-if="visto" #acoes><span v-if="selo" class="selo" :class="selo.cls"><Check v-if="selo.cls === 'paga'" :size="13" :stroke-width="2.6" /> {{ selo.texto }}</span></template>
            <template v-if="visto">
              <strong class="valor-fatura numero-tabular"><Valor :valor="visto.total" /></strong>
              <span v-if="fat" class="datas">Fecha <b>{{ dm(fat.fecha) }}</b> · Vence <b>{{ dm(fat.vence) }}</b></span>
              <div v-if="fat && !visto.anual" class="comparar">
                <span class="rotulo">Fatura anterior</span>
                <b class="numero-tabular"><Valor :valor="anterior" /></b>
                <span v-if="variacao !== null" class="var" :class="variacao > 0 ? 'sobe' : 'desce'"><ArrowUpRight v-if="variacao > 0" :size="13" /><ArrowDownRight v-else :size="13" /> {{ pctTxt(variacao) }}</span>
              </div>
              <div v-if="fat && fat.paga" class="linha-paga">
                <span>{{ textoPagamento(fat) }}</span>
                <button v-if="manual" type="button" class="link" @click="desfazerPagar(fat.chave)"><Undo2 :size="14" /> Desfazer</button>
              </div>
              <dl v-if="acerto(fat)" class="acerto" aria-label="Como a fatura foi paga">
                <div><dt>Valor pago</dt><dd class="numero-tabular"><Valor :valor="acerto(fat).pago" /></dd></div>
                <div v-if="acerto(fat).desconto > 0" class="desconto"><dt>Desconto</dt><dd class="numero-tabular"><Valor :valor="acerto(fat).desconto" /></dd></div>
                <div v-if="acerto(fat).parcelado > 0" class="parcelada"><dt>Fatura parcelada</dt><dd class="numero-tabular"><Valor :valor="acerto(fat).parcelado" /></dd></div>
                <p v-if="acerto(fat).parcelado > 0" class="aviso-parcelada">O restante vai para as próximas faturas e virou dívida. <button type="button" class="link" @click="verDividas">Ver em Dívidas</button></p>
              </dl>
            </template>
            <p v-else class="nota">Sem fatura neste período.</p>
            <template #rodape>
              <BarraAcoes compacto :colunas="4" rotulo="Ações do cartão">
                <BotaoAcao compacto :icone="FileText" rotulo="Ver fatura" tema="saida" @click="verFatura" />
                <BotaoAcao compacto :icone="Wallet" rotulo="Registrar pagamento" tema="saida" :disabled="!podePagar" :titulo="podePagar ? '' : manual ? 'Sem fatura a pagar neste período' : 'Em cartão conectado o pagamento vem do banco'" @click="abrirPagar(fat.chave, fat.total)" />
                <BotaoAcao compacto :icone="ShoppingBag" rotulo="Lançar compra" tema="saida" :disabled="!manual" :titulo="manual ? '' : 'Compras deste cartão vêm do extrato'" @click="lancarCompra" />
                <div class="acao-mais" @click.stop>
                  <BotaoAcao compacto :icone="Ellipsis" rotulo="Mais" tema="saida" :aria-expanded="menuMais" @click="menuMais = !menuMais" />
                  <div v-if="menuMais" class="menu-mais" role="menu">
                    <button type="button" role="menuitem" @click="fecharMenu(); detalhe = true"><List :size="16" /> Detalhes e faturas</button>
                    <button v-if="manual" type="button" role="menuitem" @click="fecharMenu(); router.push({ path: '/importar', query: { tipo: 'fatura', id: cartao.id } })"><FileUp :size="16" /> Importar fatura</button>
                    <button v-if="manual" type="button" role="menuitem" @click="fecharMenu(); editar(cartao)"><Pencil :size="16" /> Editar cartão</button>
                    <button type="button" role="menuitem" class="perigo" @click="fecharMenu(); remover(cartao)"><Trash2 :size="16" /> Remover cartão</button>
                  </div>
                </div>
              </BarraAcoes>
            </template>
          </CardPadrao>
        </div>

        <div class="filtros">
          <AbasSeletor v-model="filtroTipo" :abas="abasTipo" tema="saida" />
          <select v-if="catsUsadas.length" v-model="filtroCat" aria-label="Filtrar por categoria"><option value="">Todas as categorias</option><option v-for="c in catsUsadas" :key="c.id" :value="c.id">{{ c.nome }}</option></select>
        </div>

        <CardPadrao class="extrato" titulo="Extrato" :subtitulo="`${lista.length} ${lista.length === 1 ? 'compra' : 'compras'}`" aria-label="Extrato do cartão">
          <p v-if="visto && lista.length === 0" class="nota">Nenhuma compra {{ visto.anual ? 'neste ano' : 'nesta fatura' }}.</p>
          <CartaoLista v-else :lancamentos="lista" :categorias="categorias" :manual="manual" :cartao-nome="cartao.nome" :cartao-icone="cartao.icone" @editar="editarCompra" @remover="(l) => (removendo = l)" />
        </CardPadrao>

        <CardPadrao titulo="Próximas faturas">
          <p v-if="proximas.length === 0" class="nota">Sem valores comprometidos nas próximas faturas.</p>
          <ul v-else class="parcs">
            <li v-for="f in proximas" :key="f.chave">
              <div class="p-topo"><span class="p-nome">{{ rotuloMes(f.chave) }}</span><span class="numero-tabular p-val"><Valor :valor="f.total" /></span></div>
              <BarraDegrade :pct="(f.total / maxProx) * 100" :altura="6" :marcador="false" de="var(--saida-ambar-medio)" ate="var(--saida-carmim-medio)" />
            </li>
          </ul>
        </CardPadrao>

        <section class="analises">
          <button type="button" class="analises-cab" :aria-expanded="analises" @click="analises = !analises"><Icone nome="relatorios" :tamanho="18" /> Análises <ChevronDown :size="18" class="seta" :class="{ aberta: analises }" /></button>
          <CartaoGraficos v-if="analises" :cartao="cartao" :faturas="faturas" :chave="mes" :buscar="(k) => buscarExtrato(k)" :versao="versao" semLimite />
        </section>
      </template>
    </div>
     </template>
    </CabecalhoPagina>

    <!-- Detalhes e faturas -->
    <Modal :aberto="detalhe" :titulo="cartao ? cartao.nome : ''" tema="saida" @fechar="detalhe = false">
      <div v-if="cartao" class="detalhe">
        <dl class="dados">
          <div><dt>Conta que paga a fatura</dt><dd>{{ cartao.contaNome || 'Sem conta vinculada' }}</dd></div>
          <div><dt>Fechamento</dt><dd>dia {{ cartao.diaFechamento }}</dd></div>
          <div><dt>Vencimento</dt><dd>dia {{ cartao.diaVencimento }}</dd></div>
          <div><dt>Origem</dt><dd>{{ cartao.origem === 'conectada' ? 'Conectado (Open Finance)' : 'Cadastrado à mão' }}</dd></div>
          <div v-if="cartao.limite"><dt>Limite</dt><dd><Valor :valor="cartao.limite" /></dd></div>
          <div v-if="cartao.limite"><dt>Usado</dt><dd><Valor :valor="cartao.limiteUsado" /></dd></div>
          <div v-if="cartao.limite"><dt>Disponível</dt><dd><Valor :valor="cartao.limiteDisponivel" /></dd></div>
          <div><dt>Fatura aberta</dt><dd><Valor :texto="`${moeda(cartao.faturaAberta?.total)} · vence ${dm(cartao.faturaAberta?.vence)}`" /></dd></div>
        </dl>
        <h3>Faturas</h3>
        <p v-if="faturas.length === 0" class="nota">Nenhuma fatura ainda.</p>
        <ul v-else class="lista-faturas">
          <li v-for="f in [...faturas].reverse()" :key="f.chave" class="item-fatura">
            <button type="button" class="linha-fatura" @click="extratoDeFatura(f.chave)">
              <span><strong>{{ rotuloMes(f.chave) }}</strong> <span class="tag">{{ f.paga ? 'Paga' : rotuloStatus[f.status] }} · vence {{ dm(f.vence) }} · {{ f.quantidade }} {{ f.quantidade === 1 ? 'compra' : 'compras' }}</span></span>
              <span class="numero-tabular"><Valor :valor="f.total" /></span>
            </button>
            <template v-if="manual && f.total > 0">
              <div v-if="f.paga" class="linha-paga">
                <span class="selo paga"><Check :size="13" :stroke-width="2.6" /> Paga em {{ dm(f.pagaEm) }}{{ f.pagaComConta ? ` · ${f.pagaComConta}` : '' }}</span>
                <span v-if="f.desconto > 0" class="tag">Desconto de <Valor :valor="f.desconto" /></span>
                <span v-else-if="f.parcelado > 0" class="tag">Fatura parcelada: <Valor :valor="f.parcelado" /> viram dívida</span>
                <button type="button" class="link" @click="desfazerPagar(f.chave)"><Undo2 :size="14" /> Desfazer</button>
              </div>
              <div v-else class="linha-paga"><button type="button" class="btn-pagar peq" @click="abrirPagar(f.chave, f.total)">Pagar fatura</button></div>
            </template>
            <p v-else-if="cartao.origem === 'conectada' && f.paga" class="tag">Paga</p>
          </li>
        </ul>
        <div class="acoes-form">
          <button type="button" @click="extratoDeFatura(cartao.faturaAberta?.chave || '')">Abrir extrato completo</button>
          <button type="button" class="sec" @click="detalhe = false">Fechar</button>
        </div>
      </div>
    </Modal>

    <CartaoPagarModal :aberto="pagarAberto" :cartao="cartao" :chave="pagarChave" :total="pagarTotal" :contas="contas" @fechar="pagarAberto = false" @salvo="pagamentoSalvo" />
    <CartaoCompraModal :aberto="compraAberta" :cartao="cartao" :editando="compraEditando" @fechar="compraAberta = false" @salvo="compraSalva" />

    <Modal :aberto="!!removendo" titulo="Remover compra" tema="saida" @fechar="removendo = null">
      <div v-if="removendo" class="formulario">
        <p>Remover <strong>{{ removendo.descricao }}</strong><template v-if="removendo.totalParcelas > 1"> e as {{ removendo.totalParcelas }} parcelas</template>?</p>
        <div class="acoes-form">
          <button type="button" class="perigo-btn" @click="removerCompra">Remover</button>
          <button type="button" class="sec" @click="removendo = null">Cancelar</button>
        </div>
      </div>
    </Modal>

    <!-- Cadastro / edição -->
    <FormularioModal :aberto="modalAberto" :titulo="editandoId ? 'Editar cartão' : 'Novo cartão'" tema="saida" :rotulo-salvar="editandoId ? 'Salvar alterações' : 'Adicionar cartão'" :carregando="salvando" :erro="erro" @salvar="salvar" @fechar="fecharModal">
      <p class="nota">Informe a instituição e escolha qual conta paga a fatura. Os dias de fechamento e vencimento definem em qual fatura cai cada compra e cada parcela.</p>
      <CampoInstituicao v-model:nome="formulario.nome" v-model:icone="formulario.icone" v-model:cor="formulario.cor" rotulo="Instituição do cartão" placeholder="Ex: Nubank, Americanas, Magalu" padrao="💳" :erro="erros.nome" obrigatorio tema="saida" />
      <CampoSelecao v-model="formulario.contaId" rotulo="Conta que paga a fatura" :opcoes="[{ valor: '', rotulo: 'Nenhuma (sem vínculo)' }, ...contas.map((c) => ({ valor: c.id, rotulo: c.nome }))]" tema="saida" />
      <div class="duas-campos">
        <CampoTexto v-model="formulario.diaFechamento" rotulo="Dia de fechamento" type="number" min="1" max="31" inputmode="numeric" :erro="erros.diaFechamento" obrigatorio tema="saida" />
        <CampoTexto v-model="formulario.diaVencimento" rotulo="Dia de vencimento" type="number" min="1" max="31" inputmode="numeric" :erro="erros.diaVencimento" obrigatorio tema="saida" />
      </div>
      <CampoValor v-model="formulario.limite" rotulo="Limite (opcional)" tipo="saida" />
    </FormularioModal>
  </div>
</template>

<style scoped>
.cartao-fantasma { width: 100%; max-width: 380px; aspect-ratio: 1.586 / 1; align-self: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; border-radius: 20px; border: 2px dashed var(--cor-borda); background: var(--cor-card); color: var(--cor-texto-suave); font: 600 15px var(--fonte-texto); cursor: pointer; padding: 16px; text-align: center; }
.cartao-fantasma:hover, .cartao-fantasma:focus-visible { border-color: var(--cor-saida); color: var(--cor-texto); outline: none; }
.cartao-fantasma .mais { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--cor-saida-fundo); color: var(--cor-saida); }
.pagina { padding: 8px 40px 40px; max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
@media (max-width: 768px) { .pagina { padding: 16px 16px 24px; } }
.corpo { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.total-pilha { display: flex; flex-direction: column; gap: 2px; padding: 2px 2px 6px; }
.total-pilha strong { font-family: var(--fonte-display); font-size: 26px; }
.rotulo { font-size: 12px; color: var(--cor-texto-suave); }
.sub { font-size: 12px; color: var(--cor-texto-suave); }
.nota { font-size: 13px; color: var(--cor-texto-suave); margin: 0; }

.nome-fora { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; padding: 0 2px; font-size: 13px; }
.nome-fora strong { font-weight: 600; }
.nome-fora span { color: var(--cor-texto-suave); }
.troca-enter-active, .troca-leave-active { transition: opacity var(--anim-padrao) var(--anim-curva), transform var(--anim-padrao) var(--anim-curva); }
.troca-enter-from { opacity: 0; transform: translateX(8px); }
.troca-leave-to { opacity: 0; transform: translateX(-8px); }

.acao-mais { position: relative; min-width: 0; }
.c-fatura :deep(.acao) { padding: 2px 0; }
.c-fatura :deep(.rot) { font-size: 10.5px; overflow-wrap: normal; word-break: normal; hyphens: none; }
.menu-mais { position: absolute; right: 0; bottom: calc(100% + 6px); z-index: 20; width: 200px; display: flex; flex-direction: column; padding: 6px; background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); border-radius: 14px; box-shadow: var(--sombra-suave); }
.menu-mais button { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px; background: none; border: none; border-radius: 10px; color: var(--cor-texto); font: 500 14px var(--fonte-texto); text-align: left; cursor: pointer; }
.menu-mais button:hover { background: var(--cor-realce); }
.menu-mais .perigo { color: var(--cor-saida-texto); }

.dois { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: stretch; }
@media (max-width: 600px) { .dois { grid-template-columns: 1fr; } }
.valor-fatura { font-family: var(--fonte-display); font-size: clamp(26px, 7vw, 32px); font-weight: 700; line-height: 1.1; }
.datas { font-size: 12.5px; color: var(--cor-texto-suave); }
.datas b { color: var(--cor-texto); }
.comparar { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; padding-top: 10px; border-top: 1px solid var(--cor-card-borda); font-size: 13px; }
.comparar b { font-family: var(--fonte-display); }
.selo { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; padding: 4px 11px; border-radius: 999px; background: var(--cor-realce); color: var(--cor-texto-suave); }
.selo.aberta { background: color-mix(in srgb, var(--saida-ambar-medio) 22%, transparent); color: var(--saida-ambar-medio); }
.selo.fechada { background: var(--cor-saida-fundo); color: var(--cor-saida-texto); }
.selo.paga { background: var(--cor-investimento-fundo); color: var(--cor-investimento); }
:root[data-theme='light'] .selo.aberta { color: var(--saida-ambar-escuro); }
.var { display: inline-flex; align-items: center; gap: 2px; font-size: 12px; font-weight: 600; }
.var.sobe { color: var(--cor-saida-texto); }
.var.desce { color: var(--cor-texto-suave); }
.acerto { margin: 0; padding-top: 10px; border-top: 1px solid var(--cor-card-borda); display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.acerto > div { display: flex; justify-content: space-between; gap: 12px; }
.acerto dt { color: var(--cor-texto-suave); }
.acerto dd { margin: 0; font-weight: 600; }
.acerto .desconto dd { color: var(--cor-investimento); }
.acerto .parcelada dd { color: var(--cor-saida-texto); }
.aviso-parcelada { margin: 2px 0 0; font-size: 12.5px; color: var(--cor-texto-suave); }
.aviso-parcelada .link { min-height: 0; padding: 0; }
.linha-paga { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 13px; color: var(--cor-texto-suave); }
.link { display: inline-flex; align-items: center; gap: 5px; min-height: 44px; padding: 0 6px; background: none; border: none; color: var(--cor-texto-suave); font: 600 13px var(--fonte-texto); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
/* botão de pagar dentro do pop-up de faturas */
.btn-pagar { min-height: 44px; padding: 0 14px; border-radius: 12px; border: none; background: var(--degrade-saida); color: var(--cor-sobre-cor); font: 600 14px var(--fonte-texto); cursor: pointer; }
.btn-pagar.peq { padding: 0 14px; }

.limite { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.pct { font-family: var(--fonte-display); font-size: 19px; }
.legenda { margin: 0; display: grid; gap: 8px; flex: 1; min-width: 0; }
.legenda div { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; }
.legenda dt { color: var(--cor-texto-suave); }
.legenda dd { margin: 0; font-weight: 600; }

.filtros { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.filtros select { min-height: 44px; max-width: 100%; padding: 0 10px; border-radius: 12px; border: 1px solid var(--cor-card-borda); background: var(--cor-card); color: var(--cor-texto); font: 13px var(--fonte-texto); }

.parcs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.parcs li { display: flex; flex-direction: column; gap: 6px; }
.p-topo { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.p-nome { font-size: 13.5px; font-weight: 600; }
.p-val { font-size: 13px; font-weight: 600; }

.analises { display: flex; flex-direction: column; gap: 12px; }
.analises-cab { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 48px; padding: 0 var(--espaco-card); background: var(--cor-card); border: 1px solid var(--cor-card-borda); border-radius: var(--raio-card); color: var(--cor-texto); font: 600 15px var(--fonte-display); cursor: pointer; text-align: left; }
.analises-cab .seta { margin-left: auto; transition: transform var(--anim-padrao) var(--anim-curva); }
.analises-cab .seta.aberta { transform: rotate(180deg); }

/* pop-ups */
.detalhe { display: flex; flex-direction: column; gap: 14px; }
.detalhe h3 { font-family: var(--fonte-display); font-size: 15px; margin: 4px 0 0; }
.dados { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; margin: 0; }
@media (max-width: 480px) { .dados { grid-template-columns: 1fr; } }
.dados dt { font-size: 12px; color: var(--cor-texto-suave); }
.dados dd { margin: 2px 0 0; font-size: 14px; font-weight: 600; }
.lista-faturas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow-y: auto; }
.item-fatura { display: flex; flex-direction: column; gap: 4px; }
.linha-fatura { width: 100%; min-height: 44px; display: flex; justify-content: space-between; align-items: center; gap: 12px; text-align: left; background: var(--cor-fundo); color: var(--cor-texto); border: 1px solid var(--cor-borda); border-radius: 10px; padding: 8px 12px; font: 500 14px var(--fonte-texto); cursor: pointer; }
.tag { font-size: 12px; color: var(--cor-texto-suave); }
.formulario { display: flex; flex-direction: column; gap: 14px; }
.duas-campos { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
@media (max-width: 480px) { .duas-campos { grid-template-columns: 1fr; } }
.acoes-form { display: flex; gap: 10px; }
.acoes-form button { font-family: var(--fonte-texto); font-weight: 600; font-size: 14px; padding: 10px 16px; min-height: 44px; border-radius: 10px; border: none; background: var(--degrade-saida); color: var(--cor-sobre-cor); cursor: pointer; }
.acoes-form .sec { background: transparent; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.acoes-form .perigo-btn { background: transparent; border: 1px solid var(--cor-saida); color: var(--cor-saida-texto); }
</style>
