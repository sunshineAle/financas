<script setup>
// Criar regra de categorização ("Padaria do José" → Mercado) considerando nome, valor e conta, com "aplicar nas antigas"
// (mostra quantas serão afetadas). Usa POST /api/regras. Props: aberto, inicial { tipo, padrao, categoriaId, categoriaReceita, valor, contaId }.
// Eventos: fechar, salvo({ regra, aplicadas }).
import { ref, computed, watch } from 'vue';
import FormularioModal from './FormularioModal.vue';
import CampoTexto from './CampoTexto.vue';
import CampoTipo from './CampoTipo.vue';
import CampoValor from './CampoValor.vue';
import CampoSelecao from './CampoSelecao.vue';
import CampoCategoria from './CampoCategoria.vue';

const props = defineProps({ aberto: Boolean, inicial: { type: Object, default: () => ({}) }, tipoFixo: Boolean });
const emit = defineEmits(['fechar', 'salvo']);

const f = ref({ tipo: 'saida', padrao: '', categoriaId: '', categoriaReceita: '', usarConta: false, contaId: '', usarValor: false, valorMin: 0, valorMax: 0, aplicar: true });
const contas = ref([]);
const previa = ref(null);
const erro = ref('');
const salvando = ref(false);
const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

watch(() => props.aberto, async (a) => {
  if (!a) return;
  const i = props.inicial || {};
  const v = Number(i.valor) || 0;
  f.value = { tipo: i.tipo === 'entrada' ? 'entrada' : 'saida', padrao: i.padrao || '', categoriaId: i.categoriaId || '', categoriaReceita: i.categoriaReceita || '', usarConta: false, contaId: i.contaId || '', usarValor: false, valorMin: v, valorMax: v, aplicar: true };
  erro.value = ''; previa.value = null;
  try { const r = await fetch('/api/contas', { credentials: 'include' }); contas.value = r.ok ? await r.json() : []; } catch { contas.value = []; }
  if (!f.value.contaId && contas.value.length) f.value.contaId = contas.value[0].id;
});

const corpo = () => {
  const x = f.value;
  return {
    tipo: x.tipo, padrao: x.padrao.trim(),
    categoriaId: x.tipo === 'saida' ? x.categoriaId : undefined, categoriaReceita: x.tipo === 'entrada' ? x.categoriaReceita : undefined,
    contaId: x.usarConta ? x.contaId : '', valorMin: x.usarValor ? x.valorMin : '', valorMax: x.usarValor ? x.valorMax : '',
  };
};
let t = null;
watch(() => [props.aberto, JSON.stringify(corpo())], () => {
  clearTimeout(t); previa.value = null;
  const x = f.value;
  if (!props.aberto || x.padrao.trim().length < 2 || !(x.tipo === 'saida' ? x.categoriaId : x.categoriaReceita)) return;
  t = setTimeout(async () => {
    const q = new URLSearchParams(Object.entries(corpo()).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => [k, String(v)]));
    try { const r = await fetch(`/api/regras/previa?${q}`, { credentials: 'include' }); previa.value = r.ok ? await r.json() : null; } catch { previa.value = null; }
  }, 250);
});

async function salvar() {
  erro.value = '';
  salvando.value = true;
  try {
    const r = await fetch('/api/regras', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpo(), aplicarAntigas: f.value.aplicar }) });
    const d = await r.json();
    if (!r.ok) { erro.value = d.erro || 'Não foi possível criar a regra.'; return; }
    emit('salvo', d);
  } finally { salvando.value = false; }
}
</script>

<template>
  <FormularioModal :aberto="aberto" titulo="Nova regra de categoria" :tema="f.tipo" rotulo-salvar="Criar regra" :carregando="salvando" :erro="erro" @salvar="salvar" @fechar="emit('fechar')">
    <p class="nota">Toda vez que o nome tiver esse trecho, o lançamento vai para a categoria escolhida.</p>
    <CampoTipo v-if="!tipoFixo" v-model="f.tipo" />
    <CampoTexto v-model="f.padrao" rotulo="Quando o nome contiver" placeholder="Ex: Padaria do José" obrigatorio :tema="f.tipo" />
    <CampoCategoria v-if="f.tipo === 'saida'" :key="'s'" v-model="f.categoriaId" tipo="saida" :tema="f.tipo" rotulo="Vai para a categoria" />
    <CampoCategoria v-else :key="'e'" v-model="f.categoriaReceita" tipo="entrada" :tema="f.tipo" rotulo="Vai para a categoria" />
    <label class="opcao"><input v-model="f.usarConta" type="checkbox" /> Só para uma conta</label>
    <CampoSelecao v-if="f.usarConta" v-model="f.contaId" rotulo="Conta" :opcoes="contas.map((c) => ({ valor: c.id, rotulo: c.nome }))" />
    <label class="opcao"><input v-model="f.usarValor" type="checkbox" /> Só para uma faixa de valor</label>
    <div v-if="f.usarValor" class="faixa">
      <CampoValor v-model="f.valorMin" :tipo="f.tipo" rotulo="De" />
      <CampoValor v-model="f.valorMax" :tipo="f.tipo" rotulo="Até" />
    </div>
    <label class="opcao"><input v-model="f.aplicar" type="checkbox" /> Aplicar nos lançamentos antigos</label>
    <p v-if="previa" class="previa" role="status">{{ previa.quantidade === 0 ? 'Nenhum lançamento antigo muda de categoria.' : `${previa.quantidade} ${previa.quantidade === 1 ? 'lançamento antigo' : 'lançamentos antigos'} ${f.aplicar ? 'serão movidos' : 'poderiam ser movidos'} para esta categoria` }}{{ previa.exemplos && previa.exemplos.length ? ` (ex.: ${previa.exemplos.slice(0, 2).join(', ')})` : '' }}.</p>
  </FormularioModal>
</template>

<style scoped>
.nota { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.opcao { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 14px; cursor: pointer; }
.opcao input { width: 20px; height: 20px; }
.faixa { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.previa { margin: 0; font-size: 13px; border: 1px dashed var(--cor-borda); border-radius: 10px; padding: 10px 12px; color: var(--cor-texto); }
</style>
