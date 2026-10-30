<script setup>
// Pop-up "Transferência entre contas próprias": cria a saída na origem e a entrada no destino (ligadas por vínculo),
// fora do Saldo do mês e das categorias; só os saldos das contas mudam. POST /api/transacoes/transferencia.
//   aberto, contas [{ id, nome, icone?, saldo? }], inicial { origemId?, destinoId?, valor?, data?, descricao? }
//   Emite 'fechar' e 'salvo' ({ vinculo, saida, entrada }).
import { ref, computed, watch } from 'vue';
import { ArrowUpDown } from 'lucide-vue-next';
import FormularioModal from './FormularioModal.vue';
import CampoValor from './CampoValor.vue';
import CampoDataPilula from './CampoDataPilula.vue';
import CampoData from './CampoData.vue';
import CampoTexto from './CampoTexto.vue';
import CampoSelecao from './CampoSelecao.vue';

const props = defineProps({
  aberto: { type: Boolean, default: false },
  contas: { type: Array, default: () => [] },
  inicial: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['fechar', 'salvo']);

const hojeISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const f = ref({ origemId: '', destinoId: '', valor: 0, data: hojeISO(), descricao: '' });
const erro = ref('');
const erros = ref({});
const salvando = ref(false);

const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const opcoes = (excluir) => [
  { valor: '', rotulo: 'Escolha a conta...', desabilitado: true },
  ...props.contas.filter((c) => String(c.id) !== String(excluir)).map((c) => ({ valor: c.id, rotulo: c.saldo !== undefined && c.saldo !== null ? `${c.nome} · ${moeda(c.saldo)}` : c.nome })),
];
const opcoesOrigem = computed(() => opcoes(f.value.destinoId));
const opcoesDestino = computed(() => opcoes(f.value.origemId));
const nome = (id) => props.contas.find((c) => String(c.id) === String(id))?.nome || '';
const resumo = computed(() => (f.value.origemId && f.value.destinoId && f.value.valor > 0
  ? `${moeda(f.value.valor)} saem de ${nome(f.value.origemId)} e entram em ${nome(f.value.destinoId)}. Não conta como despesa nem como receita.`
  : ''));

watch(() => props.aberto, (a) => {
  if (!a) return;
  const i = props.inicial || {};
  erro.value = ''; erros.value = {};
  f.value = {
    origemId: i.origemId || (props.contas[0]?.id ?? ''),
    destinoId: i.destinoId || '',
    valor: Number(i.valor) || 0,
    data: i.data || hojeISO(),
    descricao: i.descricao || '',
  };
  if (f.value.destinoId === f.value.origemId) f.value.destinoId = '';
});

function inverter() {
  const { origemId, destinoId } = f.value;
  f.value.origemId = destinoId;
  f.value.destinoId = origemId;
}

async function salvar() {
  erro.value = ''; erros.value = {};
  const v = f.value;
  if (!v.origemId) erros.value.origem = 'Escolha a conta de origem.';
  if (!v.destinoId) erros.value.destino = 'Escolha a conta de destino.';
  if (!(Number(v.valor) > 0)) erros.value.valor = 'Informe um valor maior que zero.';
  if (Object.keys(erros.value).length) return;
  salvando.value = true;
  try {
    const r = await fetch('/api/transacoes/transferencia', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contaOrigemId: v.origemId, contaDestinoId: v.destinoId, valor: Number(v.valor), data: v.data, descricao: v.descricao || undefined }),
    });
    const d = await r.json();
    if (!r.ok) { erro.value = d.erro || 'Não foi possível transferir.'; return; }
    emit('salvo', { ...d, origemNome: nome(v.origemId), destinoNome: nome(v.destinoId), valor: Number(v.valor), data: v.data });
  } finally { salvando.value = false; }
}
</script>

<template>
  <FormularioModal :aberto="aberto" titulo="Transferência entre contas" ajuda="transferir" tema="neutro" rotulo-salvar="Transferir" :carregando="salvando" :erro="erro" @salvar="salvar" @fechar="emit('fechar')">
    <CampoValor v-model="f.valor" tema="neutro" :erro="erros.valor" autofocus>
      <template #lado><CampoDataPilula v-model="f.data" /></template>
    </CampoValor>
    <CampoSelecao v-model="f.origemId" rotulo="Sai de" :opcoes="opcoesOrigem" :erro="erros.origem" />
    <button type="button" class="inverter" aria-label="Inverter origem e destino" @click="inverter"><ArrowUpDown :size="16" :stroke-width="2.2" /><span>Inverter</span></button>
    <CampoSelecao v-model="f.destinoId" rotulo="Entra em" :opcoes="opcoesDestino" :erro="erros.destino" />
    <CampoTexto v-model="f.descricao" rotulo="Descrição (opcional)" maxlength="120" placeholder="Ex: Reserva do mês" />
    <p v-if="resumo" class="resumo">{{ resumo }}</p>
  </FormularioModal>
</template>

<style scoped>
.nota { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.inverter { align-self: center; display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border-radius: 999px; background: transparent; border: 1px solid var(--cor-borda); color: var(--cor-texto-suave); font: 600 12.5px var(--fonte-texto); cursor: pointer; }
.inverter:hover { background: var(--cor-realce); color: var(--cor-texto); }
.resumo { margin: 0; padding: 10px 12px; border-radius: 10px; border: 1px dashed var(--cor-borda); font-size: 13px; color: var(--cor-texto-suave); }
</style>
