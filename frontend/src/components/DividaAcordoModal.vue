<script setup>
// <DividaAcordoModal :aberto :dividas :inicial :editar :taxa-cartao @fechar @salvo />
// "Adicionar acordo" (novo), "Propor/Renegociar acordo" numa dívida existente ou, com `editar`, EDITAR um acordo já salvo
// (recalcula parcelas e saldo sem perder os pagamentos feitos). Mostra, ao vivo, a simulação: taxa de juros implícita por
// mês/ano, total do acordo e juros. A parcela é calculada sozinha — (dívida − desconto − entrada) ÷ parcelas — e pode ser editada.
import { ref, computed, watch } from 'vue';
import { AlertTriangle } from 'lucide-vue-next';
import FormularioModal from './FormularioModal.vue';
import CampoTexto from './CampoTexto.vue';
import CampoValor from './CampoValor.vue';
import CampoData from './CampoData.vue';
import CampoSelecao from './CampoSelecao.vue';

const props = defineProps({
  aberto: Boolean,
  dividas: { type: Array, default: () => [] },
  inicial: { type: Object, default: null }, // dívida pré-selecionada
  editar: Boolean, // true = editar o acordo já salvo de `inicial`
  taxaCartao: { type: Number, default: null },
  rotuloTaxaCartao: { type: String, default: '' },
});
const emit = defineEmits(['fechar', 'salvo']);

const vazio = () => ({ dividaId: '', nome: '', credor: '', origem: 'outra', negativada: 'sim', valorBase: 0, desconto: 0, entrada: 0, parcelas: '', valorParcela: 0, vencimento: '' });
const f = ref(vazio());
const parcelaEditada = ref(false);
const erro = ref('');
const salvando = ref(false);
const sim = ref(null);
const erroSim = ref('');

const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const pct = (v, c = 2) => `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: c })}%`;
const opcoes = computed(() => [{ valor: '', rotulo: 'Novo acordo (nova dívida)' }, ...props.dividas.map((d) => ({ valor: d.id, rotulo: `${d.nome} · ${moeda(d.saldo)}` }))]);
const opcoesOrigem = [{ valor: 'cartao', rotulo: 'Cartão' }, { valor: 'crediario', rotulo: 'Crediário' }, { valor: 'emprestimo', rotulo: 'Empréstimo / financiamento' }, { valor: 'conta_atrasada', rotulo: 'Conta atrasada' }, { valor: 'pessoa', rotulo: 'Pessoa' }, { valor: 'outra', rotulo: 'Outra' }];
const alvo = computed(() => props.dividas.find((d) => d.id === f.value.dividaId) || null);

function preencherDe(d) {
  if (!d) return;
  const ac = props.editar ? d.acordo : null;
  f.value.valorBase = Number(ac ? ac.valorBase : d.valor_base || d.saldo) || 0;
  f.value.desconto = ac ? Number(ac.desconto) || 0 : 0;
  f.value.entrada = ac ? Number(ac.entrada) || 0 : 0;
  f.value.parcelas = ac ? String(ac.parcelas) : '';
  f.value.valorParcela = ac ? Number(ac.valorParcela) || 0 : 0;
  f.value.vencimento = d.proximo_vencimento || '';
  f.value.credor = d.credor || '';
  if (ac) { // parcela salva diferente da calculada = foi editada à mão: não deixa a automática sobrescrever
    const n = Number(ac.parcelas) || 0, fin = (Number(ac.valorBase) || 0) - (Number(ac.desconto) || 0) - (Number(ac.entrada) || 0);
    parcelaEditada.value = n >= 1 && Math.abs((Number(ac.valorParcela) || 0) - Math.round((fin / n) * 100) / 100) > 0.004;
  }
}
// Parcela automática: (dívida − desconto − entrada) ÷ parcelas. Vale enquanto a pessoa não digitar outro valor.
const parcelaAuto = computed(() => {
  const n = Math.round(Number(f.value.parcelas) || 0);
  const fin = (Number(f.value.valorBase) || 0) - (Number(f.value.desconto) || 0) - (Number(f.value.entrada) || 0);
  return n >= 1 && fin > 0 ? Math.round((fin / n) * 100) / 100 : 0;
});
watch(parcelaAuto, (v) => { if (props.aberto && !parcelaEditada.value) f.value.valorParcela = v; });
watch(() => f.value.valorParcela, (v) => { parcelaEditada.value = parcelaAuto.value > 0 && Math.abs((Number(v) || 0) - parcelaAuto.value) > 0.004; });
function usarCalculada() { f.value.valorParcela = parcelaAuto.value; parcelaEditada.value = false; }
watch(() => props.aberto, (a) => {
  if (!a) return;
  f.value = vazio();
  parcelaEditada.value = false;
  erro.value = ''; sim.value = null; erroSim.value = '';
  if (props.inicial) { f.value.dividaId = props.inicial.id; preencherDe(props.inicial); }
});
watch(() => f.value.dividaId, (id, antes) => {
  if (!props.aberto || id === antes) return;
  if (id) preencherDe(alvo.value);
});

let timer = null;
const pronto = computed(() => f.value.valorBase > 0 && Number(f.value.parcelas) >= 1 && (f.value.valorParcela > 0 || parcelaAuto.value > 0));
watch([() => f.value.valorBase, () => f.value.desconto, () => f.value.entrada, () => f.value.parcelas, () => f.value.valorParcela, () => f.value.dividaId, () => props.aberto], () => {
  clearTimeout(timer);
  if (!props.aberto || !pronto.value) { sim.value = null; erroSim.value = ''; return; }
  timer = setTimeout(async () => {
    try {
      const r = await fetch('/api/dividas/simular', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ dividaId: f.value.dividaId || undefined, valorBase: f.value.valorBase, desconto: f.value.desconto, entrada: f.value.entrada, parcelas: Number(f.value.parcelas), valorParcela: f.value.valorParcela > 0 ? f.value.valorParcela : undefined }),
      });
      const j = await r.json();
      if (r.ok) { sim.value = j; erroSim.value = ''; } else { sim.value = null; erroSim.value = j.erro || ''; }
    } catch { sim.value = null; }
  }, 250);
});

const acimaDoCartao = computed(() => props.taxaCartao != null && sim.value?.taxaMensal != null && sim.value.taxaMensal > props.taxaCartao);
const semJuros = computed(() => sim.value && sim.value.taxaMensal != null && sim.value.taxaMensal < 0.005);

async function salvar() {
  erro.value = '';
  const v = f.value;
  if (!v.dividaId && !v.nome.trim()) { erro.value = 'Dê um nome ao acordo (ex.: Acordo Serasa · Banco X).'; return; }
  if (!pronto.value) { erro.value = 'Informe o valor da dívida e o número de parcelas.'; return; }
  salvando.value = true;
  try {
    const corpo = {
      valorBase: v.valorBase, desconto: v.desconto, entrada: v.entrada, parcelas: Number(v.parcelas), valorParcela: v.valorParcela > 0 ? v.valorParcela : parcelaAuto.value,
      proximoVencimento: v.vencimento || null,
    };
    let r;
    if (v.dividaId) {
      r = await fetch(`/api/dividas/${v.dividaId}/acordo`, { method: props.editar ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(corpo) });
    } else {
      r = await fetch('/api/dividas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...corpo, nome: v.nome, credor: v.credor, origem: v.origem, situacao: 'em_acordo', negativada: v.negativada === 'sim' }),
      });
    }
    const j = await r.json();
    if (!r.ok) { erro.value = j.erro || 'Não foi possível salvar o acordo.'; return; }
    emit('salvo', j);
  } catch { erro.value = 'Não foi possível salvar o acordo agora. Tente de novo.'; } finally { salvando.value = false; }
}
</script>

<template>
  <FormularioModal :aberto="aberto" ajuda="dividas.acordo" :titulo="editar ? `Editar acordo${alvo ? ' · ' + alvo.nome : ''}` : f.dividaId ? 'Acordo para a dívida' : 'Adicionar acordo'" tema="saida" :rotuloSalvar="editar ? 'Salvar alterações' : 'Salvar acordo'" :carregando="salvando" :erro="erro" @salvar="salvar" @fechar="emit('fechar')">
    <CampoSelecao v-if="!editar" v-model="f.dividaId" :opcoes="opcoes" rotulo="Qual dívida simular e aplicar?" dica="Uma dívida existente ou um acordo novo." dica-ao-focar />
    <template v-if="!f.dividaId">
      <CampoTexto v-model="f.nome" rotulo="Nome do acordo" placeholder="Ex: Acordo Serasa · Banco X" obrigatorio />
      <CampoTexto v-model="f.credor" rotulo="Credor — opcional" placeholder="Ex: Banco X, Magalu" dica="Quem cobra a dívida hoje (banco, loja, empresa de cobrança)." dica-ao-focar />
      <CampoSelecao v-model="f.origem" :opcoes="opcoesOrigem" rotulo="Origem da dívida" dica="De onde ela veio. A situação já fica 'Em acordo'." dica-ao-focar />
      <CampoSelecao v-model="f.negativada" :opcoes="[{ valor: 'sim', rotulo: 'Sim, negativada (SPC/Serasa)' }, { valor: 'nao', rotulo: 'Não' }]" rotulo="Está negativada?" />
    </template>
    <CampoValor v-model="f.valorBase" tipo="saida" rotulo="Valor da dívida (original ou à vista)" />
    <CampoValor v-model="f.desconto" tipo="saida" rotulo="Desconto oferecido" />
    <CampoValor v-model="f.entrada" tipo="saida" rotulo="Entrada" />
    <CampoTexto v-model="f.parcelas" type="number" inputmode="numeric" min="1" step="1" rotulo="Número de parcelas" placeholder="Ex: 12" />
    <CampoValor v-model="f.valorParcela" tipo="saida" rotulo="Valor da parcela" :dica="parcelaAuto > 0 ? `Calculada: (dívida − desconto − entrada) ÷ parcelas = ${moeda(parcelaAuto)}. Você pode editar.` : 'Calculada sozinha: (dívida − desconto − entrada) ÷ parcelas.'" />
    <button v-if="parcelaEditada && parcelaAuto > 0" type="button" class="usar-calculada" @click="usarCalculada">Usar o valor calculado ({{ moeda(parcelaAuto) }})</button>
    <CampoData v-model="f.vencimento" rotulo="Vencimento da próxima parcela" />

    <section v-if="sim" class="resultado" aria-live="polite">
      <h4>Simulação dos juros</h4>
      <dl>
        <div><dt>À vista, com desconto</dt><dd class="numero-tabular">{{ moeda(sim.aVista) }}</dd></div>
        <div><dt>Total do acordo</dt><dd class="numero-tabular">{{ moeda(sim.totalPago) }}</dd></div>
        <div><dt>Juros embutidos</dt><dd class="numero-tabular">{{ moeda(sim.jurosTotal) }}</dd></div>
        <div v-if="sim.economiaSobreBase > 0"><dt>Economia sobre a dívida original</dt><dd class="numero-tabular">{{ moeda(sim.economiaSobreBase) }}</dd></div>
        <div class="taxa"><dt>Taxa implícita</dt><dd class="numero-tabular" :class="{ 'sem-juros': semJuros }">{{ semJuros ? 'Sem juros' : `${pct(sim.taxaMensal)} ao mês · ${pct(sim.taxaAnual, 1)} ao ano` }}</dd></div>
      </dl>
      <p v-if="sim.atual && sim.atual.meses" class="comparar">Seguindo como está ({{ moeda(sim.atual.pagamentoMensal) }} por mês), você quitaria em {{ sim.atual.meses }} {{ sim.atual.meses === 1 ? 'mês' : 'meses' }}; no acordo são {{ sim.parcelas }}.</p>
      <p v-if="acimaDoCartao" class="aviso"><AlertTriangle :size="14" aria-hidden="true" /> Taxa acima da média dos cartões ({{ pct(taxaCartao) }} ao mês · {{ rotuloTaxaCartao }}). Tente negociar um desconto maior ou menos parcelas.</p>
    </section>
    <p v-else-if="erroSim" class="nota">{{ erroSim }}</p>
    <p v-else class="nota">Preencha valor, parcelas e valor da parcela para ver os juros implícitos do acordo.</p>
  </FormularioModal>
</template>

<style scoped>
.nota { font-size: 13px; color: var(--cor-texto-suave); margin: 0; }
.resultado { padding: 12px; border-radius: 14px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); display: flex; flex-direction: column; gap: 10px; }
.resultado h4 { margin: 0; font-size: 13px; font-family: var(--fonte-display); color: var(--cor-texto-suave); }
.resultado dl { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; font-size: 12px; }
.resultado dt { color: var(--cor-texto-suave); }
.resultado dd { margin: 2px 0 0; font-weight: 600; color: var(--cor-texto); overflow-wrap: anywhere; }
.resultado .taxa { grid-column: 1 / -1; }
.resultado .taxa dd { font-size: 16px; color: var(--cor-saida-texto); font-family: var(--fonte-display); }
.resultado .taxa dd.sem-juros { color: var(--cor-zero-texto); }
.usar-calculada { align-self: flex-start; min-height: 44px; padding: 6px 12px; border-radius: 10px; border: 1px solid var(--cor-borda); background: transparent; color: var(--cor-texto); font-size: 13px; font-weight: 600; cursor: pointer; }
.comparar { margin: 0; font-size: 13px; }
.aviso { display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 1.4; background: color-mix(in srgb, var(--saida-ambar-medio) 16%, transparent); }
.aviso svg { flex: none; margin-top: 2px; }
</style>
