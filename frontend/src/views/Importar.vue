<script setup>
// Importar extrato ou fatura. Central em 2 etapas (tipo -> conta/cartão) ou contextual (?tipo=&id= vindo do menu do card).
// Fluxo: arquivo -> pré-visualização obrigatória (corrigir/descartar linhas) -> confirmar -> histórico com desfazer.
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Landmark, CreditCard, FileUp, Undo2, TriangleAlert, Check, ChevronLeft, Pencil, X, Link2 } from 'lucide-vue-next';
import CardPadrao from '../components/CardPadrao.vue';
import AjudaSecao from '../components/AjudaSecao.vue';
import Modal from '../components/Modal.vue';
import IconeBanco from '../components/IconeBanco.vue';
import NovoDestinoModal from '../components/NovoDestinoModal.vue';
import { lerArquivo, FORMATOS } from '../services/leitorArquivo.js';
import { avisar } from '../services/avisos.js';

const route = useRoute();
const router = useRouter();
const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const dataBR = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
async function api(metodo, url, corpo) {
  const r = await fetch(url, { method: metodo, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  let j = null; try { j = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) throw new Error((j && j.erro) || 'Não foi possível concluir.');
  return j;
}

const etapa = ref(1); // 1 tipo · 2 destino + arquivo · 3 pré-visualização · 4 resultado
const tipo = ref(''); // 'conta' | 'fatura'
const contas = ref([]); const cartoes = ref([]);
const destinoId = ref('');
const contextual = ref(false);
const corpoArq = ref(null); // arquivo lido
const nomeArq = ref('');
const analise = ref(null);
const linhas = ref([]);
const carregando = ref(false); const erro = ref('');
const resultado = ref(null);
const historico = ref([]);
const sugestao = ref(null);
const filtro = ref('todas');
const editando = ref(null);
const periodoModo = ref('arquivo'); const periodoPers = ref({ inicio: '', fim: '' });
const mapa = ref({ linhaCabecalho: 0, data: '', descricao: '', valor: '', debito: '', credito: '' });
const precisaMapa = ref(null);
const salvarPerfil = ref(true);
const ajustarSaldo = ref(false);
const projetar = ref(true);
const senhaPdf = ref({ aberto: false, valor: '', erro: false, resolver: null });
// Mesmo arquivo já importado (e não desfeito) neste destino: pergunta antes de seguir
const anterior = ref(null);
const substituindo = ref(false);
const diaMes = (iso) => { try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); } catch { return dataBR(iso).slice(0, 5); } };

const destinos = computed(() => (tipo.value === 'conta' ? contas.value : cartoes.value));
const destinoSel = computed(() => destinos.value.find((d) => d.id === destinoId.value) || null);
const rotuloDestino = computed(() => (destinoSel.value ? (tipo.value === 'fatura' ? 'Cartão ' : '') + destinoSel.value.nome : ''));

async function carregarBase() {
  // contas e cartões carregam cada um por si: uma lista com erro não esvazia a outra
  const [c, k] = await Promise.allSettled([api('GET', '/api/contas'), api('GET', '/api/cartoes')]);
  if (c.status === 'fulfilled') contas.value = c.value;
  if (k.status === 'fulfilled') cartoes.value = k.value.filter((x) => x.origem === 'manual');
  if (c.status === 'rejected' && k.status === 'rejected') throw c.reason;
  try { historico.value = await api('GET', '/api/importacao/historico'); } catch { historico.value = []; }
}

onMounted(async () => {
  try { await carregarBase(); } catch (e) { erro.value = e.message; }
  const t = route.query.tipo; const id = route.query.id;
  if ((t === 'conta' || t === 'fatura') && id) {
    tipo.value = t; destinoId.value = String(id);
    if (destinoSel.value) { contextual.value = true; etapa.value = 2; } else { tipo.value = ''; destinoId.value = ''; }
  }
});

// "+ Novo banco/conta" e "+ Novo cartão": cadastro numa janela, sem sair da importação; o destino novo fica selecionado.
const NOVO = '__novo';
const modalNovo = ref(false);
watch(destinoId, (v) => { if (v === NOVO) { destinoId.value = ''; modalNovo.value = true; } });
async function destinoCriado(reg) {
  modalNovo.value = false;
  try { await carregarBase(); } catch { /* a lista é recarregada na próxima abertura */ }
  destinoId.value = String(reg.id);
  avisar(tipo.value === 'conta' ? 'Conta criada e selecionada.' : 'Cartão criado e selecionado.');
}

function escolherTipo(t) { tipo.value = t; destinoId.value = ''; etapa.value = 2; sugestao.value = null; }
function voltar() {
  erro.value = '';
  if (etapa.value === 3) { etapa.value = 2; analise.value = null; return; }
  if (etapa.value === 2 && !contextual.value) { etapa.value = 1; return; }
  router.back();
}

function pedirSenha(repetiu) {
  return new Promise((resolve) => { senhaPdf.value = { aberto: true, valor: '', erro: !!repetiu, resolver: resolve }; });
}
function enviarSenha(ok) {
  const r = senhaPdf.value.resolver; const v = senhaPdf.value.valor;
  senhaPdf.value = { aberto: false, valor: '', erro: false, resolver: null }; // a senha não fica guardada
  if (r) r(ok ? v : null);
}

async function escolherArquivo(ev) {
  const f = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  erro.value = ''; carregando.value = true; sugestao.value = null;
  try {
    corpoArq.value = await lerArquivo(f, { pedirSenha });
    nomeArq.value = f.name;
    const id = await api('POST', '/api/importacao/identificar', { ...corpoArq.value, tipo: tipo.value });
    sugestao.value = id;
    if (!destinoId.value) {
      const s = id.sugestoes.find((x) => x.tipo === tipo.value);
      if (s) destinoId.value = s.id;
    }
  } catch (e) { erro.value = e.message; corpoArq.value = null; nomeArq.value = ''; } finally { carregando.value = false; }
}

function periodoPedido() {
  if (periodoModo.value === 'arquivo') return undefined;
  if (periodoModo.value === 'personalizado') return { inicio: periodoPers.value.inicio || undefined, fim: periodoPers.value.fim || undefined };
  return { dias: Number(periodoModo.value) };
}
async function analisar(extra = {}) {
  if (!corpoArq.value || !destinoId.value) return;
  erro.value = ''; carregando.value = true;
  try {
    const r = await api('POST', '/api/importacao/analisar', {
      ...corpoArq.value, destino: { tipo: tipo.value, id: destinoId.value }, periodo: periodoPedido(), ...extra,
    });
    if (r.precisaMapeamento) { precisaMapa.value = r; analise.value = null; etapa.value = 3; return; }
    if (r.importacaoAnterior && etapa.value !== 3) { anterior.value = r.importacaoAnterior; return; }
    precisaMapa.value = null;
    analise.value = r;
    linhas.value = r.linhas.map((l) => ({ ...l, existenteId: l.existente ? l.existente.id : undefined }));
    if (periodoModo.value === 'arquivo') periodoPers.value = { inicio: r.periodo.inicio, fim: r.periodo.fim };
    ajustarSaldo.value = false;
    etapa.value = 3;
  } catch (e) { erro.value = e.message; } finally { carregando.value = false; }
}
// "Substituir": desfaz a importação anterior do mesmo arquivo e lê o arquivo de novo (agora nada dele é duplicado)
async function substituirAnterior() {
  const a = anterior.value; if (!a) return;
  substituindo.value = true; erro.value = '';
  try {
    await api('DELETE', `/api/importacao/${a.id}`);
    anterior.value = null;
    try { historico.value = await api('GET', '/api/importacao/historico'); } catch { /* segue */ }
    avisar('Importação anterior desfeita. Confira a pré-visualização.', { tipo: 'ok' });
    await analisar();
  } catch (e) { erro.value = e.message; anterior.value = null; } finally { substituindo.value = false; }
}
function cancelarSubstituir() { anterior.value = null; }
function aplicarMapa() {
  const n = (v) => (v === '' || v === null ? undefined : Number(v));
  analisar({ mapeamento: { linhaCabecalho: Number(mapa.value.linhaCabecalho), data: n(mapa.value.data), descricao: n(mapa.value.descricao), valor: n(mapa.value.valor), debito: n(mapa.value.debito), credito: n(mapa.value.credito) } });
}
function mudarPeriodo(m) { periodoModo.value = m; if (m !== 'personalizado') analisar(); }
function inverter() { analisar({ inverterSinal: !analise.value.sinalInvertido }); }

// ---- edição das linhas
const ROT = { nova: 'Nova', duplicada: 'Já existe', casada: 'Parcela já registrada', divergente: 'Valor diferente', estorno: 'Estorno', pagamento_fatura: 'Pagamento de fatura', pagamento_recebido: 'Pagamento da fatura', pagamento_adiantado: 'Pagamento adiantado', cashback: 'Cashback', reserva: 'Reserva', fora_periodo: 'Fora do período' };
const grava = (l) => ['importar', 'transferencia', 'atualizar'].includes(l.acao);
const visiveis = computed(() => linhas.value.filter((l) => {
  if (filtro.value === 'todas') return true;
  if (filtro.value === 'novas') return l.acao === 'importar' || l.acao === 'transferencia';
  if (filtro.value === 'atencao') return l.confianca === 'baixa' || ['divergente', 'estorno', 'pagamento_fatura', 'pagamento_adiantado', 'cashback', 'reserva', 'investimento'].includes(l.status) || l.revisar;
  if (filtro.value === 'descartadas') return l.acao === 'descartar' || l.acao === 'manter';
  return true;
}));
// Anotação 56: linhas de caixinha (Guardar/Resgatar na meta) não são entrada nem saída; do resgate, só o rendimento entra.
const ehCaixinha = (l) => l.status === 'reserva' && l.reserva && l.reserva.caixinha;
const totais = computed(() => {
  const g = linhas.value.filter(grava);
  const comuns = g.filter((l) => !ehCaixinha(l) && l.status !== 'investimento'); // seção 15: aporte/resgate pela regra fica fora
  const rend = g.filter((l) => ehCaixinha(l) && l.reserva.metaId).reduce((s, l) => s + (Number(l.reserva.rendimento) || 0), 0);
  if (tipo.value === 'fatura') {
    // Anotação 61: na fatura, crédito abate a fatura; só o cashback é entrada
    const compras = comuns.filter((l) => l.valor < 0).reduce((s, l) => s - l.valor, 0);
    const creditos = comuns.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
    return { qtd: g.length, entradas: comuns.filter((l) => l.status === 'cashback').reduce((s, l) => s + l.valor, 0), saidas: compras, creditos, liquido: compras - creditos, descartadas: linhas.value.length - g.length };
  }
  return { qtd: g.length, entradas: comuns.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0) + rend, saidas: comuns.filter((l) => l.valor < 0).reduce((s, l) => s - l.valor, 0), descartadas: linhas.value.length - g.length };
});
function escolherMetaCaixinha(l, id) {
  const op = (l.reserva.opcoes || []).find((o) => o.id === id);
  l.reserva.metaId = op ? op.id : null;
  l.reserva.metaNome = op ? op.nome : null;
  l.reserva.manual = !!op;
  l.reserva.rendimento = 0; // separado pelo app na gravação (o que passar do guardado)
  l.observacao = op ? `${l.valor < 0 ? 'Guardar na' : 'Resgatar da'} meta ${op.nome}: fora das entradas e saídas.` : 'Fica em A revisar (fora das entradas e saídas).';
}
// Anotação 55: extrato com lançamentos antes do saldo inicial da conta — mover a data de início. O valor novo desconta o que
// este arquivo traz antes da data antiga, para o saldo de hoje continuar o mesmo depois de importar.
const movendoInicio = ref(false);
async function moverInicio() {
  const a = analise.value && analise.value.antesDoSaldoInicial; if (!a) return;
  movendoInicio.value = true; erro.value = '';
  try {
    const antes = linhas.value.filter((l) => grava(l) && l.data < a.data && !ehCaixinha(l)).reduce((s, l) => s + Number(l.valor), 0);
    const valor = Math.round((Number(a.valor) - antes) * 100) / 100;
    await api('PUT', `/api/contas/${destinoId.value}`, { saldoInicial: { data: a.primeiraData, valor } });
    avisar(`Data de início movida para ${dataBR(a.primeiraData).slice(0, 5)} (saldo inicial ${moeda(valor)}).`, { tipo: 'ok' });
    await analisar();
  } catch (e) { erro.value = e.message; } finally { movendoInicio.value = false; }
}
const divergentes = computed(() => linhas.value.filter((l) => l.status === 'divergente').length);
function alternar(l) {
  if (grava(l)) l.acao = 'descartar';
  else l.acao = l.status === 'divergente' ? 'atualizar' : l.transferencia ? 'transferencia' : 'importar';
}
function escolherDiverg(l, acao) { l.acao = acao; }
function abrirEdicao(l) { editando.value = { ref: l, descricao: l.descricao, valor: Math.abs(l.valor), saida: l.valor < 0, data: l.data, categoriaId: l.categoriaId || '', credito: l.status === 'pagamento_adiantado' || l.status === 'pagamento_recebido' ? 'pagamento' : l.status === 'cashback' ? 'cashback' : 'estorno' }; }
function salvarEdicao() {
  const e = editando.value; const l = e.ref;
  l.descricao = e.descricao.trim() || l.descricao;
  l.valor = Math.round((e.saida ? -1 : 1) * Math.abs(Number(e.valor) || 0) * 100) / 100;
  l.data = e.data || l.data;
  l.categoriaId = e.saida || (tipo.value === 'fatura' && e.credito === 'estorno') ? e.categoriaId || null : null;
  // Anotação 61: na fatura, ao virar crédito escolhe o tipo (estorno / pagamento adiantado / cashback)
  if (tipo.value === 'fatura') {
    if (e.saida) { if (['estorno', 'cashback', 'pagamento_adiantado'].includes(l.status)) { l.status = 'nova'; l.anula = null; l.credito = null; l.observacao = 'Marcada como compra.'; } }
    else {
      const st = e.credito === 'pagamento' ? 'pagamento_adiantado' : e.credito === 'cashback' ? 'cashback' : 'estorno';
      if (st !== l.status) { l.status = st; l.anula = null; l.credito = { tipo: e.credito }; l.revisar = st === 'estorno'; l.observacao = st === 'estorno' ? 'Estorno sem compra ligada: reduz o gasto da categoria e fica em A revisar.' : st === 'cashback' ? 'Cashback: abate a fatura e entra como entrada em Cashback.' : 'Pagamento adiantado: abate a fatura, não é entrada nem gasto.'; }
      if (l.acao === 'descartar' && l.status !== 'duplicada') l.acao = 'importar';
    }
  }
  l.categoriaAuto = false; l.confianca = 'alta';
  editando.value = null;
}
const categorias = ref([]);
onMounted(async () => { try { categorias.value = await api('GET', '/api/categorias'); } catch { /* sem categorias */ } });

async function confirmar() {
  erro.value = ''; carregando.value = true;
  try {
    const a = analise.value;
    manuais.value = linhas.value.filter((l) => grava(l) && ehCaixinha(l) && l.reserva.manual && l.reserva.metaId)
      .map((l) => ({ trecho: trechoCaixinha(l.descricao), metaId: l.reserva.metaId, metaNome: l.reserva.metaNome }))
      .filter((m, i, arr) => arr.findIndex((x) => x.trecho.toLowerCase() === m.trecho.toLowerCase()) === i);
    resultado.value = await api('POST', '/api/importacao/confirmar', {
      formato: a.formato, nomeArquivo: nomeArq.value, banco: a.banco, destino: { tipo: tipo.value, id: destinoId.value },
      periodo: a.periodo, fatura: a.fatura ? a.fatura.chave : undefined, impressao: a.impressao, saldoExtrato: a.saldoExtrato, mapeamento: a.mapeamento, assinatura: a.assinatura,
      opcoes: { ajustarSaldo: ajustarSaldo.value, projetarParcelas: projetar.value, salvarPerfil: salvarPerfil.value && a.mapeamento && !a.perfilAplicado && (a.formato === 'csv' || a.formato === 'xlsx') ? { nome: a.banco || 'Meu banco' } : undefined },
      linhas: linhas.value.map((l) => ({ ...l, bruto: undefined })),
    });
    etapa.value = 4;
    avisarVinculos(resultado.value);
    try { historico.value = await api('GET', '/api/importacao/historico'); } catch { /* segue */ }
  } catch (e) { erro.value = e.message; } finally { carregando.value = false; }
}
// Anotação 56: aviso breve "Vinculado à meta Viagem · Desfazer" e, para escolha manual, sugestão de regra (como a anotação 52).
function avisarVinculos(res) {
  const vinc = (res && res.vinculadas) || [];
  if (!vinc.length) return;
  const metas = [...new Set(vinc.map((v) => v.metaNome))];
  const texto = vinc.length === 1 ? `Vinculado à meta ${metas[0]}` : `${vinc.length} vinculados às metas ${metas.join(', ')}`;
  avisar(texto, { tipo: 'ok', grupo: 'caixinha', duracao: 7000, acoes: [{ rotulo: 'Desfazer', acao: () => desfazerVinculos(vinc) }],
    aoSumir: () => sugerirRegraCaixinha(res) });
}
async function desfazerVinculos(vinc) {
  try {
    for (const v of vinc) await api('POST', '/api/reserva/auto/desfazer', { transacaoId: v.transacaoId });
    avisar('Vínculo desfeito: os lançamentos foram para A revisar.', { tipo: 'ok', grupo: 'caixinha', rota: '/objetivos' });
  } catch (e) { erro.value = e.message; }
}
const manuais = ref([]); // escolhas manuais de meta na pré-visualização (para virar regra)
function sugerirRegraCaixinha() {
  const m = manuais.value.shift(); if (!m) return;
  avisar(`Criar regra: “${m.trecho}” → meta ${m.metaNome}?`, { tipo: 'regra', grupo: 'sugestao-regra', duracao: 6000,
    acoes: [
      { rotulo: 'Criar regra', primaria: true, acao: async () => {
        try { await api('POST', `/api/reserva/metas/${m.metaId}/caixinha-apelido`, { trecho: m.trecho, contaId: destinoId.value }); avisar(`Regra criada: “${m.trecho}” vai para ${m.metaNome}.`, { tipo: 'ok', grupo: 'sugestao-regra' }); }
        catch (e) { avisar(e.message, { tipo: 'alerta', grupo: 'sugestao-regra' }); }
      } },
      { rotulo: 'Agora não', acao: () => {} },
    ] });
}
const trechoCaixinha = (d) => String(d || '').replace(/\b(aplica[cç][aã]o|aplic|resgate|dep[oó]sito|guardar|guardado|pix|ted)\b/gi, ' ').replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || String(d || '').slice(0, 40);

async function desfazer(id) {
  try { await api('DELETE', `/api/importacao/${id}`); avisar('Importação desfeita.', { tipo: 'ok' }); historico.value = await api('GET', '/api/importacao/historico'); if (resultado.value && resultado.value.importacaoId === id) resultado.value = null; }
  catch (e) { erro.value = e.message; }
}
function novaImportacao() { etapa.value = contextual.value ? 2 : 1; corpoArq.value = null; nomeArq.value = ''; analise.value = null; resultado.value = null; filtro.value = 'todas'; periodoModo.value = 'arquivo'; sugestao.value = null; }
function irParaReserva() { router.push('/objetivos'); }
const ROT_FORMATO = { ofx: 'OFX', csv: 'CSV', xlsx: 'Planilha', pdf: 'PDF' };
</script>

<template>
  <div class="pagina">
    <!-- O título da página fica no topo do app (TopoApp); aqui só a volta de etapa -->
    <header v-if="etapa === 3" class="topo">
      <button type="button" class="voltar" aria-label="Etapa anterior" title="Etapa anterior" @click="voltar"><ChevronLeft :size="22" /></button>
    </header>

    <p v-if="erro" class="faixa erro" role="alert"><TriangleAlert :size="18" /><span>{{ erro }}</span></p>

    <!-- Etapa 1: tipo -->
    <template v-if="etapa === 1">
      <CardPadrao titulo="O que você vai importar?" subtitulo="Etapa 1 de 2">
        <div class="escolhas">
          <button type="button" class="escolha" @click="escolherTipo('conta')"><Landmark :size="26" /><span><b>Extrato de conta</b><small>OFX, CSV, planilha ou PDF do banco</small></span></button>
          <button type="button" class="escolha" @click="escolherTipo('fatura')"><CreditCard :size="26" /><span><b>Fatura de cartão</b><small>Compras e parcelas da fatura</small></span></button>
        </div>
      </CardPadrao>
    </template>

    <!-- Etapa 2: destino + arquivo -->
    <template v-else-if="etapa === 2">
      <CardPadrao ajuda="importar.arquivo" :titulo="contextual ? `Importando para: ${rotuloDestino}` : tipo === 'conta' ? 'Qual conta?' : 'Qual cartão?'" :subtitulo="contextual ? '' : 'Etapa 2 de 2'">
        <label v-if="!contextual" class="campo"><span>{{ tipo === 'conta' ? 'Conta de destino' : 'Cartão de destino' }}</span>
          <span style="display:flex;align-items:center;gap:10px"><IconeBanco v-if="destinoSel" :icone="destinoSel.icone" :nome="destinoSel.nome" :padrao="tipo === 'conta' ? '🏦' : '💳'" :tamanho="32" /><select v-model="destinoId" style="flex:1"><option value="" disabled>Escolha…</option><option v-for="d in destinos" :key="d.id" :value="d.id">{{ d.nome }}</option><option value="__novo">{{ tipo === 'conta' ? '+ Novo banco/conta' : '+ Novo cartão' }}</option></select></span>
        </label>
        <p v-if="!destinos.length" class="dica">{{ tipo === 'conta' ? 'Nenhuma conta ainda.' : 'Nenhum cartão ainda.' }} Use <b>{{ tipo === 'conta' ? '+ Novo banco/conta' : '+ Novo cartão' }}</b> na lista acima para cadastrar sem sair daqui.</p>
        <NovoDestinoModal :aberto="modalNovo" :tipo="tipo" :nome-sugerido="sugestao && sugestao.banco ? sugestao.banco : ''" :contas="contas" @criado="destinoCriado" @fechar="modalNovo = false" />
        <label class="arquivo" :class="{ ocupado: carregando }"><FileUp :size="22" /><span>{{ nomeArq || 'Escolher arquivo (OFX, CSV, XLSX, XLS ou PDF)' }}</span>
          <input type="file" :accept="FORMATOS" @change="escolherArquivo" />
        </label>
        <p v-if="sugestao && sugestao.banco" class="dica">Banco reconhecido: <b>{{ sugestao.banco }}</b><span v-if="!contextual && sugestao.sugestoes.length"> · destino sugerido preenchido</span>.</p>
        <p v-if="sugestao && sugestao.dica" class="dica">{{ sugestao.dica }}</p>
        <button type="button" class="b-prim" :disabled="!corpoArq || !destinoId || carregando" @click="analisar()">{{ carregando ? 'Lendo…' : 'Ver pré-visualização' }}</button>
      </CardPadrao>

      <CardPadrao v-if="historico.length" titulo="Importações anteriores">
        <ul class="hist">
          <li v-for="h in historico.slice(0, 8)" :key="h.id" :class="{ desfeita: h.desfeitaEm }">
            <div><b>{{ h.destino || '—' }}</b> <span class="chip">{{ ROT_FORMATO[h.formato] || h.formato }}</span>
              <small v-if="h.arquivo" class="arq">{{ h.arquivo }} · importado em {{ diaMes(h.em) }}</small>
              <small>{{ dataBR(h.periodoInicio) }} a {{ dataBR(h.periodoFim) }} · {{ h.novas }} novas<span v-if="h.atualizadas">, {{ h.atualizadas }} atualizadas</span><span v-if="h.desfeitaEm"> · desfeita</span></small></div>
            <button v-if="!h.desfeitaEm" type="button" class="b-sec peq" @click="desfazer(h.id)"><Undo2 :size="15" /> Desfazer</button>
          </li>
        </ul>
      </CardPadrao>
    </template>

    <!-- Etapa 3: mapeamento de colunas -->
    <template v-else-if="etapa === 3 && precisaMapa">
      <CardPadrao titulo="Indique as colunas" :subtitulo="precisaMapa.motivo">
        <div class="tabela-rolagem"><table class="amostra"><tbody><tr v-for="(l, i) in precisaMapa.amostra.slice(0, 8)" :key="i"><th>{{ i }}</th><td v-for="(c, j) in l" :key="j">{{ c }}</td></tr></tbody></table></div>
        <div class="grade">
          <label class="campo"><span>Linha do cabeçalho (número à esquerda)</span><input v-model.number="mapa.linhaCabecalho" type="number" min="0" /></label>
          <label v-for="c in [['data','Coluna da data'],['descricao','Coluna da descrição'],['valor','Coluna do valor'],['debito','Coluna de débito (opcional)'],['credito','Coluna de crédito (opcional)']]" :key="c[0]" class="campo"><span>{{ c[1] }}</span>
            <select v-model="mapa[c[0]]"><option value="">—</option><option v-for="(_, j) in (precisaMapa.amostra[0] || [])" :key="j" :value="j">Coluna {{ j + 1 }}: {{ String((precisaMapa.amostra[mapa.linhaCabecalho] || [])[j] ?? '').slice(0, 22) }}</option></select></label>
        </div>
        <label class="marca"><input v-model="salvarPerfil" type="checkbox" /> Lembrar este layout para as próximas importações</label>
        <button type="button" class="b-prim" :disabled="mapa.data === '' || (mapa.valor === '' && mapa.debito === '' && mapa.credito === '') || carregando" @click="aplicarMapa">Aplicar</button>
      </CardPadrao>
    </template>

    <!-- Etapa 3: pré-visualização -->
    <template v-else-if="etapa === 3 && analise">
      <CardPadrao :titulo="`Importando para: ${rotuloDestino}`" :subtitulo="`${ROT_FORMATO[analise.formato]}${analise.banco ? ' · ' + analise.banco : ''}${analise.perfilAplicado ? ' · layout salvo: ' + analise.perfilAplicado.nome : ''}`">
        <p class="periodo">Período do arquivo: <b>{{ dataBR(analise.periodoArquivo.inicio) }}</b> a <b>{{ dataBR(analise.periodoArquivo.fim) }}</b><span v-if="analise.fatura && analise.fatura.chave"> · fatura de <b>{{ analise.fatura.chave.split('-').reverse().join('/') }}</b></span></p>
        <div class="atalhos" role="group" aria-label="Período">
          <button v-for="p in [['arquivo','Arquivo todo'],['7','7 dias'],['15','15 dias'],['30','30 dias'],['personalizado','Personalizado']]" :key="p[0]" type="button" :class="{ ativo: periodoModo === p[0] }" @click="mudarPeriodo(p[0])">{{ p[1] }}</button>
        </div>
        <div v-if="periodoModo === 'personalizado'" class="grade">
          <label class="campo"><span>De</span><input v-model="periodoPers.inicio" type="date" /></label>
          <label class="campo"><span>Até</span><input v-model="periodoPers.fim" type="date" /></label>
          <button type="button" class="b-sec" @click="analisar()">Aplicar período</button>
        </div>
        <p class="dica">Duplicidade conferida só dentro de {{ dataBR(analise.periodo.inicio) }} a {{ dataBR(analise.periodo.fim) }} (parcelas: ±5 dias).</p>
        <div v-if="analise.antesDoSaldoInicial && tipo === 'conta'" class="faixa alerta" data-antes-saldo-inicial>
          <TriangleAlert :size="18" />
          <span>Este extrato é de antes do saldo inicial. Mover a data de início para {{ dataBR(analise.antesDoSaldoInicial.primeiraData).slice(0, 5) }}?</span>
          <button type="button" class="b-sec peq" :disabled="movendoInicio" @click="moverInicio">{{ movendoInicio ? 'Movendo…' : 'Mover data' }}</button>
        </div>
        <p v-if="analise.leituraGenerica" class="faixa alerta"><TriangleAlert :size="18" /><span>Leitura genérica de PDF: confira as linhas marcadas e os valores antes de confirmar.</span></p>
        <p v-if="!analise.sinalFixo && tipo === 'fatura'" class="dica">Compras são tratadas como saídas. <button type="button" class="link" @click="inverter">Inverter sinais</button> se estiver ao contrário.</p>
        <p v-if="tipo === 'fatura' && analise.fatura && analise.fatura.totalArquivo !== undefined" class="periodo">Total da fatura no arquivo<AjudaSecao secao="importar.total-fatura" />: <b>{{ moeda(analise.fatura.totalArquivo) }}</b></p>
        <p v-if="analise.totalIgnoradasArquivo" class="dica">{{ analise.totalIgnoradasArquivo }} linha(s) do arquivo ignorada(s) (cabeçalhos, totais, rodapé).</p>
        <p v-if="tipo === 'fatura' && analise.fatura && analise.fatura.totalDeclarado !== null && analise.fatura.totalDeclarado !== undefined && Math.abs(analise.fatura.totalDeclarado - analise.fatura.totalArquivo) > 0.009" class="faixa alerta" data-total-diferente><TriangleAlert :size="18" /><span>O arquivo diz que a fatura é {{ moeda(analise.fatura.totalDeclarado) }}, mas as linhas somam {{ moeda(analise.fatura.totalArquivo) }}. Confira os créditos e os sinais.</span></p>
        <p v-if="tipo === 'fatura' && analise.creditosPorTexto" class="dica">{{ analise.creditosPorTexto }} crédito(s) vieram com o sinal de compra e foram reconhecidos pelo nome (estorno, pagamento, cashback).</p>
        <div class="resumo">
          <div><small>A gravar</small><b>{{ totais.qtd }}</b></div>
          <div v-if="tipo === 'fatura'"><small>Compras</small><b class="sai">{{ moeda(totais.saidas) }}</b></div>
          <div v-if="tipo === 'fatura'" data-creditos-fatura><small>Créditos</small><b class="ent">{{ moeda(totais.creditos) }}</b></div>
          <div v-if="tipo !== 'fatura'"><small>Entradas</small><b class="ent">{{ moeda(totais.entradas) }}</b></div>
          <div v-if="tipo !== 'fatura'"><small>Saídas</small><b class="sai">{{ moeda(totais.saidas) }}</b></div>
          <div><small>Fora</small><b>{{ totais.descartadas }}</b></div>
        </div>
        <div class="atalhos" role="group" aria-label="Filtro">
          <button v-for="f in [['todas','Todas'],['novas','Novas'],['atencao','Atenção'],['descartadas','Fora']]" :key="f[0]" type="button" :class="{ ativo: filtro === f[0] }" @click="filtro = f[0]">{{ f[1] }}</button>
        </div>
      </CardPadrao>

      <CardPadrao titulo="Lançamentos" :subtitulo="divergentes ? `${divergentes} com valor diferente do registrado` : ''" sem-padding>
        <ul class="linhas">
          <li v-for="l in visiveis" :key="l.idx" :class="['linha', l.status, { fora: !grava(l), baixa: l.confianca === 'baixa' }]">
            <div class="topo-linha">
              <span class="data">{{ dataBR(l.data) }}</span>
              <span class="desc">{{ l.descricao }}<small v-if="l.parcela"> · parcela {{ l.parcela.atual }}/{{ l.parcela.total }}</small></span>
              <b :class="ehCaixinha(l) ? 'neutro' : l.valor < 0 ? 'sai' : 'ent'" class="valor">{{ moeda(l.valor) }}</b>
            </div>
            <div class="sub-linha">
              <span :class="['selo', l.status]">{{ ROT[l.status] }}</span>
              <span v-if="l.confianca === 'baixa'" class="selo baixa">Conferir</span>
              <span v-if="l.revisar" class="selo baixa">A revisar</span>
              <span v-if="l.categoriaNome" class="chip">{{ l.categoriaNome }}</span>
              <small v-if="l.observacao" class="obs">{{ l.observacao }}</small>
              <span class="acoes">
                <button v-if="l.status !== 'fora_periodo'" type="button" class="icone" :aria-label="grava(l) ? 'Descartar linha' : 'Incluir linha'" :title="grava(l) ? 'Descartar' : 'Incluir'" @click="alternar(l)"><component :is="grava(l) ? X : Check" :size="16" /></button>
                <button v-if="l.status !== 'fora_periodo'" type="button" class="icone" aria-label="Corrigir linha" title="Corrigir" @click="abrirEdicao(l)"><Pencil :size="15" /></button>
              </span>
            </div>
            <div v-if="l.status === 'divergente'" class="diverg" role="group" aria-label="Valor diferente">
              <span>Registrado: <b>{{ moeda(Math.abs(l.existente.valor)) }}</b> · Arquivo: <b>{{ moeda(Math.abs(l.valor)) }}</b></span>
              <button type="button" :class="{ ativo: l.acao === 'atualizar' }" @click="escolherDiverg(l, 'atualizar')">Atualizar para o valor real</button>
              <button type="button" :class="{ ativo: l.acao === 'manter' }" @click="escolherDiverg(l, 'manter')">Manter o manual</button>
              <button type="button" :class="{ ativo: l.acao === 'importar' }" @click="escolherDiverg(l, 'importar')">Criar novo</button>
            </div>
            <div v-if="ehCaixinha(l) && (!l.reserva.porNome || l.reserva.manual)" class="diverg" data-caixinha-escolha>
              <label>{{ l.valor < 0 ? 'Guardar na meta' : 'Resgatar da meta' }}:
                <select :value="l.reserva.metaId || ''" @change="(e) => escolherMetaCaixinha(l, e.target.value)">
                  <option value="">Deixar para A revisar</option>
                  <option v-for="o in l.reserva.opcoes" :key="o.id" :value="o.id">{{ o.nome }}</option>
                </select></label>
            </div>
            <div v-if="l.status === 'pagamento_fatura' && l.candidatasFatura && l.candidatasFatura.length" class="diverg">
              <label>Fatura paga:
                <select :value="l.fatura ? l.fatura.cartaoId + '|' + l.fatura.chave : ''" @change="(e) => { const [c, k] = e.target.value.split('|'); l.fatura = c ? { cartaoId: c, chave: k } : null; }">
                  <option value="">Nenhuma (saída comum)</option>
                  <option v-for="f in l.candidatasFatura" :key="f.cartaoId + f.chave" :value="f.cartaoId + '|' + f.chave">{{ f.cartaoNome }} · {{ f.chave.split('-').reverse().join('/') }} · {{ moeda(f.total) }}</option>
                </select></label>
            </div>
          </li>
          <li v-if="!visiveis.length" class="vazio">Nada neste filtro.</li>
        </ul>
      </CardPadrao>

      <CardPadrao titulo="Opções">
        <label v-if="analise.saldoExtrato && tipo === 'conta' && analise.destino.manual" class="marca"><input v-model="ajustarSaldo" type="checkbox" /> Acertar o saldo da conta para {{ moeda(analise.saldoExtrato.valor) }} (saldo do extrato em {{ dataBR(analise.saldoExtrato.data) }})</label>
        <label v-if="tipo === 'fatura'" class="marca"><input v-model="projetar" type="checkbox" /> Lançar também as parcelas futuras das compras parceladas</label>
        <label v-if="analise.mapeamento && !analise.perfilAplicado && (analise.formato === 'csv' || analise.formato === 'xlsx')" class="marca"><input v-model="salvarPerfil" type="checkbox" /> Lembrar este layout{{ analise.banco ? ' (' + analise.banco + ')' : '' }}</label>
        <button type="button" class="b-prim" :disabled="carregando || !totais.qtd" @click="confirmar">{{ carregando ? 'Gravando…' : `Importar ${totais.qtd} lançamento(s)` }}</button>
      </CardPadrao>
    </template>

    <!-- Etapa 4: resultado -->
    <template v-else-if="etapa === 4 && resultado">
      <CardPadrao titulo="Importação concluída" :subtitulo="rotuloDestino">
        <ul class="res">
          <li><b>{{ resultado.novas }}</b> novos lançamentos<span v-if="resultado.projetadas"> (+{{ resultado.projetadas }} parcelas futuras)</span></li>
          <li v-if="resultado.atualizadas"><b>{{ resultado.atualizadas }}</b> atualizados para o valor real</li>
          <li v-if="resultado.anuladas"><b>{{ resultado.anuladas }}</b> estorno(s) anularam a despesa original<span v-if="resultado.anuladasParcial"> ({{ resultado.anuladasParcial }} em parte)</span></li>
          <li v-if="resultado.estornosRevisar" data-estornos-revisar><b>{{ resultado.estornosRevisar }}</b> estorno(s) sem a compra original: reduzem o gasto da categoria e ficam em A revisar</li>
          <li v-if="resultado.pagamentosAdiantados"><b>{{ resultado.pagamentosAdiantados }}</b> pagamento(s) adiantado(s) abatendo a fatura<span v-if="resultado.pagamentosCasados"> · {{ resultado.pagamentosCasados }} casado(s) com o extrato da conta</span></li>
          <li v-else-if="resultado.pagamentosCasados"><b>{{ resultado.pagamentosCasados }}</b> pagamento(s) adiantado(s) do cartão casado(s) com este extrato (não contam como gasto)</li>
          <li v-if="resultado.cashback"><b>{{ moeda(resultado.cashback) }}</b> de cashback como entrada em Cashback</li>
          <li v-if="resultado.transferencias"><b>{{ resultado.transferencias }}</b> transferência(s) entre contas próprias</li>
          <li v-if="resultado.faturasPagas"><b>{{ resultado.faturasPagas }}</b> fatura(s) marcada(s) como paga(s)</li>
          <li v-if="resultado.vinculadas && resultado.vinculadas.length" data-vinculadas><b>{{ resultado.vinculadas.length }}</b> guardar/resgatar vinculado(s) às metas: {{ [...new Set(resultado.vinculadas.map((v) => v.metaNome))].join(', ') }}<span v-if="resultado.vinculadas.some((v) => v.rendimento > 0)"> · rendimento de {{ moeda(resultado.vinculadas.reduce((s, v) => s + (v.rendimento || 0), 0)) }} em Rendimentos</span></li>
          <li><b>{{ resultado.ignoradas }}</b> ignorados (duplicados ou descartados)</li>
          <li v-if="resultado.fatura" data-total-fatura>Fatura de {{ resultado.fatura.chave.split('-').reverse().join('/') }} no app: <b>{{ moeda(resultado.fatura.totalApp) }}</b> · no arquivo: <b>{{ moeda(resultado.fatura.totalArquivo) }}</b> <span :class="Math.abs(resultado.fatura.totalApp - resultado.fatura.totalArquivo) > 0.009 ? 'sai' : 'ent'">{{ Math.abs(resultado.fatura.totalApp - resultado.fatura.totalArquivo) > 0.009 ? '· não bate' : '· bate' }}</span><small v-if="resultado.fatura.compras !== undefined" class="dica" style="display:block;margin:2px 0 0">compras {{ moeda(resultado.fatura.compras) }} − créditos {{ moeda(resultado.fatura.creditos) }}</small></li>
          <li v-if="resultado.saldoAjustado"><Link2 :size="14" /> Saldo da conta acertado ({{ moeda(resultado.saldoAjustado) }})</li>
          <li v-if="resultado.perfilSalvo">Layout "{{ resultado.perfilSalvo }}" lembrado</li>
        </ul>
        <p v-for="a in resultado.avisos" :key="a" class="faixa alerta"><TriangleAlert :size="16" /><span>{{ a }}</span></p>
        <div v-if="resultado.reservasPendentes.length" class="faixa ok"><span>{{ resultado.reservasPendentes.length }} lançamento(s) de reserva (Caixinha, Porquinho, Resgate CDB) em A revisar. Vincule a uma meta em Objetivos para atualizar a meta; se recusar, ficam fora do orçamento.</span><button type="button" class="b-sec peq" @click="irParaReserva">Abrir Objetivos</button></div>
        <div class="linha-botoes">
          <button type="button" class="b-sec" @click="desfazer(resultado.importacaoId)"><Undo2 :size="16" /> Desfazer esta importação</button>
          <button type="button" class="b-prim" @click="novaImportacao">Importar outro arquivo</button>
        </div>
      </CardPadrao>
    </template>
    <p v-else-if="etapa === 4" class="dica"><button type="button" class="b-prim" @click="novaImportacao">Nova importação</button></p>

    <Modal :aberto="!!editando" titulo="Corrigir lançamento" @fechar="editando = null">
      <div v-if="editando" class="form">
        <label class="campo"><span>Descrição</span><input v-model="editando.descricao" type="text" /></label>
        <label class="campo"><span>Data</span><input v-model="editando.data" type="date" /></label>
        <label class="campo"><span>Valor (R$)</span><input v-model.number="editando.valor" type="number" step="0.01" min="0" /></label>
        <label class="marca"><input v-model="editando.saida" type="checkbox" /> {{ tipo === 'fatura' ? 'É uma compra (despesa)' : 'É uma saída (despesa)' }}</label>
        <label v-if="tipo === 'fatura' && !editando.saida" class="campo" data-tipo-credito-previa><span>Que crédito é?</span>
          <select v-model="editando.credito"><option value="estorno">Estorno de uma compra</option><option value="pagamento">Pagamento adiantado da fatura</option><option value="cashback">Cashback ou outro crédito</option></select></label>
        <label v-if="editando.saida || (tipo === 'fatura' && editando.credito === 'estorno')" class="campo"><span>Categoria</span>
          <select v-model="editando.categoriaId"><option value="">Sem categoria</option><option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nome }}</option></select></label>
      </div>
      <template #rodape><button type="button" class="b-prim" @click="salvarEdicao">Salvar</button></template>
    </Modal>

    <Modal :aberto="!!anterior" titulo="Arquivo já importado" @fechar="cancelarSubstituir">
      <p v-if="anterior" class="pergunta-subst">Este arquivo já foi importado em {{ diaMes(anterior.em) }}. Substituir a importação anterior?</p>
      <p class="dica">Substituir desfaz a importação anterior ({{ anterior ? anterior.novas : 0 }} lançamento(s)) e importa o arquivo de novo. Cancelar não muda nada.</p>
      <template #rodape>
        <div class="linha-botoes" style="justify-content:flex-end;margin-top:0">
          <button type="button" class="b-sec" :disabled="substituindo" @click="cancelarSubstituir">Cancelar</button>
          <button type="button" class="b-prim" :disabled="substituindo" @click="substituirAnterior">{{ substituindo ? 'Substituindo…' : 'Substituir' }}</button>
        </div>
      </template>
    </Modal>

    <Modal :aberto="senhaPdf.aberto" titulo="PDF protegido por senha" @fechar="enviarSenha(false)">
      <p class="dica">Digite a senha do PDF. Ela é usada só para abrir o arquivo agora e não fica guardada.</p>
      <p v-if="senhaPdf.erro" class="faixa erro">Senha incorreta. Tente de novo.</p>
      <label class="campo"><span>Senha</span><input v-model="senhaPdf.valor" type="password" autocomplete="off" @keyup.enter="enviarSenha(true)" /></label>
      <template #rodape><button type="button" class="b-prim" :disabled="!senhaPdf.valor" @click="enviarSenha(true)">Abrir</button></template>
    </Modal>
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
.topo { display: flex; align-items: center; gap: 8px; }
.voltar { width: 44px; height: 44px; border-radius: 12px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); display: grid; place-items: center; cursor: pointer; }
.titulo-pagina { font-family: var(--fonte-display); font-size: 20px; margin: 0; flex: 1; }
.faixa { display: flex; gap: 10px; align-items: flex-start; margin: 0; padding: 12px 14px; border-radius: 12px; font-size: 14px; line-height: 1.4; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado); }
.faixa.erro { border-color: var(--cor-grave, var(--cor-saida)); color: var(--cor-grave, var(--cor-saida)); }
.faixa.alerta { border-color: var(--cor-amarelo); }
.faixa.ok { border-color: var(--cor-investimento); justify-content: space-between; align-items: center; flex-wrap: wrap; }
.escolhas { display: grid; gap: 10px; }
.escolha { display: flex; align-items: center; gap: 14px; min-height: 64px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); cursor: pointer; text-align: left; font-family: var(--fonte-texto); }
.escolha:hover, .escolha:focus-visible { border-color: var(--cor-primaria); outline: none; }
.escolha span { display: flex; flex-direction: column; gap: 2px; font-size: 15px; }
.escolha small, .dica { color: var(--cor-texto-suave); font-size: 13.5px; line-height: 1.5; }
.dica { margin: 8px 0; }
.campo { display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 500; margin: 8px 0; }
select, input[type='text'], input[type='number'], input[type='date'], input[type='password'] { font-family: var(--fonte-texto); font-size: 15px; padding: 8px 10px; min-height: 44px; border-radius: 10px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); }
.arquivo { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 0 14px; margin: 10px 0; border: 1.5px dashed var(--cor-borda); border-radius: 14px; cursor: pointer; color: var(--cor-texto); font-size: 14.5px; position: relative; overflow: hidden; }
.arquivo input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.arquivo.ocupado { opacity: 0.6; }
.b-prim, .b-sec { min-height: 44px; padding: 0 18px; border-radius: 12px; font: 600 14.5px var(--fonte-texto); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.b-prim { border: none; background: var(--cor-primaria); color: var(--cor-sobre-cor); margin-top: 8px; }
.b-sec { background: none; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.b-sec.peq { min-height: 36px; padding: 0 12px; font-size: 13px; }
.b-prim:disabled, .b-sec:disabled { opacity: 0.5; cursor: default; }
.linha-botoes { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.link { background: none; border: none; color: var(--cor-primaria); text-decoration: underline; cursor: pointer; font: inherit; padding: 0; }
.periodo { margin: 0 0 8px; font-size: 14.5px; }
.atalhos { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
.atalhos button, .diverg button { min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); font: 500 13px var(--fonte-texto); cursor: pointer; }
.atalhos button.ativo, .diverg button.ativo { background: var(--cor-primaria); color: var(--cor-sobre-cor); border-color: transparent; }
.grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; align-items: end; }
.resumo { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
.resumo div { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 10px; background: var(--cor-realce); font-size: 13px; }
.resumo b { font-size: 14.5px; }
@media (max-width: 480px) { .resumo { grid-template-columns: 1fr 1fr; } }
.neutro { color: var(--cor-meta); }
.ent { color: var(--cor-entrada); } .sai { color: var(--cor-saida-texto, var(--cor-saida)); }
.linhas { list-style: none; margin: 0; padding: 0; }
.linha { padding: 10px 14px; border-bottom: 1px solid var(--cor-borda); display: flex; flex-direction: column; gap: 6px; }
.linha.fora { opacity: 0.55; }
.linha.baixa { background: var(--cor-realce); }
.topo-linha { display: flex; gap: 10px; align-items: baseline; }
.data { font-size: 12.5px; color: var(--cor-texto-suave); min-width: 74px; }
.desc { flex: 1; font-size: 14.5px; overflow-wrap: anywhere; }
.valor { font-variant-numeric: tabular-nums; white-space: nowrap; }
.sub-linha { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.selo { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--cor-realce); color: var(--cor-texto-suave); }
.selo.nova { color: var(--cor-investimento); } .selo.divergente, .selo.baixa { color: var(--cor-amarelo); } .selo.estorno, .selo.pagamento_fatura, .selo.reserva, .selo.pagamento_adiantado { color: var(--cor-meta); } .selo.cashback { color: var(--cor-entrada); }
.chip { font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--cor-borda); color: var(--cor-texto-suave); }
.obs { color: var(--cor-texto-suave); font-size: 12.5px; flex: 1 1 200px; }
.acoes { margin-left: auto; display: flex; gap: 4px; }
.icone { width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); display: grid; place-items: center; cursor: pointer; }
.diverg { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 13px; }
.vazio { padding: 20px; text-align: center; color: var(--cor-texto-suave); }
.marca { display: flex; gap: 10px; align-items: center; font-size: 14px; margin: 8px 0; min-height: 36px; }
.marca input { width: 20px; height: 20px; accent-color: var(--cor-primaria); }
.hist { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.hist li { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 14px; }
.hist li div { display: flex; flex-direction: column; gap: 2px; }
.hist small { color: var(--cor-texto-suave); }
.hist small.arq { overflow-wrap: anywhere; }
.pergunta-subst { margin: 0 0 8px; font-size: 15px; font-weight: 600; line-height: 1.45; }
.hist li.desfeita { opacity: 0.55; }
.res { list-style: none; padding: 0; margin: 0 0 8px; display: flex; flex-direction: column; gap: 6px; font-size: 14.5px; }
.tabela-rolagem { overflow-x: auto; margin-bottom: 8px; }
.amostra { border-collapse: collapse; font-size: 12.5px; }
.amostra td, .amostra th { border: 1px solid var(--cor-borda); padding: 4px 8px; white-space: nowrap; color: var(--cor-texto-suave); }
.form { display: flex; flex-direction: column; }
</style>
