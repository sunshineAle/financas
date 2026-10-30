<script setup>
// Relatórios (REF-06): abas Mês/Ano, resumo do período, barras horizontais por categoria, evolução do saldo
// (linha com marcador), entradas × saídas por mês e comparações (esta semana × passada; período × anterior).
// O período vem do mês compartilhado (services/mes.js): trocar aqui troca nas outras telas.
// Homologação 1.0, seção 19: sem filtro de meses nesta página — o gráfico de linha da relação mensal no topo é o seletor
// (tocar/arrastar escolhe o mês); o botão ao lado alterna Mês ↔ Ano; "Exportar CSV" virou ícone no canto do gráfico.
// Seção 1: card "Resumo financeiro" explica Saldo do mês, Dinheiro nas contas e Patrimônio líquido.
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowDown, ArrowUp, ArrowDownRight, ArrowUpRight, Minus, Download, CalendarDays, CalendarRange } from 'lucide-vue-next';
import CabecalhoPagina from '../components/CabecalhoPagina.vue';
import CardPadrao from '../components/CardPadrao.vue';
import AjudaSecao from '../components/AjudaSecao.vue';
import RelRelacaoMensal from '../components/RelRelacaoMensal.vue';
import Valor from '../components/Valor.vue';
import RelBarrasH from '../components/RelBarrasH.vue';
import RelSemana from '../components/RelSemana.vue';
import { periodo, ano, mesNum, anoInteiro, escolher, MESES, MESES_CURTOS, anoAtual } from '../services/mes.js';
import { corDespesa } from '../utils/coresDespesa.js';
import { corReceita } from '../utils/coresReceita.js';

const router = useRouter();
const carregando = ref(true);
const atual = ref(null); // resposta de /api/dashboard do período
const anterior = ref(null); // idem do período anterior
const serie = ref([]); // [{ chave, rotulo, entradas, saidas }]
const projecao = ref(null);
const semana = ref(null);

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtInt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const moeda = (v) => fmt.format(v || 0);
const moedaInt = (v) => fmtInt.format(v || 0);

// ---- período ---------------------------------------------------------------------------------
function chaveMes(a, m) { return `${a}-${String(m).padStart(2, '0')}`; }
function chaveDeslocada(chave, delta) {
  if (chave.length === 4) return String(Number(chave) + delta);
  const [a, m] = chave.split('-').map(Number);
  const t = a * 12 + (m - 1) + delta;
  return chaveMes(Math.floor(t / 12), (t % 12) + 1);
}
const chaveAnterior = computed(() => chaveDeslocada(periodo.value.chave, -1));
const rotuloAnterior = computed(() => {
  const c = chaveAnterior.value;
  if (c.length === 4) return c;
  const [a, m] = c.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
});
const rotuloAtual = computed(() => (anoInteiro.value ? String(ano.value) : `${MESES[mesNum.value - 1]} de ${ano.value}`));
const aba = computed(() => (anoInteiro.value ? 'ano' : 'mes'));
function escolherAba(a) {
  if (a === 'ano') escolher(ano.value, null);
  else escolher(ano.value, mesNum.value);
}

// ---- dados -----------------------------------------------------------------------------------
const cacheDash = new Map();
async function pegarJson(url) {
  const r = await fetch(url, { credentials: 'include' });
  if (r.status === 401) { router.push('/login'); throw new Error('401'); }
  if (!r.ok) throw new Error('falha');
  return r.json();
}
async function dash(chave) {
  if (!cacheDash.has(chave)) cacheDash.set(chave, pegarJson(`/api/dashboard?mes=${chave}`).catch((e) => { cacheDash.delete(chave); throw e; }));
  return cacheDash.get(chave);
}
let seq = 0;
async function carregar() {
  const meu = ++seq;
  cacheDash.clear(); // dados podem ter mudado desde a última visita; só reaproveita dentro de uma carga
  try {
    const p = periodo.value;
    // Janela do gráfico: no Mês, 12 meses terminando no mais recente entre o escolhido e o mês atual (+1 futuro);
    // no Ano, os 5 anos terminando no escolhido (ou no atual).
    const hojeChave = chaveMes(new Date().getFullYear(), new Date().getMonth() + 1);
    const fimMes = p.tipo === 'ano' ? null : (p.chave > hojeChave ? p.chave : hojeChave);
    const fimAno = p.tipo === 'ano' ? Math.max(Number(p.chave), anoAtual) : null;
    const chavesSerie = p.tipo === 'ano'
      ? Array.from({ length: 5 }, (_, i) => String(fimAno - 4 + i))
      : Array.from({ length: 12 }, (_, i) => chaveDeslocada(fimMes, i - 11));
    const [a, ant] = await Promise.all([dash(p.chave), dash(chaveAnterior.value)]);
    const janela = Object.fromEntries((a.fluxoCaixa || []).map((m) => [m.chave, m]));
    const meses = await Promise.all(chavesSerie.map(async (chave) => {
      let e = janela[chave];
      if (!e || e.futuro) {
        const d = await dash(chave);
        const pv = d.periodo.previsao;
        e = pv ? { entradas: pv.entradas, saidas: pv.saidas } : { entradas: d.periodo.entradas, saidas: d.periodo.saidas };
      }
      const rotulo = chave.length === 4 ? chave : MESES_CURTOS[Number(chave.slice(5, 7)) - 1];
      return { chave, rotulo, entradas: e.entradas || 0, saidas: e.saidas || 0 };
    }));
    if (meu !== seq) return;
    atual.value = a;
    anterior.value = ant;
    serie.value = meses;
  } catch (e) {
    if (e.message === '401') return;
  }
  carregando.value = false;
}
async function carregarFixos() {
  try {
    projecao.value = await pegarJson('/api/relatorios/projecao');
  } catch { projecao.value = { entradas: 0, saidas: 0, mesesConsiderados: 0 }; }
  // semana: últimos 7 dias × 7 dias anteriores (a API não tem "semana"; calcula-se pelas datas das transações)
  try {
    const hoje = new Date();
    const chaves = [chaveMes(hoje.getFullYear(), hoje.getMonth() + 1)];
    if (hoje.getDate() <= 13) chaves.push(chaveDeslocada(chaves[0], -1));
    const listas = await Promise.all(chaves.map((c) => pegarJson(`/api/transacoes?mes=${c}`)));
    const txs = listas.flatMap((l) => l.transacoes).filter((t) => t.valor < 0 && !t.ignorada && !t.cartao);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const soma = {};
    txs.forEach((t) => { const k = String(t.data).slice(0, 10); soma[k] = (soma[k] || 0) + -t.valor; });
    const SEM = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    const dias = [];
    for (let k = 0; k < 7; k++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (6 - k));
      const dp = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7);
      dias.push({ rotulo: SEM[d.getDay()], dataAtual: iso(d), atual: soma[iso(d)] || 0, anterior: soma[iso(dp)] || 0 });
    }
    semana.value = { dias, totalAtual: dias.reduce((s, d) => s + d.atual, 0), totalAnterior: dias.reduce((s, d) => s + d.anterior, 0) };
  } catch { semana.value = null; }
}

// ---- derivados -------------------------------------------------------------------------------
const entradas = computed(() => atual.value?.periodo.previsao?.entradas ?? atual.value?.periodo.entradas ?? 0);
const saidas = computed(() => atual.value?.periodo.previsao?.saidas ?? atual.value?.periodo.saidas ?? 0);
const saldo = computed(() => entradas.value - saidas.value);
const sobrouPct = computed(() => (entradas.value > 0 ? Math.round((saldo.value / entradas.value) * 100) : 0));
const textoSobrou = computed(() => {
  if (!entradas.value && !saidas.value) return 'Sem movimentações neste período';
  if (!entradas.value) return 'Sem entradas neste período';
  return saldo.value >= 0 ? `${sobrouPct.value}% das entradas ficou no saldo` : `Saídas passaram das entradas em ${Math.abs(sobrouPct.value)}%`;
});
const semDados = computed(() => !serie.value.some((m) => m.entradas || m.saidas) && !saidas.value && !entradas.value);

const gastosCat = computed(() => {
  const lista = (atual.value?.categoriasMes || []).map((c, i) => ({
    id: c.id, rotulo: c.nome, valor: c.gasto_atual, icone: c.icone || '', cor: corDespesa(c, i), nomeCat: c.nome,
  })).filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor);
  const total = lista.reduce((s, c) => s + c.valor, 0) || 1;
  return lista.map((c) => ({ ...c, detalhe: `${Math.round((c.valor / total) * 100)}% dos gastos categorizados` }));
});
const entradasCat = computed(() => {
  const lista = (atual.value?.entradasPorCategoria || []).map((e) => ({ id: e.nome, rotulo: e.nome, valor: e.valor, cor: corReceita(e.nome, e.cor) }));
  const total = lista.reduce((s, c) => s + c.valor, 0) || 1;
  return lista.map((c) => ({ ...c, detalhe: `${Math.round((c.valor / total) * 100)}% das entradas` }));
});

const indiceSel = computed(() => serie.value.findIndex((m) => m.chave === periodo.value.chave));
function escolherPonto(i) { // tocar/arrastar no gráfico leva o período para aquele mês (ou ano)
  const m = serie.value[i];
  if (!m) return;
  if (m.chave.length === 4) { escolher(Number(m.chave), null); return; }
  const [a, mm] = m.chave.split('-').map(Number);
  escolher(a, mm);
}
// ‹ › nas pontas do gráfico: um período para trás/para frente (até 12 meses ou 1 ano à frente de hoje)
const limiteFuturo = computed(() => (anoInteiro.value ? String(anoAtual + 1) : chaveDeslocada(chaveMes(anoAtual, new Date().getMonth() + 1), 12)));
const podeAvancar = computed(() => periodo.value.chave < limiteFuturo.value);
function passo(d) {
  const nova = chaveDeslocada(periodo.value.chave, d);
  if (d > 0 && nova > limiteFuturo.value) return;
  if (nova.length === 4) escolher(Number(nova), null);
  else { const [a, mm] = nova.split('-').map(Number); escolher(a, mm); }
}
function alternarMesAno() { escolherAba(anoInteiro.value ? 'mes' : 'ano'); }

// Resumo financeiro (seção 1, texto do Contador). Dinheiro nas contas e Patrimônio são POSIÇÃO de hoje.
const resumo = computed(() => {
  const d = atual.value;
  if (!d) return null;
  const pv = d.periodo.previsao;
  const ent = pv ? pv.entradas : d.periodo.entradas;
  const sai = pv ? pv.saidas : d.periodo.saidas;
  const reserva = d.reservaResumo?.total || 0;
  return {
    previsto: !!pv,
    entradas: ent, saidas: sai, saldoMes: Math.round((ent - sai) * 100) / 100,
    contas: d.totalContas || 0, faturas: d.totalFaturasAbertas || 0, dividas: d.totalDividas || 0, reserva,
    patrimonio: typeof d.patrimonioLiquido === 'number' ? d.patrimonioLiquido : Math.round(((d.totalContas || 0) + reserva - (d.totalFaturasAbertas || 0) - (d.totalDividas || 0)) * 100) / 100,
  };
});

function variacao(a, b) {
  if (!b) return null;
  return Math.round(((a - b) / b) * 100);
}
const compPeriodo = computed(() => {
  if (!atual.value || !anterior.value) return [];
  return [
    { id: 'saidas', rotulo: 'Saídas', atual: saidas.value, ant: anterior.value.periodo.saidas, bomSeCair: true },
    { id: 'entradas', rotulo: 'Entradas', atual: entradas.value, ant: anterior.value.periodo.entradas, bomSeCair: false },
  ].map((c) => ({ ...c, pct: variacao(c.atual, c.ant) }));
});
const variacaoSemana = computed(() => (semana.value ? variacao(semana.value.totalAtual, semana.value.totalAnterior) : null));
// gasto menor ou entrada maior = azul (frio); gasto maior ou entrada menor = quente
function classeDelta(pct, bomSeCair) {
  if (!pct) return '';
  return (pct < 0) === bomSeCair ? 'frio' : 'quente';
}
function textoVar(pct) {
  if (pct === null) return 'sem base para comparar';
  if (pct === 0) return 'igual ao anterior';
  return `${Math.abs(pct)}% ${pct > 0 ? 'a mais' : 'a menos'}`;
}

function abrirCategoria(c) {
  router.push({ path: '/transacoes', query: { categoria: c.id, nomeCategoria: c.nomeCat } });
}
function abrirEntrada(c) {
  router.push({ path: '/transacoes', query: { receita: c.rotulo, tipo: 'entrada' } });
}
function exportarCsv() {
  window.location.href = '/api/relatorios/exportar.csv';
}

watch(() => periodo.value.chave, carregar);
onMounted(() => { carregar(); carregarFixos(); });
</script>

<template>
  <div class="pagina">
    <CabecalhoPagina titulo="Relatórios" sem-mes>
    <template #corpo>
    <div class="conteudo-mes">

    <div v-if="carregando" class="carregando" aria-live="polite">Carregando relatórios…</div>

    <template v-else>
      <!-- Topo: relação mensal em linha, que também escolhe o período -->
      <CardPadrao class="painel topo-grafico" aria-labelledby="t-relacao">
        <div class="cab-grafico">
          <h2 id="t-relacao">{{ anoInteiro ? 'Relação anual' : 'Relação mensal' }} <span class="periodo-sel">· {{ rotuloAtual }}</span><AjudaSecao secao="relatorios.evolucao" /></h2>
          <div class="acoes-grafico">
            <button type="button" class="icone-botao alterna" :aria-label="anoInteiro ? 'Ver por mês' : 'Ver por ano'" :title="anoInteiro ? 'Ver por mês' : 'Ver por ano'" data-alterna-mes-ano @click="alternarMesAno">
              <component :is="anoInteiro ? CalendarDays : CalendarRange" :size="16" :stroke-width="2" /><span>{{ anoInteiro ? 'Ano' : 'Mês' }}</span>
            </button>
            <button type="button" class="icone-botao" aria-label="Exportar CSV" title="Exportar CSV" @click="exportarCsv"><Download :size="16" :stroke-width="2" /></button>
          </div>
        </div>
        <RelRelacaoMensal :pontos="serie" :selecionado="indiceSel" :formato="moedaInt" :pode-avancar="podeAvancar" @escolher="escolherPonto" @passo="passo" />
        <p v-if="semDados" class="nota">Ainda não há transações neste período. Os relatórios se preenchem sozinhos conforme você lança ou importa movimentações.</p>
      </CardPadrao>

      <!-- Resumo financeiro: o que é cada número (seção 1) -->
      <CardPadrao v-if="resumo" class="painel resumo-fin" aria-labelledby="t-resumo" data-resumo-financeiro>
        <h2 id="t-resumo">Resumo financeiro<AjudaSecao secao="relatorios.resumo" /></h2>
        <div class="bloco-num">
          <div class="num-cab"><span>{{ resumo.previsto ? 'Saldo do mês (previsto)' : anoInteiro ? 'Saldo do ano' : 'Saldo do mês' }}</span><b class="numero-tabular" :class="{ neg: resumo.saldoMes < 0, pos: resumo.saldoMes > 0 }"><Valor :valor="resumo.saldoMes" /></b></div>
          <p class="frase">Entradas − saídas {{ anoInteiro ? 'do ano' : 'do mês' }}: mostra se sobrou ou faltou no período.</p>
          <ul class="comp-num"><li><span>+ Entradas</span><Valor :valor="resumo.entradas" /></li><li><span>− Saídas</span><Valor :valor="resumo.saidas" /></li></ul>
        </div>
        <div class="bloco-num">
          <div class="num-cab"><span>Dinheiro nas contas <small>hoje</small></span><b class="numero-tabular"><Valor :valor="resumo.contas" /></b></div>
          <p class="frase">A soma dos saldos dos bancos. Inclui o dinheiro que já está comprometido com a fatura.</p>
          <ul v-if="resumo.faturas > 0" class="comp-num"><li><span>Comprometido com faturas abertas</span><Valor :valor="resumo.faturas" /></li></ul>
        </div>
        <div class="bloco-num">
          <div class="num-cab"><span>Patrimônio líquido <small>hoje</small></span><b class="numero-tabular" :class="{ neg: resumo.patrimonio < 0 }"><Valor :valor="resumo.patrimonio" /></b></div>
          <p class="frase">Tudo o que você tem − tudo o que deve.</p>
          <ul class="comp-num">
            <li><span>+ Contas</span><Valor :valor="resumo.contas" /></li>
            <li><span>+ Reserva de Liberdade e investimentos</span><Valor :valor="resumo.reserva" /></li>
            <li><span>− Faturas abertas</span><Valor :valor="resumo.faturas" /></li>
            <li><span>− Dívidas</span><Valor :valor="resumo.dividas" /></li>
          </ul>
        </div>
      </CardPadrao>

      <div class="grade">
        <!-- Barras por categoria -->
        <CardPadrao class="painel" aria-labelledby="t-gastos">
          <h2 id="t-gastos">Gastos por categoria</h2>
          <RelBarrasH v-if="gastosCat.length" :itens="gastosCat" :formato="moeda" clicavel @clicar="abrirCategoria" />
          <p v-else class="nota">Sem gastos categorizados neste período.</p>
        </CardPadrao>

        <CardPadrao class="painel" aria-labelledby="t-entradas">
          <h2 id="t-entradas">Entradas por categoria</h2>
          <RelBarrasH v-if="entradasCat.length" :itens="entradasCat" :formato="moeda" de="var(--entrada-ceu-medio)" ate="var(--entrada-royal-medio)" clicavel @clicar="abrirEntrada" />
          <p v-else class="nota">Sem entradas neste período.</p>
        </CardPadrao>

        <!-- Esta semana x semana passada -->
        <CardPadrao class="painel" aria-labelledby="t-semana">
          <h2 id="t-semana">Esta semana × semana passada<AjudaSecao secao="relatorios.semana" /></h2>
          <template v-if="semana">
            <div class="duo">
              <div><small>Esta semana</small><b class="numero-tabular">{{ moeda(semana.totalAtual) }}</b></div>
              <div><small>Semana passada</small><b class="numero-tabular">{{ moeda(semana.totalAnterior) }}</b></div>
              <span class="delta" :class="classeDelta(variacaoSemana, true)">
                <component :is="variacaoSemana > 0 ? ArrowUpRight : variacaoSemana < 0 ? ArrowDownRight : Minus" :size="15" :stroke-width="2.2" />
                {{ textoVar(variacaoSemana) }}
              </span>
            </div>
            <RelSemana :dias="semana.dias" />
          </template>
          <p v-else class="nota">Não foi possível calcular a semana agora.</p>
        </CardPadrao>

        <!-- Período x anterior -->
        <CardPadrao class="painel" aria-labelledby="t-comp">
          <h2 id="t-comp">{{ anoInteiro ? 'Este ano × ano anterior' : 'Este mês × mês anterior' }}</h2>
          <p class="nota">{{ rotuloAtual }} comparado a {{ rotuloAnterior }}.</p>
          <ul class="comp">
            <li v-for="c in compPeriodo" :key="c.id" :class="c.id">
              <span class="cab"><span class="seta"><component :is="c.id === 'saidas' ? ArrowUp : ArrowDown" :size="14" :stroke-width="2.2" /></span> {{ c.rotulo }}</span>
              <span class="par"><b class="numero-tabular">{{ moeda(c.atual) }}</b><small class="numero-tabular">antes {{ moeda(c.ant) }}</small></span>
              <span class="delta" :class="classeDelta(c.pct, c.bomSeCair)">
                <component :is="c.pct > 0 ? ArrowUpRight : c.pct < 0 ? ArrowDownRight : Minus" :size="15" :stroke-width="2.2" />
                {{ textoVar(c.pct) }}
              </span>
            </li>
          </ul>
        </CardPadrao>

        <!-- Projeção -->
        <CardPadrao v-if="projecao" class="painel" aria-labelledby="t-proj">
          <h2 id="t-proj">Projeção para o próximo mês<AjudaSecao secao="relatorios.projecao" /></h2>
          <p class="nota">Média de {{ projecao.mesesConsiderados || 0 }} meses</p>
          <div class="linha-proj"><span>Entradas</span><span class="numero-tabular v-ent">{{ moeda(projecao.entradas) }}</span></div>
          <div class="linha-proj"><span>Saídas</span><span class="numero-tabular v-sai">{{ moeda(projecao.saidas) }}</span></div>
          <div class="linha-proj total"><span>Saldo projetado</span><span class="numero-tabular" data-total>{{ moeda(projecao.entradas - projecao.saidas) }}</span></div>
        </CardPadrao>
      </div>
    </template>
    </div>
    </template>
    </CabecalhoPagina>
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); min-height: 60vh; }
.conteudo-mes { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.topo-grafico { gap: 8px; }
.cab-grafico { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.periodo-sel { font-family: var(--fonte-texto); font-weight: 500; font-size: 14px; color: var(--cor-texto-suave); }
.acoes-grafico { display: flex; gap: 6px; }
.icone-botao { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 36px; height: 36px; padding: 0 9px; border-radius: 10px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto-suave); font: 600 12.5px var(--fonte-texto); cursor: pointer; }
.icone-botao:hover { color: var(--cor-texto); background: var(--cor-realce); }
.icone-botao.alterna { color: var(--cor-texto); }
.resumo-fin { gap: 4px; }
.bloco-num { display: flex; flex-direction: column; gap: 4px; padding: 10px 0; border-top: 1px solid var(--cor-borda); }
.bloco-num:first-of-type { border-top: 0; padding-top: 6px; }
.num-cab { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-weight: 600; font-size: 14.5px; }
.num-cab small { font-weight: 400; font-size: 12px; color: var(--cor-texto-suave); margin-left: 4px; }
.num-cab b { font-family: var(--fonte-display); font-size: 17px; }
.num-cab b.pos { color: var(--cor-entrada-texto, var(--cor-entrada)); }
.num-cab b.neg { color: var(--cor-saida-texto, var(--cor-saida)); }
.frase { margin: 0; font-size: 12.5px; color: var(--cor-texto-suave); line-height: 1.45; }
.comp-num { list-style: none; margin: 2px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.comp-num li { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; color: var(--cor-texto-suave); }
.comp-num li :deep(*) { font-variant-numeric: tabular-nums; }
.topo { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.titulo-pagina { font-family: var(--fonte-display); font-size: 22px; margin: 0; }

.linha-abas { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.botao-fantasma { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); font-family: var(--fonte-texto); font-size: 14px; font-weight: 600; cursor: pointer; }
.botao-fantasma:hover { background: var(--cor-realce); }

.nota-topo { margin: 0; padding: 12px 14px; border: 1px dashed var(--cor-borda); border-radius: 12px; font-size: 13px; color: var(--cor-texto-suave); }
.carregando { padding: 48px 0; text-align: center; color: var(--cor-texto-suave); font-size: 14px; }

/* resumo */
.resumo { display: flex; flex-direction: column; gap: 14px; }
.saldo { display: flex; flex-direction: column; gap: 2px; }
.saldo small { font-size: 13px; color: var(--cor-texto-suave); text-transform: capitalize; }
.saldo strong { font-family: var(--fonte-display); font-size: clamp(28px, 7vw, 38px); line-height: 1.1; font-weight: 700; }
.saldo strong.negativo { color: var(--cor-saida); }
.minis { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mini { display: flex; flex-direction: column; gap: 6px; padding: 14px; border-radius: var(--raio-padrao); background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); min-width: 0; }
.mini .cab, .comp .cab { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--cor-texto-suave); }
.mini b { font-family: var(--fonte-display); font-size: clamp(15px, 4.4vw, 20px); overflow-wrap: anywhere; }
.seta { width: 24px; height: 24px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.entrada .seta, .comp .entradas .seta { background: var(--cor-entrada-fundo); color: var(--entrada-royal-medio); }
.saida .seta, .comp .saidas .seta { background: var(--cor-saida-fundo); color: var(--cor-saida); }
.entrada b, .v-ent { color: var(--cor-primaria); }
.saida b, .v-sai { color: var(--cor-saida); }
.sobrou { display: flex; flex-direction: column; gap: 8px; }
.sobrou small { font-size: 13px; color: var(--cor-texto-suave); }

/* grade */
.grade { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
.painel.larga { grid-column: 1 / -1; }
@media (max-width: 768px) { .grade { grid-template-columns: minmax(0, 1fr); } }
.painel { gap: 10px; }
.painel h2 { margin: 0; font-family: var(--fonte-display); font-size: 16px; display: flex; align-items: center; gap: 8px; }
.nota { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }

/* entradas x saídas por mês */
.meses { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.meses li { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 6px 6px; border-radius: 10px; min-height: 44px; }
.meses li.destaque { background: var(--cor-realce); }
.rot { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--cor-texto-suave); }
.barras { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.vals { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; font-size: 12px; font-weight: 600; line-height: 1.35; }

/* comparações */
.duo { display: flex; flex-wrap: wrap; gap: 8px 22px; align-items: flex-end; }
.duo > div { display: flex; flex-direction: column; gap: 2px; }
.duo small, .par small { font-size: 12px; color: var(--cor-texto-suave); }
.duo b { font-family: var(--fonte-display); font-size: 17px; }
.delta { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; font-weight: 600; color: var(--cor-texto-suave); }
.delta.quente { color: var(--cor-saida); }
.delta.frio { color: var(--cor-primaria); }
.comp { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.comp li { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; padding: 12px; border: 1px solid var(--cor-borda); border-radius: 14px; background: var(--cor-fundo); }
.comp .cab { grid-column: 1 / -1; }
.par { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.par b { font-family: var(--fonte-display); font-size: 17px; overflow-wrap: anywhere; }
.comp .delta { align-self: end; justify-self: end; text-align: right; }

.linha-proj { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--cor-borda); font-size: 14px; }
.linha-proj.total { border-bottom: none; font-family: var(--fonte-display); font-weight: 700; padding-bottom: 0; }
</style>
