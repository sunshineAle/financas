<script setup>
import CampoIconeItem from '../components/CampoIconeItem.vue';
import ReservasAuto from '../components/ReservasAuto.vue';
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import CabecalhoPagina from '../components/CabecalhoPagina.vue';
import TopoValor from '../components/TopoValor.vue';
import AbasSeletor from '../components/AbasSeletor.vue';
import CardPadrao from '../components/CardPadrao.vue';
import BarraAcoes from '../components/BarraAcoes.vue';
import BotaoAcao from '../components/BotaoAcao.vue';
import FormularioModal from '../components/FormularioModal.vue';
import CampoTipo from '../components/CampoTipo.vue';
import CampoValor from '../components/CampoValor.vue';
import CampoTexto from '../components/CampoTexto.vue';
import CampoData from '../components/CampoData.vue';
import CampoConta from '../components/CampoConta.vue';
import CampoSelecao from '../components/CampoSelecao.vue';
import IconeCategoria from '../components/IconeCategoria.vue';
import BarraDegrade from '../components/BarraDegrade.vue';
import { ArrowDown, ArrowUp, ArrowRightLeft, Receipt, ChevronDown, ChevronRight, Filter, Landmark, CreditCard } from 'lucide-vue-next';
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
const filtroCategoria = ref(route.query.categoria ? String(route.query.categoria) : '');
const filtroReceita = ref(route.query.receita ? String(route.query.receita) : '');
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
const rotuloMov = { reserva_vinculada: 'guardar/resgatar', reserva_recusada: 'reserva', transferencia_corretora: 'investimento', transferencia_interna: 'transferência', transferencia_vinculada: 'transferência', estorno: 'estorno', estorno_vinculado: 'estorno', estornada: 'estornada' };
async function desfazerMov(t) {
  fecharMenu();
  if (!confirm(ehTransf(t) ? 'Desfazer esta transferência? Os saldos das duas contas voltam ao que eram.' : 'Desfazer este estorno? A despesa volta a contar nos totais.')) return;
  const url = t.cartao ? `/api/transacoes/estorno-cartao/${t.vinculo}` : ehTransf(t) ? `/api/transacoes/transferencia/${t.vinculo}` : `/api/transacoes/estorno/${t.vinculo}`;
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
  filtroConta.value = q.conta ? String(q.conta) : '';
  filtroCategoria.value = q.categoria ? String(q.categoria) : '';
  filtroReceita.value = q.receita ? String(q.receita) : '';
  filtroTipo.value = q.tipo === 'entrada' || q.tipo === 'saida' ? q.tipo : '';
});

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
const edicaoEhSaida = computed(() => (editando.value ? (editando.value.origem === 'manual' ? formEdicao.value.tipo === 'saida' : editando.value.valor < 0) : true));
watch(() => [formEdicao.value.tipo, formEdicao.value.categoriaId, formEdicao.value.categoriaReceita], ([tp, c, r]) => {
  if (editando.value) carregarSugestoes(tp === 'saida' ? c : '', tp === 'saida' ? '' : r);
});
const erroEdicao = ref('');
function abrirEdicao(t) {
  fecharMenu();
  editando.value = t;
  erroEdicao.value = '';
  if (t.cartao) {
    // Compra no cartão: o pop-up edita a compra inteira (todas as parcelas), no próprio lugar
    formEdicao.value = { tipo: 'saida', valor: t.valor_total_compra, contaId: '', descricao: t.descricao_base, data: String(t.data_compra).slice(0, 10), categoriaId: t.categoria_id ?? '', categoriaReceita: '', subcategoria: t.subcategoria || '' };
    carregarSugestoes(t.categoria_id ?? '', '');
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
    const rc = await pedir(`/api/cartoes/${t.cartao_id}/lancamentos/${t.compra_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpoC) });
    const dc = await rc.json();
    if (!rc.ok) { erroEdicao.value = dc.erro || 'Não foi possível salvar.'; return; }
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
  if (t.tipo_mov) return { chave: 'neutra-estorno', nome: 'Estornos', cor: null, icone: null, neutra: true, tipoNeutro: 'transf' };
  if (REGEX_FATURA.test(t.descricao || '')) return { chave: 'neutra-fatura', nome: 'Pagamento de fatura', cor: null, icone: null, neutra: true, tipoNeutro: 'fatura' };
  if (REGEX_TRANSF.test(t.descricao || '')) return { chave: 'neutra-transf', nome: 'Transferência', cor: null, icone: null, neutra: true, tipoNeutro: 'transf' };
  if (t.valor < 0) {
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
    if (!mapa.has(info.chave)) mapa.set(info.chave, { chave: info.chave, info, itens: [], total: 0, tipo: info.neutra ? 'neutro' : t.valor < 0 ? 'saida' : 'entrada' });
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
const semFiltros = computed(() => !filtroConta.value && !filtroTipo.value && !filtroCategoria.value && !filtroReceita.value);
</script>

<template>
  <div class="pagina">
    <ReservasAuto @decidido="carregar" />
    <CabecalhoPagina titulo="Transações" cor="var(--entrada-cobalto-medio)">
    <template #corpo>
    <div v-deslizar-mes class="area-mes">
      <TopoValor tema="entrada" :variante="1" rotulo="Saldo do mês" :periodo="periodoTxt" :valor="saldoAnim" :linhas="[{ rotulo: 'Entradas', valor: entradasAnim }, { rotulo: 'Saídas', valor: saidasAnim }]">
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

      <CardPadrao v-if="filtroAberto" class="painel-filtro" @click.stop>
        <CampoSelecao v-model="filtroConta" rotulo="Conta" :opcoes="[{ valor: '', rotulo: 'Todas as contas' }, ...contas.map((c) => ({ valor: c.id, rotulo: c.nome }))]" />
        <CampoSelecao v-model="filtroTipo" rotulo="Tipo" :opcoes="[{ valor: '', rotulo: 'Entradas e saídas' }, { valor: 'entrada', rotulo: 'Só entradas' }, { valor: 'saida', rotulo: 'Só saídas' }]" />
      </CardPadrao>

      <p v-if="resumo.quantidadeCartao" class="nota-cartao">
        {{ resumo.quantidadeCartao }} compra(s) no cartão de crédito ({{ moeda(resumo.cartao) }}) aparecem na lista. As compras no cartão contam na data da compra. Pagar a fatura não conta como gasto de novo.
      </p>

      <p v-if="aviso" class="aviso-ok">
        {{ aviso.texto }}
        <a v-if="aviso.cartaoId" href="#" @click.prevent="router.push({ name: 'cartao-extrato', params: { id: aviso.cartaoId } })">Ver na fatura</a>
        <a v-if="aviso.desfazer" href="#" @click.prevent="desfazerAviso">Desfazer</a>
        <button type="button" class="botao-icone" aria-label="Fechar aviso" @click="aviso = null">Fechar</button>
      </p>

      <AbasSeletor v-model="visao" :abas="[{ id: 'data', rotulo: 'Por data' }, { id: 'categoria', rotulo: 'Por categoria' }]" tema="neutro" bloco />

      <p v-if="filtroCategoria || filtroReceita" class="chip-filtro">
        Categoria: <strong>{{ nomeFiltroCategoria }}</strong>
        <button type="button" class="botao-icone" @click="limparFiltroCategoria">Ver todas</button>
      </p>

      <p v-if="!carregando && transacoes.length === 0" class="vazio">
        <Receipt :size="28" :stroke-width="1.6" />
        <span>Nenhuma transação {{ semFiltros ? (anoInteiro ? 'neste ano' : 'neste mês') : 'neste filtro' }}.</span>
      </p>

      <div v-else :key="`${periodo.chave}-${visao}`" class="lista-wrap">
        <template v-if="visao === 'data' && !anoInteiro">
          <section v-for="g in gruposPorDia" :key="g.iso" class="grupo">
            <header class="titulo-grupo">
              <span>{{ g.rotulo }}</span>
              <span v-if="g.total !== 0" class="total-grupo numero-tabular" :class="g.total < 0 ? 'neg' : 'pos'">{{ g.total < 0 ? '−' : '+' }} {{ moeda(Math.abs(g.total)) }}</span>
            </header>
            <CardPadrao class="cartao-lista" sem-padding>
              <LinhaTransacao v-for="t in g.itens" :key="t.id" :t="t" :info="infoDe(t)" menu @abrir="abrirEdicao" @menu="abrirMenu" />
            </CardPadrao>
          </section>
        </template>

        <template v-else-if="visao === 'data'">
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

        <template v-else>
          <section v-for="sec in gruposPorCategoria" :key="sec.id" class="grupo">
            <header class="titulo-grupo"><span>{{ sec.titulo }}</span></header>
            <CardPadrao class="cartao-lista" sem-padding>
              <div v-for="g in sec.itens" :key="g.chave" class="cat-grupo">
                <button type="button" class="cat-cab" :aria-expanded="!!abertas[g.chave]" @click="alternarAberta(g.chave)">
                  <IconeCategoria :valor="g.info.neutra ? (g.info.tipoNeutro === 'fatura' ? 'fatura-fechada' : 'transferir') : (g.info.icone || '')" :tipo="g.tipo === 'entrada' ? 'entrada' : 'saida'" :cor="g.info.neutra ? 'var(--cor-texto-suave)' : (g.info.cor || '')" :tamanho="40" />
                  <span class="cat-textos">
                    <span class="cat-nome">{{ g.info.nome }}</span>
                    <span class="cat-qtd">{{ g.itens.length }} lançamento(s) · {{ Math.round(g.pct) }}%</span>
                    <span class="cat-trilho"><span class="cat-fill" :style="{ width: Math.min(100, g.pct) + '%', '--c': g.info.cor || 'var(--cor-texto-suave)' }"></span></span>
                  </span>
                  <span class="cat-total numero-tabular" :class="g.info.neutra ? 'neutro' : g.total < 0 ? 'negativo' : 'positivo'">{{ g.total < 0 ? '−' : '+' }} {{ moeda(Math.abs(g.total)) }}</span>
                  <ChevronDown :size="18" :stroke-width="2" class="seta-cat" :class="{ aberta: abertas[g.chave] }" />
                </button>
                <div v-if="abertas[g.chave]" class="cat-itens">
                  <LinhaTransacao v-for="t in g.itens" :key="t.id" :t="t" :info="infoDe(t)" menu @abrir="abrirEdicao" @menu="abrirMenu" />
                </div>
              </div>
            </CardPadrao>
          </section>
        </template>
      </div>
    </div>
    </template>
    </CabecalhoPagina>

    <div v-if="menu" class="menu-pontos" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @click.stop>
      <button type="button" @click="abrirEdicao(menu.t)">Editar</button>
      <button v-if="!menu.t.cartao && !menu.t.tipo_mov" type="button" @click="alternarIgnorar(menu.t)">{{ menu.t.ignorada ? 'Reativar' : 'Ignorar' }}</button>
      <button v-if="podeEstornar(menu.t)" type="button" @click="abrirEstorno(menu.t)">Estornar / devolver</button>
      <button v-if="menu.t.tipo_mov && !ehReserva(menu.t)" type="button" class="perigo" @click="desfazerMov(menu.t)">{{ ehTransf(menu.t) ? 'Desfazer transferência' : 'Desfazer estorno' }}</button>
      <button v-else-if="menu.t.origem === 'manual'" type="button" class="perigo" @click="fecharMenu(); apagar(menu.t)">Apagar</button>
    </div>

    <!-- Detalhes / edição -->
    <FormularioModal :aberto="!!editando" titulo="Detalhes da transação" :tema="edicaoEhSaida ? 'saida' : 'entrada'" :erro="erroEdicao" rotulo-cancelar="Fechar" @salvar="salvarEdicao" @fechar="editando = null">
      <template v-if="editando">
        <p class="origem-tx">
          <span :class="['tag-tipo', edicaoEhSaida ? 'saida' : 'entrada']">{{ edicaoEhSaida ? 'Saída' : 'Entrada' }}</span>
          <span class="nota" v-if="editando.cartao">{{ editando.cartao_origem === 'manual' ? `Compra no cartão ${editando.conta_nome}${editando.total_parcelas > 1 ? ` em ${editando.total_parcelas}x` : ''}: a edição vale para a compra inteira.` : 'Compra de cartão conectado: vem do banco e não pode ser editada.' }}</span>
          <span class="nota" v-else>{{ editando.origem === 'manual' ? 'Lançada manualmente: tudo pode ser editado.' : 'Veio do banco (Open Finance): só categoria e subcategoria podem mudar.' }}</span>
          <span v-if="editando.tipo_mov" class="selo-ignorada">{{ rotuloMov[editando.tipo_mov] }} · fora dos totais</span>
          <span v-else-if="editando.ignorada" class="selo-ignorada">ignorada</span>
        </p>
        <p v-if="editando.tipo_mov && !editando.cartao" class="nota">Faz parte de uma {{ ehTransf(editando) ? 'transferência entre contas' : 'despesa estornada' }}: valor, tipo e conta não mudam aqui. Para refazer, desfaça pelo menu ⋮ e lance de novo.</p>
        <template v-if="(editando.origem === 'manual' && !editando.tipo_mov) || (editando.cartao && editando.cartao_origem === 'manual' && !editando.tipo_mov)">
          <CampoTipo v-if="!editando.cartao" v-model="formEdicao.tipo" />
          <CampoValor v-model="formEdicao.valor" :tipo="edicaoEhSaida ? 'saida' : 'entrada'" :rotulo="editando.cartao ? 'Valor total da compra' : 'Valor'" />
          <CampoTexto v-model="formEdicao.descricao" rotulo="Descrição" />
          <CampoData v-model="formEdicao.data" :rotulo="editando.cartao ? 'Data da compra' : 'Data'" />
          <p v-if="editando.cartao" class="nota">Cartão: {{ editando.conta_nome }} · parcela {{ editando.descricao.match(/\((\d+\/\d+)\)$/)?.[1] || '1/1' }} nesta linha</p>
          <CampoConta v-else v-model="formEdicao.contaId" :contas="contasCampo" />
        </template>
        <dl v-else class="detalhes-tx">
          <div><dt>Descrição</dt><dd>{{ editando.descricao }}</dd></div>
          <div><dt>Valor</dt><dd class="numero-tabular" :class="editando.valor < 0 ? 'negativo' : 'positivo'">{{ moeda(editando.valor) }}</dd></div>
          <div><dt>Data</dt><dd>{{ dataCurta(editando.data) }}</dd></div>
          <div><dt>Conta</dt><dd>{{ editando.conta_nome }}</dd></div>
        </dl>
        <CampoCategoria v-if="edicaoEhSaida" :key="'ed-s' + editando.id" v-model="formEdicao.categoriaId" tipo="saida" tema="saida" rotulo="Categoria de despesa" :categorias="categorias" @criada="carregarApoio" />
        <CampoCategoria v-else :key="'ed-e' + editando.id" v-model="formEdicao.categoriaReceita" tipo="entrada" tema="entrada" rotulo="Categoria de entrada" @criada="carregarApoio" />
        <CampoTexto v-model="formEdicao.subcategoria" rotulo="Subcategoria" maxlength="80" list="sugestoes-sub" autocomplete="off" placeholder="Ex: Hortifruti, Uber do trabalho" />
        <CampoIconeItem v-if="!editando.cartao" v-model="formEdicao.icone" :tipo="formEdicao.tipo" :descricao="formEdicao.descricao" />
      </template>
    </FormularioModal>
    <datalist id="sugestoes-sub"><option v-for="s in sugestoesSub" :key="s" :value="s"></option></datalist>

    <RegraModal :aberto="regraAberta" :inicial="sugestaoRegra ? sugestaoRegra.inicial : {}" tipo-fixo @fechar="regraAberta = false" @salvo="regraCriada" />

    <FormularioModal :aberto="!!estornando" titulo="Estornar lançamento" tema="neutro" rotulo-salvar="Estornar" :erro="erroEstorno" @salvar="confirmarEstorno" @fechar="estornando = null">
      <template v-if="estornando">
        <p class="nota">
          <strong>{{ estornando.cartao ? estornando.descricao_base : estornando.descricao }}</strong>
          ({{ moeda(Math.abs(estornando.cartao ? estornando.valor_total_compra : estornando.valor)) }}): use para estorno, cancelamento ou devolução.
          A despesa original e o estorno ficam ligados e saem dos totais; {{ estornando.cartao ? 'a compra deixa de pesar nas faturas.' : 'o valor volta ao saldo da conta.' }}
        </p>
        <CampoData v-if="!estornando.cartao" v-model="dataEstorno" rotulo="Data do estorno" atalhos />
        <p class="nota">Dá para desfazer depois pelo menu ⋮.</p>
      </template>
    </FormularioModal>
  </div>
</template>

<style scoped>
.pagina {
  --txt-entrada: var(--entrada-royal-claro); --txt-saida: var(--saida-carmim-claro);
  padding: 0 0 var(--espaco-fim); max-width: 920px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao);
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
.selo-ignorada { display: inline-block; margin-left: 6px; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--cor-borda); color: var(--cor-texto-suave); }
.menu-pontos { position: fixed; z-index: 60; width: 160px; background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); border-radius: 12px; padding: 6px; display: flex; flex-direction: column; box-shadow: var(--sombra-suave); }
.menu-pontos button { background: transparent; border: none; color: var(--cor-texto); text-align: left; font-family: inherit; font-size: 14px; font-weight: 500; padding: 12px 10px; border-radius: 8px; cursor: pointer; }
.menu-pontos button:hover { background: var(--cor-realce); }
.menu-pontos .perigo { color: var(--cor-alerta); }
</style>
