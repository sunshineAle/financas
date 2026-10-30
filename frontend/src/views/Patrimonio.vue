<script setup>
// Versão 1.0 (modelo unificado): página Patrimônio (rodapé). Pedido do usuário (30/10, 06h17–06h18):
// - mesmo padrão visual das outras páginas (TopoValor + CardPadrao, linhas iguais às de Transações), sem botões nem abas no topo;
// - Patrimônio é SÓ o que a pessoa tem: Contas, Reserva e metas, Investimentos. Faturas, dívidas e parcelas futuras ficam
//   em Compromissos (o card de topo só mostra o total dos passivos para explicar o líquido, com o link para lá);
// - cada bloco abre PARA BAIXO ao tocar (no bloco ou na setinha) e mostra o detalhe; o link "Acessar …" leva à página.
// Números: GET /api/patrimonio (o mesmo cálculo do Início). Detalhe das metas: /api/reserva; dos ativos: /api/investimentos.
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronDown, ChevronRight, ChartPie, ChartBar, Landmark, Target, TrendingUp, CreditCard, ReceiptText, TriangleAlert } from 'lucide-vue-next';
import AbasSeletor from '../components/AbasSeletor.vue';
import { ehTelaLarga } from '../services/layout.js';
import TopoValor from '../components/TopoValor.vue';
import CardPadrao from '../components/CardPadrao.vue';
import DashRosca from '../components/DashRosca.vue';
import RelBarrasH from '../components/RelBarrasH.vue';
import Anel from '../components/Anel.vue';
import Valor from '../components/Valor.vue';
import IconeBanco from '../components/IconeBanco.vue';
import IconeCategoria from '../components/IconeCategoria.vue';

const router = useRouter();
const pat = ref(null);
const metas = ref([]);
const ativos = ref([]);
const erro = ref('');
const grafico = ref('rosca');
const abertos = ref({ contas: true, faturas: true });
// Abas Ativos | Passivos como antes (decisão de 30/10, 07h31); no PC (≥ 1100 px) os dois lados ficam lado a lado.
const lado = ref('ativos');
const ABAS = [{ id: 'ativos', rotulo: 'Ativos' }, { id: 'passivos', rotulo: 'Passivos' }];
const ladosVisiveis = computed(() => (ehTelaLarga.value ? ['ativos', 'passivos'] : [lado.value]));

const pegar = (u) => fetch(u, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
onMounted(async () => {
  const [p, r, i] = await Promise.all([pegar('/api/patrimonio'), pegar('/api/reserva'), pegar('/api/investimentos')]);
  if (!p) { erro.value = 'Não deu para carregar o patrimônio agora. Tente de novo.'; return; }
  pat.value = p; metas.value = r?.metas || []; ativos.value = (i?.ativos || []).filter((a) => !a.encerrado && (a.valor_atual || 0) > 0);
});

const blocoDe = (chave) => (pat.value?.ativos || []).find((b) => b.chave === chave) || { total: 0, itens: [] };
const contas = computed(() => blocoDe('contas'));
const reserva = computed(() => blocoDe('reserva'));
const totalInvest = computed(() => Math.round((blocoDe('renda_fixa').total + blocoDe('renda_variavel').total) * 100) / 100);
const totalAtivos = computed(() => pat.value?.totalAtivos || 0);
const pct = (v) => (totalAtivos.value > 0 ? Math.round((v / totalAtivos.value) * 100) : 0);
// Passivos: só o que se deve HOJE (faturas abertas, dívidas, cheque especial). Parcelas futuras ficam em Compromissos.
const passivoDe = (chave) => (pat.value?.passivos || []).find((b) => b.chave === chave) || { total: 0, itens: [] };
const faturas = computed(() => passivoDe('faturas'));
const dividas = computed(() => passivoDe('dividas'));
const cheque = computed(() => passivoDe('cheque_especial'));
const totalPassivos = computed(() => pat.value?.totalPassivos || 0);
const pctP = (v) => (totalPassivos.value > 0 ? Math.round((v / totalPassivos.value) * 100) : 0);
const CORP = { faturas: ['var(--saida-carmim-medio)', 'var(--saida-tangerina-medio)'], dividas: ['var(--saida-vermelho-medio)', 'var(--saida-brasa-medio)'], cheque: ['var(--saida-coral-medio)', 'var(--saida-ambar-medio)'] };
const segmentosP = computed(() => [
  { nome: 'Faturas abertas', valor: faturas.value.total, cor: CORP.faturas[0], chave: 'faturas' },
  { nome: 'Dívidas', valor: dividas.value.total, cor: CORP.dividas[0], chave: 'dividas' },
  { nome: 'Cheque especial', valor: cheque.value.total, cor: CORP.cheque[0], chave: 'cheque' },
].filter((x) => x.valor > 0));
const barrasP = computed(() => segmentosP.value.map((x) => ({ id: x.chave, rotulo: x.nome, valor: x.valor, cor: x.cor, detalhe: `${pctP(x.valor)}%` })));
const venceCurto = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') : '');

// Cores da paleta v2 (as mesmas do Início/"Seus saldos"): contas = céu, reserva = violeta (metas), investimentos = petróleo
const COR = { contas: ['var(--entrada-ceu-medio)', 'var(--entrada-royal-medio)'], reserva: ['var(--meta-violeta-medio)', 'var(--meta-orquidea-medio)'], invest: ['var(--investimento-esmeralda-medio)', 'var(--investimento-verde-agua-medio)'] };
const segmentos = computed(() => [
  { nome: 'Contas', valor: contas.value.total, cor: COR.contas[0], chave: 'contas' },
  { nome: 'Metas', valor: reserva.value.total, cor: COR.reserva[0], chave: 'reserva' },
  { nome: 'Investimentos', valor: totalInvest.value, cor: COR.invest[0], chave: 'invest' },
].filter((s) => s.valor > 0));
const barras = computed(() => segmentos.value.map((s) => ({ id: s.chave, rotulo: s.nome, valor: s.valor, cor: s.cor, detalhe: `${pct(s.valor)}%` })));

const alternar = (k) => { abertos.value = { ...abertos.value, [k]: !abertos.value[k] }; };
const TIPO_CONTA = { corrente: 'Conta corrente', poupanca: 'Poupança', corretora: 'Corretora', dinheiro: 'Dinheiro', beneficio: 'Benefício', outra: 'Outra' };
const pctMeta = (m) => (m.valor_meta > 0 ? Math.min(100, Math.round(((m.valor_acumulado ?? m.valor_atingido) / m.valor_meta) * 100)) : 0);
const semMeta = computed(() => reserva.value.itens.find((i) => i.id === 'sem-meta'));
const gruposInvest = computed(() => {
  const g = {};
  ativos.value.forEach((a) => { (g[a.tipo_rotulo || a.tipo] ||= []).push(a); });
  return Object.entries(g).map(([tipo, itens]) => ({ tipo, itens: itens.sort((x, y) => y.valor_atual - x.valor_atual), total: itens.reduce((s, a) => s + a.valor_atual, 0) }));
});
const moeda = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
</script>

<template>
  <div class="pag-patrimonio">
    <p v-if="erro" class="estado" role="alert">{{ erro }}</p>
    <template v-if="pat">
      <TopoValor tema="investimento" :variante="2" rotulo="Patrimônio líquido" periodo="hoje" :valor="pat.patrimonioLiquido"
        :linhas="[{ rotulo: 'Ativos (o que você tem)', valor: pat.totalAtivos }, { rotulo: 'Passivos (o que você deve)', valor: -pat.totalPassivos }]" />

      <AbasSeletor v-if="!ehTelaLarga" v-model="lado" :abas="ABAS" :tema="lado === 'ativos' ? 'entrada' : 'saida'" bloco />

      <div class="lados" :class="{ duplo: ladosVisiveis.length > 1 }">
      <div v-if="ladosVisiveis.includes('ativos')" class="grade-pat">
        <h2 v-if="ehTelaLarga" class="lado-titulo ativos">Ativos</h2>
        <!-- Onde está o seu dinheiro -->
        <CardPadrao class="bloco-pat" titulo="Onde está o seu dinheiro" ajuda="inicio.patrimonio" data-bloco-grafico>
          <template #acoes>
            <button type="button" class="troca-graf" :aria-label="grafico === 'rosca' ? 'Ver em barras' : 'Ver em rosca'" @click="grafico = grafico === 'rosca' ? 'barras' : 'rosca'"><component :is="grafico === 'rosca' ? ChartBar : ChartPie" :size="16" :stroke-width="2" /></button>
          </template>
          <DashRosca v-if="grafico === 'rosca'" compacta :segmentos="segmentos" rotulo-total="você tem" rotulo-vazio="Nada guardado ainda." />
          <RelBarrasH v-else :itens="barras" :formato="moeda" />
        </CardPadrao>

        <div class="col-blocos">
          <!-- Contas -->
          <CardPadrao class="bloco-pat" sem-padding data-bloco-contas>
            <button type="button" class="cab-bloco" :aria-expanded="!!abertos.contas" @click="alternar('contas')">
              <Anel :pct="pct(contas.total)" :tamanho="44" :espessura="10" :de="COR.contas[0]" :ate="COR.contas[1]"><Landmark :size="17" :stroke-width="1.8" /></Anel>
              <span class="cb-nome">Contas<small>{{ contas.itens.length }} {{ contas.itens.length === 1 ? 'conta' : 'contas' }} · {{ pct(contas.total) }}%</small></span>
              <b class="numero-tabular"><Valor :valor="contas.total" /></b>
              <ChevronDown class="seta" :class="{ girada: abertos.contas }" :size="18" :stroke-width="2" aria-hidden="true" />
            </button>
            <div v-if="abertos.contas" class="corpo-bloco">
              <button v-for="c in contas.itens" :key="c.id" type="button" class="linha" @click="router.push({ path: '/contas', query: { conta: c.id } })">
                <IconeBanco :icone="c.icone || ''" :nome="c.nome" :tamanho="36" />
                <span class="l-nome">{{ c.nome }}<small>{{ TIPO_CONTA[c.tipo] || 'Conta' }}</small></span>
                <b class="numero-tabular"><Valor :valor="c.valor" /></b>
              </button>
              <p v-if="!contas.itens.length" class="vazio">Nenhuma conta com saldo.</p>
              <button type="button" class="acessar" @click="router.push('/contas')">Acessar Contas<ChevronRight :size="16" :stroke-width="2" /></button>
            </div>
          </CardPadrao>

          <!-- Metas -->
          <CardPadrao class="bloco-pat" sem-padding data-bloco-metas>
            <button type="button" class="cab-bloco" :aria-expanded="!!abertos.reserva" @click="alternar('reserva')">
              <Anel :pct="pct(reserva.total)" :tamanho="44" :espessura="10" :de="COR.reserva[0]" :ate="COR.reserva[1]"><Target :size="17" :stroke-width="1.8" /></Anel>
              <span class="cb-nome">Metas<small>{{ metas.length }} {{ metas.length === 1 ? 'meta' : 'metas' }} · {{ pct(reserva.total) }}%</small></span>
              <b class="numero-tabular"><Valor :valor="reserva.total" /></b>
              <ChevronDown class="seta" :class="{ girada: abertos.reserva }" :size="18" :stroke-width="2" aria-hidden="true" />
            </button>
            <div v-if="abertos.reserva" class="corpo-bloco">
              <button v-for="m in metas" :key="m.id" type="button" class="linha meta" @click="router.push({ path: '/objetivos', query: { meta: m.id } })">
                <Anel :pct="pctMeta(m)" :tamanho="40" :espessura="8" :de="COR.reserva[0]" :ate="COR.reserva[1]"><span class="anel-pct numero-tabular">{{ pctMeta(m) }}%</span></Anel>
                <span class="l-nome">{{ m.nome }}<small><Valor :valor="m.valor_acumulado ?? m.valor_atingido" /> de <Valor :valor="m.valor_meta" /><template v-if="m.prazo_info?.necessario_mes"> · guardar <Valor :valor="m.prazo_info.necessario_mes" />/mês</template></small></span>
                <b class="numero-tabular"><Valor :valor="m.valor_acumulado ?? m.valor_atingido" /></b>
              </button>
              <div v-if="semMeta" class="linha estatica">
                <IconeCategoria :valor="semMeta.icone || '🐷'" tipo="meta" :tamanho="36" />
                <span class="l-nome">{{ semMeta.nome }}<small>{{ semMeta.detalhe }}</small></span>
                <b class="numero-tabular"><Valor :valor="semMeta.valor" /></b>
              </div>
              <p v-if="!metas.length && !semMeta" class="vazio">Nenhuma meta ainda.</p>
              <button type="button" class="acessar" @click="router.push('/objetivos')">Acessar Metas<ChevronRight :size="16" :stroke-width="2" /></button>
            </div>
          </CardPadrao>

          <!-- Investimentos -->
          <CardPadrao class="bloco-pat" sem-padding data-bloco-investimentos>
            <button type="button" class="cab-bloco" :aria-expanded="!!abertos.invest" @click="alternar('invest')">
              <Anel :pct="pct(totalInvest)" :tamanho="44" :espessura="10" :de="COR.invest[0]" :ate="COR.invest[1]"><TrendingUp :size="17" :stroke-width="1.8" /></Anel>
              <span class="cb-nome">Investimentos<small>{{ ativos.length }} {{ ativos.length === 1 ? 'ativo' : 'ativos' }} · {{ pct(totalInvest) }}%</small></span>
              <b class="numero-tabular"><Valor :valor="totalInvest" /></b>
              <ChevronDown class="seta" :class="{ girada: abertos.invest }" :size="18" :stroke-width="2" aria-hidden="true" />
            </button>
            <div v-if="abertos.invest" class="corpo-bloco">
              <template v-for="g in gruposInvest" :key="g.tipo">
                <div class="sub-grupo"><span>{{ g.tipo }}</span><b class="numero-tabular"><Valor :valor="g.total" /></b></div>
                <button v-for="a in g.itens" :key="a.id" type="button" class="linha" @click="router.push({ path: '/objetivos', query: { ativo: a.id } })">
                  <IconeCategoria :valor="a.tipo || ''" tipo="investimento" :tamanho="36" />
                  <span class="l-nome">{{ a.ticker || a.nome }}<small><template v-if="a.usa_cotas">{{ a.cotas }} cotas · PM <Valor :valor="a.preco_medio" /></template><template v-else>{{ a.corretora_nome || a.tipo_rotulo }}</template></small></span>
                  <b class="numero-tabular"><Valor :valor="a.valor_atual" /></b>
                </button>
              </template>
              <p v-if="!ativos.length" class="vazio">Nenhum investimento ainda.</p>
              <button type="button" class="acessar" @click="router.push('/objetivos?aba=investimentos')">Acessar Investimentos<ChevronRight :size="16" :stroke-width="2" /></button>
            </div>
          </CardPadrao>
        </div>
      </div>

      <!-- ===== PASSIVOS: só o que se deve hoje ===== -->
      <div v-if="ladosVisiveis.includes('passivos')" class="grade-pat">
        <h2 v-if="ehTelaLarga" class="lado-titulo passivos">Passivos</h2>
        <CardPadrao class="bloco-pat" titulo="O que você deve hoje" ajuda="patrimonio.passivos" data-bloco-grafico-passivos>
          <template #acoes>
            <button type="button" class="troca-graf" :aria-label="grafico === 'rosca' ? 'Ver em barras' : 'Ver em rosca'" @click="grafico = grafico === 'rosca' ? 'barras' : 'rosca'"><component :is="grafico === 'rosca' ? ChartBar : ChartPie" :size="16" :stroke-width="2" /></button>
          </template>
          <DashRosca v-if="grafico === 'rosca'" compacta :segmentos="segmentosP" rotulo-total="você deve" rotulo-vazio="Nenhum passivo. Ótimo!" />
          <RelBarrasH v-else :itens="barrasP" :formato="moeda" />
        </CardPadrao>

        <div class="col-blocos">
          <!-- Faturas abertas -->
          <CardPadrao class="bloco-pat" sem-padding data-bloco-faturas>
            <button type="button" class="cab-bloco" :aria-expanded="!!abertos.faturas" @click="alternar('faturas')">
              <Anel :pct="pctP(faturas.total)" :tamanho="44" :espessura="10" :de="CORP.faturas[0]" :ate="CORP.faturas[1]"><CreditCard :size="17" :stroke-width="1.8" /></Anel>
              <span class="cb-nome">Faturas abertas<small>{{ faturas.itens.length }} {{ faturas.itens.length === 1 ? 'fatura' : 'faturas' }} · {{ pctP(faturas.total) }}%</small></span>
              <b class="numero-tabular"><Valor :valor="faturas.total" /></b>
              <ChevronDown class="seta" :class="{ girada: abertos.faturas }" :size="18" :stroke-width="2" aria-hidden="true" />
            </button>
            <div v-if="abertos.faturas" class="corpo-bloco">
              <button v-for="f in faturas.itens" :key="f.id" type="button" class="linha" @click="router.push(`/cartoes/${f.cartaoId}/extrato`)">
                <IconeBanco :icone="f.icone || ''" :nome="f.nome" :tamanho="36" padrao="💳" />
                <span class="l-nome">{{ f.nome }}<small>{{ f.detalhe }}<template v-if="f.vence"> · vence {{ venceCurto(f.vence) }}</template></small></span>
                <b class="numero-tabular"><Valor :valor="f.valor" /></b>
              </button>
              <p v-if="!faturas.itens.length" class="vazio">Nenhuma fatura aberta.</p>
              <button type="button" class="acessar" @click="router.push('/cartoes')">Acessar Cartões<ChevronRight :size="16" :stroke-width="2" /></button>
            </div>
          </CardPadrao>

          <!-- Dívidas -->
          <CardPadrao class="bloco-pat" sem-padding data-bloco-dividas>
            <button type="button" class="cab-bloco" :aria-expanded="!!abertos.dividas" @click="alternar('dividas')">
              <Anel :pct="pctP(dividas.total)" :tamanho="44" :espessura="10" :de="CORP.dividas[0]" :ate="CORP.dividas[1]"><ReceiptText :size="17" :stroke-width="1.8" /></Anel>
              <span class="cb-nome">Dívidas<small>{{ dividas.itens.length }} {{ dividas.itens.length === 1 ? 'dívida' : 'dívidas' }} · {{ pctP(dividas.total) }}%</small></span>
              <b class="numero-tabular"><Valor :valor="dividas.total" /></b>
              <ChevronDown class="seta" :class="{ girada: abertos.dividas }" :size="18" :stroke-width="2" aria-hidden="true" />
            </button>
            <div v-if="abertos.dividas" class="corpo-bloco">
              <button v-for="d in dividas.itens" :key="d.id" type="button" class="linha" @click="router.push('/dividas')">
                <IconeCategoria valor="🧾" tipo="saida" :tamanho="36" />
                <span class="l-nome">{{ d.nome }}<small>saldo que falta{{ d.credor ? ' · ' + d.credor : '' }}</small></span>
                <b class="numero-tabular"><Valor :valor="d.valor" /></b>
              </button>
              <p v-if="!dividas.itens.length" class="vazio">Nenhuma dívida em aberto.</p>
              <button type="button" class="acessar" @click="router.push('/dividas')">Acessar Dívidas<ChevronRight :size="16" :stroke-width="2" /></button>
            </div>
          </CardPadrao>

          <!-- Cheque especial (só quando houver) -->
          <CardPadrao v-if="cheque.total > 0" class="bloco-pat" sem-padding data-bloco-cheque>
            <button type="button" class="cab-bloco" :aria-expanded="!!abertos.cheque" @click="alternar('cheque')">
              <Anel :pct="pctP(cheque.total)" :tamanho="44" :espessura="10" :de="CORP.cheque[0]" :ate="CORP.cheque[1]"><TriangleAlert :size="17" :stroke-width="1.8" /></Anel>
              <span class="cb-nome">Cheque especial<small>conta com saldo negativo · {{ pctP(cheque.total) }}%</small></span>
              <b class="numero-tabular"><Valor :valor="cheque.total" /></b>
              <ChevronDown class="seta" :class="{ girada: abertos.cheque }" :size="18" :stroke-width="2" aria-hidden="true" />
            </button>
            <div v-if="abertos.cheque" class="corpo-bloco">
              <button v-for="c in cheque.itens" :key="c.id" type="button" class="linha" @click="router.push({ path: '/contas', query: { conta: c.id } })">
                <IconeBanco :icone="c.icone || ''" :nome="c.nome" :tamanho="36" />
                <span class="l-nome">{{ c.nome }}<small>{{ c.detalhe }}</small></span>
                <b class="numero-tabular"><Valor :valor="c.valor" /></b>
              </button>
              <button type="button" class="acessar" @click="router.push('/contas')">Acessar Contas<ChevronRight :size="16" :stroke-width="2" /></button>
            </div>
          </CardPadrao>
        </div>
      </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pag-patrimonio { display: flex; flex-direction: column; gap: 14px; max-width: 1200px; margin: 0 auto; width: 100%; padding: 4px 16px 24px; }
.estado { color: var(--cor-texto-suave); }
.lados.duplo { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.lado-titulo { margin: 2px 0 0; font: 600 17px var(--fonte-display); }
.lado-titulo.ativos { color: var(--cor-entrada-texto, var(--cor-entrada)); }
.lado-titulo.passivos { color: var(--cor-saida-texto, var(--cor-saida)); }
:deep(.abas) { background: var(--cor-fundo); border: 1px solid color-mix(in srgb, var(--cor-texto) 14%, var(--cor-borda)); }
.link-comp { align-self: flex-start; display: inline-flex; align-items: center; gap: 2px; margin-top: 6px; padding: 0; border: 0; background: none; color: var(--cor-texto-suave); font: 500 12.5px var(--fonte-texto); cursor: pointer; }
.link-comp:hover { color: var(--cor-texto); }
.grade-pat { display: flex; flex-direction: column; gap: 14px; }
.col-blocos { display: flex; flex-direction: column; gap: 14px; }
.bloco-pat { gap: 10px; }
.troca-graf { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto-suave); cursor: pointer; }
.cab-bloco { width: 100%; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto 20px; gap: 12px; align-items: center; padding: 14px 16px; border: 0; background: none; color: var(--cor-texto); text-align: left; font: inherit; cursor: pointer; border-radius: inherit; }
.cab-bloco:hover { background: var(--cor-realce); }
.cab-bloco :deep(svg) { color: var(--cor-texto-suave); }
.cb-nome { display: flex; flex-direction: column; font: 600 15.5px var(--fonte-display); min-width: 0; }
.cb-nome small { font: 400 12.5px var(--fonte-texto); color: var(--cor-texto-suave); }
.cab-bloco b { font-size: 15.5px; }
.seta { transition: transform var(--anim-padrao, .2s) ease; }
.seta.girada { transform: rotate(180deg); }
.corpo-bloco { display: flex; flex-direction: column; gap: 2px; padding: 0 10px 12px; border-top: 1px solid var(--cor-borda); padding-top: 8px; }
.linha { width: 100%; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: 10px; align-items: center; min-height: 56px; padding: 6px; border: 0; border-radius: 12px; background: none; color: var(--cor-texto); text-align: left; font: inherit; cursor: pointer; }
.linha:hover { background: var(--cor-realce); }
.linha.estatica { cursor: default; }
.linha.estatica:hover { background: none; }
.l-nome { display: flex; flex-direction: column; min-width: 0; font-weight: 600; font-size: 14.5px; }
.l-nome, .l-nome small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.l-nome small { font-weight: 400; font-size: 12.5px; color: var(--cor-texto-suave); }
.anel-pct { font-size: 10px; font-weight: 700; }
.sub-grupo { display: flex; justify-content: space-between; padding: 8px 8px 2px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--cor-texto-suave); }
.vazio { margin: 6px; color: var(--cor-texto-suave); font-size: 14px; }
.acessar { align-self: center; display: inline-flex; align-items: center; gap: 2px; min-height: 40px; margin-top: 6px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-primaria); font: 600 13.5px var(--fonte-texto); cursor: pointer; }
.acessar:hover { background: var(--cor-realce); }

</style>
