<script setup>
// Metas (aba Metas) e carteira/investimentos (aba Investimentos) de Objetivos. A tela Objetivos escolhe a aba e o item aberto;
// os dados e os formulários vivem aqui (uma só carga). Props: `aba` 'metas' | 'investimentos'; `metaAberta` / `ativoAberto` (ids,
// vindos da URL ?meta= / ?ativo=) abrem o extrato da meta ou o detalhe do ativo.
import MenuPontos from '../components/MenuPontos.vue';
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import Anel from '../components/Anel.vue';
import Orbe from '../components/Orbe.vue';
import BarraDegrade from '../components/BarraDegrade.vue';
import TopoValor from '../components/TopoValor.vue';
import CardPadrao from '../components/CardPadrao.vue';
import BarraAcoes from '../components/BarraAcoes.vue';
import BotaoAcao from '../components/BotaoAcao.vue';
import IconeCategoria from '../components/IconeCategoria.vue';
import FormularioModal from '../components/FormularioModal.vue';
import CampoTexto from '../components/CampoTexto.vue';
import CampoValor from '../components/CampoValor.vue';
import CampoData from '../components/CampoData.vue';
import CampoSelecao from '../components/CampoSelecao.vue';
import CampoTipo from '../components/CampoTipo.vue';
import CampoBase from '../components/CampoBase.vue';
import Valor from '../components/Valor.vue';
import MetaExtrato from '../components/MetaExtrato.vue';
import AtivoDetalhe from '../components/AtivoDetalhe.vue';
import OperacaoModal from '../components/OperacaoModal.vue';
import TransferirCorretoraModal from '../components/TransferirCorretoraModal.vue';
import ReservasAuto from '../components/ReservasAuto.vue';
import { Plus, PiggyBank, ArrowUpFromLine, ArrowLeftRight, Landmark } from 'lucide-vue-next';
import { resolverChave, CATALOGO, ESCOLHAS } from '../utils/icones.js';
import { api, carregarCdi, comCdi, infoCdi, dataHoraBR, moeda, numeroBR } from '../services/investimentos.js';

const router = useRouter();
const route = useRoute();
const props = defineProps({
  embutido: { type: Boolean, default: false },
  aba: { type: String, default: 'metas' },
  metaAberta: { type: String, default: '' },
  ativoAberto: { type: String, default: '' },
});
const reserva = ref(null);
const carteira = ref({ ativos: [], totais: { investido: 0, proventos: 0, realizado: 0, quantidade: 0 }, resumo_por_tipo: [], evolucao: [], corretoras: [], contas: [], tipos: [], tem_corretora: false });
const carregando = ref(true);
const versao = ref(0); // sobe a cada gravação: os componentes filhos (extrato/detalhe) recarregam
const modalAporte = ref(false);
const aporteVazio = () => ({ tipo: 'cdb', operacao: 'aporte', metaId: '', ativo: '', quantidade: '', precoUnitario: '', valor: 0, data: '', descricao: '', contaId: '' });
const editandoAporte = ref(null);
const contas = ref([]);
const aporte = ref(aporteVazio());
const erroAporte = ref('');
const errosAporte = ref({});
const errosMeta = ref({});
const salvando = ref(false);

// Metas (várias): modal de criar/editar
const modalMeta = ref(false);
const editandoMetaId = ref(null);
const metaForm = ref({ nome: '', icone: '🎯', tipoInvestimento: '', meta: 0, prazo: '' });
const erroMeta = ref('');
const confirmandoRemocao = ref(false);

// Investimentos: guardar/resgatar/provento (tema verde) e transferência banco -> corretora
const modalOp = ref(false);
const opInicial = ref('guardar');
const opAtivoId = ref('');
const opEdicao = ref(null);
const opMetaInicial = ref('');
const modalTransf = ref(false);
const avisoOp = ref('');

// Uma cor por tipo de investimento (grupo verde da paleta oficial): mesma na rosca e na lista.
// A ordem alterna matizes distantes (médios primeiro, depois claros e escuros), sem subtons vizinhos lado a lado.
const ORDEM_VERDES = [
  'var(--investimento-anis-medio)', 'var(--investimento-esmeralda-medio)', 'var(--investimento-pistache-medio)', 'var(--investimento-jade-medio)',
  'var(--investimento-lima-medio)', 'var(--investimento-menta-medio)', 'var(--investimento-folha-medio)', 'var(--investimento-verde-agua-medio)',
  'var(--investimento-anis-claro)', 'var(--investimento-esmeralda-claro)', 'var(--investimento-pistache-claro)', 'var(--investimento-jade-claro)',
  'var(--investimento-lima-claro)', 'var(--investimento-menta-claro)', 'var(--investimento-folha-claro)', 'var(--investimento-verde-agua-claro)',
  'var(--investimento-anis-escuro)', 'var(--investimento-esmeralda-escuro)',
];
const TIPOS_ORDEM = ['cdb', 'cdi', 'lci', 'lca', 'tesouro', 'poupanca', 'debentures', 'cri_cra', 'coe', 'previdencia', 'fundo', 'fii', 'fiagro', 'etf', 'bdr', 'acoes', 'cripto', 'ouro'];
const corTipo = (t) => { const i = TIPOS_ORDEM.indexOf(t); return i >= 0 ? ORDEM_VERDES[i] : 'var(--cor-texto-suave)'; };

const fatiasPizza = computed(() => (carteira.value.resumo_por_tipo || []).filter((t) => t.total > 0).map((t) => ({ ...t, cor: corTipo(t.tipo) })));

// Investimentos lidos dos bancos conectados (Open Finance): só consulta. Opcional/futuro: no app local (PWA) não há Open Finance.
const conectados = ref({ total: 0, itens: [] });
async function carregarConectados() {
  try {
    const r = await fetch('/api/open-finance/status', { credentials: 'include' });
    if (r.ok) conectados.value = (await r.json()).investimentos || conectados.value;
  } catch { /* sem conexão: a lista simplesmente não aparece */ }
}

const metas = computed(() => reserva.value?.metas || []);
const acumulado = (m) => (m.valor_acumulado ?? m.valor_atingido) || 0;
const pctMeta = (m) => (m.valor_meta ? Math.min(100, Math.round((acumulado(m) / m.valor_meta) * 100)) : 0);
const totalMetas = computed(() => metas.value.reduce((s, m) => s + m.valor_meta, 0));
const totalAtingidoMetas = computed(() => metas.value.reduce((s, m) => s + acumulado(m), 0));

// Cores das metas (eixo roxo): Reserva de Liberdade = violeta; as demais alternam matizes distantes
const ROXOS = ['ametista', 'indigo', 'ameixa', 'roxo', 'orquidea', 'purpura', 'uva-rose'];
const ehReserva = (nome) => /emerg|reserva|liberdade/i.test(String(nome || ''));
const nomeExibir = (nome) => (/reserva de emerg[êe]ncia/i.test(nome || '') ? 'Reserva de Liberdade' : nome);
const mapaCores = computed(() => {
  const mapa = {};
  let i = 0;
  metas.value.forEach((m) => {
    const t = ehReserva(m.nome) ? 'violeta' : ROXOS[i++ % ROXOS.length];
    mapa[m.id] = { cor: `var(--meta-${t}-medio)`, claro: `var(--meta-${t}-claro)` };
  });
  return mapa;
});
const corMeta = (m) => mapaCores.value[m.id] || { cor: 'var(--cor-meta)', claro: 'var(--cor-meta-clara)' };
const ultimaMeta = ref(null);
const metaSel = computed(() => metas.value.find((m) => m.id === (props.metaAberta || ultimaMeta.value)) || metas.value[0] || null);
const metaDoExtrato = computed(() => metas.value.find((m) => m.id === props.metaAberta) || null);
// Orbe da Visão geral: partes = metas (até 4); proporção = quanto já está guardado em cada uma
const partesMetas = computed(() => {
  const lista = metas.value.map((m) => ({ id: m.id, nome: nomeExibir(m.nome), cor: corMeta(m).cor, guardado: acumulado(m), alvo: m.valor_meta, pct: pctMeta(m) }));
  const comValor = lista.some((l) => l.guardado > 0);
  return lista.map((l) => ({ ...l, valor: comValor ? Math.max(l.guardado, 0.0001) : l.alvo })).sort((a, b) => b.valor - a.valor).slice(0, 4);
});
// Ícones do formulário: o backend só grava os emojis de `icones_meta`; aqui muda só a apresentação (um ícone distinto por emoji) e a ordem
const iconesForm = computed(() => {
  const vistos = new Set();
  const lista = [];
  for (const e of reserva.value?.icones_meta || []) {
    const chave = resolverChave(e, 'meta') || e;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    lista.push({ emoji: e, chave, rotulo: CATALOGO[chave]?.rotulo || '' });
  }
  const pos = (c) => { const k = ESCOLHAS.meta.indexOf(c); return k < 0 ? 99 : k; };
  return lista.sort((a, b) => pos(a.chave) - pos(b.chave));
});
const sugerirNome = (nome) => /emerg|reserva|liberdade/i.test(String(nome || ''));

async function recarregarContas() {
  const rc = await fetch('/api/contas', { credentials: 'include' });
  if (rc.ok) contas.value = await rc.json();
}
async function carregarCarteira() {
  const r = await api('GET', '/api/investimentos');
  if (r.ok) carteira.value = r.json;
}
async function carregar() {
  await carregarCdi();
  const resposta = await fetch(comCdi('/api/reserva'), { credentials: 'include' });
  if (resposta.status === 401) {
    router.push('/login');
    return;
  }
  reserva.value = await resposta.json();
  await Promise.all([recarregarContas(), carregarCarteira()]);
  carregando.value = false;
}
// Depois de qualquer gravação: recarrega tudo que depende dela
async function aposGravar(novaReserva) {
  if (novaReserva && novaReserva.metas) reserva.value = novaReserva;
  else {
    const r = await fetch(comCdi('/api/reserva'), { credentials: 'include' });
    if (r.ok) reserva.value = await r.json();
  }
  await Promise.all([recarregarContas(), carregarCarteira()]);
  versao.value += 1;
}

const larguraGrafico = 600;
const alturaGrafico = 150;
const pontosGrafico = computed(() => {
  const ev = carteira.value.evolucao || [];
  if (ev.length < 2) return null;
  const max = Math.max(...ev.map((e) => e.saldo), 1);
  const x = (i) => 28 + (i * (larguraGrafico - 56)) / (ev.length - 1);
  const y = (v) => alturaGrafico - 10 - (Math.max(v, 0) / max) * (alturaGrafico - 24);
  return {
    linha: ev.map((e, i) => `${x(i).toFixed(1)},${y(e.saldo).toFixed(1)}`).join(' '),
    pontos: ev.map((e, i) => ({ x: x(i), y: y(e.saldo), mes: e.mes, saldo: e.saldo })),
  };
});
const mesCurto = (m) => { const [a, n] = m.split('-'); return `${n}/${a.slice(2)}`; };

// --- Navegação: extrato da meta / detalhe do ativo (URL ?meta= / ?ativo=) -----------------------------------------------------
function abrirMeta(id) { ultimaMeta.value = id; router.push({ path: route.path, query: { meta: id } }); }
function abrirAtivo(id) { router.push({ path: route.path, query: { ativo: id } }); }
function fecharDetalhe() { router.push({ path: route.path, query: {} }); }

// --- Lançamentos das metas (Guardar / Resgatar) -------------------------------------------------------------------------------
const TIPOS_RAPIDOS = computed(() => reserva.value?.tipos_liquidez_rapida || ['cdb', 'cdi', 'lci', 'lca', 'tesouro', 'poupanca', 'fundo']);
function abrirAporte(operacao, meta = null) {
  editandoAporte.value = null;
  aporte.value = aporteVazio();
  if (operacao) aporte.value.operacao = operacao;
  const alvo = meta || metaSel.value || null;
  if (alvo) {
    aporte.value.metaId = alvo.id;
    if (alvo.tipo_investimento) aporte.value.tipo = alvo.tipo_investimento;
  }
  erroAporte.value = '';
  errosAporte.value = {};
  modalAporte.value = true;
}
function abrirAporteDaMeta(operacao, metaId) { abrirAporte(operacao, metas.value.find((m) => m.id === metaId) || null); }

function editarAporte(item) {
  editandoAporte.value = item.id;
  aporte.value = {
    tipo: item.tipo,
    operacao: item.operacao || 'aporte',
    metaId: item.meta_id ?? '',
    ativo: item.ativo || '',
    quantidade: item.quantidade ?? '',
    precoUnitario: item.preco_unitario ?? '',
    valor: Math.abs(item.valor),
    data: String(item.data).slice(0, 10),
    descricao: item.descricao || '',
    contaId: item.conta_id ?? '',
  };
  erroAporte.value = '';
  errosAporte.value = {};
  modalAporte.value = true;
}
const itemPorId = (id) => (reserva.value?.historico_aportes || []).find((h) => h.id === id);
function editarLancamento(id) { const it = itemPorId(id); if (it) editarAporte(it); }
function apagarLancamento(id) { const it = itemPorId(id); if (it) apagarAporte(it); }

async function apagarAporte(item) {
  if (!confirm(`Apagar este lançamento de ${moeda(Math.abs(item.valor))}? O valor volta para a conta de origem, se houver.`)) return;
  const r = await api('DELETE', comCdi(`/api/reserva/aportes/${item.id}`));
  if (!r.ok) {
    alert(r.json?.erro || 'Não foi possível apagar.');
    return;
  }
  await aposGravar(r.json);
}

const ehResgate = computed(() => aporte.value.operacao === 'resgate');
const usaCotacao = computed(() => aporte.value.quantidade !== '' || aporte.value.precoUnitario !== '');
const totalCalculado = computed(() => Math.round(Number(aporte.value.quantidade) * Number(aporte.value.precoUnitario) * 100) / 100 || 0);
const metaEscolhida = computed(() => metas.value.find((m) => m.id === String(aporte.value.metaId)) || null);
const tipoTravado = computed(() => !!metaEscolhida.value?.tipo_investimento);

watch(() => aporte.value.metaId, () => aoTrocarMeta());
function aoTrocarMeta() {
  const m = metaEscolhida.value;
  if (m?.tipo_investimento) aporte.value.tipo = m.tipo_investimento;
}
function aoTrocarTipo() {
  const m = metaEscolhida.value;
  if (m?.tipo_investimento && m.tipo_investimento !== aporte.value.tipo) aporte.value.metaId = '';
}

async function registrarAporte() {
  erroAporte.value = '';
  errosAporte.value = {};
  if (usaCotacao.value) {
    if (!(Number(aporte.value.quantidade) > 0) || !(Number(aporte.value.precoUnitario) > 0)) {
      errosAporte.value = { cotacao: 'Informe quantidade e preço unitário, ou deixe os dois em branco e preencha o valor total.' };
      return;
    }
  } else if (!(Number(aporte.value.valor) > 0)) {
    errosAporte.value = { valor: 'Informe um valor maior que zero.' };
    return;
  }
  if (!aporte.value.metaId) { errosAporte.value = { meta: 'Escolha a meta. Investimentos sem meta ficam na aba Investimentos.' }; return; }

  salvando.value = true;
  try {
    const corpo = {
      tipo: aporte.value.tipo,
      operacao: aporte.value.operacao,
      ativo: aporte.value.ativo,
      descricao: aporte.value.descricao,
      contaId: aporte.value.contaId === '' ? null : aporte.value.contaId,
      metaId: aporte.value.metaId === '' ? null : aporte.value.metaId,
    };
    if (usaCotacao.value) {
      corpo.quantidade = Number(aporte.value.quantidade);
      corpo.precoUnitario = Number(aporte.value.precoUnitario);
    } else {
      corpo.valor = Number(aporte.value.valor);
    }
    if (aporte.value.data) corpo.data = aporte.value.data;
    const r = await api(editandoAporte.value ? 'PUT' : 'POST', comCdi(editandoAporte.value ? `/api/reserva/aportes/${editandoAporte.value}` : '/api/reserva/aportes'), corpo);
    if (!r.ok) {
      erroAporte.value = r.json?.erro || 'Não foi possível registrar.';
      return;
    }
    modalAporte.value = false;
    editandoAporte.value = null;
    await aposGravar(r.json);
  } finally {
    salvando.value = false;
  }
}

// --- Metas ---------------------------------------------------------------
function abrirNovaMeta() {
  editandoMetaId.value = null;
  metaForm.value = { nome: '', icone: '🎯', tipoInvestimento: '', meta: 0, prazo: '' };
  erroMeta.value = '';
  errosMeta.value = {};
  confirmandoRemocao.value = false;
  modalMeta.value = true;
}

function abrirEdicaoMeta(m) {
  const meta = typeof m === 'string' ? metas.value.find((x) => x.id === m) : m;
  if (!meta) return;
  editandoMetaId.value = meta.id;
  metaForm.value = { nome: meta.nome, icone: meta.icone || '🎯', tipoInvestimento: meta.tipo_investimento || '', meta: meta.valor_meta, prazo: meta.prazo || '' };
  erroMeta.value = '';
  errosMeta.value = {};
  confirmandoRemocao.value = false;
  modalMeta.value = true;
}

const sugestaoAtiva = computed(() => sugerirNome(metaForm.value.nome) && reserva.value?.meta_sugerida > 0);

async function salvarMeta() {
  const f = metaForm.value;
  erroMeta.value = '';
  errosMeta.value = {};
  if (!f.nome.trim()) errosMeta.value.nome = 'Dê um nome para a meta.';
  if (!(Number(f.meta) > 0)) errosMeta.value.meta = 'Informe uma meta maior que zero.';
  if (Object.keys(errosMeta.value).length) return;
  const r = await api(editandoMetaId.value ? 'PUT' : 'POST', comCdi(editandoMetaId.value ? `/api/reserva/metas/${editandoMetaId.value}` : '/api/reserva/metas'),
    { nome: f.nome, icone: f.icone, tipoInvestimento: f.tipoInvestimento || null, valorMeta: Number(f.meta), prazo: f.prazo || null });
  if (!r.ok) { erroMeta.value = r.json?.erro || 'Não foi possível salvar a meta.'; return; }
  modalMeta.value = false;
  await aposGravar(r.json);
}

async function removerMeta() {
  if (!confirmandoRemocao.value) { confirmandoRemocao.value = true; return; }
  const r = await api('DELETE', comCdi(`/api/reserva/metas/${editandoMetaId.value}`));
  if (!r.ok) { erroMeta.value = r.json?.erro || 'Não foi possível remover.'; confirmandoRemocao.value = false; return; }
  modalMeta.value = false;
  if (props.metaAberta === editandoMetaId.value) fecharDetalhe();
  await aposGravar(r.json);
}

function usarMetaSugerida() {
  metaForm.value.meta = reserva.value.meta_sugerida;
}

const opcoesTipoRapido = computed(() => (reserva.value?.tipos_investimento || []).filter((t) => TIPOS_RAPIDOS.value.includes(t.valor)).map((t) => ({ valor: t.valor, rotulo: t.rotulo })));
const opcoesTipoMeta = computed(() => [{ valor: '', rotulo: 'Qualquer tipo de liquidez rápida' }, ...opcoesTipoRapido.value]);
const opcoesMeta = computed(() => metas.value.map((m) => ({ valor: m.id, rotulo: `${nomeExibir(m.nome)}${m.tipo_rotulo ? ` (${m.tipo_rotulo})` : ''}` })));
const opcoesContas = computed(() => [{ valor: '', rotulo: 'Nenhuma (não mexe em saldo de conta)' }, ...contas.value.map((c) => ({ valor: c.id, rotulo: `${c.nome}${c.origem === 'conectada' ? ' (conectada)' : ''}` }))]);
const opcoesOperacao = [{ id: 'aporte', rotulo: 'Guardar', tema: 'meta', icone: PiggyBank }, { id: 'resgate', rotulo: 'Resgatar', tema: 'saida', icone: ArrowUpFromLine }];
const temaForm = computed(() => (ehResgate.value ? 'saida' : 'meta'));

// --- Investimentos: operações em tema verde -------------------------------------------------------------------------------------
function abrirOperacao(tipo = 'guardar', ativo = null, edicao = null) {
  opInicial.value = tipo;
  opAtivoId.value = ativo ? ativo.id || ativo : (props.ativoAberto || '');
  opEdicao.value = edicao;
  opMetaInicial.value = '';
  modalOp.value = true;
}
async function operacaoSalva(resposta) {
  modalOp.value = false;
  avisoOp.value = resposta?.aviso || '';
  if (resposta && resposta.ativos) carteira.value = resposta;
  await aposGravar(null);
}
function editarOperacaoDoDetalhe(linha) {
  opInicial.value = linha.tipo;
  opAtivoId.value = props.ativoAberto;
  opEdicao.value = { ...linha, ativo_id: props.ativoAberto };
  modalOp.value = true;
}
async function apagarOperacaoDoDetalhe(linha) {
  if (!confirm(`Apagar este lançamento de ${moeda(linha.total)}? O valor volta para a conta, se houver.`)) return;
  const r = await api('DELETE', `/api/investimentos/operacoes/${linha.id}`);
  if (!r.ok) { alert(r.json?.erro || 'Não foi possível apagar.'); return; }
  await aposGravar(null);
}
async function transferenciaSalva() {
  modalTransf.value = false;
  await aposGravar(null);
}

const totalInvestido = computed(() => carteira.value.totais?.investido || 0);
const ativosVisiveis = computed(() => carteira.value.ativos.filter((a) => !a.encerrado));
const ativosEncerrados = computed(() => carteira.value.ativos.filter((a) => a.encerrado));
// Orbe da carteira (único da tela): distribuição por tipo
const partesOrbe = computed(() => fatiasPizza.value.map((f) => ({ nome: f.rotulo, valor: f.total, cor: f.cor })));
const linhasTopoInv = computed(() => {
  const l = [];
  if (carteira.value.totais?.proventos) l.push({ rotulo: 'Proventos recebidos', valor: carteira.value.totais.proventos });
  if (conectados.value.itens.length) l.push({ rotulo: 'Nos bancos conectados', valor: conectados.value.total });
  return l;
});
const textoAtualizacao = computed(() => {
  const partes = [];
  if (carteira.value.atualizado_em) partes.push(`Investimentos: ${dataHoraBR(carteira.value.atualizado_em)}`);
  const c = infoCdi();
  partes.push(`Bacen (CDI): ${c.atualizadoEm ? dataHoraBR(c.atualizadoEm) : 'estimativa'}${c.origem === 'snapshot' ? ' · valor aproximado' : ''}`);
  return partes.join(' · ');
});
onMounted(carregar);
onMounted(carregarConectados);
</script>

<template>
  <div :class="['pagina', { embutido }]" v-if="!carregando && reserva">
    <h1 v-if="!embutido" class="titulo-pagina">Metas</h1>

    <!-- ===== EXTRATO DA META (lista limpa) ===== -->
    <MetaExtrato v-if="metaAberta && metaDoExtrato" :meta-id="metaAberta" :cor="corMeta(metaDoExtrato).cor" :cor-clara="corMeta(metaDoExtrato).claro" :versao="versao"
      @voltar="fecharDetalhe" @guardar="(id) => abrirAporteDaMeta('aporte', id)" @resgatar="(id) => abrirAporteDaMeta('resgate', id)"
      @editar-meta="abrirEdicaoMeta" @editar-lancamento="editarLancamento" @apagar-lancamento="apagarLancamento" />

    <!-- ===== DETALHE DO ATIVO (listas tabulares) ===== -->
    <AtivoDetalhe v-else-if="ativoAberto" :ativo-id="ativoAberto" :versao="versao" @voltar="fecharDetalhe"
      @operar="(tipo, ativo) => abrirOperacao(tipo, ativo)" @editar="editarOperacaoDoDetalhe" @apagar="apagarOperacaoDoDetalhe" />

    <!-- ===== ABA METAS ===== -->
    <template v-else-if="aba === 'metas'">
      <ReservasAuto :metas="metas" :versao="versao" @decidido="aposGravar" />
      <TopoValor tema="meta" variante="3" rotulo="Total guardado em metas" :valor="totalAtingidoMetas" :linhas="[{ rotulo: metas.length === 1 ? '1 meta' : metas.length + ' metas', valor: totalMetas }, { rotulo: 'Saldo restante', valor: Math.max(0, totalMetas - totalAtingidoMetas), destaque: true }]">
        <BarraDegrade :pct="totalMetas ? Math.min(100, (totalAtingidoMetas / totalMetas) * 100) : 0" :altura="10" de="var(--cor-sobre-cor)" ate="var(--cor-sobre-cor)" />
        <template #acoes>
          <BarraAcoes compacto :colunas="3" rotulo="Ações das metas">
            <BotaoAcao compacto :icone="PiggyBank" rotulo="Guardar" tema="meta" destaque @click="abrirAporte('aporte', metaSel)" />
            <BotaoAcao compacto :icone="ArrowUpFromLine" rotulo="Resgatar" tema="meta" @click="abrirAporte('resgate', metaSel)" />
            <BotaoAcao compacto :icone="Plus" rotulo="Nova meta" tema="meta" @click="abrirNovaMeta" />
          </BarraAcoes>
        </template>
      </TopoValor>

      <CardPadrao v-if="partesMetas.length" titulo="Visão geral">
        <div class="palco-orbe" role="img" :aria-label="'Visão geral das metas: ' + partesMetas.map((a) => `${a.nome} ${a.pct}%`).join(', ')">
          <Orbe :partes="partesMetas" :tamanho="460" />
        </div>
        <ul class="legenda-aneis">
          <li v-for="a in partesMetas" :key="a.id"><i class="pt" :style="{ background: a.cor }"></i><span class="nome-leg">{{ a.nome }}</span><small class="pct-leg numero-tabular">{{ a.pct }}% da meta</small><b class="numero-tabular"><Valor :valor="a.guardado" /></b></li>
        </ul>
      </CardPadrao>

      <section class="grade-aneis" aria-label="Metas (toque para ver o extrato)">
        <button v-for="m in metas" :key="m.id" type="button" class="meta-anel" :style="{ '--cm': corMeta(m).cor }" @click="abrirMeta(m.id)">
          <Anel :pct="pctMeta(m)" :tamanho="108" :espessura="9" :de="corMeta(m).claro" :ate="corMeta(m).cor">
            <IconeCategoria :valor="m.icone || '🎯'" tipo="meta" :cor="corMeta(m).cor" :tamanho="54" />
          </Anel>
          <span class="nome-anel">{{ nomeExibir(m.nome) }}</span>
          <small class="pct-anel numero-tabular">{{ pctMeta(m) }}%</small>
          <small class="falta-anel numero-tabular"><template v-if="m.valor_meta - acumulado(m) > 0">Faltam <Valor :valor="Math.max(0, m.valor_meta - acumulado(m))" /></template><template v-else>Concluída</template></small>
        </button>
      </section>
      <p class="nota nota-centro">{{ reserva.aviso_liquidez }}</p>
    </template>

    <!-- ===== ABA INVESTIMENTOS ===== -->
    <template v-else>
      <TopoValor tema="investimento" variante="3" rotulo="Total investido" :valor="totalInvestido" :linhas="linhasTopoInv">
        <template #acoes>
          <BarraAcoes compacto :colunas="carteira.tem_corretora ? 2 : 1" rotulo="Ações dos investimentos">
            <BotaoAcao compacto :icone="PiggyBank" rotulo="Guardar" tema="investimento" destaque @click="abrirOperacao('guardar')" />
            <BotaoAcao v-if="carteira.tem_corretora" compacto :icone="ArrowLeftRight" rotulo="Transferir" tema="investimento" @click="modalTransf = true" />
          </BarraAcoes>
        </template>
      </TopoValor>
      <p v-if="avisoOp" class="aviso-op" role="status">{{ avisoOp }}</p>

      <CardPadrao v-if="!carteira.tem_corretora" tema="investimento" titulo="Cadastre sua corretora como conta">
        <p class="nota">Para a compra sair da corretora, cadastre-a em Contas (tipo Corretora) e faça a transferência banco → corretora. Sem corretora, você ainda pode conciliar a compra com a transferência que aparece no extrato do banco.</p>
        <template #rodape>
          <BarraAcoes compacto :colunas="1"><BotaoAcao compacto :icone="Landmark" rotulo="Ir para Contas" tema="investimento" @click="router.push('/contas')" /></BarraAcoes>
        </template>
      </CardPadrao>

      <CardPadrao titulo="Onde está investido">
        <div v-if="partesOrbe.length > 1" class="palco-orbe">
          <Orbe :partes="partesOrbe" :tamanho="460" />
        </div>
        <ul v-if="fatiasPizza.length" class="legenda-rosca">
          <li v-for="f in fatiasPizza" :key="f.tipo">
            <IconeCategoria :valor="f.tipo" tipo="investimento" :cor="f.cor" :tamanho="36" />
            <span class="nome-fatia">{{ f.rotulo }}<small>{{ f.pct }}%</small></span>
            <span class="numero-tabular valor-fatia"><Valor :valor="f.total" /></span>
          </li>
        </ul>
        <p v-else class="nota">Nenhum investimento registrado ainda. Toque em Guardar para começar.</p>
      </CardPadrao>

      <CardPadrao v-if="carteira.ativos.length" titulo="Meus ativos" subtitulo="Consolidados por ticker, com preço médio. Toque para ver compras e proventos.">
        <ul class="lista-ativos">
          <li v-for="a in ativosVisiveis" :key="a.id">
            <button type="button" class="linha-ativo" @click="abrirAtivo(a.id)">
              <IconeCategoria :valor="a.tipo" tipo="investimento" :cor="corTipo(a.tipo)" :tamanho="38" />
              <span class="info-ativo">
                <span class="nome-ativo">{{ a.ticker || a.nome }}</span>
                <small>{{ a.tipo_rotulo }}<template v-if="a.usa_cotas"> · {{ numeroBR(a.cotas) }} cotas<template v-if="a.preco_medio != null"> · PM {{ moeda(a.preco_medio) }}</template></template><template v-if="a.corretora_nome"> · {{ a.corretora_nome }}</template></small>
              </span>
              <span class="valor-ativo numero-tabular"><Valor :valor="a.valor_atual" /></span>
            </button>
          </li>
          <li v-for="a in ativosEncerrados" :key="a.id" class="encerrado">
            <button type="button" class="linha-ativo" @click="abrirAtivo(a.id)">
              <IconeCategoria :valor="a.tipo" tipo="investimento" :cor="corTipo(a.tipo)" :tamanho="38" />
              <span class="info-ativo"><span class="nome-ativo">{{ a.ticker || a.nome }}</span><small>Posição encerrada</small></span>
              <span class="valor-ativo numero-tabular">—</span>
            </button>
          </li>
        </ul>
      </CardPadrao>

      <CardPadrao v-if="pontosGrafico" titulo="Evolução do total investido">
        <svg class="grafico" :viewBox="`0 0 ${larguraGrafico} ${alturaGrafico + 18}`" role="img" aria-label="Evolução do saldo por mês">
          <defs>
            <linearGradient id="gAreaG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--investimento-esmeralda-claro)" stop-opacity="0.5" /><stop offset="1" stop-color="var(--investimento-esmeralda-claro)" stop-opacity="0" /></linearGradient>
            <linearGradient id="gLinhaG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--investimento-esmeralda-medio)" /><stop offset="1" stop-color="var(--investimento-jade-medio)" /></linearGradient>
          </defs>
          <polygon :points="`${pontosGrafico.pontos[0].x},${alturaGrafico - 10} ${pontosGrafico.linha} ${pontosGrafico.pontos[pontosGrafico.pontos.length - 1].x},${alturaGrafico - 10}`" fill="url(#gAreaG)" />
          <polyline :points="pontosGrafico.linha" class="linha-saldo" fill="none" stroke="url(#gLinhaG)" />
          <g v-for="(pt, i) in pontosGrafico.pontos" :key="pt.mes">
            <circle v-if="i === pontosGrafico.pontos.length - 1" :cx="pt.x" :cy="pt.y" r="5" class="ponto"><title>{{ mesCurto(pt.mes) }}: {{ moeda(pt.saldo) }}</title></circle>
            <text :x="pt.x" :y="alturaGrafico + 12" text-anchor="middle" class="eixo">{{ mesCurto(pt.mes) }}</text>
          </g>
        </svg>
        <p class="nota">Valor investido acumulado ao fim de cada mês (compras e guardados menos vendas e resgates).</p>
      </CardPadrao>

      <CardPadrao v-if="conectados.itens.length" titulo="Nos bancos conectados" subtitulo="Só consulta por enquanto: estes valores ainda não entram nas metas. Open Finance é opcional e fica para uma versão futura do app local.">
        <ul class="legenda-rosca">
          <li v-for="i in conectados.itens" :key="i.id">
            <IconeCategoria :valor="i.tipo" tipo="investimento" :tamanho="36" />
            <span class="nome-fatia">{{ i.nome }}<small>{{ i.tipo }}</small></span>
            <span class="numero-tabular valor-fatia"><Valor :valor="i.saldo" /></span>
          </li>
        </ul>
      </CardPadrao>
      <p class="nota nota-centro">Última atualização — {{ textoAtualizacao }}</p>
    </template>

    <FormularioModal :aberto="modalMeta" :titulo="editandoMetaId ? 'Editar meta' : 'Nova meta'" tema="meta" :erro="erroMeta" rotulo-salvar="Salvar meta" @salvar="salvarMeta" @fechar="modalMeta = false">
      <CampoTexto v-model="metaForm.nome" rotulo="Nome da meta" maxlength="60" placeholder="Ex: Viagem, Reserva de Liberdade" tema="meta" obrigatorio :erro="errosMeta.nome" />
      <CampoValor v-model="metaForm.meta" rotulo="Valor da meta" tema="meta" :erro="errosMeta.meta" />
      <div v-if="sugestaoAtiva" class="sugestao">
        <button type="button" class="sf-botao secundario" @click="usarMetaSugerida">Sugestão de 6 meses de gastos: {{ moeda(reserva.meta_sugerida) }}</button>
      </div>
      <CampoBase rotulo="Ícone">
        <div class="seletor-icone">
          <button v-for="o in iconesForm" :key="o.emoji" type="button" :title="o.rotulo" :aria-label="o.rotulo" :class="['opc-icone', { ativo: metaForm.icone === o.emoji }]" :aria-pressed="metaForm.icone === o.emoji" @click="metaForm.icone = o.emoji"><IconeCategoria :valor="o.emoji" tipo="meta" :tamanho="36" /></button>
        </div>
      </CampoBase>
      <CampoSelecao v-model="metaForm.tipoInvestimento" rotulo="Tipo de investimento desta meta" :opcoes="opcoesTipoMeta" tema="meta" dica="Metas aceitam só liquidez rápida: CDB/RDB com liquidez diária, Tesouro Selic, LCI/LCA, poupança e fundos DI." />
      <CampoData v-model="metaForm.prazo" rotulo="Prazo (opcional)" tema="meta" />
      <template v-if="editandoMetaId && metas.length > 1" #extra>
        <button type="button" class="sf-botao perigo" @click="removerMeta">{{ confirmandoRemocao ? 'Confirmar remoção' : 'Remover' }}</button>
      </template>
    </FormularioModal>

    <FormularioModal :aberto="modalAporte" :titulo="editandoAporte ? 'Editar lançamento' : ehResgate ? 'Resgatar da meta' : 'Guardar na meta'" :tema="temaForm" :carregando="salvando" :erro="erroAporte" :rotulo-salvar="editandoAporte ? 'Salvar alterações' : ehResgate ? 'Resgatar' : 'Guardar'" @salvar="registrarAporte" @fechar="modalAporte = false">
      <CampoTipo v-if="!editandoAporte" v-model="aporte.operacao" :opcoes="opcoesOperacao" />
      <p v-else class="nota-inline"><strong>{{ ehResgate ? 'Resgatar' : 'Guardar' }}</strong></p>
      <CampoValor v-if="!usaCotacao" v-model="aporte.valor" rotulo="Valor total" :tema="temaForm" :erro="errosAporte.valor" />
      <CampoTexto v-else :model-value="totalCalculado" rotulo="Valor total (quantidade × preço)" type="number" disabled />
      <CampoSelecao v-model="aporte.metaId" rotulo="Meta" :opcoes="opcoesMeta" :tema="temaForm" :erro="errosAporte.meta" />
      <CampoSelecao v-model="aporte.tipo" rotulo="Tipo de investimento (liquidez rápida)" :opcoes="opcoesTipoRapido" :tema="temaForm" :disabled="tipoTravado" @update:model-value="aoTrocarTipo" />
      <CampoTexto v-model="aporte.ativo" rotulo="Nome do investimento (opcional)" maxlength="60" placeholder="Ex: CDB Inter 110% CDI, Tesouro Selic" :tema="temaForm" />
      <div v-if="usaCotacao" class="duas-colunas">
        <CampoTexto v-model="aporte.quantidade" rotulo="Quantidade" type="number" step="any" min="0" :tema="temaForm" />
        <CampoTexto v-model="aporte.precoUnitario" rotulo="Preço unitário" type="number" step="any" min="0" :tema="temaForm" />
      </div>
      <p v-if="errosAporte.cotacao" class="sf-erro">{{ errosAporte.cotacao }}</p>
      <CampoData v-model="aporte.data" rotulo="Data (opcional)" atalhos :tema="temaForm" />
      <CampoSelecao v-model="aporte.contaId" :rotulo="ehResgate ? 'Conta que recebe o resgate (opcional)' : 'Conta de origem (opcional)'" :opcoes="opcoesContas" :tema="temaForm" />
      <p v-if="aporte.contaId" class="nota-inline">O saldo de contas manuais é ajustado na hora; em conta conectada o saldo continua vindo do banco.</p>
      <CampoTexto v-model="aporte.descricao" rotulo="Observação (opcional)" maxlength="200" placeholder="Ex: guardado do mês" :tema="temaForm" />
      <p class="nota-inline">Ações, FIIs, ETFs e cripto (liquidez lenta) não entram em metas: registre-os na aba Investimentos.</p>
    </FormularioModal>

    <OperacaoModal :aberto="modalOp" :carteira="carteira" :metas="metas" :ativo-id="opAtivoId" :operacao-inicial="opInicial" :edicao="opEdicao" :meta-inicial="opMetaInicial" @fechar="modalOp = false" @salvo="operacaoSalva" />
    <TransferirCorretoraModal :aberto="modalTransf" :contas="carteira.contas" :corretoras="carteira.corretoras" @fechar="modalTransf = false" @salvo="transferenciaSalva" />
  </div>
</template>

<style scoped>
.pagina { display: flex; flex-direction: column; gap: 16px; max-width: 860px; min-width: 0; }
.pagina.embutido { padding: 0; max-width: none; margin: 0; }
.titulo-pagina { font-family: var(--fonte-display); font-size: 22px; margin: 0; }
.nota, .nota-inline { font-size: 12px; color: var(--cor-texto-suave); margin: 0; }
.nota-centro { text-align: center; padding: 0 8px; }
.aviso-op { margin: 0; padding: 10px 14px; border-radius: var(--raio-card); background: var(--cor-investimento-fundo); font-size: 13px; }
.de { font-weight: 400; color: var(--cor-texto-suave); font-size: 13px; }

.palco-orbe { width: 100%; max-width: 460px; margin: 0 auto; padding-bottom: 8px; }
.legenda-aneis { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; font-size: 14px; }
.pct-leg { color: var(--cor-texto-suave); font-size: 12px; }
.legenda-aneis li { display: flex; align-items: center; gap: 10px; }
.nome-leg { flex: 1; min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
.pt { width: 12px; height: 12px; border-radius: 50%; flex: none; }

.grade-aneis { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; }
.meta-anel { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 8px 12px; border-radius: var(--raio-card); background: var(--cor-card); border: 1.5px solid var(--cor-card-borda); color: var(--cor-texto); font-family: var(--fonte-texto); cursor: pointer; min-height: 44px; min-width: 0; transition: border-color var(--anim-padrao) var(--anim-curva), background var(--anim-padrao) var(--anim-curva); }
.meta-anel:hover { background: var(--cor-realce); }
.meta-anel:focus-visible { border-color: var(--cm); }
.falta-anel { font-size: 11.5px; color: var(--cor-texto-suave); }
.pct-anel { font-size: 12px; font-weight: 500; color: var(--cor-texto-suave); margin-top: -4px; }
.nome-anel { font-size: 13px; font-weight: 600; text-align: center; overflow-wrap: anywhere; line-height: 1.25; display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: center; }


.legenda-rosca { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.legenda-rosca li { display: flex; align-items: center; gap: 12px; padding: 6px 0; font-size: 14px; min-height: 44px; }
.nome-fatia { flex: 1; min-width: 0; display: flex; flex-direction: column; font-weight: 600; overflow-wrap: anywhere; }
.nome-fatia small { font-weight: 400; color: var(--cor-texto-suave); font-size: 12px; }
.valor-fatia { font-weight: 700; color: var(--cor-investimento); }

.lista-ativos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.lista-ativos li { border-bottom: 1px solid var(--cor-borda); }
.lista-ativos li:last-child { border-bottom: none; }
.lista-ativos li.encerrado { opacity: 0.65; }
.linha-ativo { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 0; min-height: 56px; background: none; border: none; color: var(--cor-texto); font-family: var(--fonte-texto); text-align: left; cursor: pointer; }
.linha-ativo:hover { background: var(--cor-realce); }
.info-ativo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.nome-ativo { font-weight: 700; font-size: 15px; overflow-wrap: anywhere; }
.info-ativo small { color: var(--cor-texto-suave); font-size: 12px; overflow-wrap: anywhere; }
.valor-ativo { flex: none; font-weight: 700; color: var(--cor-investimento); font-size: 14px; }

.grafico { width: 100%; height: auto; }
.linha-saldo { stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.ponto { fill: var(--cor-investimento); stroke: var(--cor-card); stroke-width: 2; }
.eixo { font-size: 11px; fill: var(--cor-texto-suave); }

.duas-colunas { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
@media (max-width: 480px) { .duas-colunas { grid-template-columns: 1fr; } }
.sugestao .sf-botao { width: 100%; min-height: 44px; font-size: 14px; }
.seletor-icone { display: flex; flex-wrap: wrap; gap: 6px; }
.opc-icone { padding: 3px; border-radius: 14px; border: 2px solid transparent; background: none; cursor: pointer; min-width: 44px; min-height: 44px; display: grid; place-items: center; }
.opc-icone.ativo { border-color: var(--cor-meta); background: var(--cor-meta-fundo); }
</style>
