<script setup>
// <DividaCard :divida="d" :taxa-cartao="2.4" @pagar="..." @acordo="..." @quebrar="..." @editar="..." @arquivar="..." @recarregar="..." />
// Uma dívida/acordo/crediário na lista: resumo (saldo, parcela, vencimento, risco) e, ao tocar, o detalhe com
// acordo (juros implícitos), ações, simulação de quitação, pagamentos reconhecidos nas transações e o
// histórico de lançamentos em lista simples.
import { ref, computed } from 'vue';
import { ChevronDown, CheckCircle2, Plus, Handshake, HeartCrack, AlertTriangle, Pencil } from 'lucide-vue-next';
import Icone from './Icone.vue';
import BarraDegrade from './BarraDegrade.vue';
import BarraAcoes from './BarraAcoes.vue';
import BotaoAcao from './BotaoAcao.vue';
import MenuPontos from './MenuPontos.vue';
import DividaRisco from './DividaRisco.vue';
import DividaSimulacao from './DividaSimulacao.vue';

const props = defineProps({
  divida: { type: Object, required: true },
  taxaCartao: { type: Number, default: null }, // % ao mês (média Bacen)
  rotuloTaxaCartao: { type: String, default: '' },
});
const emit = defineEmits(['pagar', 'acordo', 'editar-acordo', 'quebrar', 'editar', 'arquivar', 'recarregar']);

const aberta = ref(false);
const reconhecidos = ref([]);
let carregouRec = false;

const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const pct = (v, casas = 2) => `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas > 1 ? 1 : 0, maximumFractionDigits: casas })}%`;
const dataBR = (iso) => { if (!iso) return ''; const [a, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${a}`; };
const curta = (iso) => (iso ? dataBR(iso).slice(0, 5) : '');

const d = computed(() => props.divida);
const quitada = computed(() => d.value.saldo <= 0 || d.value.status === 'quitada');
const progresso = computed(() => (d.value.saldo_original ? Math.min(100, Math.round(((d.value.saldo_original - d.value.saldo) / d.value.saldo_original) * 100)) : 0));
const ehAcordoAtivo = computed(() => d.value.situacao === 'em_acordo' && d.value.status === 'ativa' && !quitada.value);
const temAcordo = computed(() => !!d.value.parcelas_total && !!d.value.acordo);
// Origem (de onde veio) e situação (como está) são dois campos; a situação aparece como selo e define a aba da página.
const subtitulo = computed(() => {
  const partes = [d.value.origem_rotulo || 'Dívida'];
  const credor = d.value.credor || d.value.conta_nome;
  if (credor) partes.push(credor);
  if (d.value.taxa_juros) partes.push(`${pct(d.value.taxa_juros)} ao mês`);
  return partes.join(' · ');
});
const linhaParcela = computed(() => {
  if (!d.value.parcelas_total || !d.value.valor_parcela || quitada.value) return '';
  const atual = Math.min(d.value.parcelas_total, (d.value.parcelas_pagas || 0) + 1);
  return `Parcela ${atual}/${d.value.parcelas_total} · ${moeda(d.value.valor_parcela)}`;
});
const acimaDoCartao = computed(() => props.taxaCartao != null && d.value.acordo?.taxaMensal != null && d.value.acordo.taxaMensal > props.taxaCartao);
// Juros de 0% nunca em vermelho: menta/neutro
const acordoSemJuros = computed(() => d.value.acordo?.taxaMensal != null && d.value.acordo.taxaMensal < 0.005);
const economiaTotal = computed(() => (d.value.historico_pagamentos || []).reduce((s, h) => s + (Number(h.desconto_antecipacao) || 0), 0));
const lancamentos = computed(() => d.value.historico_pagamentos || []);
const nPagamentos = computed(() => lancamentos.value.filter((h) => (h.tipo || 'pagamento') === 'pagamento' || h.tipo === 'entrada').length);

async function abrirFechar() {
  aberta.value = !aberta.value;
  if (aberta.value && !carregouRec && !quitada.value) {
    carregouRec = true;
    try {
      const r = await fetch(`/api/dividas/${d.value.id}/pagamentos-reconhecidos`, { credentials: 'include' });
      reconhecidos.value = r.ok ? await r.json() : [];
    } catch { reconhecidos.value = []; }
  }
}
async function abater(t) {
  await fetch(`/api/dividas/${d.value.id}/pagamentos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ transacaoId: t.id }) });
  reconhecidos.value = reconhecidos.value.filter((x) => x.id !== t.id);
  emit('recarregar');
}
async function abaterTodos() {
  for (const t of [...reconhecidos.value]) await abater(t);
}

function rotuloLancamento(h) {
  if (h.tipo === 'entrada') return 'Entrada do acordo';
  if (h.tipo === 'acordo') return h.observacao || 'Acordo registrado';
  if (h.tipo === 'quebra') return h.observacao || 'Acordo quebrado';
  return h.observacao ? `Pagamento · ${h.observacao}` : 'Pagamento';
}
const semValor = (h) => h.tipo === 'acordo' || h.tipo === 'quebra';
defineExpose({ abrirFechar });
</script>

<template>
  <li class="bloco-divida" :class="{ quitada, vencida: d.vencida }">
    <div class="item-lista" role="button" tabindex="0" :aria-expanded="aberta" @click="abrirFechar" @keydown.enter="abrirFechar">
      <span class="ico" :class="{ grave: d.vencida || d.risco?.nivel === 'Crítico' }"><Icone nome="dividas" :tamanho="20" /></span>
      <span class="meio">
        <span class="linha1"><strong>{{ d.nome }}</strong><span class="numero-tabular valor">{{ moeda(d.saldo) }}</span></span>
        <span class="linha2">
          <small>{{ subtitulo }}</small>
          <span class="selos">
            <span class="selo-sit" :class="'sit-' + d.situacao">{{ d.situacao_rotulo }}</span>
            <DividaRisco v-if="!quitada" :risco="d.risco" compacto />
          </span>
        </span>
        <span v-if="linhaParcela || d.proximo_vencimento" class="linha2">
          <small>{{ linhaParcela }}</small>
          <small v-if="d.proximo_vencimento && !quitada" :class="{ 'etq-grave': d.vencida }">{{ d.vencida ? `Vencida em ${curta(d.proximo_vencimento)}` : `Vence ${curta(d.proximo_vencimento)}` }}</small>
        </span>
        <BarraDegrade :pct="progresso" :altura="5" de="var(--saida-ambar-medio)" ate="var(--saida-carmim-medio)" />
        <span class="linha2"><small>Quitado {{ progresso }}%</small><small>Falta {{ moeda(d.saldo) }} de {{ moeda(d.saldo_original) }}</small></span>
      </span>
      <span class="pontos-divida" @click.stop><MenuPontos><button type="button" @click="emit('editar', d)">Editar</button><button type="button" @click="emit('arquivar', d, true)">Arquivar</button></MenuPontos></span>
      <ChevronDown :size="18" class="seta" :class="{ aberta }" aria-hidden="true" />
    </div>

    <div v-if="aberta" class="detalhe">
      <span v-if="quitada" class="selo-quitada"><CheckCircle2 :size="14" aria-hidden="true" /> Quitada</span>

      <ul v-if="!quitada && d.risco?.motivos?.length" class="motivos" aria-label="Motivos do risco">
        <li v-for="m in d.risco.motivos" :key="m"><AlertTriangle :size="12" aria-hidden="true" /> {{ m }}</li>
      </ul>

      <dl v-if="d.acordo" class="dados-acordo">
        <div><dt>Dívida original</dt><dd class="numero-tabular">{{ moeda(d.acordo.valorBase) }}</dd></div>
        <div v-if="d.acordo.desconto"><dt>Desconto</dt><dd class="numero-tabular">− {{ moeda(d.acordo.desconto) }}</dd></div>
        <div v-if="d.acordo.entrada"><dt>Entrada</dt><dd class="numero-tabular">{{ moeda(d.acordo.entrada) }}</dd></div>
        <div><dt>Parcelas</dt><dd class="numero-tabular">{{ d.acordo.parcelas }}x de {{ moeda(d.acordo.valorParcela) }}</dd></div>
        <div><dt>Total do acordo</dt><dd class="numero-tabular">{{ moeda(d.acordo.totalPago) }}</dd></div>
        <div><dt>Total pago</dt><dd class="numero-tabular">{{ moeda(d.total_pago) }}</dd></div>
        <div class="destaque"><dt>Juros implícitos</dt><dd class="numero-tabular" :class="{ 'sem-juros': acordoSemJuros }">{{ d.acordo.taxaMensal == null ? '—' : acordoSemJuros ? 'Sem juros (0% ao mês)' : `${pct(d.acordo.taxaMensal)} ao mês · ${pct(d.acordo.taxaAnual, 1)} ao ano` }}</dd></div>
      </dl>
      <dl v-else-if="d.total_pago > 0" class="dados-acordo">
        <div><dt>Total pago</dt><dd class="numero-tabular">{{ moeda(d.total_pago) }}</dd></div>
        <div><dt>Falta pagar</dt><dd class="numero-tabular">{{ moeda(d.saldo) }}</dd></div>
      </dl>
      <p v-if="acimaDoCartao" class="aviso-juros"><AlertTriangle :size="14" aria-hidden="true" /> Esses juros estão acima da média dos cartões ({{ pct(taxaCartao) }} ao mês · {{ rotuloTaxaCartao }}). Vale tentar negociar.</p>
      <p v-else-if="d.taxa_juros && taxaCartao != null && d.taxa_juros > taxaCartao && !d.acordo" class="aviso-juros"><AlertTriangle :size="14" aria-hidden="true" /> Juros de {{ pct(d.taxa_juros) }} ao mês, acima da média dos cartões ({{ pct(taxaCartao) }}).</p>
      <p v-if="d.status === 'quebrada'" class="aviso-juros grave"><HeartCrack :size="14" aria-hidden="true" /> Acordo quebrado em {{ dataBR(d.quebrado_em) }}: a dívida voltou ao valor original com {{ pct(d.encargos_pct, 1) }} de encargos. Dá para fechar um novo acordo.</p>

      <BarraAcoes v-if="!quitada" compacto :colunas="ehAcordoAtivo ? (temAcordo ? 4 : 3) : 2">
        <BotaoAcao compacto :icone="Plus" rotulo="Iniciar pagamento" tema="saida" destaque @click="emit('pagar', d)" />
        <BotaoAcao v-if="temAcordo && ehAcordoAtivo" compacto :icone="Pencil" rotulo="Editar acordo" tema="saida" @click="emit('editar-acordo', d)" />
        <BotaoAcao compacto :icone="Handshake" :rotulo="d.status === 'quebrada' ? 'Novo acordo' : d.parcelas_total ? 'Renegociar' : 'Propor acordo'" tema="saida" @click="emit('acordo', d)" />
        <BotaoAcao v-if="ehAcordoAtivo" compacto :icone="HeartCrack" rotulo="Acordo quebrado" tema="saida" @click="emit('quebrar', d)" />
      </BarraAcoes>

      <DividaSimulacao v-if="!quitada" :key="d.id + '|' + d.saldo + '|' + (d.valor_parcela || 0)" :divida="d" />

      <div v-if="reconhecidos.length" class="reconhecidos">
        <p class="nota">Encontrei {{ reconhecidos.length }} {{ reconhecidos.length === 1 ? 'pagamento' : 'pagamentos' }} nas transações que parecem ser desta dívida:</p>
        <ul class="lista-reconhecidos">
          <li v-for="t in reconhecidos" :key="t.id">
            <span class="rec-info"><strong>{{ t.descricao }}</strong><small>{{ dataBR(t.data) }} · {{ t.conta_nome }}<template v-if="t.no_banco"> · banco vinculado</template></small></span>
            <span class="numero-tabular">{{ moeda(t.valor) }}</span>
            <button type="button" class="botao-mini" @click="abater(t)">Abater</button>
          </li>
        </ul>
        <button v-if="reconhecidos.length > 1" type="button" class="botao-mini" @click="abaterTodos">Abater todos</button>
      </div>

      <h4 class="sub">Histórico de lançamentos ({{ lancamentos.length }})</h4>
      <p v-if="economiaTotal > 0" class="nota economia">Economia por antecipação: {{ moeda(economiaTotal) }}</p>
      <ul class="lista-historico">
        <li v-for="h in lancamentos" :key="h.id" :class="{ evento: semValor(h) }">
          <span class="h-data">{{ dataBR(h.data) }}</span>
          <span class="h-desc">{{ rotuloLancamento(h) }}</span>
          <span v-if="!semValor(h)" class="numero-tabular h-valor">{{ moeda(h.valor) }}</span>
          <span v-if="h.desconto_antecipacao > 0" class="como-pago">Desconto por antecipação de {{ moeda(h.desconto_antecipacao) }}<template v-if="h.valor_parcela"> (parcela de {{ moeda(h.valor_parcela) }})</template></span>
          <span v-if="h.transacao_id" class="como-pago">{{ [h.tx_conta, h.tx_categoria, h.tx_subcategoria].filter(Boolean).join(' · ') }}</span>
        </li>
        <li v-if="!lancamentos.length" class="nota">Nenhum lançamento ainda.</li>
      </ul>
    </div>
  </li>
</template>

<style scoped>
.nota { font-size: 13px; color: var(--cor-texto-suave); margin: 0; }
button { font-family: var(--fonte-texto); font-weight: 600; font-size: 14px; padding: 10px 16px; border-radius: 12px; border: none; background: var(--cor-primaria); color: var(--cor-sobre-cor); cursor: pointer; min-height: 44px; }
.botao-mini { align-self: flex-start; font-size: 13px; padding: 6px 12px; min-height: 44px; border-radius: 10px; border: 1px solid var(--cor-borda); background: transparent; color: var(--cor-texto); }
.bloco-divida { border-bottom: 1px solid var(--cor-borda); list-style: none; }
.bloco-divida:last-child { border-bottom: none; }
.item-lista { display: flex; align-items: center; gap: 12px; padding: 12px 0; min-height: 56px; cursor: pointer; position: relative; }
.item-lista:focus-visible { outline: 2px solid var(--cor-saida); outline-offset: 2px; border-radius: 10px; }
.ico { width: 42px; height: 42px; border-radius: 14px; flex: none; display: grid; place-items: center; background: var(--cor-saida-fundo); color: var(--cor-saida); }
.ico.grave { background: var(--cor-grave-fundo); color: var(--cor-grave); }
.meio { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.linha1, .linha2 { display: flex; justify-content: space-between; align-items: center; gap: 10px; min-width: 0; }
.linha1 strong { font-size: 15px; overflow-wrap: anywhere; min-width: 0; }
.linha1 .valor { font-weight: 700; color: var(--cor-saida-texto); flex: none; }
.linha2 small { font-size: 12px; color: var(--cor-texto-suave); overflow-wrap: anywhere; min-width: 0; }
.etq-grave { color: var(--cor-grave) !important; font-weight: 700; }
.selos { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.selo-sit { font-size: 10.5px; font-weight: 700; line-height: 1; padding: 3px 8px; border-radius: 999px; white-space: nowrap; border: 1px solid currentColor; color: var(--cor-texto-suave); }
.selo-sit.sit-atrasada { color: var(--cor-alerta-texto, var(--cor-grave)); }
.selo-sit.sit-negativada { color: var(--cor-saida-texto); }
.selo-sit.sit-em_acordo { color: var(--cor-interface-link, var(--cor-primaria)); }
.selo-sit.sit-quitada { color: var(--cor-entrada-texto); }
.vencida .linha1 .valor { color: var(--cor-grave); }
.pontos-divida { flex: none; }
.seta { flex: none; color: var(--cor-texto-suave); transition: transform var(--anim-rapida) var(--anim-curva); }
.seta.aberta { transform: rotate(180deg); }
@media (max-width: 480px) { .seta, .ico { display: none; } .linha2 { flex-wrap: wrap; gap: 4px 10px; } .item-lista { gap: 10px; } }
.quitada { opacity: 0.85; }
.detalhe { display: flex; flex-direction: column; gap: 12px; padding: 4px 0 16px; }
.sub { margin: 4px 0 0; font-size: 13px; font-family: var(--fonte-display); color: var(--cor-texto-suave); }
.selo-quitada { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; font-weight: 700; font-size: 12px; padding: 3px 10px; border-radius: 999px; background: color-mix(in srgb, var(--saida-ambar-medio) 20%, transparent); }
.motivos { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.motivos li { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 4px 9px; border-radius: 999px; background: var(--cor-saida-fundo); color: var(--cor-texto); }
.dados-acordo { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--cor-fundo); border: 1px solid var(--cor-borda); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; font-size: 12px; }
.dados-acordo dt { color: var(--cor-texto-suave); }
.dados-acordo dd { margin: 2px 0 0; font-weight: 600; color: var(--cor-texto); overflow-wrap: anywhere; }
.dados-acordo .destaque { grid-column: 1 / -1; }
.dados-acordo .destaque dd { color: var(--cor-saida-texto); font-size: 14px; }
.dados-acordo .destaque dd.sem-juros { color: var(--cor-zero-texto); }
.aviso-juros { display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 1.4; background: color-mix(in srgb, var(--saida-ambar-medio) 16%, transparent); color: var(--cor-texto); }
.aviso-juros svg { flex: none; margin-top: 2px; }
.aviso-juros.grave { background: var(--cor-grave-fundo); }
.aviso-juros.grave svg { color: var(--cor-grave); }
.reconhecidos { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px dashed var(--cor-borda); border-radius: 12px; min-width: 0; }
.lista-reconhecidos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.lista-reconhecidos li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
.rec-info { flex: 1 1 140px; min-width: 0; display: flex; flex-direction: column; overflow-wrap: anywhere; }
.rec-info small { color: var(--cor-texto-suave); font-size: 11px; }
.lista-historico { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; font-size: 13px; }
.lista-historico li { display: grid; grid-template-columns: 76px minmax(0, 1fr) auto; gap: 2px 10px; border-bottom: 1px solid var(--cor-borda); padding: 8px 0; align-items: baseline; }
.lista-historico li.evento .h-desc { color: var(--cor-texto-suave); font-style: italic; grid-column: 2 / -1; }
.h-data { color: var(--cor-texto-suave); font-size: 12px; }
.h-desc { min-width: 0; overflow-wrap: anywhere; }
.h-valor { font-weight: 600; }
.como-pago { grid-column: 2 / -1; font-size: 12px; color: var(--cor-texto-suave); overflow-wrap: anywhere; }
.economia { color: var(--cor-texto); font-weight: 600; }
</style>
