<script setup>
// Anotação 55 — Posição inicial de um ativo (o que você já tinha antes de usar o app). Não sai de nenhuma conta e não conta
// como aporte; o preço médio e o rendimento partem daqui.
//   Renda variável (ações, FIIs, ETFs, BDRs, cripto, ouro): quantidade + preço médio + data.
//   Renda fixa: valor aplicado + valor atual + data (a diferença vira o rendimento até ali).
// Props: aberto, carteira (resposta de /api/investimentos: ativos, tipos), ativoId (opcional: ativo já escolhido), edicao
// (linha da posição para editar). Emite: salvo(resposta), fechar.
import { ref, computed, watch } from 'vue';
import FormularioModal from './FormularioModal.vue';
import CampoTexto from './CampoTexto.vue';
import CampoValor from './CampoValor.vue';
import CampoData from './CampoData.vue';
import CampoSelecao from './CampoSelecao.vue';
import { api } from '../services/investimentos.js';

const props = defineProps({
  aberto: Boolean,
  carteira: { type: Object, default: () => ({ ativos: [], tipos: [] }) },
  ativoId: { type: String, default: '' },
  edicao: { type: Object, default: null },
});
const emit = defineEmits(['salvo', 'fechar']);
const hoje = () => new Date().toLocaleDateString('sv-SE');
const NOVO = '__novo';
const f = ref({});
const erro = ref('');
const salvando = ref(false);

watch(() => props.aberto, (a) => {
  if (!a) return;
  erro.value = '';
  const e = props.edicao;
  f.value = {
    ativoId: props.ativoId || NOVO, nome: '', tipo: 'acoes',
    cotas: e && e.cotas != null ? String(e.cotas) : '', preco: e && e.preco != null ? String(e.preco) : '',
    aplicado: e && e.cotas == null ? Number(e.total) || 0 : 0, atual: e && e.cotas == null ? Number(e.atual ?? e.total) || 0 : 0,
    data: e ? String(e.data).slice(0, 10) : hoje(),
  };
});

const ativos = computed(() => (props.carteira.ativos || []));
const ativoSel = computed(() => ativos.value.find((a) => a.id === f.value.ativoId) || null);
const tipoInfo = computed(() => (props.carteira.tipos || []).find((t) => t.valor === (ativoSel.value ? ativoSel.value.tipo : f.value.tipo)) || null);
const variavel = computed(() => (tipoInfo.value ? !!tipoInfo.value.cotas : true));
const opcoesAtivo = computed(() => [{ valor: NOVO, rotulo: '+ Novo ativo' }, ...ativos.value.map((a) => ({ valor: a.id, rotulo: `${a.ticker || a.nome} · ${a.tipo_rotulo}` }))]);
const opcoesTipo = computed(() => (props.carteira.tipos || []).map((t) => ({ valor: t.valor, rotulo: t.rotulo })));
const num = (v) => Number(String(v ?? '').replace(',', '.'));
const totalRv = computed(() => Math.round(num(f.value.cotas) * num(f.value.preco) * 100) / 100 || 0);
const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

async function salvar() {
  erro.value = '';
  const x = f.value;
  const corpo = { data: x.data };
  if (x.ativoId === NOVO) {
    if (!x.nome.trim()) { erro.value = 'Informe o ticker ou nome do ativo.'; return; }
    Object.assign(corpo, { nome: x.nome.trim(), ticker: x.nome.trim().toUpperCase(), tipoAtivo: x.tipo });
  } else corpo.ativoId = x.ativoId;
  if (variavel.value) {
    if (!(num(x.cotas) > 0) || !(num(x.preco) > 0)) { erro.value = 'Informe a quantidade e o preço médio.'; return; }
    Object.assign(corpo, { cotas: num(x.cotas), preco: num(x.preco) });
  } else {
    if (!(Number(x.aplicado) > 0)) { erro.value = 'Informe o valor aplicado.'; return; }
    Object.assign(corpo, { aplicado: Number(x.aplicado), atual: Number(x.atual) || Number(x.aplicado) });
  }
  salvando.value = true;
  try {
    const r = await api('POST', '/api/investimentos/posicao-inicial', corpo);
    if (!r.ok) { erro.value = r.json?.erro || 'Não foi possível salvar.'; return; }
    emit('salvo', r.json);
  } finally { salvando.value = false; }
}
</script>

<template>
  <FormularioModal :aberto="aberto" titulo="Posição inicial" ajuda="objetivos.posicao-inicial" tema="investimento" :carregando="salvando" :erro="erro" rotulo-salvar="Salvar posição" @salvar="salvar" @fechar="emit('fechar')">
    <CampoSelecao v-if="!edicao" v-model="f.ativoId" rotulo="Ativo" :opcoes="opcoesAtivo" tema="investimento" />
    <template v-if="f.ativoId === NOVO && !edicao">
      <CampoTexto v-model="f.nome" rotulo="Ticker ou nome" placeholder="Ex: MXRF11, CDB Banco X" maxlength="60" tema="investimento" obrigatorio />
      <CampoSelecao v-model="f.tipo" rotulo="Tipo" :opcoes="opcoesTipo" tema="investimento" />
    </template>
    <div v-if="variavel" class="duas">
      <CampoTexto v-model="f.cotas" rotulo="Quantidade" type="number" step="any" min="0" inputmode="decimal" tema="investimento" />
      <CampoTexto v-model="f.preco" rotulo="Preço médio (R$)" type="number" step="any" min="0" inputmode="decimal" tema="investimento" />
    </div>
    <p v-if="variavel && totalRv" class="nota">Total: <b>{{ moeda(totalRv) }}</b></p>
    <template v-else-if="!variavel">
      <CampoValor v-model="f.aplicado" rotulo="Valor aplicado" tema="investimento" />
      <CampoValor v-model="f.atual" rotulo="Valor atual" tema="investimento" dica="A diferença entra como rendimento até esta data." dica-ao-focar />
    </template>
    <CampoData v-model="f.data" rotulo="Data" :max="hoje()" tema="investimento" />
  </FormularioModal>
</template>

<style scoped>
.nota { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.duas { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
@media (max-width: 480px) { .duas { grid-template-columns: 1fr; } }
</style>
