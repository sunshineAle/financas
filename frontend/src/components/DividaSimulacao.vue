<script setup>
// <DividaSimulacao :divida="d" /> — "Simular quitação" dentro de cada dívida/acordo, no formato do Plano de quitação:
// meses, juros, data final, total pago e mini-tabela mês a mês. Usa os juros da própria dívida/acordo
// (num acordo, a parcela é fixa e os juros já estão embutidos nela). Cálculo no servidor/PWA: GET /api/dividas/:id/simulacao.
import { ref, computed, watch, onMounted } from 'vue';
import { Calculator, ChevronDown } from 'lucide-vue-next';
import CampoValor from './CampoValor.vue';

const props = defineProps({ divida: { type: Object, required: true } });

const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const dataBR = (iso) => { if (!iso) return '—'; const [a, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${a}`; };
const mesAno = (iso) => { if (!iso) return ''; const [a, m] = String(iso).slice(0, 7).split('-'); return `${m}/${a}`; };
const pct = (v) => `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;

const mensal = ref(Number(props.divida.valor_parcela) || 0);
const plano = ref(null);
const erro = ref('');
const carregando = ref(false);
const verTudo = ref(false);
let seq = 0, timer = null;

async function simular() {
  const meu = ++seq;
  erro.value = '';
  carregando.value = true;
  try {
    const q = Number(mensal.value) > 0 ? `?mensal=${Number(mensal.value)}` : '';
    const r = await fetch(`/api/dividas/${props.divida.id}/simulacao${q}`, { credentials: 'include' });
    const j = await r.json();
    if (meu !== seq) return;
    if (!r.ok) { plano.value = null; erro.value = j.erro || 'Não foi possível simular.'; return; }
    plano.value = j;
  } catch { if (meu === seq) { plano.value = null; erro.value = 'Não foi possível simular agora.'; } }
  finally { if (meu === seq) carregando.value = false; }
}
watch(mensal, () => { clearTimeout(timer); timer = setTimeout(simular, 350); });
onMounted(() => { if (Number(mensal.value) > 0) simular(); });

const linhas = computed(() => (plano.value?.tabela || []).slice(0, verTudo.value ? undefined : 6));
const semJuros = computed(() => plano.value && !plano.value.inviavel && !(plano.value.juros > 0));
</script>

<template>
  <section class="simulacao" aria-label="Simular quitação">
    <h4 class="sub"><Calculator :size="14" aria-hidden="true" /> Simular quitação</h4>
    <CampoValor v-model="mensal" tipo="saida" rotulo="Quanto você paga por mês" :dica="divida.valor_parcela ? `Parcela atual: ${moeda(divida.valor_parcela)}. Pague mais para quitar antes.` : 'Informe o valor para ver em quantos meses a dívida acaba.'" />
    <p v-if="plano?.inviavel" class="aviso">{{ plano.motivo || 'Esse valor não quita a dívida.' }}<template v-if="plano.minimo"> Mínimo para cobrir os juros: {{ moeda(plano.minimo) }}.</template></p>
    <p v-else-if="erro" class="aviso">{{ erro }}</p>
    <p v-else-if="!plano && !carregando" class="nota">Digite quanto consegue pagar por mês.</p>

    <template v-if="plano && !plano.inviavel && plano.meses">
      <dl class="quadro" aria-live="polite">
        <div><dt>Meses</dt><dd class="numero-tabular">{{ plano.meses }}</dd></div>
        <div><dt>Juros no período</dt><dd class="numero-tabular" :class="{ neutro: semJuros }">{{ semJuros ? 'Sem juros' : moeda(plano.juros) }}</dd></div>
        <div><dt>Data final</dt><dd class="numero-tabular">{{ mesAno(plano.dataFinal) }}</dd></div>
        <div><dt>Total a pagar</dt><dd class="numero-tabular">{{ moeda(plano.totalPago) }}</dd></div>
      </dl>
      <p class="nota">Juros de {{ pct(plano.taxaMensal) }} ao mês{{ divida.parcelas_total ? ' (embutidos nas parcelas do acordo)' : '' }}. Última parcela em {{ dataBR(plano.dataFinal) }}.</p>
      <div class="tabela-rolagem">
        <table class="mini">
          <thead><tr><th>Mês</th><th>Data</th><th>Juros</th><th>Pago</th><th>Saldo</th></tr></thead>
          <tbody>
            <tr v-for="l in linhas" :key="l.mes"><td>{{ l.mes }}</td><td>{{ dataBR(l.data).slice(0, 5) }}</td><td class="numero-tabular">{{ moeda(l.juros) }}</td><td class="numero-tabular">{{ moeda(l.pago) }}</td><td class="numero-tabular">{{ moeda(l.saldo) }}</td></tr>
          </tbody>
        </table>
      </div>
      <button v-if="plano.tabela.length > 6" type="button" class="ver-tudo" @click="verTudo = !verTudo"><ChevronDown :size="14" :class="{ girada: verTudo }" aria-hidden="true" /> {{ verTudo ? 'Mostrar menos' : `Ver os ${plano.tabela.length} meses` }}</button>
    </template>
  </section>
</template>

<style scoped>
.simulacao { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 14px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); min-width: 0; }
.sub { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 13px; font-family: var(--fonte-display); color: var(--cor-texto-suave); }
.nota { margin: 0; font-size: 12px; color: var(--cor-texto-suave); }
.aviso { margin: 0; padding: 10px 12px; border-radius: 12px; font-size: 13px; background: color-mix(in srgb, var(--saida-ambar-medio) 16%, transparent); color: var(--cor-texto); }
.quadro { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; font-size: 12px; }
.quadro dt { color: var(--cor-texto-suave); }
.quadro dd { margin: 2px 0 0; font-weight: 700; font-size: 15px; font-family: var(--fonte-display); color: var(--cor-saida-texto); overflow-wrap: anywhere; }
.quadro dd.neutro { color: var(--cor-zero-texto); }
.tabela-rolagem { overflow-x: auto; }
.mini { width: 100%; border-collapse: collapse; font-size: 12px; }
.mini th { text-align: right; font-weight: 600; color: var(--cor-texto-suave); padding: 4px 6px; border-bottom: 1px solid var(--cor-borda); white-space: nowrap; }
.mini td { text-align: right; padding: 5px 6px; border-bottom: 1px solid var(--cor-borda); white-space: nowrap; }
.mini th:first-child, .mini td:first-child { text-align: left; }
.mini th:nth-child(2), .mini td:nth-child(2) { text-align: left; }
.ver-tudo { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding: 6px 12px; border-radius: 10px; border: 1px solid var(--cor-borda); background: transparent; color: var(--cor-texto); font-size: 13px; font-weight: 600; cursor: pointer; }
.girada { transform: rotate(180deg); }
</style>
