<script setup>
// Versão 1.0 (modelo unificado, homologação seção 8): página Compromissos em BLOCOS no lugar das abas.
//   1. card de topo "Total a pagar" = faturas abertas (não pagas) + parcelas de dívidas do mês (visual discreto, seção 2);
//   2. Crédito: cartões, cartões de loja e crediários com a fatura aberta + "Ver todos" (/cartoes);
//   3. Dívidas: as 3 mais urgentes/caras + "Ver todas" (/dividas);
//   4. Futuros: parcelas dos próximos meses, resumidas por mês (fora do total; mesmo número do Patrimônio).
// No PC (≥ 1100 px) os blocos ficam lado a lado (seção 17).
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronRight, CreditCard, ReceiptText, CalendarClock } from 'lucide-vue-next';
import TopoValor from '../components/TopoValor.vue';
import CardPadrao from '../components/CardPadrao.vue';
import IconeBanco from '../components/IconeBanco.vue';
import Valor from '../components/Valor.vue';
import BarraAcoes from '../components/BarraAcoes.vue';
import BotaoAcao from '../components/BotaoAcao.vue';

const router = useRouter();
const cartoes = ref([]);
const dividas = ref([]);
const resumo = ref(null);
const futuros = ref({ total: 0, itens: [] });
const carregando = ref(true);

const pegar = (u) => fetch(u, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
onMounted(async () => {
  const [c, d, r, p] = await Promise.all([pegar('/api/cartoes'), pegar('/api/dividas'), pegar('/api/dividas/resumo'), pegar('/api/patrimonio')]);
  cartoes.value = c || []; dividas.value = (d || []).filter((x) => x.saldo > 0); resumo.value = r; futuros.value = p?.compromissos || { total: 0, itens: [] };
  carregando.value = false;
});

const abertas = computed(() => cartoes.value.filter((c) => c.faturaAberta && !c.faturaAberta.paga && c.faturaAberta.total > 0));
const totalFaturas = computed(() => abertas.value.reduce((s, c) => s + c.faturaAberta.total, 0));
const parcelasMes = computed(() => resumo.value?.parcelasMes || 0);
const totalPagar = computed(() => Math.round((totalFaturas.value + parcelasMes.value) * 100) / 100);

const TIPO = { cartao: 'Cartão de crédito', loja: 'Cartão de loja', crediario: 'Crediário', cheque: 'Cheque especial' };
const tipoDe = (c) => TIPO[c.tipoCredito] || 'Cartão de crédito';
const dataCurta = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') : '');
function situacaoFatura(c) {
  const f = c.faturaAberta;
  if (!f) return 'sem fatura';
  if (f.paga) return 'paga';
  const dias = Math.ceil((new Date(f.vence + 'T12:00:00') - new Date()) / 86400000);
  if (dias < 0) return 'vencida';
  return `fatura vence ${dataCurta(f.vence)}`;
}
const cartoesOrdenados = computed(() => [...cartoes.value].sort((a, b) => (b.faturaAberta?.total || 0) - (a.faturaAberta?.total || 0)));
const principaisDividas = computed(() => dividas.value.slice(0, 3));

const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesesFuturos = computed(() => {
  const mapa = new Map();
  (futuros.value.itens || []).forEach((i) => { const k = String(i.fatura || '').slice(0, 7); if (!k) return; mapa.set(k, (mapa.get(k) || 0) + (Number(i.valor) || 0)); });
  return [...mapa.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => ({ chave: k, rotulo: `${NOMES_MES[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`, valor: Math.round(v * 100) / 100 }));
});
const todosFuturos = ref(false);
const futurosVisiveis = computed(() => (todosFuturos.value ? mesesFuturos.value : mesesFuturos.value.slice(0, 3)));
const maxFuturo = computed(() => Math.max(1, ...mesesFuturos.value.map((m) => m.valor)));
</script>

<template>
  <div class="pag-compromissos">
    <TopoValor tema="saida" :variante="3" rotulo="Total a pagar" periodo="este mês" :valor="totalPagar" sinal="none"
      :linhas="[{ rotulo: 'Faturas abertas', valor: totalFaturas }, { rotulo: 'Parcelas de dívidas do mês', valor: parcelasMes }]">
      <template #acoes>
        <BarraAcoes compacto :colunas="2" rotulo="Ações de compromissos">
          <BotaoAcao compacto :icone="CreditCard" rotulo="Cartões" @click="router.push('/cartoes')" />
          <BotaoAcao compacto :icone="ReceiptText" rotulo="Dívidas" @click="router.push('/dividas')" />
        </BarraAcoes>
      </template>
    </TopoValor>

    <div class="blocos-comp">
      <!-- 2. Crédito -->
      <CardPadrao class="bloco-comp" titulo="Crédito" data-bloco-credito>
        <p v-if="carregando" class="vazio">Carregando…</p>
        <ul v-else-if="cartoesOrdenados.length" class="linhas">
          <li v-for="c in cartoesOrdenados.slice(0, 4)" :key="c.id">
            <button type="button" class="linha" @click="router.push(`/cartoes/${c.id}/extrato`)">
              <IconeBanco :icone="c.icone || ''" :nome="c.nome" :tamanho="36" padrao="💳" />
              <span class="l-nome">{{ c.nome }}<small>{{ situacaoFatura(c) }}<template v-if="c.tipoCredito && c.tipoCredito !== 'cartao'"> · {{ tipoDe(c) }}</template></small></span>
              <b class="numero-tabular" :class="{ alerta: situacaoFatura(c) === 'vencida' }"><Valor :valor="c.faturaAberta?.total || 0" /></b>
            </button>
          </li>
        </ul>
        <p v-else class="vazio">Nenhum cartão ou crediário cadastrado.</p>
        <button type="button" class="ver-todas" @click="router.push('/cartoes')">{{ cartoes.length ? `Ver todos (${cartoes.length})` : 'Cadastrar' }}<ChevronRight :size="16" :stroke-width="2" /></button>
      </CardPadrao>

      <!-- 3. Dívidas -->
      <CardPadrao class="bloco-comp" titulo="Dívidas" data-bloco-dividas>
        <p v-if="carregando" class="vazio">Carregando…</p>
        <ul v-else-if="principaisDividas.length" class="linhas">
          <li v-for="d in principaisDividas" :key="d.id">
            <button type="button" class="linha" @click="router.push('/dividas')">
              <span class="selo-risco" :class="d.urgencia" aria-hidden="true"></span>
              <span class="l-nome">{{ d.nome }}<small>{{ d.situacao_rotulo || d.origem_rotulo }}<template v-if="d.valor_parcela"> · parcela <Valor :valor="d.valor_parcela" /></template></small></span>
              <b class="numero-tabular"><Valor :valor="d.saldo" /></b>
            </button>
          </li>
        </ul>
        <p v-else class="vazio">Nenhuma dívida em aberto.</p>
        <button v-if="dividas.length" type="button" class="ver-todas" @click="router.push('/dividas')">Ver todas ({{ dividas.length }})<ChevronRight :size="16" :stroke-width="2" /></button>
      </CardPadrao>

      <!-- 4. Futuros -->
      <CardPadrao class="bloco-comp futuros" titulo="Futuros" subtitulo="Parcelas dos próximos meses · fora do total" data-bloco-futuros>
        <ul v-if="futurosVisiveis.length" class="linhas meses">
          <li v-for="m in futurosVisiveis" :key="m.chave" class="mes">
            <CalendarClock :size="17" :stroke-width="2" aria-hidden="true" />
            <span class="m-rotulo">{{ m.rotulo }}</span>
            <span class="m-barra" aria-hidden="true"><i :style="{ width: Math.round((m.valor / maxFuturo) * 100) + '%' }"></i></span>
            <b class="numero-tabular"><Valor :valor="m.valor" /></b>
          </li>
        </ul>
        <p v-else-if="!carregando" class="vazio">Nenhuma parcela futura.</p>
        <button v-if="mesesFuturos.length > 3" type="button" class="ver-todas" :aria-expanded="todosFuturos" @click="todosFuturos = !todosFuturos">{{ todosFuturos ? 'Ver menos' : `Ver todos (${mesesFuturos.length})` }}<ChevronRight :size="16" :stroke-width="2" :class="{ girado: todosFuturos }" /></button>
      </CardPadrao>
    </div>
  </div>
</template>

<style scoped>
.pag-compromissos { display: flex; flex-direction: column; gap: 14px; max-width: 1200px; margin: 0 auto; width: 100%; padding: 4px 16px 24px; }
.blocos-comp { display: flex; flex-direction: column; gap: 14px; }
.bloco-comp { gap: 10px; }
.linhas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.linha { width: 100%; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: 10px; align-items: center; min-height: 56px; padding: 6px 6px; border: 0; border-radius: 12px; background: none; color: var(--cor-texto); text-align: left; font: inherit; cursor: pointer; }
.linha:hover { background: var(--cor-realce); }
.l-nome { display: flex; flex-direction: column; min-width: 0; font-weight: 600; font-size: 14.5px; }
.l-nome, .l-nome small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.l-nome small { font-weight: 400; font-size: 12.5px; color: var(--cor-texto-suave); }
.alerta { color: var(--cor-alerta-texto, var(--cor-alerta)); }
.selo-risco { width: 12px; height: 12px; border-radius: 50%; justify-self: center; background: var(--cor-zero); }
.selo-risco.amarelo { background: var(--cor-amarelo); }
.selo-risco.vermelho { background: var(--cor-saida); }
.mes { display: grid; grid-template-columns: 20px 70px minmax(0, 1fr) auto; gap: 10px; align-items: center; min-height: 40px; color: var(--cor-texto-suave); }
.m-rotulo { color: var(--cor-texto); font-size: 14px; text-transform: capitalize; }
.m-barra { height: 6px; border-radius: 999px; background: var(--cor-trilho, var(--cor-realce)); overflow: hidden; }
.m-barra i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--saida-ambar-medio), var(--saida-carmim-medio)); }
.mes b { color: var(--cor-texto); font-size: 14px; }
.vazio { margin: 4px 0; color: var(--cor-texto-suave); font-size: 14px; }
.ver-todas { align-self: center; display: inline-flex; align-items: center; gap: 2px; min-height: 40px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-primaria); font: 600 13.5px var(--fonte-texto); cursor: pointer; }
.ver-todas:hover { background: var(--cor-realce); }
.ver-todas .girado { transform: rotate(90deg); }
@media (min-width: 1100px) {
  .blocos-comp { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
  .blocos-comp .futuros { grid-column: 1 / -1; }
}
</style>
