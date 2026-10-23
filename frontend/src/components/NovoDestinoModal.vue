<script setup>
// Janela "Novo banco/conta" ou "Novo cartão" aberta DENTRO da importação (sem sair da tela). Reaproveita os mesmos campos
// e endpoints dos cadastros de Contas e Cartões (CampoInstituicao etc.). Props: aberto, tipo ('conta'|'fatura'),
// nomeSugerido (instituição reconhecida no arquivo), contas (para o cartão escolher a conta que paga a fatura).
// Emite: criado(registro), fechar.
import { ref, watch } from 'vue';
import FormularioModal from './FormularioModal.vue';
import CampoInstituicao from './CampoInstituicao.vue';
import CampoSelecao from './CampoSelecao.vue';
import CampoValor from './CampoValor.vue';
import CampoTexto from './CampoTexto.vue';

const props = defineProps({
  aberto: Boolean,
  tipo: { type: String, default: 'conta' },
  nomeSugerido: { type: String, default: '' },
  contas: { type: Array, default: () => [] },
});
const emit = defineEmits(['criado', 'fechar']);

const TIPOS_CONTA = [
  { valor: 'corrente', rotulo: 'Conta corrente' }, { valor: 'poupanca', rotulo: 'Poupança' }, { valor: 'corretora', rotulo: 'Corretora (investimentos)' },
  { valor: 'dinheiro', rotulo: 'Dinheiro em espécie' }, { valor: 'beneficio', rotulo: 'Benefício (vale alimentação, vale presente…)' }, { valor: 'outra', rotulo: 'Outra' },
];
const vazio = () => (props.tipo === 'conta'
  ? { nome: props.nomeSugerido || '', tipo: 'corrente', saldo: 0, icone: '🏦', cor: '' }
  : { nome: props.nomeSugerido || '', contaId: '', limite: 0, diaFechamento: '', diaVencimento: '', icone: '💳', cor: '' });
const f = ref(vazio());
const erros = ref({});
const erro = ref('');
const salvando = ref(false);
watch(() => props.aberto, (a) => { if (a) { f.value = vazio(); erros.value = {}; erro.value = ''; } });

const diaOk = (v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 31;
async function salvar() {
  erro.value = ''; erros.value = {};
  const x = f.value;
  const ehConta = props.tipo === 'conta';
  if (!x.nome.trim()) erros.value.nome = ehConta ? 'Informe um nome para a conta.' : 'Informe um nome para o cartão.';
  if (!ehConta && !diaOk(x.diaFechamento)) erros.value.diaFechamento = 'Dia de 1 a 31.';
  if (!ehConta && !diaOk(x.diaVencimento)) erros.value.diaVencimento = 'Dia de 1 a 31.';
  if (Object.keys(erros.value).length) return;
  salvando.value = true;
  try {
    const corpo = ehConta
      ? { nome: x.nome, tipo: x.tipo, saldo: Number(x.saldo) || 0, icone: x.icone, cor: x.cor || null }
      : { nome: x.nome, contaId: x.contaId === '' ? null : x.contaId, limite: Number(x.limite) > 0 ? Number(x.limite) : null, diaFechamento: Number(x.diaFechamento), diaVencimento: Number(x.diaVencimento), icone: x.icone, cor: x.cor || null };
    const r = await fetch(ehConta ? '/api/contas' : '/api/cartoes', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    let d = null; try { d = await r.json(); } catch { /* sem corpo */ }
    if (!r.ok) { erro.value = (d && d.erro) || 'Não foi possível salvar.'; return; }
    emit('criado', d);
  } finally { salvando.value = false; }
}
</script>

<template>
  <FormularioModal :aberto="aberto" :titulo="tipo === 'conta' ? 'Novo banco/conta' : 'Novo cartão'" :tema="tipo === 'conta' ? 'entrada' : 'saida'" :carregando="salvando" :erro="erro" :rotulo-salvar="tipo === 'conta' ? 'Adicionar conta' : 'Adicionar cartão'" @salvar="salvar" @fechar="$emit('fechar')">
    <p v-if="nomeSugerido" class="nota-novo">Instituição reconhecida no arquivo: <b>{{ nomeSugerido }}</b>.</p>
    <template v-if="tipo === 'conta'">
      <CampoInstituicao v-model:nome="f.nome" v-model:icone="f.icone" v-model:cor="f.cor" rotulo="Instituição" :erro="erros.nome" obrigatorio tema="entrada" />
      <CampoSelecao v-model="f.tipo" rotulo="Tipo" :opcoes="TIPOS_CONTA" />
      <CampoValor v-model="f.saldo" rotulo="Saldo atual" tema="entrada" permite-negativo />
    </template>
    <template v-else>
      <CampoInstituicao v-model:nome="f.nome" v-model:icone="f.icone" v-model:cor="f.cor" rotulo="Instituição do cartão" placeholder="Ex: Nubank, Americanas, Magalu" padrao="💳" :erro="erros.nome" obrigatorio tema="saida" />
      <CampoSelecao v-model="f.contaId" rotulo="Conta que paga a fatura" :opcoes="[{ valor: '', rotulo: 'Nenhuma (sem vínculo)' }, ...contas.map((c) => ({ valor: c.id, rotulo: c.nome }))]" tema="saida" />
      <div class="duas-novo">
        <CampoTexto v-model="f.diaFechamento" rotulo="Dia de fechamento" type="number" min="1" max="31" inputmode="numeric" :erro="erros.diaFechamento" obrigatorio tema="saida" />
        <CampoTexto v-model="f.diaVencimento" rotulo="Dia de vencimento" type="number" min="1" max="31" inputmode="numeric" :erro="erros.diaVencimento" obrigatorio tema="saida" />
      </div>
      <CampoValor v-model="f.limite" rotulo="Limite (opcional)" tipo="saida" />
    </template>
  </FormularioModal>
</template>

<style scoped>
.nota-novo { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.duas-novo { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
@media (max-width: 480px) { .duas-novo { grid-template-columns: 1fr; } }
</style>
