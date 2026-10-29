<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { abrirLancamento, lancamentoSalvo } from '../services/lancamento.js';
import IconeCat from '../components/IconeCat.vue';
import IconeCategoria from '../components/IconeCategoria.vue';
import { chaveFinalCategoria } from '../utils/iconesCategoria.js';
import { ArrowDown, ArrowUp, ArrowLeftRight, Receipt, Tag, Plus, CreditCard, Landmark, ChartColumn, ShieldCheck, TriangleAlert, ChevronRight, CircleCheck } from 'lucide-vue-next';
import Orbe from '../components/Orbe.vue';
import BarraDegrade from '../components/BarraDegrade.vue';
import CabecalhoPagina from '../components/CabecalhoPagina.vue';
import TopoValor from '../components/TopoValor.vue';
import BotaoOlho from '../components/BotaoOlho.vue';
import BarraAcoes from '../components/BarraAcoes.vue';
import BotaoAcao from '../components/BotaoAcao.vue';
import DashNumero from '../components/DashNumero.vue';
import DashRosca from '../components/DashRosca.vue';
import Valor from '../components/Valor.vue';
import PrevisaoSaldo from '../components/PrevisaoSaldo.vue';
import LinhaTransacao from '../components/LinhaTransacao.vue';
import { infoTransacao } from '../utils/infoTransacao.js';
import PatrimonioDetalhe from '../components/PatrimonioDetalhe.vue';
import { moedaTotal } from '../services/privacidade.js';
import { periodo, anoInteiro, rotuloPeriodo, intervaloTxt } from '../services/mes.js';
import { corReceita, PALETA_RECEITA } from '../utils/coresReceita.js';
import { corDespesa } from '../utils/coresDespesa.js';

const router = useRouter();
const dados = ref(null);
const atividade = ref([]);
const infoReceitas = ref([]); // categorias de entrada com ícone e cor (para a atividade recente)
const nome = ref('');
const carregando = ref(true);
const atualizando = ref(false);
const menuAdd = ref(false);
const abaRosca = ref('saidas');

const rotuloUrgencia = { vermelho: 'Risco de negativação', amarelo: 'Atenção' };

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (v) => formatoMoeda.format(v || 0);
const ir = (rota) => router.push(rota);
const ehImagem = (i) => String(i || '').startsWith('data:image/');

// --- Saudação -------------------------------------------------------------
const saudacao = computed(() => {
  const h = new Date().getHours();
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
});
const primeiroNome = computed(() => (nome.value || '').trim().split(/\s+/)[0] || '');

// --- Período exibido (mês ou ano inteiro) ----------------------------------
const p = computed(() => dados.value?.periodo || { entradas: 0, saidas: 0, saidasPrevistas: 0, futuro: false, meses: 1 });
const entradasDoMes = computed(() => p.value.entradas);
const despesasDoMes = computed(() => p.value.saidas + p.value.saidasPrevistas);
const saldoDoMes = computed(() => entradasDoMes.value - despesasDoMes.value);
const pctDe = (v) => { const t = entradasDoMes.value + despesasDoMes.value; return t > 0 ? Math.round((v / t) * 100) : 0; };
const palavraPeriodo = computed(() => (anoInteiro.value ? 'no ano' : 'no mês'));
const rotuloSaldoPeriodo = computed(() => (anoInteiro.value ? 'Saldo do ano' : 'Saldo do mês'));

// Orbe: Entradas × Saídas (gráfico principal do Dashboard)
const partesOrbe = computed(() => [
  { nome: 'Entradas', valor: entradasDoMes.value, cor: 'var(--cor-entrada)' },
  { nome: 'Saídas', valor: despesasDoMes.value, cor: 'var(--cor-saida)' },
]);

// --- Patrimônio: saldo nas contas + Reserva de Liberdade − faturas abertas − dívidas ------------
const reserva = computed(() => dados.value?.reservaResumo || null);
const valorReserva = computed(() => reserva.value?.total || 0);
const saldoContas = computed(() => dados.value?.totalContas || 0);
const totalDividas = computed(() => dados.value?.totalDividas || 0);
const totalFaturasAbertas = computed(() => dados.value?.totalFaturasAbertas || 0);
// Patrimônio líquido = contas + Reserva de Liberdade − faturas abertas − dívidas. Vem pronto do backend (cálculo único em
// routes/patrimonio.js, o mesmo da janela de detalhe); a conta local fica só de reserva para respostas antigas.
const patrimonio = computed(() => (typeof dados.value?.patrimonioLiquido === 'number'
  ? dados.value.patrimonioLiquido
  : Math.round((saldoContas.value + valorReserva.value - totalFaturasAbertas.value - totalDividas.value) * 100) / 100));
// Detalhe do patrimônio (anotação 60): tocar no card abre a janela; os botões de ação dentro do card continuam com a função deles.
const patrimonioAberto = ref(false);
function abrirPatrimonio(e) {
  if (e && e.target && e.target.closest && e.target.closest('button, a, input, select, textarea')) return;
  patrimonioAberto.value = true;
}

// --- Categorias -------------------------------------------------------------
const categorias = computed(() => dados.value?.categoriasMes || []);
const segDespesas = computed(() => categorias.value
  .map((c, i) => ({ nome: `${c.nome}`, valor: c.gasto_atual, cor: corDespesa(c, i) }))
  .filter((c) => c.valor > 0));
const segEntradas = computed(() => (dados.value?.entradasPorCategoria || []).map((e, i) => ({ nome: e.nome, valor: e.valor, cor: PALETA_RECEITA.includes(e.cor) ? e.cor : PALETA_RECEITA[i % PALETA_RECEITA.length] })));
const segmentosRosca = computed(() => (abaRosca.value === 'saidas' ? segDespesas.value : segEntradas.value));

// Orçamento por categoria: categorias com teto, as de maior uso (no ano, o teto vale por 12 meses)
const orcamentoItens = computed(() => categorias.value
  .map((c, i) => {
    const teto = (c.teto_mensal || 0) * (p.value.meses || 1);
    return { ...c, teto, pct: teto > 0 ? Math.round((c.gasto_atual / teto) * 100) : 0, cor: corDespesa(c, i), restante: teto - c.gasto_atual };
  }));
const comTeto = computed(() => orcamentoItens.value.filter((c) => c.teto > 0 && c.gasto_atual > 0).sort((a, b) => b.pct - a.pct).slice(0, 5));
const semTeto = computed(() => orcamentoItens.value.filter((c) => !(c.teto > 0) && c.gasto_atual > 0).sort((a, b) => b.gasto_atual - a.gasto_atual).slice(0, 3));
const temOrcamento = computed(() => orcamentoItens.value.length > 0);
// Faixas do orçamento: tranquilo (frio) → atenção (âmbar) → estourando (quente)
function faixa(pct) {
  if (pct >= 100) return { de: 'var(--saida-carmim-medio)', ate: 'var(--saida-vermelho-medio)', nivel: 'alto' };
  if (pct >= 90) return { de: 'var(--saida-ambar-medio)', ate: 'var(--saida-carmim-medio)', nivel: 'alto' };
  if (pct >= 70) return { de: 'var(--saida-ambar-medio)', ate: 'var(--saida-brasa-medio)', nivel: 'medio' };
  return { de: 'var(--entrada-ceu-medio)', ate: 'var(--entrada-royal-medio)', nivel: 'baixo' };
}

// --- Dívidas ----------------------------------------------------------------
const faturasCartoes = computed(() => dados.value?.faturasCartoes || { total: 0, itens: [] });
const urgentes = computed(() => dados.value?.dividasUrgentes || []);
const totalUrgentes = computed(() => urgentes.value.reduce((s, d) => s + d.valor, 0) + faturasCartoes.value.total);
const maioresDividas = computed(() => [...(dados.value?.dividasPrioritarias || [])].sort((a, b) => b.valor - a.valor));
const maiorValorDivida = computed(() => (maioresDividas.value.length ? Math.max(...maioresDividas.value.map((d) => d.valor)) : 1));

// --- Atividade recente: mesma linha das outras listas (LinhaTransacao, anotação 53) ------------
function infoDe(t) { return infoTransacao(t, { categorias: categorias.value, receitas: infoReceitas.value }); }

// --- Parallax do orbe: sobe mais devagar que a página; sem movimento = rola junto -----
const deslocamento = ref(0);
let rafRolagem = 0;
function semMovimento() {
  return (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anim-lenta')) || 0) === 0;
}
function aoRolar() {
  if (rafRolagem) return;
  rafRolagem = requestAnimationFrame(() => {
    rafRolagem = 0;
    deslocamento.value = semMovimento() ? 0 : Math.min(Math.max(window.scrollY, 0), 900) * 0.42;
  });
}
onMounted(() => window.addEventListener('scroll', aoRolar, { passive: true }));
onBeforeUnmount(() => { window.removeEventListener('scroll', aoRolar); cancelAnimationFrame(rafRolagem); });

// --- Carregamento -----------------------------------------------------------
let senha = 0;
async function carregar() {
  const minha = ++senha;
  const chave = periodo.value.chave;
  atualizando.value = !carregando.value;
  try {
    const rd = await fetch(`/api/dashboard?mes=${chave}`, { credentials: 'include' });
    if (rd.status === 401) { router.push('/login'); return; }
    const json = await rd.json();
    if (minha !== senha) return;
    dados.value = json;
    carregando.value = false;
    // atividade recente: o que já aconteceu no período escolhido
    try {
      const rt = await fetch(`/api/transacoes${anoInteiro.value ? '' : `?mes=${chave}`}`, { credentials: 'include' });
      if (rt.ok && minha === senha) {
        const hoje = new Date().toISOString().slice(0, 10);
        atividade.value = ((await rt.json()).transacoes || []).filter((t) => !t.ignorada && t.data <= hoje).slice(0, 4);
      }
    } catch { /* sem atividade recente: o bloco mostra o aviso vazio */ }
  } finally {
    if (minha === senha) atualizando.value = false;
  }
}

watch(() => periodo.value.chave, carregar);
watch(lancamentoSalvo, () => carregar());
onMounted(async () => {
  carregar();
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    if (r.ok) nome.value = (await r.json()).nome || '';
  } catch { /* sem nome: saudação genérica */ }
  try {
    const r = await fetch('/api/transacoes/resumo-receitas', { credentials: 'include' });
    if (r.ok) infoReceitas.value = await r.json();
  } catch { /* sem ícones de entrada: usa o ícone padrão */ }
});
</script>

<template>
  <div v-if="!carregando && dados" v-deslizar-mes class="pagina" :class="{ atualizando }">
    <!-- Orbe solto no topo, fora de qualquer card, com parallax sutil ao rolar -->
    <section class="palco" aria-label="Saldo do período">
      <div class="palco-textos">
        <span class="pequena">{{ saudacao }}<template v-if="primeiroNome">, {{ primeiroNome }}</template></span>
        <span class="linha-valor">
          <strong class="palco-valor" :class="{ negativo: saldoDoMes < 0 }"><DashNumero :valor="saldoDoMes" /></strong>
          <BotaoOlho class="olho-valor" :tamanho="36" />
        </span>
        <span class="palco-rotulo">{{ rotuloSaldoPeriodo }} <span class="periodo">· {{ intervaloTxt || rotuloPeriodo }}</span></span>
      </div>
      <div class="palco-orbe" :style="{ transform: `translate3d(0, ${deslocamento.toFixed(1)}px, 0)` }">
        <Orbe :partes="partesOrbe" :tamanho="460" />
        <ul class="legenda-orbe">
          <li><i class="ponto entrada"></i><span>Entradas</span><b class="numero-tabular"><Valor :valor="entradasDoMes" /></b><small>{{ pctDe(entradasDoMes) }}%</small></li>
          <li><i class="ponto saida"></i><span>Saídas</span><b class="numero-tabular"><Valor :valor="despesasDoMes" /></b><small>{{ pctDe(despesasDoMes) }}%</small></li>
        </ul>
      </div>
    </section>

    <!-- Primeiro bloco: passa por cima do orbe ao rolar -->
    <div class="folha">
      <CabecalhoPagina titulo="Início" cor="var(--entrada-cobalto-medio)">
        <template #corpo>
      <div v-deslizar-mes class="corpo-mes">
      <div class="grade">
        <!-- 1. Saldo + ações rápidas ----------------------------------------- -->
        <div class="coluna">
          <div class="card-patrimonio" @click="abrirPatrimonio">
          <TopoValor tema="entrada" :variante="1" rotulo="Patrimônio líquido" :valor="patrimonio"
            :linhas="[{ rotulo: 'Saldo nas contas', valor: saldoContas }, { rotulo: '+ Reserva de Liberdade', valor: valorReserva }, { rotulo: '− Faturas abertas', valor: totalFaturasAbertas }, { rotulo: '− Dívidas', valor: totalDividas }]">
            <button type="button" class="dica-patrimonio" aria-label="Patrimônio líquido: ver os detalhes" aria-haspopup="dialog" @click.stop="patrimonioAberto = true">
              Toque para ver os detalhes<ChevronRight :size="14" :stroke-width="2" aria-hidden="true" />
            </button>
            <template #acoes>
              <BarraAcoes compacto :colunas="4">
                <BotaoAcao compacto :icone="Plus" rotulo="Adicionar" tema="entrada" destaque :aria-expanded="menuAdd" @click="menuAdd = !menuAdd" />
                <BotaoAcao compacto :icone="CreditCard" rotulo="Cartões" tema="entrada" @click="ir('/cartoes')" />
                <BotaoAcao compacto :icone="Landmark" rotulo="Dívidas" tema="entrada" @click="ir('/dividas')" />
                <BotaoAcao compacto :icone="ChartColumn" rotulo="Relatórios" tema="entrada" @click="ir('/relatorios')" />
              </BarraAcoes>
            </template>
          </TopoValor>
          </div>
          <PatrimonioDetalhe :aberto="patrimonioAberto" @fechar="patrimonioAberto = false" />
          <transition name="desce">
            <div v-if="menuAdd" class="escolha-add">
              <button type="button" class="chip entrada" @click="menuAdd = false; abrirLancamento({ tipo: 'entrada' })"><ArrowDown :size="18" :stroke-width="2" />Lançar entrada</button>
              <button type="button" class="chip saida" @click="menuAdd = false; abrirLancamento({ tipo: 'saida' })"><ArrowUp :size="18" :stroke-width="2" />Lançar saída</button>
            </div>
          </transition>
        </div>

        <!-- 1b. Dinheiro nas contas + previsão do saldo (anotação 51) -->
        <PrevisaoSaldo />

        <!-- 2. Atividade recente ---------------------------------------------- -->
        <section class="cartao">
          <div class="cabeca"><h2>Atividade recente</h2><button type="button" class="link" @click="ir('/transacoes')">Ver tudo</button></div>
          <ul v-if="atividade.length" class="lista">
            <li v-for="t in atividade" :key="t.id" class="item-tx">
              <LinhaTransacao :t="t" :info="infoDe(t)" rotulo-abrir="ver em Transações" @abrir="ir('/transacoes')" />
            </li>
          </ul>
          <p v-else class="nota">Nenhuma movimentação neste período.</p>
        </section>

        <!-- 3. Orçamento por categoria (lista com barras em degradê) --------- -->
        <section v-if="temOrcamento" class="cartao">
          <div class="cabeca"><h2>Orçamento por categoria</h2><button type="button" class="link" @click="ir('/orcamento')">Ver todas as categorias</button></div>
          <p v-if="!comTeto.length" class="nota">Nenhum gasto com teto definido neste período.</p>
          <ul v-else class="orcamento">
            <li v-for="c in comTeto" :key="c.id" class="orc-item" :class="faixa(c.pct).nivel" tabindex="0" role="button" :aria-label="`${c.nome}: ${c.pct}% do orçamento`" @click="ir('/orcamento')" @keydown.enter="ir('/orcamento')">
              <span class="icone-cat" :style="{ '--c': c.cor }" aria-hidden="true">
                <img v-if="ehImagem(c.icone)" :src="c.icone" alt="" />
                <IconeCat v-else :chave="chaveFinalCategoria(c.icone, 'saida')" :tamanho="20" />
              </span>
              <span class="orc-corpo">
                <span class="orc-topo"><span class="descricao">{{ c.nome }}</span><b class="orc-pct numero-tabular">{{ c.pct }}%</b></span>
                <BarraDegrade :pct="c.pct" :de="faixa(c.pct).de" :ate="faixa(c.pct).ate" :altura="9" :marcador="false" />
                <span class="orc-base numero-tabular">
                  <span>{{ moeda(c.gasto_atual) }} de {{ moeda(c.teto) }}</span>
                  <span :class="{ estourou: c.restante < 0 }">{{ c.restante >= 0 ? `restam ${moeda(c.restante)}` : `estourou em ${moeda(-c.restante)}` }}</span>
                </span>
              </span>
            </li>
          </ul>
          <ul v-if="semTeto.length" class="lista sem-teto">
            <li v-for="c in semTeto" :key="c.id" class="linha" tabindex="0" role="button" :aria-label="`${c.nome}, sem teto definido`" @click="ir('/orcamento')" @keydown.enter="ir('/orcamento')">
              <span class="icone-cat" :style="{ '--c': c.cor }" aria-hidden="true">
                <img v-if="ehImagem(c.icone)" :src="c.icone" alt="" />
                <IconeCat v-else :chave="chaveFinalCategoria(c.icone, 'saida')" :tamanho="20" />
              </span>
              <span class="textos"><span class="descricao">{{ c.nome }}</span><span class="secundario">sem teto definido</span></span>
              <span class="valor numero-tabular">{{ moeda(c.gasto_atual) }}</span>
            </li>
          </ul>
        </section>

        <!-- 4. Gastos por categoria (rosca) ------------------------------------- -->
        <section class="cartao">
          <div class="cabeca">
            <h2>{{ abaRosca === 'saidas' ? 'Gastos por categoria' : 'Entradas por categoria' }}</h2>
            <div :class="['abas', abaRosca === 'saidas' ? 'tema-saida' : 'tema-entrada']" role="tablist">
              <button type="button" role="tab" :aria-selected="abaRosca === 'saidas'" :class="{ ativa: abaRosca === 'saidas' }" @click="abaRosca = 'saidas'">Saídas</button>
              <button type="button" role="tab" :aria-selected="abaRosca === 'entradas'" :class="{ ativa: abaRosca === 'entradas' }" @click="abaRosca = 'entradas'">Entradas</button>
            </div>
          </div>
          <DashRosca
            :key="abaRosca + periodo.chave"
            :segmentos="segmentosRosca"
            :rotulo-total="abaRosca === 'saidas' ? 'gasto total' : 'entrou'"
            :rotulo-vazio="abaRosca === 'saidas' ? 'Nenhuma despesa categorizada neste período.' : 'Nenhuma entrada neste período.'"
            @clicar="ir(abaRosca === 'saidas' ? '/orcamento' : '/transacoes')"
          />
        </section>

        <div class="coluna">
          <!-- 5. Reserva de Liberdade ---------------------------------------------- -->
          <section v-if="reserva" class="cartao reserva" role="button" tabindex="0" @click="ir('/objetivos')" @keydown.enter="ir('/objetivos')">
            <div class="cabeca"><h2 class="titulo-reserva"><ShieldCheck :size="20" :stroke-width="2" />Reserva de Liberdade</h2><ChevronRight :size="18" :stroke-width="2" class="seta" /></div>
            <strong class="reserva-valor"><DashNumero :valor="reserva.total" /></strong>
            <template v-if="reserva.proximaMeta">
              <div class="reserva-meta">
                <span class="descricao meta-nome"><IconeCategoria :valor="reserva.proximaMeta.icone || '🎯'" tipo="meta" :tamanho="26" /> {{ reserva.proximaMeta.nome }}</span>
                <b class="numero-tabular">{{ reserva.proximaMeta.pct }}%</b>
              </div>
              <BarraDegrade :pct="reserva.proximaMeta.pct" de="var(--meta-violeta-medio)" ate="var(--meta-violeta-claro)" :altura="12" />
            </template>
            <span v-else class="nota">Nenhuma meta criada ainda.</span>
            <small v-if="reserva.aportesMes > 0" class="nota">+ {{ moedaTotal(reserva.aportesMes) }} guardados {{ palavraPeriodo }}</small>
          </section>

          <!-- 6. Dívidas que pedem urgência ----------------------------------------- -->
          <section v-if="urgentes.length || faturasCartoes.itens.length" class="cartao">
            <div class="cabeca"><h2>Dívidas urgentes</h2><b class="numero-tabular c-saida"><Valor :valor="totalUrgentes" /></b></div>
            <ul class="lista">
              <li v-if="faturasCartoes.itens.length" class="linha" tabindex="0" role="button" @click="ir('/dividas')" @keydown.enter="ir('/dividas')">
                <span class="icone-cat aviso" aria-hidden="true"><CreditCard :size="19" :stroke-width="2" /></span>
                <span class="textos"><span class="descricao">Faturas dos cartões</span><span class="secundario">{{ faturasCartoes.itens.length }} {{ faturasCartoes.itens.length === 1 ? 'cartão' : 'cartões' }}</span></span>
                <span class="valor numero-tabular"><Valor :valor="faturasCartoes.total" /></span>
              </li>
              <li v-for="d in urgentes" :key="d.id" class="linha" tabindex="0" role="button" @click="ir('/dividas')" @keydown.enter="ir('/dividas')">
                <span class="icone-cat" :class="d.urgencia === 'vermelho' ? 'perigo' : 'aviso'" aria-hidden="true"><TriangleAlert :size="19" :stroke-width="2" /></span>
                <span class="textos"><span class="descricao">{{ d.nome }}</span><span class="secundario">{{ rotuloUrgencia[d.urgencia] }}</span></span>
                <span class="valor numero-tabular">{{ moeda(d.valor) }}</span>
              </li>
            </ul>
          </section>
        </div>

        <!-- 7. Maiores dívidas / Alertas --------------------------------------------- -->
        <section class="cartao">
          <div class="cabeca"><h2>Maiores dívidas</h2><button type="button" class="link" @click="ir('/dividas')">Abrir Dívidas</button></div>
          <ul v-if="maioresDividas.length" class="ranking">
            <li v-for="d in maioresDividas" :key="d.id" tabindex="0" @click="ir('/dividas')" @keydown.enter="ir('/dividas')">
              <span class="rk-topo"><span class="descricao">{{ d.nome }}</span><b class="numero-tabular">{{ moeda(d.valor) }}</b></span>
              <BarraDegrade :pct="(d.valor / maiorValorDivida) * 100" de="var(--saida-ambar-medio)" ate="var(--saida-carmim-medio)" :altura="8" :marcador="false" />
            </li>
          </ul>
          <p v-else class="nota">Nenhuma dívida cadastrada.</p>
        </section>

        <section class="cartao">
          <h2>Alertas</h2>
          <ul v-if="dados.alertas.length" class="lista">
            <li v-for="(alerta, i) in dados.alertas" :key="i" class="linha parado">
              <span class="icone-cat aviso" aria-hidden="true"><TriangleAlert :size="19" :stroke-width="2" /></span>
              <span class="textos"><span class="descricao quebra">{{ alerta.mensagem }}</span></span>
            </li>
          </ul>
          <p v-else class="ok"><CircleCheck :size="18" :stroke-width="2" />Tudo em ordem: nenhum alerta no momento.</p>
        </section>
      </div>
      </div>
        </template>
      </CabecalhoPagina>
    </div>
  </div>
</template>

<style scoped>
.pagina { display: flex; flex-direction: column; max-width: 1100px; transition: opacity var(--anim-padrao) ease; }
.pagina.atualizando { opacity: 0.65; }
/* Card de patrimônio: tocar abre o detalhe (anotação 60); a dica é discreta, em branco translúcido sobre o degradê */
.card-patrimonio { cursor: pointer; }
.dica-patrimonio {
  display: inline-flex; align-items: center; gap: 2px; align-self: flex-start; margin: 2px 0 0; padding: 4px 0; min-height: 28px;
  background: none; border: 0; font: inherit; font-size: 0.72rem; color: color-mix(in srgb, var(--cor-sobre-cor) 78%, transparent); cursor: pointer;
}
.dica-patrimonio:hover { color: var(--cor-sobre-cor); }
.dica-patrimonio:focus-visible { outline: 2px solid var(--cor-sobre-cor); outline-offset: 2px; border-radius: 6px; }
.so-leitor { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; margin: 0; }

/* Palco do orbe: solto no topo, sem card. O bloco do orbe desce mais devagar que a rolagem (parallax) */
.palco { position: relative; z-index: 0; display: flex; flex-direction: column; align-items: center; gap: 0; padding-top: 0; }
.palco-textos { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0; }
.palco .pequena { font-size: 14px; color: var(--cor-texto-suave); }
.palco-rotulo { font-size: 14px; font-weight: 600; margin-top: 12px; letter-spacing: 0.01em; }
.periodo { font-weight: 400; color: var(--cor-texto-suave); display: inline-block; }
.periodo::first-letter { text-transform: uppercase; }
.palco-valor { font-family: var(--fonte-display); font-size: clamp(32px, 9vw, 46px); line-height: 1.1; margin-top: 2px; overflow-wrap: anywhere; }
.palco-valor.negativo { color: var(--cor-saida); }
/* olho de ocultar valores junto do valor principal (anotação 35); fica à direita sem deslocar o número do centro */
.linha-valor { position: relative; display: inline-flex; align-items: center; justify-content: center; }
.olho-valor { position: absolute; left: 100%; top: 50%; transform: translateY(-50%); margin-left: 6px; }
.palco-orbe { width: 100%; max-width: 420px; will-change: transform; padding-bottom: 4px; margin-top: 4px; }
.legenda-orbe { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 22px; font-size: 13px; color: var(--cor-texto-suave); }
.legenda-orbe li { display: inline-flex; align-items: center; gap: 7px; }
.legenda-orbe b { color: var(--cor-texto); font-weight: 600; }
.ponto { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.ponto.entrada { background: var(--cor-entrada); }
.ponto.saida { background: var(--cor-saida); }
@media (max-width: 480px) { .palco-orbe { width: calc(100% + 32px); max-width: none; margin-inline: -16px; } }

/* Folha: cobre o orbe ao rolar (mesma cor do fundo da página: acima da aba não há fundo visível) */
.folha { position: relative; z-index: 1; background: var(--cor-fundo); padding: 8px 0 0; min-height: 80vh; }
.corpo-mes { display: flex; flex-direction: column; gap: 12px; }

/* Grade sem buracos: colunas balanceadas (celular = 1 coluna; PC = 2). Cada card entra inteiro, sem espaços vazios entre eles */
.grade { column-count: 1; column-gap: 16px; }
@media (min-width: 900px) { .grade { column-count: 2; } }
.grade > * { break-inside: avoid; margin-bottom: 12px; display: flex; flex-direction: column; }
.grade > .coluna { gap: 12px; }
.coluna { min-width: 0; }

/* Cartões: molde da página Objetivos */
.cartao { background: var(--cor-card); border: 1px solid var(--cor-card-borda); border-radius: var(--raio-card, 16px); padding: 16px 18px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.cartao h2 { font-family: var(--fonte-display); font-size: 16px; margin: 0; }
.cabeca { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.nota { font-size: 13px; color: var(--cor-texto-suave); margin: 0; }
.link { background: none; border: none; color: var(--cor-primaria); font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; min-height: 32px; display: inline-flex; align-items: center; gap: 2px; font-family: inherit; }
.link:hover { text-decoration: underline; }
.c-saida { color: var(--cor-saida-texto); }
.ok { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 14px; color: var(--cor-investimento); }

/* Escolha do tipo de lançamento (abre pelo botão Adicionar do card de saldo) */
.escolha-add { display: flex; gap: 10px; flex-wrap: wrap; }
.chip { flex: 1 1 140px; min-height: 48px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-family: var(--fonte-texto); font-size: 14px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--c); color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); }
.chip.entrada { --c: var(--cor-entrada); }
.chip.saida { --c: var(--cor-saida-texto); }
.desce-enter-active, .desce-leave-active { transition: opacity var(--anim-padrao) ease, transform var(--anim-padrao) var(--anim-curva); }
.desce-enter-from, .desce-leave-to { opacity: 0; transform: translateY(-6px); }

/* Linhas de lista: mesma estrutura da lista de Transações (ícone da categoria, textos, valor) */
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.linha {
  display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 12px;
  padding: 7px 4px; min-height: 50px; border-radius: 12px; cursor: pointer; transition: background var(--anim-rapida) ease; -webkit-tap-highlight-color: transparent;
}
.linha:hover, .linha:focus-visible { background: var(--cor-realce); outline: none; }
.linha.parado { cursor: default; grid-template-columns: 40px minmax(0, 1fr); }
.linha.parado:hover { background: none; }
.icone-cat {
  width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-size: 19px; line-height: 1; overflow: hidden; flex: none;
  color: var(--c, var(--cor-texto-suave)); background: color-mix(in srgb, var(--c, var(--cor-texto-suave)) 18%, transparent);
}
.icone-cat.neutra { color: var(--cor-texto-suave); background: var(--cor-realce); }
.icone-cat.aviso { --c: var(--cor-amarelo); }
.icone-cat.perigo { --c: var(--cor-saida); }
.icone-cat img { width: 100%; height: 100%; object-fit: cover; }
.textos { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.descricao { font-size: 15px; font-weight: 600; color: var(--cor-texto); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.descricao.quebra { white-space: normal; font-weight: 500; font-size: 14px; }
.secundario { font-size: 12px; color: var(--cor-texto-suave); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sep { margin: 0 5px; }
.valor { font-family: var(--fonte-display); font-weight: 600; font-size: 15px; white-space: nowrap; text-align: right; }
.valor.positivo { color: var(--cor-entrada); }
.valor.negativo { color: var(--cor-saida); }
.valor.neutro { color: var(--cor-texto-suave); }

/* Orçamento por categoria: lista com barras em degradê (frio → âmbar → quente conforme a faixa) */
.orcamento { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr; gap: 4px; }
.orc-item { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 12px; align-items: start; padding: 7px 4px; border-radius: 14px; cursor: pointer; transition: background var(--anim-rapida) ease; min-width: 0; }
.orc-item:hover, .orc-item:focus-visible { background: var(--cor-realce); outline: none; }
.orc-corpo { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.orc-topo { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.orc-pct { font-family: var(--fonte-display); font-size: 15px; }
.orc-item.alto .orc-pct { color: var(--cor-saida-texto); }
.orc-item.medio .orc-pct { color: var(--cor-amarelo); }
.orc-base { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--cor-texto-suave); }
.orc-base .estourou { color: var(--cor-grave-clara, var(--cor-saida)); }
.sem-teto { border-top: 1px dashed var(--cor-borda); padding-top: 10px; }

/* Abas Saídas | Entradas: botão ativo em degradê */
.abas { display: inline-flex; padding: 3px; border-radius: 12px; background: var(--cor-fundo); border: 1px solid var(--cor-borda); }
.abas button { min-height: 36px; padding: 0 14px; border: none; border-radius: 9px; background: none; color: var(--cor-texto-suave); font-family: var(--fonte-texto); font-size: 13px; font-weight: 600; cursor: pointer; transition: background var(--anim-padrao) ease, color var(--anim-padrao) ease; }
.abas button.ativa { background: var(--tema-degrade); color: var(--cor-sobre-cor); }

/* Reserva de Liberdade (na cor das metas) */
.cartao.reserva { cursor: pointer; border-color: color-mix(in srgb, var(--cor-meta) 45%, var(--cor-borda)); background: linear-gradient(160deg, var(--cor-meta-fundo), var(--cor-card) 70%); }
.cartao.reserva:focus-visible { outline: 2px solid var(--cor-meta); outline-offset: 2px; }
.titulo-reserva { display: inline-flex; align-items: center; gap: 8px; color: var(--cor-meta-clara); }
:root[data-theme='light'] .titulo-reserva { color: var(--cor-meta); }
.cartao.reserva .seta { color: var(--cor-texto-suave); }
.reserva-valor { font-family: var(--fonte-display); font-size: 28px; }
.reserva-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 14px; }
.meta-nome { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.reserva-meta b { color: var(--cor-meta-clara); }
:root[data-theme='light'] .reserva-meta b { color: var(--cor-meta); }

/* Ranking de dívidas */
.ranking { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ranking li { display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 14px; cursor: pointer; min-height: 44px; transition: background var(--anim-rapida) ease; }
.ranking li:hover, .ranking li:focus-visible { background: var(--cor-realce); outline: none; }
.rk-topo { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
.rk-topo .descricao { font-weight: 500; font-size: 14px; }

@media (max-width: 480px) {
  .cartao { padding: 14px 12px; }
}
</style>
