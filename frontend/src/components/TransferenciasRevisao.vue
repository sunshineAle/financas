<script setup>
import { ref, onMounted } from 'vue';
import CardPadrao from './CardPadrao.vue';
import LinhaTransacao from './LinhaTransacao.vue';
import AjudaSecao from './AjudaSecao.vue';
import ConferirOrigemModal from './ConferirOrigemModal.vue';
import { confirmarOrigem, linhaDaOrigem, nomeDaConta, dataDaOrigem } from '../services/origemTransferencia.js';
import { lancamentoFoiSalvo } from '../services/lancamento.js';
const emit = defineEmits(['quantidade', 'decidido']);
const itens = ref([]), ocupado = ref(false), erro = ref(''), origemId = ref(null);
async function carregar() {
  const r = await fetch('/api/transacoes/transferencias-pendentes');
  if (!r.ok) throw new Error('Não foi possível carregar as transferências.');
  itens.value = (await r.json()).itens; emit('quantidade', itens.value.length);
}
const par = t => (t.candidatas || []).find(c => c.id === t.sugestaoId);
const info = t => ({ nome: nomeDaConta(t) });
async function atualizado() { await carregar(); emit('decidido'); }
async function decidir(t, acao) {
  if (ocupado.value) return;
  erro.value = ''; ocupado.value = true;
  try {
    await confirmarOrigem(t.id, { acao, contaId: t.sugestaoContaId, parceiraId: t.sugestaoId });
    await atualizado(); lancamentoFoiSalvo();
  } catch (e) { erro.value = e.message; } finally { ocupado.value = false; }
}
onMounted(() => carregar().catch(e => { erro.value = e.message; }));
</script>
<template>
  <p v-if="erro" role="alert">{{ erro }} <button type="button" @click="carregar().catch(e => erro = e.message)">Tentar novamente</button></p>
  <CardPadrao v-if="itens.length" titulo="Possíveis transferências" data-revisar-transferencias>
    <template #acoes><AjudaSecao titulo="Conferir transferências" :texto="['Compare contas, datas e valores antes de confirmar. As descrições podem ser diferentes.', 'PIX e nomes parecidos são indícios. A classificação só muda depois da sua decisão. Movimentação própria não exige cadastrar a outra conta.']" /></template>
    <article v-for="t in itens" :key="t.id" class="item-transferencia">
      <LinhaTransacao :t="linhaDaOrigem(t)" :info="info(t)" :clicavel="false" />
      <LinhaTransacao v-if="par(t)" :t="linhaDaOrigem(par(t))" :info="info(par(t))" :clicavel="false" data-outra-ponta />
      <small v-if="t.classificacao?.regra" data-regra-origem>Regra “{{ t.classificacao.regra.padrao }}”<template v-if="t.classificacao.regra.categoriaNome"> → {{ t.classificacao.regra.categoriaNome }}</template></small>
      <small v-else-if="t.conflito && t.classificacao?.categoriaNome">Classificado em {{ t.classificacao.categoriaNome }}</small>
      <small v-if="par(t) && t.data.slice(0,10) !== par(t).data.slice(0,10)">Datas diferentes: {{ dataDaOrigem(t.data) }} e {{ dataDaOrigem(par(t).data) }}.</small>
      <small v-if="t.duplicidadePropria" data-duplicidade-propria>{{ t.motivo }}</small>
      <small v-else-if="!par(t)">{{ (t.candidatas || []).length > 1 ? 'Há mais de uma possibilidade.' : 'Confira a origem deste movimento.' }}</small>
      <div class="botoes tema-neutro">
        <button type="button" class="sf-botao secundario" :disabled="ocupado" @click="decidir(t, 'manter')">{{ t.duplicidadePropria ? 'Não é o mesmo dinheiro' : t.conflito ? (t.valor < 0 ? 'Manter como despesa' : 'Manter como receita') : 'Não é transferência' }}</button>
        <button v-if="par(t) && !t.diferencaCentavos" type="button" class="sf-botao primario" :disabled="ocupado" @click="decidir(t, 'vincular')">{{ t.duplicidadePropria ? 'É o mesmo dinheiro' : 'Confirmar transferência' }}</button>
        <button v-else type="button" class="sf-botao primario" :disabled="ocupado" @click="origemId = t.id">{{ t.conflito ? 'Revisar transferência' : 'Conferir origem' }}</button>
      </div>
      <button v-if="par(t)" type="button" class="outra-origem" :disabled="ocupado" @click="origemId = t.id">Conferir outra origem</button>
    </article>
  </CardPadrao>
  <ConferirOrigemModal :aberto="!!origemId" :transacao-id="origemId" @fechar="origemId = null" @salvo="atualizado" />
</template>
<style scoped>
.item-transferencia { display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--cor-borda); min-width: 0; }
.item-transferencia:last-child { border-bottom: 0; padding-bottom: 0; }
small { color: var(--cor-texto-suave); font-size: 12px; line-height: 1.4; }
.botoes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
.botoes button { min-height: 44px; padding: 8px; white-space: normal; }
.outra-origem { align-self: flex-end; min-height: 36px; border: 0; background: none; color: var(--cor-primaria); font: 600 12px var(--fonte-texto); cursor: pointer; }
</style>
