<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Modal from '../components/Modal.vue';
import IconeBanco from '../components/IconeBanco.vue';
import BarraDegrade from '../components/BarraDegrade.vue';
import CabecalhoPagina from '../components/CabecalhoPagina.vue';
import TopoValor from '../components/TopoValor.vue';
import CardPadrao from '../components/CardPadrao.vue';
import BotaoAcao from '../components/BotaoAcao.vue';
import BarraAcoes from '../components/BarraAcoes.vue';
import AbasSeletor from '../components/AbasSeletor.vue';
import FormularioModal from '../components/FormularioModal.vue';
import CampoTexto from '../components/CampoTexto.vue';
import CampoValor from '../components/CampoValor.vue';
import CampoData from '../components/CampoData.vue';
import CampoSelecao from '../components/CampoSelecao.vue';
import CampoConta from '../components/CampoConta.vue';
import CampoCategoria from '../components/CampoCategoria.vue';
import DividaCard from '../components/DividaCard.vue';
import DividaAcordoModal from '../components/DividaAcordoModal.vue';
import DividaPlanoGeral from '../components/DividaPlanoGeral.vue';
import RelLinha from '../components/RelLinha.vue';
import { Plus, Archive, Handshake, AlertTriangle, ListOrdered, Flame } from 'lucide-vue-next';
import { MESES } from '../services/mes.js';
import { taxaCartao as buscarTaxaCartao } from '../utils/jurosCartao.js';

const router = useRouter();
const dividas = ref([]);
const cartoesFaturas = ref([]);
// Urgência da fatura pela proximidade do vencimento (mesma lógica de cores das dívidas)
function urgenciaFatura(c) {
  const f = c.faturaAberta;
  if (!f || f.paga) return 'verde';
  const dias = Math.ceil((new Date(f.vence + 'T12:00:00') - new Date()) / 86400000);
  return dias < 0 ? 'vermelho' : dias <= 10 ? 'amarelo' : 'verde';
}
const faturaVencida = (c) => urgenciaFatura(c) === 'vermelho';
const faturasAbertas = computed(() => cartoesFaturas.value.filter((c) => c.faturaAberta && !c.faturaAberta.paga));
const totalFaturas = computed(() => faturasAbertas.value.reduce((s, c) => s + (c.faturaAberta?.total || 0), 0));
// Faturas que vencem até o fim deste mês (inclui as vencidas): entram em "A pagar este mês"
const fimDoMes = () => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth() + 1, 0).toLocaleDateString('sv-SE'); };
const faturasDoMes = computed(() => faturasAbertas.value.filter((c) => c.faturaAberta.vence && c.faturaAberta.vence <= fimDoMes()).reduce((s, c) => s + (c.faturaAberta.total || 0), 0));
// Resumo das dívidas (servidor/PWA): saldo restante de acordos, empréstimos, crediários e negativadas + parcelas do mês
const resumo = ref(null);
const curtaData = (iso) => { if (!iso) return ''; const [, m, d] = iso.split('-'); return `${d}/${m}`; };
const carregando = ref(true);
const erro = ref('');

// Média de juros do cartão (Bacen), em % ao mês, para os avisos de taxa implícita alta
const jurosCartao = ref(null);
const taxaCartaoMensal = computed(() => (jurosCartao.value ? jurosCartao.value.mensal : null));
const rotuloTaxaCartao = computed(() => jurosCartao.value?.rotulo || '');

const formularioVazio = () => ({ nome: '', origem: 'crediario', situacao: 'em_dia', saldo: 0, taxaJuros: '', parcelas: '', valorParcela: 0, vencimento: '', urgencia: '', contaId: '' });
const formulario = ref(formularioVazio());
const salvandoDivida = ref(false);
const mostrarFormulario = ref(false);
const pagamentoAlvo = ref(null);
const erroPagamento = ref('');

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function moeda(valor) {
  return formatoMoeda.format(valor);
}
const pct = (v, c = 2) => `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: c })}%`;

async function carregarDividas() {
  const resposta = await fetch('/api/dividas', { credentials: 'include' });
  if (resposta.status === 401) {
    router.push('/login');
    return;
  }
  dividas.value = await resposta.json();
  try {
    const rr = await fetch('/api/dividas/resumo', { credentials: 'include' });
    resumo.value = rr.ok ? await rr.json() : null;
  } catch { resumo.value = null; }
  carregando.value = false;
}

// ----- Abas = SITUAÇÃO: Em aberto (em dia + atrasadas) · Negativadas · Em acordo · Quitadas -----
const aba = ref('aberto');
const abaEscolhida = ref(false);
const listas = computed(() => ({
  aberto: dividas.value.filter((d) => d.aba === 'aberto'),
  negativadas: dividas.value.filter((d) => d.aba === 'negativadas'),
  acordo: dividas.value.filter((d) => d.aba === 'acordo'),
  quitadas: dividas.value.filter((d) => d.aba === 'quitadas'),
}));
const abas = computed(() => [
  { id: 'aberto', rotulo: 'Em aberto' },
  { id: 'negativadas', rotulo: 'Negativadas' },
  { id: 'acordo', rotulo: 'Em acordo' },
  { id: 'quitadas', rotulo: 'Quitadas' },
]);
const textoAba = {
  aberto: 'Dívidas em dia ou atrasadas, em ordem de risco. Faturas e compras parceladas ficam logo abaixo.',
  negativadas: 'Dívidas negativadas (SPC/Serasa), em ordem de risco.',
  acordo: 'Dívidas que viraram acordo: parcelas e juros combinados com o credor.',
  quitadas: 'Dívidas já quitadas. O histórico de pagamentos fica guardado.',
};
const tituloAba = { aberto: 'Em aberto', negativadas: 'Negativadas', acordo: 'Em acordo', quitadas: 'Quitadas' };
const vazioAba = { aberto: 'Nenhuma dívida em aberto por aqui.', negativadas: 'Nenhuma dívida negativada.', acordo: 'Nenhum acordo por aqui.', quitadas: 'Nenhuma dívida quitada ainda.' };
watch(aba, () => { abaEscolhida.value = true; });
watch(carregando, (c) => {
  // Ao abrir, vai para a primeira aba que tem algo (a menos que a pessoa já tenha escolhido)
  if (!c && !abaEscolhida.value && !listas.value.aberto.length) {
    const prox = ['negativadas', 'acordo'].find((k) => listas.value[k].length);
    if (prox) { aba.value = prox; abaEscolhida.value = false; }
  }
});
const listaDaAba = computed(() => listas.value[aba.value] || []);

async function criarDivida() {
  if (salvandoDivida.value) return;
  erro.value = '';
  const f = formulario.value;
  const temParcelas = Number(f.parcelas) >= 1 && Number(f.valorParcela) > 0;
  if (!String(f.nome || '').trim()) { erro.value = 'Informe o nome da dívida.'; return; }
  if (!(Number(f.saldo) > 0) && !temParcelas) { erro.value = 'Informe o saldo devedor (quanto falta pagar).'; return; }
  salvandoDivida.value = true;
  try {
    const resposta = await fetch('/api/dividas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        nome: String(f.nome).trim(),
        origem: f.origem,
        situacao: f.situacao,
        saldo: Number(f.saldo) > 0 ? Number(f.saldo) : undefined,
        taxaJuros: f.taxaJuros === '' || f.taxaJuros === null ? null : Number(f.taxaJuros),
        parcelas: temParcelas ? Number(f.parcelas) : null,
        valorParcela: temParcelas ? Number(f.valorParcela) : null,
        proximoVencimento: f.vencimento || null,
        urgencia: f.urgencia || undefined,
        contaId: f.contaId || null,
      }),
    });
    let corpo = null;
    try { corpo = await resposta.json(); } catch { corpo = null; }
    if (!resposta.ok || !corpo || !corpo.id) {
      erro.value = (corpo && corpo.erro) || 'Não foi possível salvar a dívida. Confira os campos e tente de novo.';
      return;
    }
    formulario.value = formularioVazio();
    mostrarFormulario.value = false;
    await carregarDividas();
    aba.value = corpo.aba || 'aberto';
    abaEscolhida.value = true;
  } catch {
    erro.value = 'Não foi possível salvar a dívida agora. Tente de novo.';
  } finally {
    salvandoDivida.value = false;
  }
}

// Editar / arquivar / restaurar / remover de vez
const dividaEditando = ref(null);
const formEdicaoDivida = ref({ nome: '', credor: '', origem: 'outra', situacao: 'em_dia', taxaJuros: '', vencimento: '', urgencia: '', contaId: '' });
const salvandoEdicao = ref(false);
const erroEdicaoDivida = ref('');
function abrirEdicaoDivida(d) {
  dividaEditando.value = d;
  formEdicaoDivida.value = { nome: d.nome, credor: d.credor ?? '', origem: d.origem || 'outra', situacao: d.situacao === 'quitada' ? 'em_dia' : d.situacao || 'em_dia', taxaJuros: d.taxa_juros ?? '', vencimento: d.proximo_vencimento ?? '', urgencia: d.urgencia_base ?? '', contaId: d.conta_id ?? '' };
  erroEdicaoDivida.value = '';
  if (!contasPg.value.length) carregarApoioPagamento();
}
async function salvarEdicaoDivida() {
  const f = formEdicaoDivida.value;
  if (salvandoEdicao.value) return;
  if (!f.nome.trim()) { erroEdicaoDivida.value = 'Informe o nome da dívida.'; return; }
  salvandoEdicao.value = true;
  try {
    const quitada = dividaEditando.value.situacao === 'quitada';
    const r = await fetch(`/api/dividas/${dividaEditando.value.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ nome: f.nome, credor: f.credor, origem: f.origem, ...(quitada ? {} : { situacao: f.situacao }), taxaJuros: f.taxaJuros, proximoVencimento: f.vencimento || null, urgencia: f.urgencia || 'auto', contaId: f.contaId || null }),
    });
    if (!r.ok) { let j = null; try { j = await r.json(); } catch { /* ignora */ } erroEdicaoDivida.value = (j && j.erro) || 'Não foi possível salvar.'; return; }
    dividaEditando.value = null;
    await carregarDividas();
  } catch { erroEdicaoDivida.value = 'Não foi possível salvar agora. Tente de novo.'; } finally { salvandoEdicao.value = false; }
}
const arquivadas = ref([]);
const mostrarArquivadas = ref(false);
const confirmandoRemocao = ref(null);
async function carregarArquivadas() {
  const r = await fetch('/api/dividas?arquivadas=1', { credentials: 'include' });
  arquivadas.value = r.ok ? await r.json() : [];
}
async function arquivarDivida(d, arquivar) {
  await fetch(`/api/dividas/${d.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ arquivada: arquivar }),
  });
  await Promise.all([carregarDividas(), carregarArquivadas()]);
}
async function removerDefinitivo(d) {
  if (confirmandoRemocao.value !== d.id) { confirmandoRemocao.value = d.id; return; }
  await fetch(`/api/dividas/${d.id}`, { method: 'DELETE', credentials: 'include' });
  confirmandoRemocao.value = null;
  await carregarArquivadas();
}

// Iniciar pagamento = lançar uma saída (mesmos campos de uma despesa), que aparece em Transações
// e é abatida desta dívida; o histórico do card mostra conta, categoria e subcategoria.
// Com parcela definida, o valor vem preenchido e pode ser editado: pagar menos que a parcela quitando-a
// registra a economia como desconto por antecipação.
const contasPg = ref([]);
const categoriasPg = ref([]);
const sugestoesPg = ref([]);
const hojeISO = () => new Date().toLocaleDateString('sv-SE');
const formPg = ref({ valor: 0, data: hojeISO(), contaId: '', categoriaId: '', subcategoria: '', descricao: '', quita: 'sim' });
const salvandoPg = ref(false);
const parcelaPg = computed(() => Number(pagamentoAlvo.value?.valor_parcela) || 0);
const abaixoDaParcela = computed(() => parcelaPg.value > 0 && Number(formPg.value.valor) > 0 && Number(formPg.value.valor) < parcelaPg.value - 0.004);
const economiaPg = computed(() => (abaixoDaParcela.value && formPg.value.quita === 'sim' ? Math.round((parcelaPg.value - Number(formPg.value.valor)) * 100) / 100 : 0));
async function carregarApoioPagamento() {
  const [rc, rk] = await Promise.all([fetch('/api/contas', { credentials: 'include' }), fetch('/api/categorias', { credentials: 'include' })]);
  if (rc.ok) contasPg.value = await rc.json();
  if (rk.ok) categoriasPg.value = await rk.json();
}
async function carregarSugestoesPg() {
  const qs = formPg.value.categoriaId ? `?categoriaId=${formPg.value.categoriaId}` : '';
  try {
    const r = await fetch(`/api/transacoes/subcategorias${qs}`, { credentials: 'include' });
    sugestoesPg.value = r.ok ? await r.json() : [];
  } catch { sugestoesPg.value = []; }
}
watch(() => formPg.value.categoriaId, carregarSugestoesPg);
async function abrirPagamento(divida) {
  pagamentoAlvo.value = divida;
  erroPagamento.value = '';
  if (!contasPg.value.length) await carregarApoioPagamento();
  formPg.value = {
    valor: Number(divida.valor_parcela) ? Math.min(Number(divida.valor_parcela), divida.saldo) : 0, data: hojeISO(), contaId: contasPg.value[0]?.id ?? '', categoriaId: '', subcategoria: '',
    descricao: `Pagamento · ${divida.nome}`, quita: 'sim',
  };
  carregarSugestoesPg();
}

async function registrarPagamento() {
  const divida = pagamentoAlvo.value;
  const f = formPg.value;
  const valor = Number(f.valor);
  if (!divida || salvandoPg.value) return;
  if (!valor || valor <= 0) {
    erroPagamento.value = 'Informe um valor maior que zero.';
    return;
  }
  if (!f.contaId) {
    erroPagamento.value = 'Escolha a conta de onde saiu o pagamento.';
    return;
  }
  salvandoPg.value = true;
  try {
    const cab = { 'Content-Type': 'application/json' };
    const rt = await fetch('/api/transacoes', {
      method: 'POST', headers: cab, credentials: 'include',
      body: JSON.stringify({
        tipo: 'saida', contaId: f.contaId, descricao: f.descricao.trim() || `Pagamento · ${divida.nome}`, valor, data: f.data,
        categoriaId: f.categoriaId || null, subcategoria: f.subcategoria,
      }),
    });
    const tx = await rt.json();
    if (!rt.ok) { erroPagamento.value = tx.erro || 'Não foi possível lançar o pagamento.'; return; }
    const resposta = await fetch(`/api/dividas/${divida.id}/pagamentos`, {
      method: 'POST', headers: cab, credentials: 'include', body: JSON.stringify({ transacaoId: tx.id, quitaParcela: abaixoDaParcela.value && f.quita === 'sim' }),
    });
    if (!resposta.ok) {
      const dados = await resposta.json();
      erroPagamento.value = dados.erro || 'Não foi possível registrar o pagamento.';
      return;
    }
    pagamentoAlvo.value = null;
    await carregarDividas();
  } finally {
    salvandoPg.value = false;
  }
}

// ----- Acordos: adicionar/renegociar com simulação dos juros implícitos -----
const acordoAberto = ref(false);
const acordoInicial = ref(null);
const acordoEditando = ref(false);
function abrirAcordo(d = null, editar = false) {
  acordoInicial.value = d;
  acordoEditando.value = editar === true;
  acordoAberto.value = true;
}
// O acordo vira a situação "Em acordo": a pessoa é levada para essa aba
async function acordoSalvo(d) {
  acordoAberto.value = false;
  await carregarDividas();
  aba.value = d?.aba || 'acordo';
  abaEscolhida.value = true;
}

// ----- Plano para todas as dívidas (avalanche × bola de neve) -----
// /dividas?plano=1 (atalho do aviso da previsão do saldo, anotação 51) já abre o plano.
const planoAberto = ref(router.currentRoute.value.query.plano === '1');

// ----- Acordo quebrado: a dívida volta ao valor original + encargos -----
const quebrarAlvo = ref(null);
const encargosQuebra = ref('5');
const previaQuebra = ref(null);
const erroQuebra = ref('');
const salvandoQuebra = ref(false);
async function pedirQuebra(simular) {
  const r = await fetch(`/api/dividas/${quebrarAlvo.value.id}/quebrar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ simular, encargosPct: Number(encargosQuebra.value) || 0 }),
  });
  return { ok: r.ok, json: await r.json() };
}
async function abrirQuebra(d) {
  quebrarAlvo.value = d;
  encargosQuebra.value = String(d.encargos_pct ?? 5);
  erroQuebra.value = '';
  previaQuebra.value = null;
  const r = await pedirQuebra(true);
  if (r.ok) previaQuebra.value = r.json; else erroQuebra.value = r.json.erro || '';
}
watch(encargosQuebra, async () => {
  if (!quebrarAlvo.value) return;
  const r = await pedirQuebra(true);
  if (r.ok) { previaQuebra.value = r.json; erroQuebra.value = ''; } else erroQuebra.value = r.json.erro || '';
});
async function confirmarQuebra() {
  salvandoQuebra.value = true;
  try {
    const r = await pedirQuebra(false);
    if (!r.ok) { erroQuebra.value = r.json.erro || 'Não foi possível registrar a quebra.'; return; }
    quebrarAlvo.value = null;
    await carregarDividas();
  } finally { salvandoQuebra.value = false; }
}

function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

// Juros mais caros (anotação 60.5): cheque especial (conta negativa) e rotativo (fatura vencida ou paga em parte).
// Aparecem antes da lista, com selo; a taxa sem cadastro usa a média do Bacen (rotativo) ou o teto do cheque especial.
const caros = ref([]);
async function carregarCaros(rotativo) {
  try {
    const qs = rotativo ? `?rotativo=${encodeURIComponent(rotativo.toFixed(2))}` : '';
    const r = await fetch(`/api/dividas/caros${qs}`, { credentials: 'include' });
    caros.value = r.ok ? await r.json() : [];
  } catch { caros.value = []; }
}
const pctCaro = (v) => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

async function carregarFaturasCartoes() {
  try {
    const r = await fetch('/api/cartoes', { credentials: 'include' });
    if (r.ok) cartoesFaturas.value = await r.json();
    carregarParceladas();
  } catch { cartoesFaturas.value = []; }
}

// Compras parceladas de todos os cartões: o que falta pagar nas faturas FUTURAS (depois da aberta).
// Não é dívida com juros: não entra no total devido.
const parceladas = ref([]);
const carregandoParc = ref(true);
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloFim = (k) => { const [a, m] = k.split('-').map(Number); return `${MESES_CURTOS[m - 1]}/${a}`; };
async function carregarParceladas() {
  const grupos = new Map();
  try {
    await Promise.all(cartoesFaturas.value.map(async (c) => {
      const aberta = c.faturaAberta?.chave;
      const rf = await fetch(`/api/cartoes/${c.id}/faturas`, { credentials: 'include' });
      if (!rf.ok || !aberta) return;
      const futuras = (await rf.json()).filter((f) => f.chave > aberta && f.total > 0);
      const exts = await Promise.all(futuras.map((f) => fetch(`/api/cartoes/${c.id}/extrato?fatura=${f.chave}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
      exts.filter(Boolean).forEach((e) => e.lancamentos.forEach((l) => {
        if (!(l.totalParcelas > 1) || l.fatura <= aberta) return;
        const k = `${c.id}|${l.compraId}`;
        const g = grupos.get(k) || { id: k, descricao: l.descricao, cartao: c.nome, total: l.totalParcelas, primeira: l.parcelaNumero, restantes: 0, falta: 0, fim: l.fatura };
        g.restantes += 1; g.falta += l.valor; g.primeira = Math.min(g.primeira, l.parcelaNumero); if (l.fatura > g.fim) g.fim = l.fatura;
        grupos.set(k, g);
      }));
    }));
  } catch { /* segue com o que veio */ }
  parceladas.value = [...grupos.values()].map((g) => ({ ...g, falta: Math.round(g.falta * 100) / 100, pago: g.primeira - 1, pct: Math.round(((g.primeira - 1) / g.total) * 100) })).sort((a, b) => b.falta - a.falta);
  carregandoParc.value = false;
}
const totalParceladas = computed(() => parceladas.value.reduce((s, g) => s + g.falta, 0));

// Total devido = faturas abertas dos cartões + saldo restante de acordos, empréstimos, crediários e negativadas.
// Compras parceladas no cartão ficam de fora (não têm juros; já estão nas faturas futuras): sem dupla contagem.
const totalDividasSaldo = computed(() => (resumo.value ? resumo.value.totalDividas : dividas.value.reduce((t, d) => t + Math.max(0, d.situacao === 'quitada' ? 0 : d.saldo || 0), 0)));
const totalDevido = computed(() => Math.round((totalFaturas.value + totalDividasSaldo.value) * 100) / 100);
// A pagar este mês = faturas que vencem no mês + parcelas do mês (inclui as atrasadas)
const aPagarMes = computed(() => Math.round((faturasDoMes.value + (resumo.value ? resumo.value.parcelasMes : 0)) * 100) / 100);
const ehDinheiro = (p) => (p.tipo || 'pagamento') === 'pagamento' || p.tipo === 'entrada';

const opcoesUrgencia = [{ valor: '', rotulo: 'Automática (recomendado)' }, { valor: 'vermelho', rotulo: 'Alta: risco de negativação' }, { valor: 'amarelo', rotulo: 'Média: atenção' }, { valor: 'verde', rotulo: 'Baixa: sob controle' }];
// Origem = de onde a dívida veio. Situação = como ela está agora (define a aba).
const opcoesOrigem = [
  { valor: 'cartao', rotulo: 'Cartão' },
  { valor: 'crediario', rotulo: 'Crediário / carnê' },
  { valor: 'emprestimo', rotulo: 'Empréstimo / financiamento' },
  { valor: 'conta_atrasada', rotulo: 'Conta atrasada' },
  { valor: 'pessoa', rotulo: 'Pessoa' },
  { valor: 'outra', rotulo: 'Outra' },
];
const opcoesSituacaoNova = [
  { valor: 'em_dia', rotulo: 'Em dia' },
  { valor: 'atrasada', rotulo: 'Atrasada' },
  { valor: 'negativada', rotulo: 'Negativada (SPC/Serasa)' },
];
// "Em acordo" só existe para quem tem acordo (Adicionar acordo / Propor acordo); a edição só oferece quando já há acordo
const opcoesSituacaoEdicao = computed(() => (dividaEditando.value?.parcelas_total ? [...opcoesSituacaoNova, { valor: 'em_acordo', rotulo: 'Em acordo' }] : opcoesSituacaoNova));
const opcoesContaVinc = computed(() => [{ valor: '', rotulo: 'Nenhum' }, ...contasPg.value.map((c) => ({ valor: c.id, rotulo: c.nome }))]);
const contasCampo = computed(() => contasPg.value.map((c) => ({ id: c.id, nome: c.nome, icone: c.icone })));
const categoriasCampo = computed(() => categoriasPg.value.filter((c) => !c.tipo || c.tipo === 'saida').map((c) => ({ id: c.id, nome: c.nome, icone: c.icone, cor: c.cor })));
const dividasAtivas = computed(() => dividas.value.filter((d) => d.saldo > 0 && d.situacao !== 'quitada'));
const pctFatura = (c) => (c.limite ? Math.min(100, Math.round(((c.faturaAberta?.total || 0) / c.limite) * 100)) : 0);

// Evolução do total devido: reconstruída a partir do histórico de pagamentos (últimos 6 meses)
const evolucao = computed(() => {
  const pts = [];
  const hoje = new Date();
  for (let k = 5; k >= 0; k--) {
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() - k + 1, 0, 23, 59);
    const ini = new Date(fim.getFullYear(), fim.getMonth(), 1, 0, 0);
    let total = totalDividasSaldo.value;
    let pago = 0;
    dividas.value.forEach((d) => (d.historico_pagamentos || []).forEach((p) => {
      if (!ehDinheiro(p)) return;
      const dt = new Date(String(p.data).slice(0, 10) + 'T12:00:00');
      if (dt > fim) total += (Number(p.valor) || 0) + (Number(p.desconto_antecipacao) || 0);
      else if (dt >= ini) pago += Number(p.valor) || 0;
    }));
    const r2 = (v) => Math.round(v * 100) / 100;
    pts.push({ rotulo: MESES[fim.getMonth()].slice(0, 3).toUpperCase(), nome: `${MESES[fim.getMonth()][0].toUpperCase()}${MESES[fim.getMonth()].slice(1)} de ${fim.getFullYear()}`, valor: r2(total), pago: r2(pago), inicio: r2(total + pago) });
  }
  return pts;
});

const mesEvo = ref(-1);
const detalheEvo = computed(() => evolucao.value[mesEvo.value] || null);

onMounted(() => {
  carregarApoioPagamento(); carregarDividas(); carregarFaturasCartoes(); carregarArquivadas();
  buscarTaxaCartao().then((t) => { jurosCartao.value = t; carregarCaros(t?.rotativoMensal); }).catch(() => carregarCaros());
});
</script>

<template>
  <div class="pagina">
    <CabecalhoPagina titulo="Dívidas" sem-mes>
      <template #corpo>
    <div class="corpo-pagina">
    <TopoValor tema="saida" variante="2" rotulo="Total devido" :valor="totalDevido"
      :linhas="[{ rotulo: 'A pagar este mês', valor: aPagarMes, destaque: true }, { rotulo: 'Faturas dos cartões', valor: totalFaturas }, { rotulo: 'Acordos, empréstimos e outras dívidas', valor: totalDividasSaldo }]">
      <template #acoes>
        <BarraAcoes compacto :colunas="4" rotulo="Ações de dívidas">
          <BotaoAcao compacto :icone="Plus" rotulo="Nova dívida" tema="saida" destaque @click="mostrarFormulario = true; erro = ''" />
          <BotaoAcao compacto :icone="Handshake" rotulo="Adicionar acordo" tema="saida" @click="abrirAcordo()" />
          <BotaoAcao compacto :icone="ListOrdered" rotulo="Plano geral" titulo="Plano para todas as dívidas" tema="saida" @click="planoAberto = true" />
          <BotaoAcao compacto :icone="Archive" :rotulo="`Arquivadas (${arquivadas.length})`" tema="saida" @click="mostrarArquivadas = true; confirmandoRemocao = null; carregarArquivadas()" />
        </BarraAcoes>
      </template>
    </TopoValor>

    <AbasSeletor v-model="aba" :abas="abas" tema="saida" bloco swipe />

    <CardPadrao v-if="aba === 'aberto' && caros.length" class="card-caros" titulo="Pague primeiro: juros mais caros" ajuda="dividas.juros-caros" data-juros-caros>
      <ul class="lista-limpa">
        <li v-for="c in caros" :key="c.id" class="caro-item">
          <span class="caro-ico" aria-hidden="true"><Flame :size="16" /></span>
          <span class="meio">
            <span class="linha1"><strong>{{ c.nome }}</strong><span class="numero-tabular valor">{{ moeda(c.saldo) }}</span></span>
            <span class="linha2"><span class="selo-caro">juros mais caros</span><small>{{ c.rotulo }} · {{ pctCaro(c.taxa) }} ao mês{{ c.taxaEstimada ? ' (estimado)' : '' }}</small></span>
            <small class="frase-caro">{{ c.frase }}</small>
          </span>
        </li>
      </ul>
      <button type="button" class="botao-secundario" @click="planoAberto = true">Ver plano de quitação</button>
    </CardPadrao>

    <CardPadrao :ajuda="'dividas.aba-' + aba" :titulo="listaDaAba.length ?`${tituloAba[aba]} (${listaDaAba.length})` : tituloAba[aba]" :subtitulo="listaDaAba.length && aba !== 'quitadas' ? 'Maior risco primeiro' : ''">
      <template v-if="listaDaAba.length">
        <ul class="lista-limpa">
          <DividaCard v-for="divida in listaDaAba" :key="divida.id" :divida="divida" :taxa-cartao="taxaCartaoMensal" :rotulo-taxa-cartao="rotuloTaxaCartao"
            @pagar="abrirPagamento" @acordo="abrirAcordo($event)" @editar-acordo="abrirAcordo($event, true)" @quebrar="abrirQuebra" @editar="abrirEdicaoDivida" @arquivar="arquivarDivida" @recarregar="carregarDividas" />
        </ul>
      </template>
      <div v-else class="vazio">
        <p class="nota">{{ carregando ? 'Carregando…' : vazioAba[aba] }}</p>
        <div v-if="!carregando && aba !== 'quitadas'" class="vazio-acoes">
          <button v-if="aba === 'acordo' || aba === 'negativadas'" type="button" class="botao-secundario" @click="abrirAcordo()">Adicionar acordo</button>
          <button type="button" class="botao-secundario" @click="mostrarFormulario = true; erro = ''">Nova dívida</button>
        </div>
      </div>
    </CardPadrao>

    <template v-if="aba === 'aberto'">
      <CardPadrao v-if="cartoesFaturas.length" titulo="Faturas a pagar" ajuda="dividas.faturas">
        <template #acoes><span :class="['total-fat', 'numero-tabular']">{{ moeda(totalFaturas) }}</span></template>
        <ul class="lista-limpa">
          <li v-for="c in cartoesFaturas" :key="c.id" class="item-lista" role="button" tabindex="0" @click="router.push({ name: 'cartao-extrato', params: { id: c.id } })" @keydown.enter="router.push({ name: 'cartao-extrato', params: { id: c.id } })">
            <span class="ico"><IconeBanco :icone="c.icone" :nome="c.nome" padrao="💳" :tamanho="26" /></span>
            <span class="meio">
              <span class="linha1"><strong>{{ c.nome }}</strong><span class="numero-tabular valor" :class="{ vencida: faturaVencida(c) }">{{ moeda(c.faturaAberta?.total || 0) }}</span></span>
              <span class="linha2"><small :class="{ 'etq-grave': faturaVencida(c) }">{{ c.faturaAberta?.paga ? 'Fatura paga' : (faturaVencida(c) ? 'Vencida em ' : 'Vence ') + curtaData(c.faturaAberta?.vence) }}</small><small v-if="c.limite">{{ pctFatura(c) }}% do limite</small></span>
              <BarraDegrade v-if="c.limite" :pct="pctFatura(c)" :altura="5" :marcador="false" de="var(--saida-ambar-medio)" ate="var(--saida-carmim-medio)" />
            </span>
          </li>
        </ul>
      </CardPadrao>

      <CardPadrao titulo="Compras parceladas" ajuda="dividas.parceladas">
        <template #acoes><span class="total-fat numero-tabular">{{ moeda(totalParceladas) }}</span></template>
        <p v-if="!parceladas.length" class="nota">{{ carregandoParc ? 'Carregando…' : 'Nenhuma compra parcelada com parcelas futuras.' }}</p>
        <ul v-else class="lista-limpa">
          <li v-for="g in parceladas" :key="g.id" class="parc">
            <span class="linha1"><strong>{{ g.descricao }}</strong><span class="numero-tabular valor">{{ moeda(g.falta) }}</span></span>
            <BarraDegrade :pct="g.pct" :altura="5" :marcador="false" de="var(--saida-ambar-medio)" ate="var(--saida-carmim-medio)" />
            <span class="linha2"><small>{{ g.cartao }} · {{ g.pago }}/{{ g.total }} pagas · faltam {{ g.restantes }}</small><small>até {{ rotuloFim(g.fim) }}</small></span>
          </li>
        </ul>
      </CardPadrao>

      <CardPadrao titulo="Juros médios do cartão" ajuda="dividas.juros-medios">
        <template v-if="jurosCartao">
          <dl class="juros-cartao">
            <div><dt>Média do cartão</dt><dd class="numero-tabular">{{ pct(jurosCartao.mensal) }} ao mês</dd></div>
            <div><dt>Ao ano</dt><dd class="numero-tabular">{{ pct(jurosCartao.anual, 1) }}</dd></div>
            <div v-if="jurosCartao.rotativoMensal != null"><dt>Rotativo</dt><dd class="numero-tabular">{{ pct(jurosCartao.rotativoMensal, 1) }} ao mês</dd></div>
            <div v-if="jurosCartao.parceladoMensal != null"><dt>Parcelado</dt><dd class="numero-tabular">{{ pct(jurosCartao.parceladoMensal, 1) }} ao mês</dd></div>
          </dl>
          <p class="nota">Taxa média do Bacen para pessoa física · {{ jurosCartao.rotulo }}{{ jurosCartao.origem === 'snapshot' ? ' (valor aproximado guardado no app; atualiza quando houver internet)' : '' }}.</p>
          <p v-if="dividasAtivas.some((d) => d.acordo?.taxaMensal > jurosCartao.mensal)" class="aviso-juros"><AlertTriangle :size="14" aria-hidden="true" /> Há acordo(s) com taxa implícita acima da média dos cartões: {{ dividasAtivas.filter((d) => d.acordo?.taxaMensal > jurosCartao.mensal).map((d) => d.nome).join(', ') }}.</p>
          <p v-else class="nota">Nenhum acordo seu está acima dessa média.</p>
        </template>
        <p v-else class="nota">Taxa média do Bacen indisponível por enquanto. Ela é baixada quando houver internet.</p>
      </CardPadrao>
    </template>

    <CardPadrao v-if="dividas.length" titulo="Evolução das dívidas" subtitulo="Últimos 6 meses" ajuda="dividas.evolucao">
      <RelLinha :pontos="evolucao" :selecionado="mesEvo >= 0 ? mesEvo : evolucao.length - 1" de="var(--saida-ambar-medio)" ate="var(--saida-carmim-medio)" :formato="moeda" @escolher="mesEvo = $event" />
      <dl v-if="detalheEvo" class="detalhe-evo" aria-live="polite">
        <div class="cab"><dt>{{ detalheEvo.nome }}</dt></div>
        <div><dt>Saldo devedor</dt><dd class="numero-tabular">{{ moeda(detalheEvo.inicio) }}</dd></div>
        <div><dt>Pago no mês</dt><dd class="numero-tabular">{{ moeda(detalheEvo.pago) }}</dd></div>
        <div><dt>Falta pagar</dt><dd class="numero-tabular">{{ moeda(detalheEvo.valor) }}</dd></div>
      </dl>
    </CardPadrao>
    </div>
      </template>
    </CabecalhoPagina>

    <DividaPlanoGeral :aberto="planoAberto" @fechar="planoAberto = false" />

    <DividaAcordoModal :aberto="acordoAberto" :dividas="dividasAtivas" :inicial="acordoInicial" :editar="acordoEditando" :taxa-cartao="taxaCartaoMensal" :rotulo-taxa-cartao="rotuloTaxaCartao" @fechar="acordoAberto = false" @salvo="acordoSalvo" />

    <FormularioModal :aberto="!!quebrarAlvo" :titulo="`Acordo quebrado · ${quebrarAlvo ? quebrarAlvo.nome : ''}`" tema="saida" rotuloSalvar="Confirmar quebra" :carregando="salvandoQuebra" :erro="erroQuebra" @salvar="confirmarQuebra" @fechar="quebrarAlvo = null">
      <p class="nota">Se o acordo foi quebrado, o desconto se perde: a dívida volta ao valor original, mais os encargos, menos o que você já pagou. Ela passa a contar como negativada e sobe na lista de risco.</p>
      <CampoTexto v-model="encargosQuebra" type="number" step="0.5" min="0" max="200" inputmode="decimal" rotulo="Encargos sobre o valor original (%)" dica="Multa, juros de mora e correção que o credor cobra. Ajuste conforme o contrato." dica-ao-focar />
      <dl v-if="previaQuebra" class="detalhe-evo previa-quebra" aria-live="polite">
        <div><dt>Valor original</dt><dd class="numero-tabular">{{ moeda(previaQuebra.valorOriginal) }}</dd></div>
        <div><dt>Encargos</dt><dd class="numero-tabular">+ {{ moeda(previaQuebra.encargos) }}</dd></div>
        <div><dt>Já pago</dt><dd class="numero-tabular">− {{ moeda(previaQuebra.jaPago) }}</dd></div>
        <div><dt>Saldo antes</dt><dd class="numero-tabular">{{ moeda(previaQuebra.saldoAnterior) }}</dd></div>
        <div><dt>Novo saldo</dt><dd class="numero-tabular">{{ moeda(previaQuebra.novoSaldo) }}</dd></div>
        <div><dt>Acréscimo</dt><dd class="numero-tabular">{{ previaQuebra.acrescimo >= 0 ? '+' : '−' }} {{ moeda(Math.abs(previaQuebra.acrescimo)) }}</dd></div>
      </dl>
    </FormularioModal>

    <Modal :aberto="mostrarArquivadas" titulo="Dívidas arquivadas" @fechar="mostrarArquivadas = false">
      <p v-if="!arquivadas.length" class="nota">Nenhuma dívida arquivada. Use o menu ⋮ de uma dívida para arquivar.</p>
      <ul v-else class="lista-arquivadas">
        <li v-for="d in arquivadas" :key="d.id">
          <span class="arq-info"><strong>{{ d.nome }}</strong><small class="numero-tabular">Saldo {{ moeda(d.saldo) }} · {{ d.historico_pagamentos.length }} {{ d.historico_pagamentos.length === 1 ? 'lançamento' : 'lançamentos' }}</small></span>
          <span class="arq-acoes">
            <button type="button" class="botao-mini" @click="arquivarDivida(d, false)">Restaurar</button>
            <button type="button" class="botao-mini perigo-mini" @click="removerDefinitivo(d)">{{ confirmandoRemocao === d.id ? 'Confirmar remoção' : 'Remover' }}</button>
          </span>
        </li>
      </ul>
      <div class="acoes-formulario"><button type="button" class="botao-secundario" @click="mostrarArquivadas = false">Fechar</button></div>
    </Modal>

    <FormularioModal :aberto="!!dividaEditando" titulo="Editar dívida" ajuda="dividas.campos" tema="saida" :carregando="salvandoEdicao" :erro="erroEdicaoDivida" @salvar="salvarEdicaoDivida" @fechar="dividaEditando = null">
      <CampoTexto v-model="formEdicaoDivida.nome" rotulo="Nome" obrigatorio />
      <CampoSelecao v-model="formEdicaoDivida.origem" :opcoes="opcoesOrigem" rotulo="Origem" dica="De onde a dívida veio." dica-ao-focar />
      <CampoSelecao v-if="dividaEditando && dividaEditando.situacao !== 'quitada'" v-model="formEdicaoDivida.situacao" :opcoes="opcoesSituacaoEdicao" rotulo="Situação" dica="Como a dívida está agora. Define a aba." dica-ao-focar />
      <CampoTexto v-model="formEdicaoDivida.credor" rotulo="Credor — opcional" dica="Banco, loja, empresa de cobrança ou pessoa." dica-ao-focar />
      <CampoTexto v-model="formEdicaoDivida.taxaJuros" type="number" step="0.01" rotulo="Taxa de juros ao mês (%) — opcional" dica="Está no contrato ou no boleto. 0 = sem juros." dica-ao-focar />
      <CampoData v-model="formEdicaoDivida.vencimento" rotulo="Próximo vencimento — opcional" dica="Se passar, a dívida vira Atrasada." dica-ao-focar />
      <CampoSelecao v-model="formEdicaoDivida.contaId" :opcoes="opcoesContaVinc" rotulo="Banco / conta vinculado — opcional" dica="Ajuda a achar os pagamentos desta dívida." dica-ao-focar />
      <CampoSelecao v-model="formEdicaoDivida.urgencia" :opcoes="opcoesUrgencia" rotulo="Urgência" dica="Escolher à mão define o mínimo." dica-ao-focar />
    </FormularioModal>

    <FormularioModal :aberto="mostrarFormulario" titulo="Nova dívida" ajuda="dividas.campos" tema="saida" rotuloSalvar="Salvar dívida" :carregando="salvandoDivida" :erro="erro" @salvar="criarDivida" @fechar="mostrarFormulario = false">
      <CampoTexto v-model="formulario.nome" rotulo="Nome" placeholder="Ex: Carnê Magalu" obrigatorio />
      <CampoSelecao v-model="formulario.origem" :opcoes="opcoesOrigem" rotulo="Origem" dica="De onde a dívida veio." dica-ao-focar />
      <CampoSelecao v-model="formulario.situacao" :opcoes="opcoesSituacaoNova" rotulo="Situação" dica="Acordo com o credor? Use 'Adicionar acordo'." dica-ao-focar />
      <CampoValor v-model="formulario.saldo" tipo="saida" rotulo="Saldo devedor" dica="Quanto falta pagar hoje." dica-ao-focar />
      <CampoTexto v-model="formulario.parcelas" type="number" inputmode="numeric" min="1" step="1" rotulo="Parcelas restantes — opcional" placeholder="Ex: 10" />
      <CampoValor v-if="Number(formulario.parcelas) >= 1" v-model="formulario.valorParcela" tipo="saida" rotulo="Valor da parcela" />
      <CampoData v-model="formulario.vencimento" rotulo="Próximo vencimento — opcional" dica="Se passar, a dívida vira Atrasada." dica-ao-focar />
      <CampoTexto v-model="formulario.taxaJuros" type="number" step="0.01" rotulo="Taxa de juros ao mês (%) — opcional" placeholder="Ex: 8.5" dica="0 = sem juros; em branco = não sei." dica-ao-focar />
      <CampoSelecao v-model="formulario.contaId" :opcoes="opcoesContaVinc" rotulo="Banco / conta vinculado — opcional" dica="Ajuda a achar os pagamentos desta dívida." dica-ao-focar />
      <CampoSelecao v-model="formulario.urgencia" :opcoes="opcoesUrgencia" rotulo="Urgência" dica="Escolher à mão define o mínimo." dica-ao-focar />
    </FormularioModal>

    <FormularioModal :aberto="!!pagamentoAlvo" :titulo="`Iniciar pagamento · ${pagamentoAlvo ? pagamentoAlvo.nome : ''}`" ajuda="dividas.pagamento" tema="saida" rotuloSalvar="Registrar pagamento" :carregando="salvandoPg" :erro="erroPagamento" @salvar="registrarPagamento" @fechar="pagamentoAlvo = null">
      <CampoValor v-model="formPg.valor" tipo="saida" rotulo="Valor pago" :dica="parcelaPg ? `Parcela: ${moeda(parcelaPg)}. Você pode editar o valor.` : ''" autofocus />
      <template v-if="abaixoDaParcela">
        <CampoSelecao v-model="formPg.quita" :opcoes="[{ valor: 'sim', rotulo: 'Sim, quita a parcela (desconto por antecipação)' }, { valor: 'nao', rotulo: 'Não, é só um pagamento parcial' }]" rotulo="Esse valor quita a parcela?" />
        <p v-if="economiaPg > 0" class="economia-pg">Economia por antecipação: <strong class="numero-tabular">{{ moeda(economiaPg) }}</strong>. A parcela de {{ moeda(parcelaPg) }} sai do saldo por inteiro.</p>
      </template>
      <CampoTexto v-model="formPg.descricao" rotulo="Descrição" maxlength="120" />
      <CampoData v-model="formPg.data" rotulo="Data" atalhos />
      <CampoConta v-model="formPg.contaId" :contas="contasCampo" rotulo="Conta de onde saiu" compacto />
      <CampoSelecao v-model="formPg.categoriaId" :opcoes="[{ valor: '', rotulo: 'Automática pelo nome' }, ...categoriasPg.map((c) => ({ valor: c.id, rotulo: c.nome }))]" rotulo="Categoria de despesa (opcional)" />
      <CampoTexto v-model="formPg.subcategoria" rotulo="Subcategoria (opcional)" maxlength="80" placeholder="Ex: Parcela de outubro" list="sugestoes-sub-pg" autocomplete="off" />
      <datalist id="sugestoes-sub-pg"><option v-for="s in sugestoesPg" :key="s" :value="s" /></datalist>
    </FormularioModal>
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
.nota { font-size: 13px; color: var(--cor-texto-suave); margin: 0; }
button { font-family: var(--fonte-texto); font-weight: 600; font-size: 14px; padding: 10px 16px; border-radius: 12px; border: none; background: var(--cor-primaria); color: var(--cor-sobre-cor); cursor: pointer; min-height: 44px; }
.botao-secundario { background: transparent; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.barra-quit { padding: 6px 0 2px; }
.barra-quit :deep(.barra) { background: color-mix(in srgb, var(--cor-sobre-cor) 28%, transparent); }
.linha-quit { display: flex; justify-content: space-between; gap: 6px 14px; flex-wrap: wrap; font-size: 13px; }
.termina { margin: 6px 0 0; font-size: 14px; }
.total-fat { font-family: var(--fonte-display); font-size: 16px; font-weight: 700; color: var(--cor-saida-texto); }
.corpo-pagina { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.filtros { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px 0; }
.filtros::-webkit-scrollbar { display: none; }
.chip { flex: none; min-height: 44px; padding: 8px 14px; border-radius: 999px; font-size: 13px; background: transparent; color: var(--cor-texto-suave); border: 1px solid var(--cor-borda); }
.chip.ativo { background: var(--degrade-saida); color: var(--cor-sobre-cor); border-color: transparent; }
.parc { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; }
.valor.vencida, .etq-grave { color: var(--cor-grave) !important; font-weight: 700; }
.detalhe-evo { margin: 6px 0 0; padding: 10px 12px; border-radius: 12px; background: var(--cor-fundo); border: 1px solid var(--cor-borda); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 10px; font-size: 12px; }
.detalhe-evo .cab { grid-column: 1 / -1; font-weight: 600; color: var(--cor-texto-suave); }
.detalhe-evo dt { color: var(--cor-texto-suave); }
.detalhe-evo dd { margin: 2px 0 0; font-weight: 600; color: var(--cor-texto); overflow-wrap: anywhere; }

.lista-limpa { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.lista-limpa > li { border-bottom: 1px solid var(--cor-borda); }
.lista-limpa > li:last-child { border-bottom: none; }
.item-lista { display: flex; align-items: center; gap: 12px; padding: 12px 0; min-height: 56px; cursor: pointer; position: relative; }
.item-lista:focus-visible { outline: 2px solid var(--cor-saida); outline-offset: 2px; border-radius: 10px; }
.ico { width: 42px; height: 42px; border-radius: 14px; flex: none; display: grid; place-items: center; background: var(--cor-saida-fundo); color: var(--cor-saida); }
.meio { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.linha1, .linha2 { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; min-width: 0; }
.linha1 strong { font-size: 15px; overflow-wrap: anywhere; min-width: 0; }
.linha1 .valor { font-weight: 700; color: var(--cor-saida-texto); flex: none; }
.linha2 small { font-size: 12px; color: var(--cor-texto-suave); overflow-wrap: anywhere; }
.etq-vermelho { color: var(--cor-saida-texto) !important; font-weight: 600; }
.pontos-divida { flex: none; }
.seta { flex: none; color: var(--cor-texto-suave); transition: transform var(--anim-rapida) var(--anim-curva); }
.seta.aberta { transform: rotate(180deg); }
.grupo-sim input { flex: 1 1 130px; }
@media (max-width: 480px) { .seta { display: none; } .linha1, .linha2 { flex-wrap: wrap; gap: 2px 10px; } .item-lista { gap: 10px; } }
.bloco-divida.quitada { opacity: 0.85; }
.detalhe { display: flex; flex-direction: column; gap: 12px; padding: 4px 0 16px; }
.sub { margin: 4px 0 0; font-size: 13px; font-family: var(--fonte-display); color: var(--cor-texto-suave); }
.selo-quitada { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; font-weight: 700; font-size: 12px; padding: 3px 10px; border-radius: 999px; background: color-mix(in srgb, var(--saida-ambar-medio) 20%, transparent); }
.grupo-sim { display: flex; gap: 8px; flex-wrap: wrap; }
.campo-plano input { flex: none; }
.grupo-sim input, .campo-plano input { min-width: 0; min-height: 44px; box-sizing: border-box; font-family: var(--fonte-texto); font-size: 14px; padding: 8px 12px; border-radius: 12px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); }
.resultado-simulacao { font-size: 13px; margin: 0; }
.reconhecidos { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px dashed var(--cor-borda); border-radius: 12px; min-width: 0; }
.lista-reconhecidos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.lista-reconhecidos li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
.rec-info { flex: 1 1 140px; min-width: 0; display: flex; flex-direction: column; overflow-wrap: anywhere; }
.rec-info small { color: var(--cor-texto-suave); font-size: 11px; }
.botao-mini { align-self: flex-start; font-size: 13px; padding: 6px 12px; min-height: 44px; border-radius: 10px; border: 1px solid var(--cor-borda); background: transparent; color: var(--cor-texto); }
.lista-historico { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.lista-historico li { display: flex; flex-wrap: wrap; justify-content: space-between; border-bottom: 1px solid var(--cor-borda); padding-bottom: 6px; }
.data-pagamento { color: var(--cor-texto-suave); }
.como-pago { flex-basis: 100%; font-size: 12px; color: var(--cor-texto-suave); overflow-wrap: anywhere; }

.campo-plano { display: flex; flex-direction: column; gap: 6px; font-size: 13px; margin-bottom: 12px; }
.comparacao { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.metodo { display: flex; flex-direction: column; gap: 4px; padding: 12px; border-radius: 14px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); min-width: 0; }
.metodo h4 { margin: 0; font-size: 13px; font-family: var(--fonte-display); color: var(--cor-texto-suave); }
.metodo strong { font-family: var(--fonte-display); font-size: 20px; color: var(--cor-saida); }
.metodo small { font-size: 11px; color: var(--cor-texto-suave); overflow-wrap: anywhere; }

.acoes-formulario { display: flex; gap: 10px; flex-wrap: wrap; }
.lista-arquivadas { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.lista-arquivadas li { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 10px; border: 1px solid var(--cor-borda); border-radius: 10px; }
.arq-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 140px; overflow-wrap: anywhere; }
.arq-info small { color: var(--cor-texto-suave); }
.arq-acoes { display: flex; gap: 6px; flex-wrap: wrap; }
.perigo-mini { color: var(--cor-saida); border-color: var(--cor-saida); }
.texto-aba { margin: -6px 0 0; font-size: 13px; color: var(--cor-texto-suave); }
.caro-item { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid var(--cor-card-borda); }
.caro-item:last-child { border-bottom: none; }
.caro-item .meio { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.caro-item .linha1, .caro-item .linha2 { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.caro-item .linha1 strong { overflow-wrap: anywhere; }
.caro-item small { font-size: 12px; color: var(--cor-texto-suave); }
.caro-ico { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--cor-saida-fundo); color: var(--cor-saida-texto); }
.selo-caro { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: var(--cor-saida-fundo); color: var(--cor-saida-texto); }
.frase-caro { line-height: 1.4; }
.vazio { display: flex; flex-direction: column; gap: 12px; }
.vazio-acoes { display: flex; gap: 8px; flex-wrap: wrap; }
.juros-cartao { margin: 0 0 10px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; font-size: 12px; }
.juros-cartao dt { color: var(--cor-texto-suave); }
.juros-cartao dd { margin: 2px 0 0; font-weight: 700; font-size: 15px; color: var(--cor-saida-texto); font-family: var(--fonte-display); }
.aviso-juros { display: flex; gap: 8px; align-items: flex-start; margin: 10px 0 0; padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 1.4; background: color-mix(in srgb, var(--saida-ambar-medio) 16%, transparent); }
.aviso-juros svg { flex: none; margin-top: 2px; }
.economia-pg { margin: 0; font-size: 13px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--saida-ambar-medio) 16%, transparent); }
.previa-quebra { grid-template-columns: repeat(2, minmax(0, 1fr)); }
</style>
