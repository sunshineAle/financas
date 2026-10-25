<script setup>
// Importar extrato ou fatura. Central em 2 etapas (tipo -> conta/cartão) ou contextual (?tipo=&id= vindo do menu do card).
// Fluxo: arquivo -> pré-visualização obrigatória (corrigir/descartar linhas) -> confirmar -> histórico com desfazer.
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Landmark, CreditCard, FileUp, Undo2, TriangleAlert, Check, ChevronLeft, Pencil, X, Link2 } from 'lucide-vue-next';
import CardPadrao from '../components/CardPadrao.vue';
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

const destinos = computed(() => (tipo.value === 'conta' ? contas.value : cartoes.value));
const destinoSel = computed(() => destinos.value.find((d) => d.id === destinoId.value) || null);
const rotuloDestino = computed(() => (destinoSel.value ? (tipo.value === 'fatura' ? 'Cartão ' : '') + destinoSel.value.nome : ''));

async function carregarBase() {
  const [c, k] = await Promise.all([api('GET', '/api/contas'), api('GET', '/api/cartoes')]);
  contas.value = c;
  cartoes.value = k.filter((x) => x.origem === 'manual');
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
    precisaMapa.value = null;
    analise.value = r;
    linhas.value = r.linhas.map((l) => ({ ...l, existenteId: l.existente ? l.existente.id : undefined }));
    if (periodoModo.value === 'arquivo') periodoPers.value = { inicio: r.periodo.inicio, fim: r.periodo.fim };
    ajustarSaldo.value = false;
    etapa.value = 3;
  } catch (e) { erro.value = e.message; } finally { carregando.value = false; }
}
function aplicarMapa() {
  const n = (v) => (v === '' || v === null ? undefined : Number(v));
  analisar({ mapeamento: { linhaCabecalho: Number(mapa.value.linhaCabecalho), data: n(mapa.value.data), descricao: n(mapa.value.descricao), valor: n(mapa.value.valor), debito: n(mapa.value.debito), credito: n(mapa.value.credito) } });
}
function mudarPeriodo(m) { periodoModo.value = m; if (m !== 'personalizado') analisar(); }
function inverter() { analisar({ inverterSinal: !analise.value.sinalInvertido }); }

// ---- edição das linhas
const ROT = { nova: 'Nova', duplicada: 'Já existe', casada: 'Parcela já registrada', divergente: 'Valor diferente', estorno: 'Estorno', pagamento_fatura: 'Pagamento de fatura', pagamento_recebido: 'Pagamento da fatura', reserva: 'Reserva', fora_periodo: 'Fora do período' };
const grava = (l) => ['importar', 'transferencia', 'atualizar'].includes(l.acao);
const visiveis = computed(() => linhas.value.filter((l) => {
  if (filtro.value === 'todas') return true;
  if (filtro.value === 'novas') return l.acao === 'importar' || l.acao === 'transferencia';
  if (filtro.value === 'atencao') return l.confianca === 'baixa' || ['divergente', 'estorno', 'pagamento_fatura', 'reserva'].includes(l.status);
  if (filtro.value === 'descartadas') return l.acao === 'descartar' || l.acao === 'manter';
  return true;
}));
const totais = computed(() => {
  const g = linhas.value.filter(grava);
  return { qtd: g.length, entradas: g.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0), saidas: g.filter((l) => l.valor < 0).reduce((s, l) => s - l.valor, 0), descartadas: linhas.value.length - g.length };
});
const divergentes = computed(() => linhas.value.filter((l) => l.status === 'divergente').length);
function alternar(l) {
  if (grava(l)) l.acao = 'descartar';
  else l.acao = l.status === 'divergente' ? 'atualizar' : l.transferencia ? 'transferencia' : 'importar';
}
function escolherDiverg(l, acao) { l.acao = acao; }
function abrirEdicao(l) { editando.value = { ref: l, descricao: l.descricao, valor: Math.abs(l.valor), saida: l.valor < 0, data: l.data, categoriaId: l.categoriaId || '' }; }
function salvarEdicao() {
  const e = editando.value; const l = e.ref;
  l.descricao = e.descricao.trim() || l.descricao;
  l.valor = Math.round((e.saida ? -1 : 1) * Math.abs(Number(e.valor) || 0) * 100) / 100;
  l.data = e.data || l.data;
  l.categoriaId = e.saida ? e.categoriaId || null : null;
  l.categoriaAuto = false; l.confianca = 'alta';
  editando.value = null;
}
const categorias = ref([]);
onMounted(async () => { try { categorias.value = await api('GET', '/api/categorias'); } catch { /* sem categorias */ } });

async function confirmar() {
  erro.value = ''; carregando.value = true;
  try {
    const a = analise.value;
    resultado.value = await api('POST', '/api/importacao/confirmar', {
      formato: a.formato, nomeArquivo: nomeArq.value, banco: a.banco, destino: { tipo: tipo.value, id: destinoId.value },
      periodo: a.periodo, fatura: a.fatura ? a.fatura.chave : undefined, saldoExtrato: a.saldoExtrato, mapeamento: a.mapeamento, assinatura: a.assinatura,
      opcoes: { ajustarSaldo: ajustarSaldo.value, projetarParcelas: projetar.value, salvarPerfil: salvarPerfil.value && a.mapeamento && !a.perfilAplicado && (a.formato === 'csv' || a.formato === 'xlsx') ? { nome: a.banco || 'Meu banco' } : undefined },
      linhas: linhas.value.map((l) => ({ ...l, bruto: undefined })),
    });
    etapa.value = 4;
    try { historico.value = await api('GET', '/api/importacao/historico'); } catch { /* segue */ }
  } catch (e) { erro.value = e.message; } finally { carregando.value = false; }
}
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
    <header class="topo">
      <button v-if="etapa === 3" type="button" class="voltar" aria-label="Voltar" @click="voltar"><ChevronLeft :size="22" /></button>
      <h1 class="titulo-pagina">Importar extrato ou fatura</h1>
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
      <CardPadrao :titulo="contextual ? `Importando para: ${rotuloDestino}` : tipo === 'conta' ? 'Qual conta?' : 'Qual cartão?'" :subtitulo="contextual ? '' : 'Etapa 2 de 2'">
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
        <p v-if="sugestao && sugestao.formato === 'pdf'" class="dica">PDF: a leitura é genérica (data, descrição, valor). Você confere tudo na próxima tela. Se o PDF tiver senha, ela será pedida e não é guardada.</p>
        <p v-if="tipo === 'fatura'" class="dica">Nada é gravado antes da pré-visualização. Compras já registradas, parcelas e estornos são reconhecidos sozinhos.</p>
        <button type="button" class="b-prim" :disabled="!corpoArq || !destinoId || carregando" @click="analisar()">{{ carregando ? 'Lendo…' : 'Ver pré-visualização' }}</button>
      </CardPadrao>

      <CardPadrao v-if="historico.length" titulo="Importações anteriores">
        <ul class="hist">
          <li v-for="h in historico.slice(0, 8)" :key="h.id" :class="{ desfeita: h.desfeitaEm }">
            <div><b>{{ h.destino || '—' }}</b> <span class="chip">{{ ROT_FORMATO[h.formato] || h.formato }}</span>
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
        <p v-if="analise.leituraGenerica" class="faixa alerta"><TriangleAlert :size="18" /><span>Leitura genérica de PDF: confira as linhas marcadas e os valores antes de confirmar.</span></p>
        <p v-if="!analise.sinalFixo && tipo === 'fatura'" class="dica">Compras são tratadas como saídas. <button type="button" class="link" @click="inverter">Inverter sinais</button> se estiver ao contrário.</p>
        <p v-if="analise.totalIgnoradasArquivo" class="dica">{{ analise.totalIgnoradasArquivo }} linha(s) do arquivo ignorada(s) (cabeçalhos, totais, rodapé).</p>
        <div class="resumo">
          <div><small>A gravar</small><b>{{ totais.qtd }}</b></div>
          <div><small>Entradas</small><b class="ent">{{ moeda(totais.entradas) }}</b></div>
          <div><small>Saídas</small><b class="sai">{{ moeda(totais.saidas) }}</b></div>
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
              <b :class="l.valor < 0 ? 'sai' : 'ent'" class="valor">{{ moeda(l.valor) }}</b>
            </div>
            <div class="sub-linha">
              <span :class="['selo', l.status]">{{ ROT[l.status] }}</span>
              <span v-if="l.confianca === 'baixa'" class="selo baixa">Conferir</span>
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
          <li v-if="resultado.anuladas"><b>{{ resultado.anuladas }}</b> estorno(s) anularam a despesa original</li>
          <li v-if="resultado.transferencias"><b>{{ resultado.transferencias }}</b> transferência(s) entre contas próprias</li>
          <li v-if="resultado.faturasPagas"><b>{{ resultado.faturasPagas }}</b> fatura(s) marcada(s) como paga(s)</li>
          <li><b>{{ resultado.ignoradas }}</b> ignorados (duplicados ou descartados)</li>
          <li v-if="resultado.saldoAjustado"><Link2 :size="14" /> Saldo da conta acertado ({{ moeda(resultado.saldoAjustado) }})</li>
          <li v-if="resultado.perfilSalvo">Layout "{{ resultado.perfilSalvo }}" lembrado</li>
        </ul>
        <p v-for="a in resultado.avisos" :key="a" class="faixa alerta"><TriangleAlert :size="16" /><span>{{ a }}</span></p>
        <div v-if="resultado.reservasPendentes.length" class="faixa ok"><span>{{ resultado.reservasPendentes.length }} lançamento(s) de reserva (Caixinha, Porquinho, Resgate CDB). Vincule a uma meta em Objetivos para atualizar a meta; se recusar, ficam fora do orçamento.</span><button type="button" class="b-sec peq" @click="irParaReserva">Abrir Objetivos</button></div>
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
        <label class="marca"><input v-model="editando.saida" type="checkbox" /> É uma saída (despesa)</label>
        <label v-if="editando.saida && tipo === 'conta' || editando.saida" class="campo"><span>Categoria</span>
          <select v-model="editando.categoriaId"><option value="">Sem categoria</option><option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nome }}</option></select></label>
      </div>
      <template #rodape><button type="button" class="b-prim" @click="salvarEdicao">Salvar</button></template>
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
.selo.nova { color: var(--cor-investimento); } .selo.divergente, .selo.baixa { color: var(--cor-amarelo); } .selo.estorno, .selo.pagamento_fatura, .selo.reserva { color: var(--cor-meta); }
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
.hist li.desfeita { opacity: 0.55; }
.res { list-style: none; padding: 0; margin: 0 0 8px; display: flex; flex-direction: column; gap: 6px; font-size: 14.5px; }
.tabela-rolagem { overflow-x: auto; margin-bottom: 8px; }
.amostra { border-collapse: collapse; font-size: 12.5px; }
.amostra td, .amostra th { border: 1px solid var(--cor-borda); padding: 4px 8px; white-space: nowrap; color: var(--cor-texto-suave); }
.form { display: flex; flex-direction: column; }
</style>
