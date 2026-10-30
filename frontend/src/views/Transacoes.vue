<script setup>
import CampoIconeItem from '../components/CampoIconeItem.vue';
import ReservasAuto from '../components/ReservasAuto.vue';
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import CabecalhoPagina from '../components/CabecalhoPagina.vue';
import TopoValor from '../components/TopoValor.vue';
import AbasSeletor from '../components/AbasSeletor.vue';
import CardPadrao from '../components/CardPadrao.vue';
import AjudaSecao from '../components/AjudaSecao.vue';
import BarraAcoes from '../components/BarraAcoes.vue';
import BotaoAcao from '../components/BotaoAcao.vue';
import FormularioModal from '../components/FormularioModal.vue';
import CampoTipo from '../components/CampoTipo.vue';
import CampoValor from '../components/CampoValor.vue';
import CampoTexto from '../components/CampoTexto.vue';
import CampoData from '../components/CampoData.vue';
import CampoDataPilula from '../components/CampoDataPilula.vue';
import CampoSubcategoria from '../components/CampoSubcategoria.vue';
import CampoConta from '../components/CampoConta.vue';
import CampoSelecao from '../components/CampoSelecao.vue';
import IconeCategoria from '../components/IconeCategoria.vue';
import BarraDegrade from '../components/BarraDegrade.vue';
import DashRosca from '../components/DashRosca.vue';
import RelBarrasH from '../components/RelBarrasH.vue';
import RelBarrasMes from '../components/RelBarrasMes.vue';
import SeletorPopup from '../components/SeletorPopup.vue';
import { ArrowDown, ArrowUp, ArrowRightLeft, Receipt, ChevronDown, ChevronRight, ChevronLeft, Filter, Landmark, CreditCard, Pencil, ChartPie, ChartBar, TriangleAlert } from 'lucide-vue-next';
import CampoCategoria from '../components/CampoCategoria.vue';
import RegraModal from '../components/RegraModal.vue';
import { avisar } from '../services/avisos.js';
import { abrirLancamento, lancamentoSalvo, avisoLancamento } from '../services/lancamento.js';
import LinhaTransacao from '../components/LinhaTransacao.vue';
import { periodo, anoInteiro, ano, escolher, MESES, MESES_CURTOS } from '../services/mes.js';
import { corDespesa } from '../utils/coresDespesa.js';
import { corReceita } from '../utils/coresReceita.js';

const router = useRouter();
const route = useRoute();

const hojeISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

const filtroConta = ref(route.query.conta ? String(route.query.conta) : '');
const filtroTipo = ref(route.query.tipo === 'entrada' || route.query.tipo === 'saida' ? route.query.tipo : '');
// Seção 5 (0.12): a categoria agora abre o DETALHE DA CATEGORIA (?cat=s-<id> | e-<nome> | s-0), filtrado no próprio
// navegador a partir das transações do mês; os links antigos (?categoria= / ?receita=) são convertidos ao abrir.
const filtroCategoria = ref('');
const filtroReceita = ref('');
const nomeFiltroCategoria = computed(() => (filtroReceita.value ? `Entrada: ${filtroReceita.value}` : categorias.value.find((c) => c.id === filtroCategoria.value)?.nome || String(route.query.nomeCategoria || '')));
function limparFiltroCategoria() { filtroCategoria.value = ''; filtroReceita.value = ''; router.replace({ path: '/transacoes' }); }

const transacoes = ref([]);
const resumo = ref({ entradas: 0, saidas: 0, resultado: 0, quantidade: 0 });
const contas = ref([]);
const categorias = ref([]);
const carregando = ref(true);

const categoriasReceita = ref([]);
const infoReceitas = ref([]); // categorias de entrada com ícone e cor
const aviso = ref(null); // { texto, cartaoId?, desfazer?: { url } }
watch(avisoLancamento, (v) => { if (v) aviso.value = v; });
const erro = ref('');

// Adicionar nunca troca de página: a janela de lançamento é a global (LancamentoModal, no AppLayout).
function abrirModal(tipo) { abrirLancamento({ tipo, contaId: filtroConta.value || '', limitar: '' }); }

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (v) => formatoMoeda.format(v || 0);

function dataBR(texto) {
  const [a, m, d] = String(texto).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

async function pedir(url, opcoes = {}) {
  const resposta = await fetch(url, { credentials: 'include', ...opcoes });
  if (resposta.status === 401) {
    router.push('/login');
    throw new Error('não autenticado');
  }
  return resposta;
}

async function carregarApoio() {
  const [rc, rk] = await Promise.all([pedir('/api/contas'), pedir('/api/categorias')]);
  contas.value = await rc.json();
  categorias.value = await rk.json();
  const rrec = await pedir('/api/transacoes/categorias-receita');
  if (rrec.ok) categoriasReceita.value = await rrec.json();
  const rres = await pedir('/api/transacoes/resumo-receitas');
  if (rres.ok) infoReceitas.value = await rres.json();
}

// Transferência entre contas próprias: janela global (abrirLancamento tipo 'transferencia').
function abrirTransferencia(inicial = {}) { abrirLancamento({ tipo: 'transferencia', contaId: inicial.origemId || '' }); }
async function desfazerAviso() {
  const a = aviso.value;
  if (!a || !a.desfazer) return;
  await pedir(a.desfazer.url, { method: 'DELETE' });
  aviso.value = null;
  await Promise.all([carregar(), carregarApoio()]);
}

// Estorno / cancelamento / devolução: anula a despesa original (as duas saem dos totais e o saldo volta).
const estornando = ref(null);
const dataEstorno = ref(hojeISO);
const erroEstorno = ref('');
function abrirEstorno(t) { fecharMenu(); estornando.value = t; dataEstorno.value = hojeISO; erroEstorno.value = ''; }
async function confirmarEstorno() {
  const t = estornando.value;
  const r = t.cartao
    ? await pedir('/api/transacoes/estorno-cartao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ compraId: t.compra_id }) })
    : await pedir(`/api/transacoes/${t.id}/estorno`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataEstorno.value }) });
  const d = await r.json();
  if (!r.ok) { erroEstorno.value = d.erro || 'Não foi possível estornar.'; return; }
  estornando.value = null;
  aviso.value = { texto: `"${t.cartao ? t.descricao_base : t.descricao}" foi estornada: a despesa e o estorno ficam fora dos totais.`, desfazer: { url: t.cartao ? `/api/transacoes/estorno-cartao/${d.vinculo}` : `/api/transacoes/estorno/${d.vinculo}` } };
  await Promise.all([carregar(), carregarApoio()]);
}
const podeEstornar = (t) => !t.tipo_mov && !t.ignorada && (t.cartao ? t.cartao_origem === 'manual' : t.valor !== 0);
const ehReserva = (t) => /^reserva_|^transferencia_corretora$/.test(String(t.tipo_mov || ''));
const ehTransf = (t) => String(t.tipo_mov || '').startsWith('transferencia') && !ehReserva(t);
const rotuloMov = { reserva_aporte: 'aporte em investimento', reserva_resgate_inv: 'resgate de investimento', reserva_vinculada: 'guardar/resgatar', reserva_recusada: 'reserva', transferencia_corretora: 'investimento', transferencia_interna: 'transferência', transferencia_vinculada: 'transferência', estorno: 'estorno', estorno_vinculado: 'estorno', estornada: 'estornada',
  // anotação 61: créditos na fatura do cartão
  estorno_avulso: 'estorno a revisar', estornada_parcial: 'estornada em parte', pagamento: 'pagamento adiantado', cashback: 'cashback', pagamento_cartao: 'pagamento adiantado do cartão', pagamento_cartao_criado: 'pagamento adiantado do cartão' };
// Créditos do cartão que CONTAM nos totais (cashback é entrada; estorno avulso e estorno parcial mexem no gasto da categoria)
const MOV_NOS_TOTAIS = ['cashback', 'estorno_avulso', 'estornada_parcial'];
const foraDosTotais = (t) => !!t.tipo_mov && !MOV_NOS_TOTAIS.includes(t.tipo_mov) && !(t.cartao && t.tipo_mov === 'estorno_vinculado' && t.estorno_parcial);
const ehPagCartao = (t) => t.tipo_mov === 'pagamento_cartao' || t.tipo_mov === 'pagamento_cartao_criado';
async function desfazerMov(t) {
  fecharMenu();
  if (!confirm(ehTransf(t) ? 'Desfazer esta transferência? Os saldos das duas contas voltam ao que eram.' : 'Desfazer este estorno? A despesa volta a contar nos totais.')) return;
  const url = t.cartao || ehPagCartao(t) ? `/api/transacoes/estorno-cartao/${t.vinculo}` : ehTransf(t) ? `/api/transacoes/transferencia/${t.vinculo}` : `/api/transacoes/estorno/${t.vinculo}`;
  await pedir(url, { method: 'DELETE' });
  await Promise.all([carregar(), carregarApoio()]);
}

const nomesMesCurtos = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function rotuloFatura(chave) {
  if (!chave) return '';
  const [a, m] = chave.split('-').map(Number);
  return `${nomesMesCurtos[m - 1]}/${a}`;
}

let seqCarga = 0;
function paramsDe(mesChave) {
  const params = new URLSearchParams();
  params.set('mes', mesChave);
  if (filtroConta.value) params.set('contaId', filtroConta.value);
  if (filtroTipo.value) params.set('tipo', filtroTipo.value);
  if (filtroCategoria.value) params.set('categoriaId', filtroCategoria.value);
  if (filtroReceita.value) params.set('categoriaReceita', filtroReceita.value);
  return params;
}
async function carregar() {
  const minha = ++seqCarga;
  // Visão anual: busca os 12 meses e junta (o servidor já filtra por mês)
  const chaves = anoInteiro.value
    ? Array.from({ length: 12 }, (_, i) => `${ano.value}-${String(i + 1).padStart(2, '0')}`)
    : [periodo.value.chave];
  const respostas = await Promise.all(chaves.map((c) => pedir(`/api/transacoes?${paramsDe(c)}`).then((r) => r.json())));
  if (minha !== seqCarga) return; // chegou uma resposta mais nova
  transacoes.value = respostas.flatMap((d) => d.transacoes);
  resumo.value = respostas.reduce((acc, d) => ({
    entradas: acc.entradas + d.resumo.entradas,
    saidas: acc.saidas + d.resumo.saidas,
    resultado: acc.resultado + d.resumo.resultado,
    quantidade: acc.quantidade + d.resumo.quantidade,
    cartao: (acc.cartao || 0) + (d.resumo.cartao || 0),
    quantidadeCartao: (acc.quantidadeCartao || 0) + (d.resumo.quantidadeCartao || 0),
  }), { entradas: 0, saidas: 0, resultado: 0, quantidade: 0, cartao: 0, quantidadeCartao: 0 });
  carregando.value = false;
}

watch([() => periodo.value.chave, filtroConta, filtroTipo, filtroCategoria, filtroReceita], carregar);

// Autocompletar de subcategoria: as já usadas na categoria escolhida.
const sugestoesSub = ref([]);
async function carregarSugestoes(categoriaId, categoriaReceita) {
  const qs = new URLSearchParams();
  if (categoriaId) qs.set('categoriaId', categoriaId);
  else if (categoriaReceita) qs.set('categoriaReceita', categoriaReceita);
  try {
    const r = await fetch(`/api/transacoes/subcategorias?${qs}`, { credentials: 'include' });
    sugestoesSub.value = r.ok ? await r.json() : [];
  } catch { sugestoesSub.value = []; }
}


watch(() => route.query, (q) => {
  if (route.path !== '/transacoes') return;
  if (q.categoria || q.receita) { router.replace({ path: '/transacoes', query: { cat: q.categoria ? `s-${q.categoria}` : `e-${q.receita}` } }); return; }
  filtroConta.value = q.conta ? String(q.conta) : '';
  filtroTipo.value = q.tipo === 'entrada' || q.tipo === 'saida' ? q.tipo : '';
}, { immediate: true });

async function salvarSub(t, valor) {
  const r = await pedir(`/api/transacoes/${t.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subcategoria: valor }),
  });
  if (r.ok) t.subcategoria = (await r.json()).subcategoria;
}

// --- Menu de três pontinhos, ignorar e edição ---
const menu = ref(null); // { t, x, y }
function abrirMenu(t, e) {
  if (menu.value && menu.value.t.id === t.id) { menu.value = null; return; }
  const r = e.currentTarget.getBoundingClientRect();
  menu.value = { t, x: Math.max(8, Math.min(window.innerWidth - 168, r.right - 160)), y: Math.min(r.bottom + 4, window.innerHeight - 140) };
}
function fecharMenu() { menu.value = null; }
onMounted(() => { window.addEventListener('click', fecharMenu); window.addEventListener('wheel', fecharMenu, { passive: true }); window.addEventListener('touchmove', fecharMenu, { passive: true }); });
onUnmounted(() => { window.removeEventListener('click', fecharMenu); window.removeEventListener('wheel', fecharMenu); window.removeEventListener('touchmove', fecharMenu); });

async function alternarIgnorar(t) {
  fecharMenu();
  await pedir(`/api/transacoes/${t.id}/ignorar`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ignorada: !t.ignorada }) });
  await Promise.all([carregar(), carregarApoio()]);
}

function irCartao(t) { router.push({ name: 'cartao-extrato', params: { id: t.cartao_id } }); }
const editando = ref(null);
const formEdicao = ref({ tipo: 'saida', valor: '', contaId: '', descricao: '', data: '', categoriaId: '', categoriaReceita: '', subcategoria: '', icone: '' });
// Nas lançadas à mão o tipo pode mudar no próprio pop-up; nas do banco ele é fixo
const edicaoEhSaida = computed(() => (editando.value ? (editando.value.origem === 'manual' || (editando.value.cartao && editando.value.cartao_origem === 'manual') ? formEdicao.value.tipo === 'saida' : editando.value.valor < 0) : true));
watch(() => [formEdicao.value.tipo, formEdicao.value.categoriaId, formEdicao.value.categoriaReceita], ([tp, c, r]) => {
  if (editando.value) carregarSugestoes(tp === 'saida' ? c : '', tp === 'saida' ? '' : r);
});
const erroEdicao = ref('');
// Anotação 61: ao marcar um lançamento do cartão como crédito (verde), o app pergunta que crédito é.
const credito = ref({ tipo: '', originalCompraId: '', contaId: '', parecidas: null, original: false });
const ehCreditoCartao = computed(() => !!(editando.value && editando.value.cartao && editando.value.cartao_origem === 'manual' && formEdicao.value.tipo === 'entrada'));
watch(() => [ehCreditoCartao.value, credito.value.tipo], async ([sim, tp]) => {
  if (!sim || tp !== 'estorno' || credito.value.parecidas) return;
  const t = editando.value;
  try {
    const r = await pedir(`/api/cartoes/${t.cartao_id}/lancamentos/${t.compra_id}/credito/parecidas`);
    credito.value.parecidas = r.ok ? await r.json() : [];
  } catch { credito.value.parecidas = []; }
});
const dadosAbertos = ref(false);
function abrirEdicao(t) {
  fecharMenu();
  dadosAbertos.value = false;
  editando.value = t;
  erroEdicao.value = '';
  if (t.cartao) {
    // Compra no cartão: o pop-up edita a compra inteira (todas as parcelas), no próprio lugar
    formEdicao.value = { tipo: t.valor < 0 ? 'saida' : 'entrada', valor: Math.abs(t.valor_total_compra), contaId: '', descricao: t.descricao_base, data: String(t.data_compra).slice(0, 10), categoriaId: t.categoria_id ?? '', categoriaReceita: '', subcategoria: t.subcategoria || '' };
    carregarSugestoes(t.categoria_id ?? '', '');
    // Anotação 61: crédito na fatura — que crédito é (estorno, pagamento adiantado, cashback)
    credito.value = { tipo: t.tipo_mov === 'pagamento' ? 'pagamento' : t.tipo_mov === 'cashback' ? 'cashback' : t.valor > 0 ? 'estorno' : '', originalCompraId: '', contaId: '', parecidas: null, original: t.valor > 0 };
    return;
  }
  formEdicao.value = { tipo: t.valor < 0 ? 'saida' : 'entrada', valor: Math.abs(t.valor), contaId: t.conta_id, descricao: t.descricao, data: String(t.data).slice(0, 10), categoriaId: t.categoria_id ?? '', categoriaReceita: t.categoria_receita || '', subcategoria: t.subcategoria || '', icone: t.icone || '' };
  carregarSugestoes(t.categoria_id ?? '', t.categoria_id ? '' : (t.categoria_receita || ''));
}
// Anotação 52 — ao corrigir a categoria, sugere guardar a correção como regra num aviso no rodapé:
// "Criar regra: 'IFD*' → Restaurante?" [Criar regra] [Agora não]. Tocar no texto abre a janela da regra antes de salvar.
// Não sugere se já há regra para o trecho ou se o usuário recusou 2 vezes o mesmo trecho (localStorage).
const sugestaoRegra = ref(null); // { inicial } — usado quando o texto do aviso abre a janela
const regraAberta = ref(false);
const CHAVE_RECUSAS = 'dagda.regras.recusas';
const normRegra = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
function lerRecusas() { try { return JSON.parse(localStorage.getItem(CHAVE_RECUSAS) || '{}') || {}; } catch { return {}; } }
function recusar(trecho) {
  try { const r = lerRecusas(); const k = normRegra(trecho); r[k] = (r[k] || 0) + 1; localStorage.setItem(CHAVE_RECUSAS, JSON.stringify(r)); } catch { /* sem armazenamento: só não lembra */ }
}
// Nome do estabelecimento sem números, datas e códigos: "IFD*BRASIL 1234" → "IFD*", "UBER *TRIP 1234" → "UBER", "PADARIA DO JOSE 0012" → "PADARIA DO JOSE".
function trechoRegra(nome) {
  const limpo = String(nome || '').replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
  const pal = [];
  for (const tok of limpo.split(/\s+/)) {
    if (!tok) continue;
    const estrela = tok.indexOf('*');
    if (estrela > 0) { const base = tok.slice(0, estrela + 1); if (!/\d/.test(base)) pal.push(base); break; } // "IFD*BRASIL" → "IFD*"
    if (estrela === 0) break; // "*TRIP": código do adquirente
    if (/\d/.test(tok) || /^[-–·|:#/.]+$/.test(tok)) break; // número, data, código
    pal.push(tok.replace(/[-–·|:,;.]+$/, ''));
    if (pal.length >= 3) break;
  }
  const t = pal.join(' ').trim();
  return t.replace(/\*/g, '').length >= 2 ? t : '';
}
async function sugerirRegra(t, f) {
  const ehSaida = t.cartao ? true : (t.origem === 'manual' ? f.tipo === 'saida' : t.valor < 0);
  const antes = ehSaida ? (t.categoria_id || '') : (t.categoria_receita || '');
  const depois = ehSaida ? String(f.categoriaId || '') : (f.categoriaReceita || '');
  if (!depois || depois === antes) return;
  const nomeTx = String(t.cartao ? t.descricao_base : t.descricao).replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
  const trecho = trechoRegra(nomeTx);
  if (!trecho) return;
  if ((lerRecusas()[normRegra(trecho)] || 0) >= 2) return;
  const tipo = ehSaida ? 'saida' : 'entrada';
  let n = 0;
  try {
    const rr = await pedir('/api/regras');
    const regras = rr.ok ? await rr.json() : [];
    const nome = normRegra(nomeTx);
    if (regras.some((r) => r.tipo === tipo && (normRegra(r.padrao) === normRegra(trecho) || nome.includes(normRegra(r.padrao))))) return;
    const q = new URLSearchParams({ tipo, padrao: trecho, ...(ehSaida ? { categoriaId: depois } : { categoriaReceita: depois }) });
    const rp = await pedir(`/api/regras/previa?${q}`);
    if (rp.ok) n = (await rp.json()).quantidade || 0;
  } catch { return; }
  const nomeCat = ehSaida ? (categorias.value.find((c) => c.id === depois) || {}).nome : depois;
  const extras = { subcategoria: f.subcategoria || '', icone: t.cartao ? '' : (f.icone || '') };
  const inicial = { tipo, padrao: trecho, categoriaId: ehSaida ? depois : '', categoriaReceita: ehSaida ? '' : depois, ...extras, valor: Math.abs(t.cartao ? t.valor_total_compra : t.valor) };
  avisar(`Criar regra: “${trecho}” → ${nomeCat}?`, {
    tipo: 'regra', grupo: 'sugestao-regra', duracao: 6000,
    detalhe: n ? `e aplicar a ${n === 1 ? 'outra transação' : `outras ${n}`}` : 'Toque no texto para ajustar antes de salvar',
    aoTocar: () => { sugestaoRegra.value = { inicial }; regraAberta.value = true; },
    acoes: [
      { rotulo: 'Agora não', acao: () => recusar(trecho) },
      { rotulo: 'Criar regra', primaria: true, acao: () => criarRegraDireto(inicial, n > 0) },
    ],
  });
}
function criarRegraDaTx(t) {
  const ehSaida = t.cartao ? t.valor < 0 : t.valor < 0;
  const nomeTx = String(t.cartao ? t.descricao_base : t.descricao).replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
  sugestaoRegra.value = { inicial: { tipo: ehSaida ? 'saida' : 'entrada', padrao: trechoRegra(nomeTx), categoriaId: ehSaida ? (t.categoria_id || '') : '', categoriaReceita: ehSaida ? '' : (t.categoria_receita || ''), subcategoria: t.subcategoria || '', icone: t.cartao ? '' : (t.icone || '') } };
  editando.value = null;
  regraAberta.value = true;
}
async function criarRegraDireto(i, aplicarAntigas) {
  const corpo = { tipo: i.tipo, padrao: i.padrao, subcategoria: i.subcategoria, icone: i.icone, aplicarAntigas, ...(i.tipo === 'saida' ? { categoriaId: i.categoriaId } : { categoriaReceita: i.categoriaReceita }) };
  const r = await pedir('/api/regras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { avisar(d.erro || 'Não foi possível criar a regra.', { tipo: 'alerta', grupo: 'sugestao-regra' }); return; }
  await regraCriada(d);
}
async function regraCriada({ aplicadas }) {
  regraAberta.value = false; sugestaoRegra.value = null;
  avisar(aplicadas ? `Regra criada · ${aplicadas} ${aplicadas === 1 ? 'transação movida' : 'transações movidas'}` : 'Regra criada: as próximas já entram na categoria certa', { tipo: 'ok', grupo: 'sugestao-regra', rota: '/regras' });
  await Promise.all([carregar(), carregarApoio()]);
}
async function salvarEdicao() {
  const t = editando.value;
  const f = formEdicao.value;
  if (t.cartao) {
    erroEdicao.value = '';
    const corpoC = { descricao: f.descricao, valor: Number(f.valor), dataCompra: f.data, categoriaId: f.categoriaId === '' ? null : f.categoriaId, subcategoria: f.subcategoria };
    if (t.divida_id) corpoC.dividaId = t.divida_id;
    const cr = credito.value;
    if (f.tipo === 'entrada' && !cr.tipo) { erroEdicao.value = 'Diga que crédito é este: estorno, pagamento adiantado ou cashback.'; return; }
    if (f.tipo === 'entrada' && cr.tipo === 'pagamento' && !cr.contaId) { erroEdicao.value = 'Escolha a conta de onde saiu o pagamento.'; return; }
    const rc = await pedir(`/api/cartoes/${t.cartao_id}/lancamentos/${t.compra_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpoC) });
    const dc = await rc.json();
    if (!rc.ok) { erroEdicao.value = dc.erro || 'Não foi possível salvar.'; return; }
    // Anotação 61: marcar como crédito (ou voltar a compra) — o servidor liga ao estorno/pagamento/cashback
    const mudouCredito = f.tipo === 'entrada' ? (!cr.original || cr.tipo !== (t.tipo_mov === 'pagamento' ? 'pagamento' : t.tipo_mov === 'cashback' ? 'cashback' : 'estorno') || !!cr.originalCompraId) : t.valor > 0;
    if (mudouCredito) {
      const corpoCr = f.tipo === 'entrada' ? { tipo: cr.tipo, originalCompraId: cr.originalCompraId || null, contaId: cr.contaId || null, data: f.data } : { tipo: 'compra' };
      const rr = await pedir(`/api/cartoes/${t.cartao_id}/lancamentos/${t.compra_id}/credito`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpoCr) });
      const dr = await rr.json();
      if (!rr.ok) { erroEdicao.value = dr.erro || 'Não foi possível marcar o crédito.'; return; }
      const msg = { estorno: cr.originalCompraId ? (dr.parcial ? 'Estorno parcial ligado à compra: só a parte estornada sai do gasto.' : 'Estorno ligado à compra: a compra deixa de contar.') : 'Estorno sem compra ligada: reduz o gasto da categoria e fica em A revisar.', pagamento: dr.casouComExtrato ? 'Pagamento adiantado casado com a saída da conta: abate a fatura e não conta como gasto.' : 'Pagamento adiantado: abate a fatura; a saída foi lançada na conta, fora dos totais.', cashback: 'Cashback: abate a fatura e entra como entrada em Cashback.', compra: 'Voltou a ser compra.' };
      avisar(msg[corpoCr.tipo], { tipo: 'ok' });
    }
    sugerirRegra(t, f);
    editando.value = null;
    await Promise.all([carregar(), carregarApoio()]);
    return;
  }
  const corpo = { subcategoria: f.subcategoria, icone: f.icone || '' };
  if (t.origem === 'manual') {
    Object.assign(corpo, { descricao: f.descricao, data: f.data, tipo: f.tipo, valor: Number(f.valor), contaId: f.contaId });
  }
  if (edicaoEhSaida.value) corpo.categoriaId = f.categoriaId === '' ? null : f.categoriaId;
  else corpo.categoriaReceita = f.categoriaReceita || null;
  const r = await pedir(`/api/transacoes/${t.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const d = await r.json();
  if (!r.ok) { erroEdicao.value = d.erro || 'Não foi possível salvar.'; return; }
  sugerirRegra(t, f);
  editando.value = null;
  await Promise.all([carregar(), carregarApoio()]);
}
const dataCurta = (d) => { const [a, m, dia] = String(d).slice(0, 10).split('-'); return `${dia}/${m}/${a.slice(2)}`; };

async function trocarCategoria(t, valor) {
  await pedir(`/api/transacoes/${t.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoriaId: valor === '' ? null : String(valor) }),
  });
  await carregar();
}

// Homologação 1.0, seção 6: "Excluir" do arraste. Transferência/estorno desfaz o par; compra no cartão remove a compra.
function podeExcluirTx(t) {
  if (ehReserva(t)) return false;
  if (t.tipo_mov && t.vinculo) return true;
  if (t.cartao) return t.cartao_origem === 'manual';
  return t.origem === 'manual';
}
async function excluirTx(t) {
  if (!podeExcluirTx(t)) return;
  if (t.tipo_mov && t.vinculo && !t.cartao) { await desfazerMov(t); return; }
  if (t.cartao) {
    if (!confirm(`Excluir a compra "${t.descricao_base || t.descricao}"${t.total_parcelas > 1 ? ` (todas as ${t.total_parcelas} parcelas)` : ''}?`)) return;
    await pedir(`/api/cartoes/${t.cartao_id}/lancamentos/${t.compra_id}`, { method: 'DELETE' });
    await Promise.all([carregar(), carregarApoio()]);
    return;
  }
  await apagar(t);
}
async function apagar(t) {
  if (!confirm(`Apagar "${t.descricao}" (${moeda(t.valor)})?`)) return;
  const resposta = await pedir(`/api/transacoes/${t.id}`, { method: 'DELETE' });
  if (!resposta.ok) {
    const dados = await resposta.json();
    alert(dados.erro || 'Não foi possível apagar.');
    return;
  }
  await Promise.all([carregar(), carregarApoio()]);
}

const filtroAberto = ref(false);
const filtrosAtivos = computed(() => (filtroConta.value ? 1 : 0) + (filtroTipo.value ? 1 : 0));
const fecharFiltro = () => { filtroAberto.value = false; };
onMounted(async () => {
  window.addEventListener('click', fecharFiltro);
  await carregarApoio();
  await carregar();
  // Links antigos (?novo=...) abrem a janela global sobre esta mesma página
  const novo = route.query.novo;
  if (novo === 'transferencia' || novo === 'entrada' || novo === 'saida') {
    abrirLancamento({ tipo: novo, contaId: route.query.conta ? String(route.query.conta) : '', categoriaId: route.query.cat ? String(route.query.cat) : '', categoriaReceita: route.query.catReceita ? String(route.query.catReceita) : '', limitar: '' });
    router.replace({ path: '/transacoes' });
  }
});
onUnmounted(() => window.removeEventListener('click', fecharFiltro));
watch(lancamentoSalvo, async () => { await Promise.all([carregar(), carregarApoio()]); });

// ===== Redesenho: resumo, agrupamentos e animações =====
const visao = ref('data'); // 'data' | 'categoria'
const abertas = ref({}); // grupos de categoria / meses expandidos

// Números grandes contam rápido até o valor final (some com "reduzir movimento": --anim-lenta = 0)
function useContagem(origem) {
  const v = ref(origem());
  let raf = 0;
  watch(origem, (novo) => {
    cancelAnimationFrame(raf);
    const dur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anim-lenta')) || 0;
    const ini = v.value; const t0 = performance.now();
    if (!dur) { v.value = novo; return; }
    const passo = (agora) => {
      const k = Math.min(1, (agora - t0) / Math.min(dur, 500));
      v.value = ini + (novo - ini) * (1 - Math.pow(1 - k, 3));
      if (k < 1) raf = requestAnimationFrame(passo); else v.value = novo;
    };
    raf = requestAnimationFrame(passo);
  });
  onUnmounted(() => cancelAnimationFrame(raf));
  return v;
}
const saldoAnim = useContagem(() => resumo.value.resultado);
const entradasAnim = useContagem(() => resumo.value.entradas);
const saidasAnim = useContagem(() => resumo.value.saidas);

const periodoTxt = computed(() => (anoInteiro.value ? String(ano.value) : MESES[periodo.value.mes - 1].toLowerCase()));
const sobra = computed(() => {
  const { entradas, saidas } = resumo.value;
  if (entradas <= 0) return { pct: 0, texto: saidas > 0 ? 'Sem entradas neste período' : 'Sem movimento neste período' };
  const p = ((entradas - saidas) / entradas) * 100;
  if (p < 0) return { pct: 0, texto: `As saídas passaram das entradas em ${moeda(saidas - entradas)}` };
  return { pct: p, texto: `${Math.round(p)}% das entradas ficou no saldo ${anoInteiro.value ? 'do ano' : 'do mês'}` };
});

// Categoria, cor e ícone de cada lançamento
const REGEX_FATURA = /pagamento\s+(de\s+)?fatura|pgto\.?\s+fatura/i;
const REGEX_TRANSF = /transfer[eê]ncia\s+(entre\s+contas|interna|propria|própria)/i;
function infoDe(t) {
  if (ehTransf(t)) return { chave: 'neutra-transf', nome: 'Transferência', cor: null, icone: null, neutra: true, tipoNeutro: 'transf' };
  // Anotação 38: Guardar/Resgatar (Caixinha, Porquinho, CDB) e transferência para corretora: dinheiro do usuário mudando de lugar.
  if (ehReserva(t)) return { chave: 'neutra-reserva', nome: t.rotulo_mov || (t.valor > 0 ? 'Resgate' : 'Guardar'), cor: null, icone: null, neutra: true, tipoNeutro: 'reserva' };
  if (t.tipo_mov === 'saldo_inicial' || t.tipo_mov === 'ajuste_saldo') return { chave: 'neutra-saldo', nome: 'Saldo inicial e ajustes', cor: null, icone: null, neutra: true, tipoNeutro: 'transf' };
  // Anotação 61: pagamento adiantado do cartão (e a saída da conta ligada a ele) é pagamento de fatura; cashback é entrada;
  // estorno avulso / parcial do cartão fica na categoria da compra (reduz o gasto dela)
  if (t.tipo_mov === 'pagamento' || ehPagCartao(t)) return { chave: 'neutra-fatura', nome: 'Pagamento de fatura', cor: null, icone: null, neutra: true, tipoNeutro: 'fatura' };
  if (t.tipo_mov && !(t.cartao && (t.tipo_mov === 'cashback' || ((t.tipo_mov === 'estorno_avulso' || t.estorno_parcial) && t.categoria_id)))) return { chave: 'neutra-estorno', nome: 'Estornos', cor: null, icone: null, neutra: true, tipoNeutro: 'transf' };
  if (REGEX_FATURA.test(t.descricao || '')) return { chave: 'neutra-fatura', nome: 'Pagamento de fatura', cor: null, icone: null, neutra: true, tipoNeutro: 'fatura' };
  if (REGEX_TRANSF.test(t.descricao || '')) return { chave: 'neutra-transf', nome: 'Transferência', cor: null, icone: null, neutra: true, tipoNeutro: 'transf' };
  if (t.valor < 0 || (t.cartao && t.tipo_mov && t.tipo_mov !== 'cashback' && t.categoria_id)) {
    if (!t.categoria_id) return { chave: 's-0', nome: 'Sem categoria', cor: null, icone: null };
    const idx = categorias.value.findIndex((c) => c.id === t.categoria_id);
    const cat = categorias.value[idx];
    return { chave: `s-${t.categoria_id}`, nome: cat?.nome || t.categoria_nome || 'Sem categoria', cor: corDespesa(cat, Math.max(idx, 0)), icone: cat?.icone || null };
  }
  const nome = t.categoria_receita;
  if (!nome) return { chave: 'e-0', nome: 'Sem categoria', cor: null, icone: null };
  const inf = infoReceitas.value.find((c) => c.nome === nome);
  return { chave: `e-${nome}`, nome, cor: corReceita(nome, inf?.cor || null), icone: inf?.icone || null };
}

const ordenadas = computed(() => transacoes.value.slice().sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0)));
const diaDe = (d) => String(d).slice(0, 10);
const ontemISO = (() => { const d = new Date(`${hojeISO}T12:00:00`); d.setDate(d.getDate() - 1); return d.toLocaleDateString('sv-SE'); })();
function rotuloDia(iso) {
  const [, m, d] = iso.split('-').map(Number);
  const base = `${d} ${MESES_CURTOS[m - 1].toLowerCase()}`;
  if (iso === hojeISO) return `Hoje · ${base}`;
  if (iso === ontemISO) return `Ontem · ${base}`;
  return base;
}
const liquido = (lista) => lista.filter((t) => !t.ignorada && !t.cartao).reduce((s, t) => s + t.valor, 0);

const gruposPorDia = computed(() => {
  const mapa = new Map();
  ordenadas.value.forEach((t) => { const k = diaDe(t.data); if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(t); });
  return [...mapa].map(([iso, itens]) => ({ iso, rotulo: rotuloDia(iso), itens, total: liquido(itens) }));
});

const gruposPorMes = computed(() => {
  const mapa = new Map();
  ordenadas.value.forEach((t) => { const k = Number(diaDe(t.data).slice(5, 7)); if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(t); });
  return [...mapa].sort((a, b) => b[0] - a[0]).map(([m, itens]) => {
    const v = itens.filter((t) => !t.ignorada && !t.cartao);
    const entradas = v.filter((t) => t.valor > 0).reduce((s, t) => s + t.valor, 0);
    const saidas = v.filter((t) => t.valor < 0).reduce((s, t) => s - t.valor, 0);
    return { m, nome: MESES[m - 1], itens, entradas, saidas, resultado: entradas - saidas, pct: entradas > 0 ? Math.max(0, ((entradas - saidas) / entradas) * 100) : 0 };
  });
});

const gruposPorCategoria = computed(() => {
  const mapa = new Map();
  transacoes.value.filter((t) => t.ignorada !== 1).forEach((t) => {
    const info = infoDe(t);
    if (!mapa.has(info.chave)) mapa.set(info.chave, { chave: info.chave, info, itens: [], total: 0, tipo: info.neutra ? 'neutro' : info.chave.startsWith('s-') ? 'saida' : info.chave.startsWith('e-') ? 'entrada' : t.valor < 0 ? 'saida' : 'entrada' });
    const g = mapa.get(info.chave);
    g.itens.push(t); g.total += t.valor;
  });
  const lista = [...mapa.values()];
  const soma = (tipo) => lista.filter((g) => g.tipo === tipo).reduce((s, g) => s + Math.abs(g.total), 0);
  const tot = { saida: soma('saida'), entrada: soma('entrada'), neutro: soma('neutro') };
  lista.forEach((g) => { g.pct = tot[g.tipo] > 0 ? (Math.abs(g.total) / tot[g.tipo]) * 100 : 0; });
  const por = (tipo) => lista.filter((g) => g.tipo === tipo).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return [
    { id: 'saida', titulo: 'Saídas', itens: por('saida') },
    { id: 'entrada', titulo: 'Entradas', itens: por('entrada') },
    { id: 'neutro', titulo: 'Transferências, estornos e faturas', itens: por('neutro') },
  ].filter((s) => s.itens.length);
});

function alternarAberta(chave) { abertas.value = { ...abertas.value, [chave]: !abertas.value[chave] }; }

// ===== Seção 5 (Versão 0.12): Transações em blocos · Extrato · Detalhe da categoria =====
// modo 'blocos' (padrão): gráfico por categoria + bloco Categorias + Últimas transações (+ "Ver todas");
// modo 'extrato' (?ver=extrato): lista completa por dia; as barras do topo escolhem o mês (o filtro de meses some);
// modo 'categoria' (?cat=…): chips das categorias, gráfico por mês, limite, subcategorias e as transações dela.
const modo = computed(() => (route.query.cat ? 'categoria' : route.query.ver === 'extrato' ? 'extrato' : 'blocos'));
function irModo(q) { router.push({ path: '/transacoes', query: q }); }
function voltarBlocos() { if (window.history.length > 1 && route.query.ver !== undefined || route.query.cat) router.back(); else irModo({}); }
const abaGrafico = ref('saida'); // 'saida' | 'entrada'
const tipoGrafico = ref('rosca'); // 'rosca' | 'barras'
const gruposTipo = (tipo) => (gruposPorCategoria.value.find((s) => s.id === tipo) || { itens: [] }).itens;
const segmentosGrafico = computed(() => gruposTipo(abaGrafico.value).map((g) => ({ nome: g.info.nome, valor: Math.abs(g.total), cor: g.info.cor || 'var(--cor-texto-suave)', chave: g.chave })));
const barrasGrafico = computed(() => gruposTipo(abaGrafico.value).map((g) => ({ id: g.chave, rotulo: g.info.nome, valor: Math.abs(g.total), icone: g.info.icone || '', cor: g.info.cor || 'var(--cor-texto-suave)', detalhe: `${Math.round(g.pct)}% · ${g.itens.length} lançamento(s)` })));
function abrirCategoria(chave) { if (chave) irModo({ cat: chave }); }
// Bloco Categorias: despesas do período com gasto e limite; as 3 maiores ganham destaque
const blocoCategorias = computed(() => {
  const meses = anoInteiro.value ? 12 : 1;
  const porChave = Object.fromEntries(gruposTipo('saida').map((g) => [g.chave, g]));
  const lista = categorias.value.map((c, i) => {
    const g = porChave[`s-${c.id}`];
    const gasto = g ? Math.abs(g.total) : 0;
    const teto = (Number(c.teto_mensal) || 0) * meses;
    return { chave: `s-${c.id}`, id: c.id, nome: c.nome, icone: c.icone, cor: corDespesa(c, i), gasto, teto, pct: teto > 0 ? Math.round((gasto / teto) * 100) : 0, qtd: g ? g.itens.length : 0 };
  }).filter((c) => c.gasto > 0 || c.teto > 0).sort((a, b) => b.gasto - a.gasto);
  return lista.map((c, i) => ({ ...c, destaque: i < 3 && c.gasto > 0 }));
});
const semCategoria = computed(() => transacoes.value.filter((t) => t.ignorada !== 1 && ['s-0', 'e-0'].includes(infoDe(t).chave)));
const ultimas = computed(() => ordenadas.value.filter((t) => t.ignorada !== 1).slice(0, 5));
function faixaCat(pct) {
  if (pct >= 100) return { de: 'var(--saida-carmim-medio)', ate: 'var(--saida-vermelho-medio)' };
  if (pct >= 95) return { de: '#E6F9F1', ate: '#9FE3C8' };
  return { de: 'var(--saida-ambar-medio)', ate: 'var(--saida-carmim-medio)' };
}

// Extrato: barras dos últimos 12 meses (até o mês escolhido ou o atual) — tocar/arrastar escolhe o mês
const mesesExtrato = ref([]);
async function carregarMesesExtrato() {
  try {
    const r = await pedir(`/api/dashboard?mes=${periodo.value.chave}`);
    const d = r.ok ? await r.json() : null;
    const fluxo = (d && d.fluxoCaixa) || [];
    const fim = fluxo.findIndex((m) => m.chave === periodo.value.chave);
    const ate = fim >= 0 ? Math.max(fim + 1, Math.min(fluxo.length, 12)) : fluxo.length;
    mesesExtrato.value = fluxo.slice(Math.max(0, ate - 12), ate).map((m) => ({ chave: m.chave, rotulo: MESES_CURTOS[Number(m.chave.slice(5, 7)) - 1], entradas: m.entradas, saidas: m.saidas }));
  } catch { mesesExtrato.value = []; }
}
const indiceExtrato = computed(() => mesesExtrato.value.findIndex((m) => m.chave === periodo.value.chave));
function escolherMesExtrato(i) { const m = mesesExtrato.value[i]; if (!m) return; const [a, mm] = m.chave.split('-').map(Number); escolher(a, mm); }
watch(() => [modo.value, periodo.value.chave], () => { if (modo.value === 'extrato' && (indiceExtrato.value < 0 || !mesesExtrato.value.length)) carregarMesesExtrato(); }, { immediate: true });
const moedaInt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

// Detalhe da categoria
const catAtual = computed(() => String(route.query.cat || ''));
const catTipo = computed(() => (catAtual.value.startsWith('e-') ? 'entrada' : 'saida'));
const catObj = computed(() => (catAtual.value.startsWith('s-') && catAtual.value !== 's-0' ? categorias.value.find((c) => `s-${c.id}` === catAtual.value) || null : null));
const catItens = computed(() => transacoes.value.filter((t) => t.ignorada !== 1 && infoDe(t).chave === catAtual.value));
const catInfo = computed(() => (catItens.value[0] ? infoDe(catItens.value[0]) : catObj.value ? { nome: catObj.value.nome, icone: catObj.value.icone, cor: corDespesa(catObj.value, 0) } : { nome: catAtual.value === 's-0' || catAtual.value === 'e-0' ? 'Sem categoria' : catAtual.value.slice(2), icone: '', cor: null }));
const catTotal = computed(() => catItens.value.reduce((s, t) => s + Math.abs(t.valor), 0));
const chipsCategorias = computed(() => {
  const base = gruposTipo(catTipo.value).map((g) => ({ chave: g.chave, nome: g.info.nome, icone: g.info.icone, cor: g.info.cor }));
  if (catTipo.value === 'saida') categorias.value.forEach((c, i) => { if (!base.some((b) => b.chave === `s-${c.id}`)) base.push({ chave: `s-${c.id}`, nome: c.nome, icone: c.icone, cor: corDespesa(c, i) }); });
  return base;
});
const subFiltro = ref('');
watch(catAtual, () => { subFiltro.value = ''; });
const catSubs = computed(() => [...new Set(catItens.value.map((t) => t.subcategoria).filter(Boolean))]);
const catLista = computed(() => catItens.value.filter((t) => !subFiltro.value || t.subcategoria === subFiltro.value).sort((a, b) => (a.data < b.data ? 1 : -1)));
const catGrafico = ref('barras'); // barras por mês | rosca por subcategoria
const catSegmentos = computed(() => {
  const m = new Map();
  catItens.value.forEach((t) => { const k = t.subcategoria || 'Sem subcategoria'; m.set(k, (m.get(k) || 0) + Math.abs(t.valor)); });
  const cores = ['var(--saida-carmim-medio)', 'var(--saida-tangerina-medio)', 'var(--saida-ambar-medio)', '#C2307A', '#8E7CC3', '#3A9AD9', '#4F5D75'];
  const coresE = ['#17713D', '#22A55A', '#5BAA3A', '#8BBF2E', '#63C98A'];
  return [...m].map(([nome, valor], i) => ({ nome, valor, cor: (catTipo.value === 'entrada' ? coresE : cores)[i % 7 % (catTipo.value === 'entrada' ? 5 : 7)] }));
});
// gráfico por mês da categoria: os 6 meses até o escolhido (busca só os da categoria)
const catMeses = ref([]);
async function carregarCatMeses() {
  const c = catAtual.value;
  if (!c || anoInteiro.value) { catMeses.value = []; return; }
  const [a, m] = periodo.value.chave.split('-').map(Number);
  const chaves = Array.from({ length: 6 }, (_, i) => { const t = a * 12 + (m - 1) - (5 - i); return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; });
  const q = (k) => { const p = new URLSearchParams({ mes: k }); if (c.startsWith('s-') && c !== 's-0') p.set('categoriaId', c.slice(2)); else if (c.startsWith('e-') && c !== 'e-0') p.set('categoriaReceita', c.slice(2)); return p; };
  try {
    const res = await Promise.all(chaves.map((k) => pedir(`/api/transacoes?${q(k)}`).then((r) => r.json())));
    if (c !== catAtual.value) return;
    catMeses.value = chaves.map((k, i) => {
      const itens = (res[i].transacoes || []).filter((t) => t.ignorada !== 1 && infoDe(t).chave === c);
      return { chave: k, rotulo: MESES_CURTOS[Number(k.slice(5, 7)) - 1], valor: itens.reduce((s, t) => s + Math.abs(t.valor), 0) };
    });
  } catch { catMeses.value = []; }
}
watch(() => [catAtual.value, periodo.value.chave, transacoes.value.length], () => { if (modo.value === 'categoria') carregarCatMeses(); }, { immediate: true });
const catMaiorMes = computed(() => Math.max(1, ...catMeses.value.map((x) => x.valor)));
// Limite da categoria (só despesas com categoria)
const limiteAberto = ref(false);
const limiteValor = ref(0);
const limiteErro = ref('');
function abrirLimite() { limiteValor.value = Number(catObj.value?.teto_mensal) || 0; limiteErro.value = ''; limiteAberto.value = true; }
async function salvarLimite() {
  const c = catObj.value;
  if (!c) return;
  const r = await pedir(`/api/categorias/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tetoMensal: Number(limiteValor.value) || 0 }) });
  if (!r.ok) { limiteErro.value = (await r.json().catch(() => ({}))).erro || 'Não foi possível salvar o limite.'; return; }
  limiteAberto.value = false;
  await carregarApoio();
  avisar(Number(limiteValor.value) > 0 ? `Limite de ${c.nome}: ${moeda(Number(limiteValor.value))} por mês.` : `${c.nome} ficou sem limite.`, { tipo: 'ok' });
}
const semFiltros = computed(() => !filtroConta.value && !filtroTipo.value && !filtroCategoria.value && !filtroReceita.value);
</script>

<template>
  <div class="pagina">
    <ReservasAuto @decidido="carregar" />
    <CabecalhoPagina titulo="Transações" cor="var(--entrada-cobalto-medio)" :sem-mes="modo === 'extrato'">
    <template #corpo>
    <div v-deslizar-mes class="area-mes" :class="'modo-' + modo">
      <!-- ===== Extrato / Detalhe da categoria: cabeçalho com voltar ===== -->
      <div v-if="modo !== 'blocos'" class="cab-sub">
        <button type="button" class="voltar-sub" aria-label="Voltar para Transações" data-voltar-transacoes @click="voltarBlocos"><ChevronLeft :size="18" :stroke-width="2" />Transações</button>
        <b>{{ modo === 'extrato' ? 'Todas as transações' : catInfo.nome }}</b>
      </div>

      <TopoValor v-if="modo === 'blocos'" tema="entrada" :variante="1" rotulo="Saldo do mês" :periodo="periodoTxt" :valor="saldoAnim" :linhas="[{ rotulo: 'Entradas', valor: entradasAnim }, { rotulo: 'Saídas', valor: saidasAnim }]">
        <template #rotulo>Saldo do mês<AjudaSecao v-if="resumo.quantidadeCartao" secao="transacoes.cartao" /></template>
        <div class="sobra">
          <BarraDegrade :pct="sobra.pct" de="var(--entrada-ceu-medio)" ate="var(--cor-sobre-cor)" :altura="8" />
          <span class="sobra-texto">{{ sobra.texto }}</span>
        </div>
        <template #acoes>
          <BarraAcoes compacto :colunas="4" rotulo="Ações de transações">
            <BotaoAcao compacto :icone="Filter" :rotulo="filtrosAtivos ? `Filtro (${filtrosAtivos})` : 'Filtro'" :destaque="!!filtrosAtivos" @click.stop="filtroAberto = !filtroAberto" />
            <BotaoAcao compacto :icone="ArrowUp" rotulo="Saída" tema="saida" @click="abrirModal('saida')" />
            <BotaoAcao compacto :icone="ArrowDown" rotulo="Entrada" tema="entrada" @click="abrirModal('entrada')" />
            <BotaoAcao compacto :icone="ArrowRightLeft" rotulo="Transferir" @click="abrirTransferencia()" />
          </BarraAcoes>
        </template>
      </TopoValor>

      <!-- Extrato: barras que escolhem o mês + filtro -->
      <CardPadrao v-if="modo === 'extrato'" class="painel-extrato" data-extrato>
        <div class="cab-extrato">
          <span class="ext-mes">{{ anoInteiro ? ano : `${MESES[periodo.mes - 1]} de ${ano}` }}</span>
          <button type="button" class="botao-filtro" :class="{ on: filtrosAtivos }" @click.stop="filtroAberto = !filtroAberto"><Filter :size="15" :stroke-width="2" />{{ filtrosAtivos ? `Filtro (${filtrosAtivos})` : 'Filtro' }}</button>
        </div>
        <RelBarrasMes :meses="mesesExtrato" :selecionado="indiceExtrato" :formato="moedaInt" @escolher="escolherMesExtrato" />
      </CardPadrao>

      <CardPadrao v-if="filtroAberto && modo === 'extrato'" class="painel-filtro" @click.stop>
        <CampoSelecao v-model="filtroConta" rotulo="Conta" :opcoes="[{ valor: '', rotulo: 'Todas as contas' }, ...contas.map((c) => ({ valor: c.id, rotulo: c.nome }))]" />
        <CampoSelecao v-model="filtroTipo" rotulo="Tipo" :opcoes="[{ valor: '', rotulo: 'Entradas e saídas' }, { valor: 'entrada', rotulo: 'Só entradas' }, { valor: 'saida', rotulo: 'Só saídas' }]" />
      </CardPadrao>


      <p v-if="aviso" class="aviso-ok">
        {{ aviso.texto }}
        <a v-if="aviso.cartaoId" href="#" @click.prevent="router.push({ name: 'cartao-extrato', params: { id: aviso.cartaoId } })">Ver na fatura</a>
        <a v-if="aviso.desfazer" href="#" @click.prevent="desfazerAviso">Desfazer</a>
        <button type="button" class="botao-icone" aria-label="Fechar aviso" @click="aviso = null">Fechar</button>
      </p>

      <!-- ===== BLOCOS (padrão) ===== -->
      <template v-if="modo === 'blocos'">
        <!-- 1. Gastos | Entradas por categoria (rosca ↔ barras) -->
        <CardPadrao class="bloco-tx" data-bloco-grafico>
          <div class="cab-bloco">
            <div class="mini-abas" role="tablist" aria-label="Gastos ou entradas por categoria">
              <button type="button" role="tab" :aria-selected="abaGrafico === 'saida'" :class="{ on: abaGrafico === 'saida' }" @click="abaGrafico = 'saida'">Gastos por categoria</button>
              <button type="button" role="tab" :aria-selected="abaGrafico === 'entrada'" :class="{ on: abaGrafico === 'entrada' }" @click="abaGrafico = 'entrada'">Entradas</button>
            </div>
            <button type="button" class="troca-graf" :aria-label="tipoGrafico === 'rosca' ? 'Ver em barras' : 'Ver em rosca'" @click="tipoGrafico = tipoGrafico === 'rosca' ? 'barras' : 'rosca'"><component :is="tipoGrafico === 'rosca' ? ChartBar : ChartPie" :size="16" :stroke-width="2" /></button>
          </div>
          <DashRosca v-if="tipoGrafico === 'rosca'" compacta :key="abaGrafico + periodo.chave" :segmentos="segmentosGrafico" :rotulo-total="abaGrafico === 'saida' ? 'gasto total' : 'entrou'" :rotulo-vazio="abaGrafico === 'saida' ? 'Nenhum gasto neste período.' : 'Nenhuma entrada neste período.'" @clicar="(f) => abrirCategoria(f.chave)" />
          <template v-else>
            <RelBarrasH v-if="barrasGrafico.length" :itens="barrasGrafico" :formato="moeda" clicavel :de="abaGrafico === 'saida' ? 'var(--saida-ambar-medio)' : '#4CC27A'" :ate="abaGrafico === 'saida' ? 'var(--saida-carmim-medio)' : '#167A42'" @clicar="(i) => abrirCategoria(i.id)" />
            <p v-else class="nota-vazia">{{ abaGrafico === 'saida' ? 'Nenhum gasto neste período.' : 'Nenhuma entrada neste período.' }}</p>
          </template>
        </CardPadrao>

        <!-- 2. Categorias: gasto e limite, maiores em destaque, aviso de sem categoria -->
        <CardPadrao class="bloco-tx" titulo="Categorias" ajuda="transacoes.categorias" data-bloco-categorias>
          <button v-if="semCategoria.length" type="button" class="aviso-semcat" data-sem-categoria @click="abrirCategoria('s-0')">
            <TriangleAlert :size="17" :stroke-width="2" /><span><b>{{ semCategoria.length }} sem categoria</b> — toque para categorizar</span><ChevronRight :size="16" :stroke-width="2" />
          </button>
          <ul v-if="blocoCategorias.length" class="lista-cat">
            <li v-for="c in blocoCategorias" :key="c.chave">
              <button type="button" class="linha-cat" :class="{ destaque: c.destaque }" @click="abrirCategoria(c.chave)">
                <IconeCategoria :valor="c.icone || ''" tipo="saida" :cor="c.cor" :tamanho="38" />
                <span class="lc-corpo">
                  <span class="lc-topo"><span class="lc-nome">{{ c.nome }}<small v-if="c.destaque" class="selo-maior">maior gasto</small></span><b class="numero-tabular">{{ moeda(c.gasto) }}</b></span>
                  <BarraDegrade v-if="c.teto > 0" :pct="c.pct" :de="faixaCat(c.pct).de" :ate="faixaCat(c.pct).ate" :altura="6" :marcador="false" />
                  <small class="lc-sub numero-tabular">{{ c.teto > 0 ? `${c.pct}% de ${moeda(c.teto)}` : 'sem limite' }} · {{ c.qtd }} lançamento(s)</small>
                </span>
              </button>
            </li>
          </ul>
          <p v-else class="nota-vazia">Nenhum gasto categorizado neste período.</p>
        </CardPadrao>

        <!-- 3. Últimas transações + Ver todas -->
        <CardPadrao class="bloco-tx" titulo="Últimas transações" data-bloco-ultimas>
          <div v-if="ultimas.length" class="cartao-lista-sem">
            <LinhaTransacao v-for="t in ultimas" :key="t.id" :t="t" :info="infoDe(t)" arrastavel :pode-excluir="podeExcluirTx(t)" @abrir="abrirEdicao" @editar="abrirEdicao" @excluir="excluirTx" />
          </div>
          <p v-else class="nota-vazia">Nenhuma transação {{ anoInteiro ? 'neste ano' : 'neste mês' }}.</p>
          <button type="button" class="ver-todas" data-ver-todas @click="irModo({ ver: 'extrato' })">Ver todas<ChevronRight :size="16" :stroke-width="2" /></button>
        </CardPadrao>
      </template>

      <!-- ===== DETALHE DA CATEGORIA ===== -->
      <template v-if="modo === 'categoria'">
        <div class="chips-cat" role="tablist" aria-label="Trocar de categoria">
          <button v-for="c in chipsCategorias" :key="c.chave" type="button" role="tab" :aria-selected="c.chave === catAtual" :class="['chip-c', { on: c.chave === catAtual }]" @click="router.replace({ path: '/transacoes', query: { cat: c.chave } })">
            <IconeCategoria :valor="c.icone || ''" :tipo="catTipo" :cor="c.cor || undefined" :tamanho="22" />{{ c.nome }}
          </button>
        </div>
        <CardPadrao class="bloco-tx" data-detalhe-categoria>
          <div class="cat-cab-det">
            <IconeCategoria :valor="catInfo.icone || ''" :tipo="catTipo" :cor="catInfo.cor || undefined" :tamanho="44" />
            <span class="cd-txt"><b>{{ catInfo.nome }}</b><small>{{ anoInteiro ? ano : `${MESES[periodo.mes - 1]} de ${ano}` }} · {{ catItens.length }} lançamento(s)</small></span>
            <strong class="cd-total numero-tabular" :class="catTipo === 'entrada' ? 'pos' : 'neg'">{{ moeda(catTotal) }}</strong>
          </div>
          <div v-if="catObj" class="limite-cat">
            <template v-if="Number(catObj.teto_mensal) > 0">
              <BarraDegrade :pct="Math.round(catTotal / (catObj.teto_mensal * (anoInteiro ? 12 : 1)) * 100)" :de="faixaCat(Math.round(catTotal / (catObj.teto_mensal * (anoInteiro ? 12 : 1)) * 100)).de" :ate="faixaCat(Math.round(catTotal / (catObj.teto_mensal * (anoInteiro ? 12 : 1)) * 100)).ate" :altura="8" :marcador="false" />
              <span class="lim-txt numero-tabular">Limite {{ moeda(catObj.teto_mensal) }}/mês · {{ catTotal <= catObj.teto_mensal * (anoInteiro ? 12 : 1) ? `ainda pode gastar ${moeda(catObj.teto_mensal * (anoInteiro ? 12 : 1) - catTotal)}` : `passou ${moeda(catTotal - catObj.teto_mensal * (anoInteiro ? 12 : 1))}` }}</span>
            </template>
            <button type="button" class="link-lim" data-limite @click="abrirLimite">{{ Number(catObj.teto_mensal) > 0 ? 'Mudar limite' : 'Definir limite' }}</button>
          </div>
          <div class="cab-bloco">
            <span class="sub-tit">{{ catGrafico === 'barras' ? 'Mês a mês' : 'Por subcategoria' }}</span>
            <button type="button" class="troca-graf" :aria-label="catGrafico === 'barras' ? 'Ver em rosca' : 'Ver em barras'" @click="catGrafico = catGrafico === 'barras' ? 'rosca' : 'barras'"><component :is="catGrafico === 'barras' ? ChartPie : ChartBar" :size="16" :stroke-width="2" /></button>
          </div>
          <div v-if="catGrafico === 'barras'" class="meses-cat" aria-label="Gasto da categoria nos últimos 6 meses">
            <div v-for="m in catMeses" :key="m.chave" class="mc" :class="{ sel: m.chave === periodo.chave }">
              <span class="mc-v numero-tabular">{{ moedaInt(m.valor) }}</span>
              <span class="mc-barra" :class="catTipo" :style="{ height: Math.max(3, (m.valor / catMaiorMes) * 100) + '%' }"></span>
              <span class="mc-r">{{ m.rotulo }}</span>
            </div>
            <p v-if="!catMeses.length" class="nota-vazia">Gráfico por mês disponível na visão de mês.</p>
          </div>
          <DashRosca v-else compacta :segmentos="catSegmentos" rotulo-total="no período" rotulo-vazio="Sem lançamentos." />
        </CardPadrao>
        <div v-if="catSubs.length" class="chips-sub" role="group" aria-label="Filtrar por subcategoria">
          <button type="button" :class="['chip-s', { on: !subFiltro }]" @click="subFiltro = ''">Todas</button>
          <button v-for="sb in catSubs" :key="sb" type="button" :class="['chip-s', { on: subFiltro === sb }]" @click="subFiltro = subFiltro === sb ? '' : sb">{{ sb }}</button>
        </div>
        <CardPadrao class="cartao-lista" sem-padding>
          <LinhaTransacao v-for="t in catLista" :key="t.id" :t="t" :info="infoDe(t)" arrastavel :pode-excluir="podeExcluirTx(t)" @abrir="abrirEdicao" @editar="abrirEdicao" @excluir="excluirTx" />
          <p v-if="!catLista.length" class="nota-vazia pad">Nenhuma transação nesta categoria {{ anoInteiro ? 'neste ano' : 'neste mês' }}.</p>
        </CardPadrao>
      </template>

      <template v-if="modo === 'extrato'">
      <p v-if="!carregando && transacoes.length === 0" class="vazio">
        <Receipt :size="28" :stroke-width="1.6" />
        <span>Nenhuma transação {{ semFiltros ? (anoInteiro ? 'neste ano' : 'neste mês') : 'neste filtro' }}.</span>
      </p>

      <div v-else :key="`${periodo.chave}-extrato`" class="lista-wrap">
        <template v-if="!anoInteiro">
          <section v-for="g in gruposPorDia" :key="g.iso" class="grupo">
            <header class="titulo-grupo">
              <span>{{ g.rotulo }}</span>
              <span v-if="g.total !== 0" class="total-grupo numero-tabular" :class="g.total < 0 ? 'neg' : 'pos'">{{ g.total < 0 ? '−' : '+' }} {{ moeda(Math.abs(g.total)) }}</span>
            </header>
            <CardPadrao class="cartao-lista" sem-padding>
              <LinhaTransacao v-for="t in g.itens" :key="t.id" :t="t" :info="infoDe(t)" arrastavel :pode-excluir="podeExcluirTx(t)" @abrir="abrirEdicao" @editar="abrirEdicao" @excluir="excluirTx" />
            </CardPadrao>
          </section>
        </template>

        <template v-else>
          <CardPadrao v-for="g in gruposPorMes" :key="g.m" tag="button" clicavel @abrir="escolher(ano, g.m)">
            <span class="cartao-mes">
              <span class="mes-topo">
                <strong class="mes-nome">{{ g.nome }}</strong>
                <span class="mes-resultado numero-tabular" :class="g.resultado < 0 ? 'neg' : 'pos'">{{ g.resultado < 0 ? '−' : '' }} {{ moeda(Math.abs(g.resultado)) }}</span>
                <ChevronRight :size="18" :stroke-width="2" class="seta-mes" />
              </span>
              <span class="mes-valores">
                <span class="mv entrada"><ArrowDown :size="13" :stroke-width="2.6" /><span class="numero-tabular">{{ moeda(g.entradas) }}</span></span>
                <span class="mv saida"><ArrowUp :size="13" :stroke-width="2.6" /><span class="numero-tabular">{{ moeda(g.saidas) }}</span></span>
                <span class="mv qtd">{{ g.itens.length }} lançamento(s)</span>
              </span>
              <BarraDegrade :pct="g.pct" de="var(--entrada-ceruleo-medio)" ate="var(--entrada-royal-medio)" :altura="6" :marcador="false" />
            </span>
          </CardPadrao>
        </template>

      </div>
      </template>
    </div>
    </template>
    </CabecalhoPagina>
    <SeletorPopup :aberto="limiteAberto" :titulo="catObj ? `Limite de ${catObj.nome}` : 'Limite'" tema="saida" @fechar="limiteAberto = false">
      <div class="form-limite">
        <CampoValor v-model="limiteValor" tipo="saida" rotulo="Limite por mês" dica="Deixe zero para ficar sem limite." />
        <p v-if="limiteErro" class="erro-lim" role="alert">{{ limiteErro }}</p>
        <button type="button" class="salvar-lim" data-salvar-limite @click="salvarLimite">Salvar limite</button>
      </div>
    </SeletorPopup>

    <div v-if="menu" class="menu-pontos" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @click.stop>
      <button type="button" @click="abrirEdicao(menu.t)">Editar</button>
      <button v-if="!menu.t.cartao && !menu.t.tipo_mov" type="button" @click="alternarIgnorar(menu.t)">{{ menu.t.ignorada ? 'Reativar' : 'Ignorar' }}</button>
      <button v-if="podeEstornar(menu.t)" type="button" @click="abrirEstorno(menu.t)">Estornar / devolver</button>
      <button v-if="menu.t.tipo_mov && !ehReserva(menu.t)" type="button" class="perigo" @click="desfazerMov(menu.t)">{{ ehTransf(menu.t) ? 'Desfazer transferência' : 'Desfazer estorno' }}</button>
      <button v-else-if="menu.t.origem === 'manual'" type="button" class="perigo" @click="fecharMenu(); apagar(menu.t)">Apagar</button>
    </div>

    <!-- Detalhes / edição -->
    <FormularioModal :aberto="!!editando" titulo="Detalhes da transação" ajuda="transacoes.editar" :tema="edicaoEhSaida ? 'saida' : 'entrada'" :erro="erroEdicao" rotulo-cancelar="Fechar" @salvar="salvarEdicao" @fechar="editando = null">
      <template v-if="editando">
        <p class="origem-tx">
          <span :class="['tag-tipo', edicaoEhSaida ? 'saida' : 'entrada']">{{ edicaoEhSaida ? 'Saída' : 'Entrada' }}</span>
          <span class="nota" v-if="editando.cartao">{{ `Cartão ${editando.conta_nome}${editando.total_parcelas > 1 ? ` · ${editando.total_parcelas}x` : ''}${editando.cartao_origem === 'manual' ? '' : ' · do banco'}` }}</span>
          <span class="nota" v-else>{{ editando.origem === 'manual' ? 'Lançada à mão' : 'Do banco (Open Finance)' }}</span>
          <span v-if="editando.tipo_mov" class="selo-ignorada">{{ rotuloMov[editando.tipo_mov] }}{{ foraDosTotais(editando) ? ' · fora dos totais' : '' }}</span>
          <span v-else-if="editando.ignorada" class="selo-ignorada">ignorada</span>
        </p>
        <!-- Homologação 1.0, seção 6: ações que saíram do menu ⋮ ficam aqui, no detalhe -->
        <div class="acoes-detalhe" data-acoes-detalhe>
          <button v-if="podeEstornar(editando)" type="button" class="acao-det" @click="abrirEstorno(editando); editando = null">Estornar</button>
          <button v-if="!editando.cartao && !editando.tipo_mov" type="button" class="acao-det" @click="alternarIgnorar(editando); editando = null">{{ editando.ignorada ? 'Reativar' : 'Ignorar' }}</button>
          <button v-if="trechoRegra(editando.cartao ? editando.descricao_base : editando.descricao)" type="button" class="acao-det" @click="criarRegraDaTx(editando)">Criar regra</button>
          <button v-if="editando.tipo_mov && editando.vinculo && !ehReserva(editando)" type="button" class="acao-det perigo" @click="excluirTx(editando); editando = null">{{ ehTransf(editando) ? 'Desfazer transferência' : 'Desfazer estorno' }}</button>
        </div>
        <!-- 29/10 22h24: o detalhe abre RESUMIDO; tocar no resumo expande os campos de edição (valor, data, descrição, conta) -->
        <button v-if="((editando.origem === 'manual' && !editando.tipo_mov) || (editando.cartao && editando.cartao_origem === 'manual' && (!editando.tipo_mov || ['estorno_avulso', 'estorno_vinculado', 'pagamento', 'cashback'].includes(editando.tipo_mov)))) && !dadosAbertos" type="button" class="resumo-tx" data-resumo-tx @click="dadosAbertos = true">
          <dl class="detalhes-tx">
            <div><dt>Descrição</dt><dd>{{ editando.cartao ? editando.descricao_base : editando.descricao }}</dd></div>
            <div><dt>Valor</dt><dd class="numero-tabular" :class="editando.valor < 0 ? 'negativo' : 'positivo'">{{ moeda(editando.cartao ? (editando.valor < 0 ? -1 : 1) * Math.abs(editando.valor_total_compra) : editando.valor) }}</dd></div>
            <div><dt>Data</dt><dd>{{ dataCurta(editando.cartao ? editando.data_compra : editando.data) }}</dd></div>
            <div><dt>{{ editando.cartao ? 'Cartão' : 'Conta' }}</dt><dd>{{ editando.conta_nome }}</dd></div>
          </dl>
          <span class="editar-dados"><Pencil :size="14" :stroke-width="2" aria-hidden="true" />Editar valor, data e descrição</span>
        </button>
        <template v-if="((editando.origem === 'manual' && !editando.tipo_mov) || (editando.cartao && editando.cartao_origem === 'manual' && (!editando.tipo_mov || ['estorno_avulso', 'estorno_vinculado', 'pagamento', 'cashback'].includes(editando.tipo_mov)))) && dadosAbertos">
          <CampoTipo v-if="!editando.cartao" v-model="formEdicao.tipo" />
          <CampoTipo v-else-if="editando.total_parcelas === 1" v-model="formEdicao.tipo" rotulo="Lançar no extrato como" :opcoes="[{ id: 'saida', rotulo: 'Saída', tema: 'saida' }, { id: 'entrada', rotulo: 'Entrada', tema: 'entrada' }]" data-marcar-credito />
          <div v-if="ehCreditoCartao" class="credito-cartao" data-credito-cartao>
            <p class="nota">Crédito abate a fatura. Que crédito é este?</p>
            <label v-for="o in [['estorno', 'Estorno de uma compra', 'Anula a compra (ou parte dela)'], ['pagamento', 'Pagamento adiantado da fatura', 'Não é entrada nem gasto'], ['cashback', 'Cashback ou outro crédito', 'Entra como entrada em Cashback']]" :key="o[0]" class="opcao-credito" :class="{ ativa: credito.tipo === o[0] }">
              <input v-model="credito.tipo" type="radio" name="tipo-credito" :value="o[0]" />
              <span><b>{{ o[1] }}</b><small>{{ o[2] }}</small></span>
            </label>
            <label v-if="credito.tipo === 'estorno'" class="campo-credito"><span>Compra estornada</span>
              <select v-model="credito.originalCompraId" data-compra-estornada>
                <option value="">{{ credito.parecidas === null ? 'Procurando compras parecidas…' : 'Não sei / não está no app (fica em A revisar)' }}</option>
                <option v-for="c in credito.parecidas || []" :key="c.compraId" :value="c.compraId">{{ c.descricao }} · {{ dataCurta(c.data) }} · {{ moeda(c.valor) }}</option>
              </select></label>
            <label v-if="credito.tipo === 'pagamento'" class="campo-credito"><span>De qual conta saiu?</span>
              <select v-model="credito.contaId" data-conta-pagamento>
                <option value="" disabled>Escolha a conta…</option>
                <option v-for="c in contas" :key="c.id" :value="c.id">{{ c.nome }}</option>
              </select></label>
          </div>
          <CampoValor v-model="formEdicao.valor" :tipo="edicaoEhSaida ? 'saida' : 'entrada'" :rotulo="editando.cartao ? (formEdicao.tipo === 'entrada' ? 'Valor do crédito' : 'Valor total da compra') : 'Valor'">
            <template #lado><CampoDataPilula v-model="formEdicao.data" :rotulo="editando.cartao ? 'Data da compra' : 'Data'" /></template>
          </CampoValor>
          <CampoTexto v-model="formEdicao.descricao" rotulo="Descrição" />
          <p v-if="editando.cartao" class="nota">Cartão: {{ editando.conta_nome }} · parcela {{ editando.descricao.match(/\((\d+\/\d+)\)$/)?.[1] || '1/1' }} nesta linha</p>
          <CampoConta v-else v-model="formEdicao.contaId" :contas="contasCampo" />
        </template>
        <dl v-else class="detalhes-tx">
          <div><dt>Descrição</dt><dd>{{ editando.descricao }}</dd></div>
          <div><dt>Valor</dt><dd class="numero-tabular" :class="editando.valor < 0 ? 'negativo' : 'positivo'">{{ moeda(editando.valor) }}</dd></div>
          <div><dt>Data</dt><dd>{{ dataCurta(editando.data) }}</dd></div>
          <div><dt>Conta</dt><dd>{{ editando.conta_nome }}</dd></div>
        </dl>
        <CampoCategoria v-if="edicaoEhSaida || (ehCreditoCartao && credito.tipo === 'estorno')" :key="'ed-s' + editando.id" v-model="formEdicao.categoriaId" tipo="saida" tema="saida" rotulo="Categoria de despesa" :categorias="categorias" @criada="carregarApoio" />
        <CampoCategoria v-else-if="!editando.cartao" :key="'ed-e' + editando.id" v-model="formEdicao.categoriaReceita" tipo="entrada" tema="entrada" rotulo="Categoria de entrada" @criada="carregarApoio" />
        <CampoSubcategoria v-model="formEdicao.subcategoria" :sugestoes="sugestoesSub" :tema="edicaoEhSaida ? 'saida' : 'entrada'" />
        <CampoIconeItem v-if="!editando.cartao" v-model="formEdicao.icone" :tipo="formEdicao.tipo" :descricao="formEdicao.descricao" />
      </template>
    </FormularioModal>

    <RegraModal :aberto="regraAberta" :inicial="sugestaoRegra ? sugestaoRegra.inicial : {}" tipo-fixo @fechar="regraAberta = false" @salvo="regraCriada" />

    <FormularioModal :aberto="!!estornando" titulo="Estornar lançamento" ajuda="transacoes.estorno" tema="neutro" rotulo-salvar="Estornar" :erro="erroEstorno" @salvar="confirmarEstorno" @fechar="estornando = null">
      <template v-if="estornando">
        <p class="nota">
          <strong>{{ estornando.cartao ? estornando.descricao_base : estornando.descricao }}</strong>
          · {{ moeda(Math.abs(estornando.cartao ? estornando.valor_total_compra : estornando.valor)) }}
        </p>
        <CampoData v-if="!estornando.cartao" v-model="dataEstorno" rotulo="Data do estorno" atalhos />
      </template>
    </FormularioModal>
  </div>
</template>

<style scoped>
.pagina {
  --txt-entrada: var(--entrada-royal-claro); --txt-saida: var(--saida-carmim-claro);
  padding: 0 0 var(--espaco-fim); max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao);
}
:global(:root[data-theme='light']) .pagina { --txt-entrada: var(--entrada-royal-medio); --txt-saida: var(--saida-carmim-medio); }

.area-mes { display: flex; flex-direction: column; gap: 16px; min-width: 0; touch-action: pan-y; }

.painel-filtro { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }

.sobra { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.sobra-texto { font-size: 12.5px; opacity: 0.92; }
.dica-pix { margin: 0; padding: 10px 12px; border-radius: 10px; border: 1px dashed var(--cor-borda); font-size: 13px; color: var(--cor-texto-suave); display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.dica-pix.propria { border-style: solid; color: var(--cor-texto); }
.nota-cartao { margin: 0; font-size: 12px; color: var(--cor-texto-suave); }

.chip-filtro { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; margin: 0; padding: 8px 10px; border-radius: 10px; background: var(--cor-card); border: 1px solid var(--cor-card-borda); }
.vazio { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: 24px 0; color: var(--cor-texto-suave); font-size: 14px; }

.lista-wrap { display: flex; flex-direction: column; gap: 18px; animation: entra var(--anim-padrao) var(--anim-curva) both; }
@keyframes entra { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.grupo { display: flex; flex-direction: column; gap: 6px; }
.titulo-grupo { display: flex; justify-content: space-between; align-items: baseline; padding: 0 6px; font-size: 13px; font-weight: 600; color: var(--cor-texto-suave); }
.total-grupo { font-size: 12px; font-weight: 600; }
.pos { color: var(--txt-entrada); }
.neg { color: var(--txt-saida); }
.cartao-lista :deep(.linha-tx) { margin: 0 6px; }
.cartao-lista { padding-block: 4px; }
.cartao-lista :deep(.linha-tx + .linha-tx) { border-top: 1px solid var(--cor-borda); border-radius: 0 0 14px 14px; }

.cartao-mes { display: flex; flex-direction: column; gap: 10px; text-align: left; color: var(--cor-texto); font-weight: 500; }
.mes-topo { display: flex; align-items: center; gap: 10px; }
.mes-nome { flex: 1; font-family: var(--fonte-display); font-size: 16px; text-transform: capitalize; }
.mes-resultado { font-family: var(--fonte-display); font-weight: 700; font-size: 16px; }
.seta-mes { color: var(--cor-texto-suave); flex: none; }
.mes-valores { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 12.5px; }
.mv { display: inline-flex; align-items: center; gap: 4px; }
.mv.entrada { color: var(--txt-entrada); }
.mv.saida { color: var(--txt-saida); }
.mv.qtd { color: var(--cor-texto-suave); margin-left: auto; }

.cat-grupo + .cat-grupo { border-top: 1px solid var(--cor-borda); }
.cat-cab { width: 100%; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto 20px; align-items: center; gap: 12px; padding: 10px 10px 10px 12px; min-height: 60px; background: transparent; border: none; color: var(--cor-texto); text-align: left; font-family: inherit; font-weight: 500; cursor: pointer; }
.cat-cab:hover { background: var(--cor-realce); }
.cat-textos { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cat-nome { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-qtd { font-size: 12px; color: var(--cor-texto-suave); }
.cat-trilho { height: 5px; border-radius: 999px; background: var(--cor-borda); overflow: hidden; }
.cat-fill { display: block; height: 100%; border-radius: 999px; background: var(--c); transition: width var(--anim-lenta) var(--anim-curva-suave); }
.cat-total { font-family: var(--fonte-display); font-weight: 600; font-size: 15px; white-space: nowrap; }
.cat-total.positivo { color: var(--txt-entrada); }
.cat-total.negativo { color: var(--txt-saida); }
.cat-total.neutro { color: var(--cor-texto-suave); }
.seta-cat { color: var(--cor-texto-suave); transition: transform var(--anim-padrao) var(--anim-curva); }
.seta-cat.aberta { transform: rotate(180deg); }
.cat-itens { padding: 0 6px 6px 14px; border-top: 1px dashed var(--cor-borda); }

.origem-tx { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0; }
.origem-tx .nota { flex: 1 1 180px; margin: 0; }
.detalhes-tx { margin: 0; display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid var(--cor-borda); border-radius: 10px; background: var(--cor-fundo); }
.detalhes-tx div { display: flex; justify-content: space-between; gap: 12px; }
.detalhes-tx dt { color: var(--cor-texto-suave); font-size: 13px; }
.detalhes-tx dd { margin: 0; font-size: 14px; text-align: right; overflow-wrap: anywhere; }
.positivo { color: var(--txt-entrada); }
.negativo { color: var(--txt-saida); }
.nota { font-size: 13px; color: var(--cor-texto-suave); margin: 0; }
.previa { margin: 0; font-size: 13px; color: var(--cor-texto-suave); border: 1px dashed var(--cor-borda); border-radius: 10px; padding: 10px 12px; }
.aviso-ok { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--cor-investimento-fundo); color: var(--cor-positivo); font-size: 14px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.aviso-ok a { color: inherit; font-weight: 600; }
.botao-icone { background: transparent; border: 1px solid var(--cor-borda); color: var(--cor-texto-suave); font-family: inherit; font-size: 12px; padding: 6px 10px; border-radius: 10px; min-height: 36px; cursor: pointer; }
.tag-tipo { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.tag-tipo.entrada { background: var(--cor-entrada-fundo); color: var(--txt-entrada); }
.tag-tipo.saida { background: var(--cor-saida-fundo); color: var(--txt-saida); }
.credito-cartao { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); }
.credito-cartao .nota { margin: 0; }
.opcao-credito { display: flex; gap: 10px; align-items: center; min-height: 48px; padding: 8px 10px; border-radius: 12px; border: 1.5px solid var(--cor-borda); cursor: pointer; }
.opcao-credito.ativa { border-color: var(--cor-entrada); }
.opcao-credito input { width: 18px; height: 18px; accent-color: var(--cor-entrada); flex: none; }
.opcao-credito span { display: flex; flex-direction: column; gap: 1px; font-size: 14px; min-width: 0; }
.opcao-credito small { color: var(--cor-texto-suave); font-size: 12.5px; }
.campo-credito { display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 500; }
.campo-credito select { font: 15px var(--fonte-texto); min-height: 44px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); max-width: 100%; }
.selo-ignorada { display: inline-block; margin-left: 6px; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--cor-borda); color: var(--cor-texto-suave); }
.menu-pontos { position: fixed; z-index: 60; width: 160px; background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); border-radius: 12px; padding: 6px; display: flex; flex-direction: column; box-shadow: var(--sombra-suave); }
.menu-pontos button { background: transparent; border: none; color: var(--cor-texto); text-align: left; font-family: inherit; font-size: 14px; font-weight: 500; padding: 12px 10px; border-radius: 8px; cursor: pointer; }
.menu-pontos button:hover { background: var(--cor-realce); }
.menu-pontos .perigo { color: var(--cor-alerta); }
.acoes-detalhe { display: flex; flex-wrap: wrap; gap: 6px; margin: -2px 0 4px; }
.acao-det { min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); font: 600 12.5px var(--fonte-texto); cursor: pointer; }
.acao-det:hover { background: var(--cor-realce); }
.acao-det.perigo { color: var(--cor-alerta-texto, var(--cor-alerta)); }
.resumo-tx { width: 100%; display: flex; flex-direction: column; gap: 6px; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.resumo-tx .detalhes-tx { margin: 0; }
.resumo-tx:hover .detalhes-tx { border-color: color-mix(in srgb, var(--cor-primaria) 40%, var(--cor-borda)); }
.editar-dados { align-self: flex-end; display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--cor-primaria); }
/* ===== Seção 5 (0.12): blocos, extrato e detalhe da categoria ===== */
.cab-sub { display: flex; align-items: center; gap: 10px; }
.cab-sub b { font-family: var(--fonte-display); font-size: 17px; }
.voltar-sub { display: inline-flex; align-items: center; gap: 2px; min-height: 36px; padding: 0 10px 0 4px; border-radius: 999px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto-suave); font: 600 13px var(--fonte-texto); cursor: pointer; }
.voltar-sub:hover { color: var(--cor-texto); background: var(--cor-realce); }
.bloco-tx { gap: 10px; }
.cab-bloco { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mini-abas { display: inline-flex; padding: 3px; border-radius: 12px; background: var(--cor-fundo); border: 1px solid var(--cor-borda); }
.mini-abas button { min-height: 32px; padding: 0 12px; border: 0; border-radius: 9px; background: none; color: var(--cor-texto-suave); font: 600 12.5px var(--fonte-texto); cursor: pointer; }
.mini-abas button.on { background: var(--cor-interface, var(--cor-primaria)); color: #fff; }
.troca-graf { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto-suave); cursor: pointer; }
.troca-graf:hover { color: var(--cor-texto); background: var(--cor-realce); }
.nota-vazia { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.nota-vazia.pad { padding: 14px; }
.aviso-semcat { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--cor-amarelo) 40%, transparent); background: color-mix(in srgb, var(--cor-amarelo) 10%, transparent); color: var(--cor-texto); font: 13.5px var(--fonte-texto); text-align: left; cursor: pointer; }
.aviso-semcat svg:first-child { color: var(--cor-amarelo); flex: none; }
.aviso-semcat span { flex: 1; }
.lista-cat { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.linha-cat { width: 100%; display: flex; align-items: center; gap: 12px; padding: 8px 6px; border: 0; border-radius: 12px; background: none; color: var(--cor-texto); font: inherit; text-align: left; cursor: pointer; }
.linha-cat:hover { background: var(--cor-realce); }
.linha-cat.destaque { background: color-mix(in srgb, var(--cor-saida) 6%, transparent); }
.lc-corpo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.lc-topo { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.lc-nome { font-size: 14.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.lc-topo b { font-family: var(--fonte-display); font-size: 14.5px; }
.lc-sub { font-size: 12px; color: var(--cor-texto-suave); }
.selo-maior { font-size: 10.5px; font-weight: 700; padding: 1px 7px; border-radius: 999px; color: var(--cor-saida-texto, var(--cor-saida)); background: color-mix(in srgb, var(--cor-saida) 14%, transparent); }
.ver-todas { align-self: center; display: inline-flex; align-items: center; gap: 2px; min-height: 40px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-primaria); font: 600 13.5px var(--fonte-texto); cursor: pointer; }
.ver-todas:hover { background: var(--cor-realce); }
.cartao-lista-sem { display: flex; flex-direction: column; }
.painel-extrato { gap: 10px; }
.cab-extrato { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.ext-mes { font-family: var(--fonte-display); font-size: 15px; font-weight: 600; }
.ext-mes::first-letter { text-transform: uppercase; }
.botao-filtro { display: inline-flex; align-items: center; gap: 5px; min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto-suave); font: 600 12.5px var(--fonte-texto); cursor: pointer; }
.botao-filtro.on { color: var(--cor-primaria); border-color: var(--cor-primaria); }
.chips-cat, .chips-sub { display: flex; gap: 6px; overflow-x: auto; padding: 2px 2px 4px; scrollbar-width: none; overscroll-behavior-x: contain; }
.chips-cat::-webkit-scrollbar, .chips-sub::-webkit-scrollbar { display: none; }
.chip-c { flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 0 12px 0 6px; border-radius: 999px; border: 1.5px solid var(--cor-borda); background: var(--cor-card); color: var(--cor-texto); font: 600 12.5px var(--fonte-texto); white-space: nowrap; cursor: pointer; }
.chip-c.on { border-color: var(--cor-primaria); background: var(--cor-realce); }
.chip-s { flex: none; min-height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--cor-borda); background: var(--cor-card); color: var(--cor-texto-suave); font: 600 12px var(--fonte-texto); white-space: nowrap; cursor: pointer; }
.chip-s.on { color: var(--cor-texto); border-color: var(--cor-primaria); }
.cat-cab-det { display: flex; align-items: center; gap: 12px; }
.cd-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.cd-txt b { font-family: var(--fonte-display); font-size: 17px; }
.cd-txt small { font-size: 12px; color: var(--cor-texto-suave); }
.cd-txt small::first-letter { text-transform: uppercase; }
.cd-total { font-family: var(--fonte-display); font-size: 19px; }
.cd-total.neg { color: var(--cor-saida-texto, var(--cor-saida)); }
.cd-total.pos { color: var(--cor-entrada-texto, var(--cor-entrada)); }
.limite-cat { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 12px; background: var(--cor-fundo); border: 1px solid var(--cor-borda); }
.lim-txt { font-size: 12.5px; color: var(--cor-texto-suave); }
.link-lim { align-self: flex-start; min-height: 32px; padding: 0; border: 0; background: none; color: var(--cor-primaria); font: 600 13px var(--fonte-texto); cursor: pointer; }
.sub-tit { font-size: 13px; font-weight: 600; color: var(--cor-texto-suave); }
.meses-cat { display: flex; align-items: flex-end; gap: 6px; height: 130px; }
.mc { flex: 1; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; opacity: 0.6; }
.mc.sel { opacity: 1; }
.mc-v { font-size: 9.5px; color: var(--cor-texto-suave); white-space: nowrap; }
.mc-barra { width: min(22px, 60%); border-radius: 6px 6px 2px 2px; background: linear-gradient(180deg, #E15F0E, #CE2239); }
.mc-barra.entrada { background: linear-gradient(180deg, #4CC27A, #167A42); }
.mc-r { font-size: 10px; font-weight: 600; color: var(--cor-texto-suave); }
.form-limite { display: flex; flex-direction: column; gap: 10px; }
.erro-lim { margin: 0; font-size: 13px; color: var(--cor-alerta-texto, var(--cor-alerta)); }
.salvar-lim { min-height: 46px; border-radius: 12px; border: 0; background: var(--cor-interface, var(--cor-primaria)); color: #fff; font: 600 14.5px var(--fonte-texto); cursor: pointer; }
/* PC: gráfico + categorias lado a lado, últimas transações embaixo (seção 17) */
@media (min-width: 1100px) {
  .modo-blocos { display: grid !important; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  .modo-blocos > :not([data-bloco-grafico]):not([data-bloco-categorias]) { grid-column: 1 / -1; }
}
</style>
