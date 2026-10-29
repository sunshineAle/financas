<script setup>
// <DividaPlanoGeral :aberto :orcamento-sugerido @fechar /> — "Plano para todas as dívidas": avalanche (maior juros primeiro)
// × bola de neve (menor saldo primeiro), com a ordem de pagamento e o valor, os juros e o mês de quitação de cada dívida.
// Cálculo em POST /api/dividas/plano.
import { ref, computed, watch } from 'vue';
import Modal from './Modal.vue';
import AbasSeletor from './AbasSeletor.vue';
import CampoValor from './CampoValor.vue';
import { Flame } from 'lucide-vue-next';
import { taxaCartao } from '../utils/jurosCartao.js';

const props = defineProps({ aberto: Boolean });
const emit = defineEmits(['fechar']);

const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const pct = (v) => `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
const mesesTxt = (m) => (m == null ? '—' : `${m} ${m === 1 ? 'mês' : 'meses'}`);

const mensal = ref(0);
const metodo = ref('avalanche');
const dados = ref(null);
const erro = ref('');
let seq = 0, timer = null;
// Referência do rotativo (média Bacen) para o cheque especial / fatura vencida sem taxa cadastrada (anotação 60.5)
let referencia = null;

async function carregar() {
  const meu = ++seq;
  erro.value = '';
  try {
    if (!referencia) { try { const t = await taxaCartao(); referencia = { rotativo: t?.rotativoMensal || undefined }; } catch { referencia = {}; } }
    const r = await fetch('/api/dividas/plano', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ mensal: Number(mensal.value) > 0 ? Number(mensal.value) : undefined, taxasReferencia: referencia }) });
    const j = await r.json();
    if (meu !== seq) return;
    if (!r.ok) { dados.value = null; erro.value = j.erro || 'Não foi possível montar o plano.'; return; }
    dados.value = j;
  } catch { if (meu === seq) { dados.value = null; erro.value = 'Não foi possível montar o plano agora.'; } }
}
watch(() => props.aberto, (a) => { if (a) { mensal.value = 0; dados.value = null; carregar(); } });
watch(mensal, () => { if (!props.aberto) return; clearTimeout(timer); timer = setTimeout(carregar, 350); });

const abas = [{ id: 'avalanche', rotulo: 'Avalanche' }, { id: 'bolaDeNeve', rotulo: 'Bola de neve' }];
const plano = computed(() => dados.value?.[metodo.value] || null);
const outro = computed(() => dados.value?.[metodo.value === 'avalanche' ? 'bolaDeNeve' : 'avalanche'] || null);
const economia = computed(() => (plano.value && outro.value && !plano.value.inviavel && !outro.value.inviavel ? Math.round((outro.value.juros - plano.value.juros) * 100) / 100 : 0));
// Juros mais caros (cheque especial e rotativo): selo na lista e uma frase curta por tipo
const caros = computed(() => (plano.value?.ordem || []).filter((o) => o.caro));
const frasesCaros = computed(() => [...new Set(caros.value.map((o) => o.caro.frase))]);
const descricao = computed(() => (metodo.value === 'avalanche' ? 'Paga primeiro a dívida com o maior juros. Costuma gastar menos juros.' : 'Paga primeiro a dívida de menor saldo. Quita mais rápido as pequenas e motiva.'));
</script>

<template>
  <Modal :aberto="aberto" titulo="Plano para todas as dívidas" tema="saida" @fechar="emit('fechar')">
    <div class="corpo">
      <p v-if="dados && !dados.dividas" class="nota">Nenhuma dívida em aberto para planejar.</p>
      <template v-else>
        <CampoValor v-model="mensal" tipo="saida" rotulo="Quanto você consegue pagar por mês" :dica="dados?.avalanche ? `Em branco = soma das parcelas (${moeda(dados.avalanche.minimos)}).` : ''" />
        <AbasSeletor v-model="metodo" :abas="abas" tema="saida" bloco />
        <p class="nota">{{ descricao }}</p>
        <p v-if="erro" class="aviso">{{ erro }}</p>
        <p v-else-if="plano?.inviavel" class="aviso">Com {{ moeda(plano.orcamento) }} por mês as dívidas não chegam a ser quitadas (os juros crescem mais que o pagamento). Aumente o valor.</p>
        <template v-else-if="plano">
          <dl class="resumo" aria-live="polite">
            <div><dt>Tempo total</dt><dd class="numero-tabular">{{ mesesTxt(plano.meses) }}</dd></div>
            <div><dt>Juros no período</dt><dd class="numero-tabular">{{ moeda(plano.juros) }}</dd></div>
            <div><dt>Total a pagar</dt><dd class="numero-tabular">{{ moeda(plano.totalPago) }}</dd></div>
          </dl>
          <p v-if="economia > 0" class="nota">Em juros, esse método gasta {{ moeda(economia) }} a menos que o outro.</p>
          <p v-else-if="economia < 0" class="nota">Em juros, esse método gasta {{ moeda(-economia) }} a mais que o outro.</p>
          <div v-if="caros.length" class="caros" data-juros-caros>
            <Flame :size="16" aria-hidden="true" />
            <p><strong>Juros mais caros: {{ caros.map((o) => o.caro.rotulo.toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(' e ') }}.</strong> {{ frasesCaros.join(' ') }} <template v-if="metodo === 'avalanche'">Na avalanche eles vêm primeiro porque a ordem segue a taxa.</template><template v-else>Mesmo na bola de neve, vale quitar estes antes se puder.</template></p>
          </div>
          <h4 class="sub">Ordem de pagamento</h4>
          <ol class="ordem">
            <li v-for="(o, i) in plano.ordem" :key="o.id" :class="{ cara: o.caro }">
              <span class="pos" aria-hidden="true">{{ i + 1 }}</span>
              <span class="info">
                <strong>{{ o.nome }}</strong>
                <span v-if="o.caro" class="selo-caro"><Flame :size="12" aria-hidden="true" /> juros mais caros · {{ o.caro.rotulo }}</span>
                <small>Saldo {{ moeda(o.saldo) }} · juros {{ pct(o.taxa) }} ao mês<template v-if="o.caro?.taxaEstimada"> (estimado)</template></small>
                <small>Pago no plano {{ moeda(o.totalPago) }} · juros {{ moeda(o.juros) }} · quita no mês {{ o.mesQuitacao }}</small>
              </span>
            </li>
          </ol>
        </template>
        <p v-else class="nota">Calculando…</p>
      </template>
    </div>
    <template #rodape>
      <button type="button" class="fechar" @click="emit('fechar')">Fechar</button>
    </template>
  </Modal>
</template>

<style scoped>
.corpo { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.nota { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.aviso { margin: 0; padding: 10px 12px; border-radius: 12px; font-size: 13px; background: color-mix(in srgb, var(--saida-ambar-medio) 16%, transparent); color: var(--cor-texto); }
.sub { margin: 4px 0 0; font-size: 13px; font-family: var(--fonte-display); color: var(--cor-texto-suave); }
.resumo { margin: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; font-size: 12px; padding: 12px; border-radius: 14px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); }
.resumo dt { color: var(--cor-texto-suave); }
.resumo dd { margin: 2px 0 0; font-weight: 700; font-size: 15px; font-family: var(--fonte-display); color: var(--cor-saida-texto); overflow-wrap: anywhere; }
.ordem { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.ordem li { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid var(--cor-borda); }
.ordem li:last-child { border-bottom: none; }
.pos { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 13px; background: var(--degrade-saida); color: var(--cor-sobre-cor); }
.info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.info strong { overflow-wrap: anywhere; }
.info small { font-size: 12px; color: var(--cor-texto-suave); overflow-wrap: anywhere; }
.caros { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: var(--cor-saida-fundo); color: var(--cor-saida-texto); }
.caros p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--cor-texto); }
.caros :deep(svg) { flex: none; margin-top: 2px; }
.selo-caro { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: var(--cor-saida-fundo); color: var(--cor-saida-texto); }
.ordem li.cara .pos { box-shadow: 0 0 0 2px var(--cor-fundo-elevado, var(--cor-card)), 0 0 0 4px var(--cor-saida); }
.fechar { width: 100%; min-height: 46px; border-radius: 12px; border: 1px solid var(--cor-borda); background: transparent; color: var(--cor-texto); font-weight: 600; font-size: 14px; cursor: pointer; }
@media (max-width: 480px) { .resumo { grid-template-columns: 1fr 1fr; } }
</style>
