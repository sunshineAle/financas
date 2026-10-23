<script setup>
// Pop-up "Registrar pagamento" da fatura (cartão manual): escolhe a conta de onde saiu o dinheiro e o valor pago.
// Se pagou MENOS que a fatura, é preciso dizer o que foi a diferença — e os dois casos nunca se misturam:
//   • Desconto           — pagou a menos porque a loja/banco deu desconto (ex.: Shopee). A diferença some.
//   • Fatura parcelada   — pagou parte e o restante vai para as próximas faturas e vira dívida (juros podem existir).
import { ref, computed, watch } from 'vue';
import FormularioModal from './FormularioModal.vue';
import CampoSelecao from './CampoSelecao.vue';
import CampoValor from './CampoValor.vue';
import AbasSeletor from './AbasSeletor.vue';

const props = defineProps({
  aberto: { type: Boolean, default: false },
  cartao: { type: Object, default: null },
  chave: { type: String, default: '' },
  total: { type: Number, default: 0 },
  contas: { type: Array, default: () => [] },
});
const emit = defineEmits(['fechar', 'salvo']);
const conta = ref('');
const valorPago = ref(0);
const diferenca = ref('desconto');
const parcelas = ref('3');
const erro = ref('');
const salvando = ref(false);
const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const abasDif = [{ id: 'desconto', rotulo: 'Desconto' }, { id: 'parcelada', rotulo: 'Fatura parcelada' }];

const resto = computed(() => Math.round((props.total - (valorPago.value || 0)) * 100) / 100);
const pagouMenos = computed(() => resto.value > 0 && valorPago.value > 0);

watch(() => props.aberto, (a) => {
  if (!a) return;
  erro.value = '';
  conta.value = props.cartao?.contaId || props.contas[0]?.id || '';
  valorPago.value = props.total;
  diferenca.value = 'desconto';
  parcelas.value = '3';
});

async function confirmar() {
  erro.value = '';
  if (!(valorPago.value > 0)) { erro.value = 'Informe o valor pago.'; return; }
  if (valorPago.value > props.total) { erro.value = 'O valor pago não pode ser maior que a fatura.'; return; }
  salvando.value = true;
  try {
    const corpo = { contaId: String(conta.value) };
    if (pagouMenos.value) {
      corpo.valorPago = valorPago.value;
      corpo.diferenca = diferenca.value;
      if (diferenca.value === 'parcelada') corpo.parcelas = Number(parcelas.value);
    }
    const r = await fetch(`/api/cartoes/${props.cartao.id}/faturas/${props.chave}/pagar`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    const d = await r.json();
    if (!r.ok) { erro.value = d.erro || 'Não foi possível marcar como paga.'; return; }
    emit('salvo');
  } finally { salvando.value = false; }
}
</script>

<template>
  <FormularioModal :aberto="aberto" :titulo="`Registrar pagamento · ${cartao ? cartao.nome : ''}`" tema="saida" rotulo-salvar="Confirmar pagamento" :carregando="salvando" :erro="erro" @salvar="conta && confirmar()" @fechar="emit('fechar')">
    <p class="nota">Fatura de <strong>{{ chave }}</strong> · <strong>{{ moeda(total) }}</strong>. O valor pago sai da conta escolhida e entra em Transações como pagamento de fatura.</p>
    <CampoSelecao v-model="conta" rotulo="Conta de onde saiu o dinheiro" :opcoes="contas.map((c) => ({ valor: c.id, rotulo: c.nome }))" tema="saida" obrigatorio />
    <CampoValor v-model="valorPago" rotulo="Valor pago" tema="saida" />
    <template v-if="pagouMenos">
      <p class="nota">Você pagou <strong>{{ moeda(resto) }}</strong> a menos. O que foi essa diferença?</p>
      <AbasSeletor v-model="diferenca" :abas="abasDif" tema="saida" />
      <p v-if="diferenca === 'desconto'" class="nota">Desconto: a loja ou o banco abateu {{ moeda(resto) }}. Esse valor não vira dívida.</p>
      <template v-else>
        <p class="nota">Fatura parcelada: os {{ moeda(resto) }} restantes vão para as próximas faturas e viram uma dívida em Dívidas (pode ter juros).</p>
        <CampoSelecao v-model="parcelas" rotulo="Em quantas parcelas" :opcoes="[2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((n) => ({ valor: String(n), rotulo: `${n}x` }))" tema="saida" />
      </template>
    </template>
  </FormularioModal>
</template>

<style scoped>
.nota { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
</style>
