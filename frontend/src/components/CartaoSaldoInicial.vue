<script setup>
// <CartaoSaldoInicial v-model="saldo" /> — "Começando no meio do mês" (anotação 55, cartões): valor que já está na
// fatura atual e parcelas restantes de compras antigas. v-model: { faturaAberta: number, parcelas: [{ descricao,
// valorParcela, faltam, total }] }. Quem grava é POST /api/cartoes/:id/saldo-inicial (ver corpoSaldoInicial).
import { Plus, X } from 'lucide-vue-next';
import CampoValor from './CampoValor.vue';
import CampoTexto from './CampoTexto.vue';
import AjudaSecao from './AjudaSecao.vue';

const modelo = defineModel({ type: Object, required: true });
defineProps({ erros: { type: Object, default: () => ({}) } });

function adicionar() { modelo.value.parcelas.push({ descricao: '', valorParcela: 0, faltam: '', total: '' }); }
function remover(i) { modelo.value.parcelas.splice(i, 1); }
</script>

<script>
// Monta o corpo do POST (ignora linhas vazias). Devolve null quando não há nada para gravar.
export function corpoSaldoInicial(s) {
  const parcelas = (s?.parcelas || [])
    .filter((p) => String(p.descricao || '').trim() || Number(p.valorParcela) > 0)
    .map((p) => ({ descricao: String(p.descricao || '').trim(), valorParcela: Number(p.valorParcela) || 0, faltam: Number(p.faltam) || 0, total: p.total === '' || p.total == null ? undefined : Number(p.total) }));
  const faturaAberta = Number(s?.faturaAberta) > 0 ? Number(s.faturaAberta) : undefined;
  if (!faturaAberta && !parcelas.length) return null;
  return { faturaAberta, parcelas };
}
export const saldoInicialVazio = () => ({ faturaAberta: 0, parcelas: [] });
</script>

<template>
  <div class="saldo-inicial">
    <CampoValor v-model="modelo.faturaAberta" tipo="saida" rotulo="Fatura atual já em aberto" dica="O que já está na fatura deste mês." dica-ao-focar :erro="erros.faturaAberta" />
    <div class="parcelas">
      <span class="titulo">Parcelas restantes de compras antigas<AjudaSecao secao="cartoes.parcelas-restantes" /></span>
      <div v-for="(p, i) in modelo.parcelas" :key="i" class="parcela">
        <div class="linha-topo">
          <CampoTexto v-model="p.descricao" rotulo="Descrição" placeholder="Ex.: Geladeira" tema="saida" />
          <button type="button" class="remover" :aria-label="`Remover compra ${i + 1}`" @click="remover(i)"><X :size="18" /></button>
        </div>
        <CampoValor v-model="p.valorParcela" tipo="saida" rotulo="Valor da parcela" />
        <div class="duas">
          <CampoTexto v-model="p.faltam" rotulo="Quantas faltam" type="number" min="1" max="48" inputmode="numeric" tema="saida" />
          <CampoTexto v-model="p.total" rotulo="Total de parcelas (opcional)" type="number" min="1" max="48" inputmode="numeric" tema="saida" />
        </div>
      </div>
      <button type="button" class="adicionar" @click="adicionar"><Plus :size="16" /> Adicionar compra parcelada</button>
    </div>
  </div>
</template>

<style scoped>
.saldo-inicial { display: flex; flex-direction: column; gap: 14px; }
.parcelas { display: flex; flex-direction: column; gap: 10px; }
.titulo { font-size: 13px; font-weight: 600; }
.nota { margin: -6px 0 0; font-size: 12.5px; color: var(--cor-texto-suave); }
.parcela { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 14px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); }
.linha-topo { display: flex; align-items: flex-end; gap: 8px; }
.linha-topo > :first-child { flex: 1; min-width: 0; }
.remover { flex: none; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; border: 1px solid var(--cor-borda); background: transparent; color: var(--cor-texto-suave); cursor: pointer; }
.duas { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 420px) { .duas { grid-template-columns: 1fr; } }
.adicionar { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border-radius: 12px; border: 1px dashed var(--cor-borda); background: transparent; color: var(--cor-texto); font: 600 13.5px var(--fonte-texto); cursor: pointer; }
</style>
