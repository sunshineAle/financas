<script setup>
import { ref, onMounted } from 'vue';
import CardPadrao from './CardPadrao.vue';
import { lancamentoFoiSalvo as avisarMudanca } from '../services/lancamento.js';
const emit = defineEmits(['quantidade', 'decidido']);
const itens = ref([]), ocupado = ref(false), erro = ref('');
const moeda = v => Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
async function carregar() {
  const r = await fetch('/api/transacoes/transferencias-pendentes');
  if (!r.ok) throw new Error('Não foi possível carregar as transferências. Tente novamente.');
  itens.value = (await r.json()).itens.map(t => ({ ...t, contaEscolhida: t.sugestaoContaId || '', parceiraEscolhida: t.sugestaoId || '' }));
  emit('quantidade', itens.value.length);
}
async function decidir(t, acao) {
  erro.value = ''; ocupado.value = true;
  try {
    const r = await fetch(`/api/transacoes/${t.id}/revisar-transferencia`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao, contaId: t.contaEscolhida, parceiraId: t.parceiraEscolhida }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.erro);
    await carregar(); emit('decidido'); avisarMudanca();
  } catch (e) { erro.value = e.message; } finally { ocupado.value = false; }
}
const candidatas = t => t.candidatas.filter(c => c.contaId === t.contaEscolhida);
onMounted(() => carregar().catch(e => { erro.value = e.message; }));
</script>
<template>
  <p v-if="erro" role="alert">{{ erro }} <button type="button" @click="carregar().catch(e => erro = e.message)">Tentar novamente</button></p>
  <CardPadrao v-if="itens.length" titulo="Possíveis transferências" :subtitulo="`${itens.length} lançamento(s) para confirmar`" data-revisar-transferencias>
    <article v-for="t in itens" :key="t.id" class="item-transferencia">
      <b>{{ t.descricao }} · {{ moeda(t.valor) }}</b>
      <small>{{ t.data.slice(0, 10) }} · {{ t.valor < 0 ? 'Saiu da conta' : 'Entrou na conta' }}</small>
      <p>{{ t.motivo }}</p>
      <details><summary>Como funciona?</summary>O valor sai de uma conta e entra na outra. Depois de confirmar, não conta como entrada nem gasto. Se o outro extrato ainda não foi importado, a outra ponta será criada na conta escolhida.</details>
      <select v-model="t.contaEscolhida" class="sf-entrada" aria-label="Outra conta da transferência" @change="t.parceiraEscolhida = ''">
        <option value="">Escolha a outra conta</option><option v-for="c in t.contas" :key="c.id" :value="c.id">{{ c.nome }}</option>
      </select>
      <select v-if="candidatas(t).length" v-model="t.parceiraEscolhida" class="sf-entrada" aria-label="Lançamento correspondente">
        <option value="">Escolha o lançamento correspondente</option><option v-for="c in candidatas(t)" :key="c.id" :value="c.id">{{ c.descricao }} · {{ c.data.slice(0, 10) }}</option>
      </select>
      <div class="botoes"><button type="button" class="sf-botao primario" :disabled="ocupado || !t.contaEscolhida || t.diferencaCentavos || (candidatas(t).length && !t.parceiraEscolhida)" @click="decidir(t, 'vincular')">Vincular</button><button type="button" class="sf-botao secundario" :disabled="ocupado" @click="decidir(t, 'recusar')">Não é transferência</button></div>
    </article>
  </CardPadrao>
</template>
<style scoped>
.item-transferencia { display: flex; flex-direction: column; gap: 10px; padding: 16px 0; border-bottom: 1px solid var(--cor-borda); }
.item-transferencia:last-child { border-bottom: none; }
p { margin: 0; } small, details { color: var(--cor-texto-suave); font-size: 13px; }
select { min-height: 44px; width: 100%; } .botoes { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
