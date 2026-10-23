<script setup>
// Pop-up "Lançar compra" (nova ou edição) de um cartão manual, com prévia de parcelas e fatura.
import { ref, watch, nextTick } from 'vue';
import FormularioModal from './FormularioModal.vue';
import CampoTexto from './CampoTexto.vue';
import CampoValor from './CampoValor.vue';
import CampoData from './CampoData.vue';
import CampoSelecao from './CampoSelecao.vue';
import CampoCategoria from './CampoCategoria.vue';

const props = defineProps({
  aberto: { type: Boolean, default: false },
  cartao: { type: Object, default: null },
  editando: { type: Object, default: null }, // lançamento sendo editado
});
const emit = defineEmits(['fechar', 'salvo']);

const vazia = () => ({ descricao: '', valor: 0, dataCompra: '', parcelas: 1, dividaId: '', categoriaId: '', subcategoria: '' });
const compra = ref(vazia());
const categorias = ref([]);
const dividas = ref([]);
const sugestoes = ref([]);
const previa = ref(null);
const erro = ref('');
const erros = ref({});
const salvando = ref(false);

const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const rotuloFatura = (chave) => { if (!chave) return ''; const [a, m] = chave.split('-').map(Number); return `${MESES[m - 1]}/${a}`; };
const dataBR = (iso) => { if (!iso) return ''; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };

async function get(url) { try { const r = await fetch(url, { credentials: 'include' }); return r.ok ? await r.json() : []; } catch { return []; } }

watch(() => props.aberto, async (a) => {
  if (!a) return;
  erro.value = ''; erros.value = {}; previa.value = null;
  const l = props.editando;
  compra.value = l
    ? { descricao: l.descricao, valor: l.valorTotalCompra, parcelas: l.totalParcelas, dataCompra: l.dataCompra, dividaId: l.dividaId || '', categoriaId: l.categoriaId || '', subcategoria: '' }
    : vazia();
  [categorias.value, dividas.value] = await Promise.all([get('/api/categorias'), get('/api/dividas')]);
  if (l) { await nextTick(); await nextTick(); compra.value.subcategoria = l.subcategoria || ''; }
});

watch(() => compra.value.categoriaId, async (id) => {
  compra.value.subcategoria = '';
  sugestoes.value = id ? await get(`/api/transacoes/subcategorias?categoriaId=${id}`) : [];
});

let tempo = null;
watch(() => [compra.value.valor, compra.value.parcelas, compra.value.dataCompra, props.aberto], () => {
  clearTimeout(tempo);
  previa.value = null;
  if (!props.aberto || !(Number(compra.value.valor) > 0) || !props.cartao) return;
  tempo = setTimeout(async () => {
    const p = new URLSearchParams({ valor: String(compra.value.valor), parcelas: String(compra.value.parcelas || 1) });
    if (compra.value.dataCompra) p.set('dataCompra', compra.value.dataCompra);
    const r = await get(`/api/cartoes/${props.cartao.id}/previa?${p}`);
    previa.value = r && r.primeiraFatura ? r : null;
  }, 250);
});

async function registrar() {
  erro.value = '';
  erros.value = {};
  const c = compra.value;
  if (!c.descricao.trim()) erros.value.descricao = 'Informe o que foi comprado.';
  if (!(Number(c.valor) > 0)) erros.value.valor = 'Informe o valor total.';
  if (Object.keys(erros.value).length) return;
  salvando.value = true;
  try {
    const corpo = { descricao: c.descricao, valor: Number(c.valor), parcelas: Number(c.parcelas) || 1 };
    if (c.dataCompra) corpo.dataCompra = c.dataCompra;
    if (c.dividaId) corpo.dividaId = c.dividaId;
    if (c.categoriaId) { corpo.categoriaId = c.categoriaId; if (c.subcategoria.trim()) corpo.subcategoria = c.subcategoria.trim(); }
    const url = props.editando ? `/api/cartoes/${props.cartao.id}/lancamentos/${props.editando.compraId}` : `/api/cartoes/${props.cartao.id}/lancamentos`;
    const r = await fetch(url, { method: props.editando ? 'PUT' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const d = await r.json();
    if (!r.ok) { erro.value = d.erro || 'Não foi possível registrar a compra.'; return; }
    emit('salvo', { primeiraFatura: d.primeiraFatura, edicao: !!props.editando });
  } finally { salvando.value = false; }
}
</script>

<template>
  <FormularioModal :aberto="aberto" :titulo="`${editando ? 'Editar compra' : 'Lançar compra'} · ${cartao ? cartao.nome : ''}`" tema="saida" :rotulo-salvar="editando ? 'Salvar compra' : 'Registrar compra'" :carregando="salvando" :erro="erro" @salvar="registrar" @fechar="emit('fechar')">
    <CampoValor v-model="compra.valor" tipo="saida" rotulo="Valor total" :erro="erros.valor" />
    <CampoTexto v-model="compra.descricao" rotulo="O que foi comprado" placeholder="Ex: Geladeira" :erro="erros.descricao" obrigatorio />
    <div class="duas">
      <CampoTexto v-model="compra.parcelas" rotulo="Parcelas" type="number" min="1" max="48" inputmode="numeric" :disabled="!!editando" tema="saida" />
      <CampoData v-model="compra.dataCompra" rotulo="Data da compra" atalhos tema="saida" />
    </div>
    <CampoCategoria v-model="compra.categoriaId" tipo="saida" tema="saida" rotulo="Categoria (opcional)" automatica="Automática" :categorias="categorias" />
    <CampoTexto v-if="compra.categoriaId" v-model="compra.subcategoria" rotulo="Subcategoria (opcional)" maxlength="80" list="sugestoes-sub-cartao" autocomplete="off" placeholder="Ex: Eletrodomésticos, Presente" tema="saida" />
    <datalist id="sugestoes-sub-cartao"><option v-for="s in sugestoes" :key="s" :value="s"></option></datalist>
    <CampoSelecao v-if="dividas.length" v-model="compra.dividaId" rotulo="Vincular a acordo, dívida ou crediário (opcional)" placeholder="Nenhuma" :opcoes="[{ valor: '', rotulo: 'Nenhuma' }, ...dividas.map((d) => ({ valor: d.id, rotulo: d.nome }))]" tema="saida" />
    <p v-if="previa" class="previa">
      <template v-if="previa.parcelas > 1">{{ previa.parcelas }}x de {{ moeda(previa.valorParcela) }}.</template>
      <template v-else>À vista: {{ moeda(previa.valorParcela) }}.</template>
      A 1ª parcela entra na fatura de {{ rotuloFatura(previa.primeiraFatura.chave) }} (vence {{ dataBR(previa.primeiraFatura.vence) }})<template v-if="previa.parcelas > 1"> e a última em {{ rotuloFatura(previa.ultimaFatura) }}</template>.
    </p>
  </FormularioModal>
</template>

<style scoped>
.duas { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
@media (max-width: 480px) { .duas { grid-template-columns: 1fr; } }
.previa { margin: 0; padding: 10px 12px; border-radius: 10px; border: 1px dashed var(--cor-borda); font-size: 13px; color: var(--cor-texto-suave); }
</style>
