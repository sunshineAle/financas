<script setup>
// Banco → corretora: é uma TRANSFERÊNCIA entre contas próprias (não é gasto). A compra do ativo depois sai da corretora.
import { ref, computed, watch } from 'vue';
import FormularioModal from './FormularioModal.vue';
import CampoSelecao from './CampoSelecao.vue';
import CampoValor from './CampoValor.vue';
import CampoData from './CampoData.vue';
import { api, hojeISO } from '../services/investimentos.js';

const props = defineProps({ aberto: Boolean, contas: { type: Array, default: () => [] }, corretoras: { type: Array, default: () => [] } });
const emit = defineEmits(['fechar', 'salvo']);
const f = ref({ origem: '', corretora: '', valor: 0, data: hojeISO() });
const erro = ref('');
const salvando = ref(false);
const origens = computed(() => props.contas.filter((c) => c.tipo !== 'corretora').map((c) => ({ valor: c.id, rotulo: c.nome })));
const destinos = computed(() => props.corretoras.map((c) => ({ valor: c.id, rotulo: c.nome })));
watch(() => props.aberto, (v) => {
  if (!v) return;
  erro.value = '';
  f.value = { origem: origens.value[0]?.valor || '', corretora: destinos.value[0]?.valor || '', valor: 0, data: hojeISO() };
});
async function salvar() {
  erro.value = '';
  if (!(Number(f.value.valor) > 0)) { erro.value = 'Informe um valor maior que zero.'; return; }
  salvando.value = true;
  try {
    const r = await api('POST', '/api/investimentos/transferencia', { origemId: f.value.origem, corretoraId: f.value.corretora, valor: Number(f.value.valor), data: f.value.data });
    if (!r.ok) { erro.value = r.json?.erro || 'Não foi possível transferir.'; return; }
    emit('salvo', r.json);
  } finally { salvando.value = false; }
}
</script>

<template>
  <FormularioModal :aberto="aberto" titulo="Transferir para a corretora" ajuda="transferir" tema="investimento" :carregando="salvando" :erro="erro" rotulo-salvar="Transferir" @salvar="salvar" @fechar="emit('fechar')">
    <CampoSelecao v-model="f.origem" rotulo="Conta de origem (banco)" :opcoes="origens" tema="investimento" />
    <CampoSelecao v-model="f.corretora" rotulo="Corretora" :opcoes="destinos" tema="investimento" />
    <CampoValor v-model="f.valor" rotulo="Valor" tema="investimento" />
    <CampoData v-model="f.data" rotulo="Data" atalhos tema="investimento" />
  </FormularioModal>
</template>

<style scoped>.nota { margin: 0; font-size: 12px; color: var(--cor-texto-suave); }</style>
