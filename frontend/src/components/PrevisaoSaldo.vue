<script setup>
// "Dinheiro nas contas" + previsão do saldo (anotação 51). Única exceção à regra "cada transação conta na data da compra":
// aqui a fatura do cartão entra no VENCIMENTO, porque a pergunta é "quanto vou ter na conta?".
// Previsto = saldo de hoje + entradas recorrentes − Custo de vida − faturas que vencem − parcelas de dívidas e acordos.
// Linha tracejada "Previsto" para os próximos meses financeiros; tocar num mês mostra a composição.
// Se o saldo ficar negativo, aviso com atalho para o plano de quitação.
//   <PrevisaoSaldo />            (lê /api/custos-fixos/previsao)
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Wallet, TriangleAlert, ChevronRight } from 'lucide-vue-next';
import Valor from './Valor.vue';
import { MESES_CURTOS } from '../services/mes.js';

const router = useRouter();
const dados = ref(null);
const erro = ref(false);
const sel = ref(1); // índice do mês escolhido (0 = mês atual)

onMounted(async () => {
  try {
    const r = await fetch('/api/custos-fixos/previsao?meses=6', { credentials: 'include' });
    if (!r.ok) throw new Error();
    dados.value = await r.json();
    sel.value = Math.min(1, dados.value.meses.length - 1);
  } catch { erro.value = true; }
});

const curto = (chave) => MESES_CURTOS[Number(chave.slice(5, 7)) - 1];
const nomeMes = (r) => String(r || '').replace(/ de \d{4}$/, '');

// ---- gráfico (SVG com viewBox fixo; escala vertical inclui o zero) ----
const L = 320, A = 120, PX = 18, PT = 14, PB = 10;
const pontos = computed(() => {
  if (!dados.value) return [];
  const vals = [dados.value.saldoContas, ...dados.value.meses.map((m) => m.saldo)];
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  const amp = max - min || 1;
  const passo = (L - PX * 2) / (vals.length - 1);
  return vals.map((v, i) => ({ x: PX + i * passo, y: PT + (1 - (v - min) / amp) * (A - PT - PB), v, neg: v < 0 }));
});
const yZero = computed(() => {
  if (!dados.value) return 0;
  const vals = [dados.value.saldoContas, ...dados.value.meses.map((m) => m.saldo)];
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  return PT + (1 - (0 - min) / (max - min || 1)) * (A - PT - PB);
});
const caminho = computed(() => pontos.value.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '));
const temNegativo = computed(() => pontos.value.some((p) => p.neg));
const vazio = computed(() => pontos.value.every((p) => Math.abs(p.v) < 0.005));
const mesSel = computed(() => dados.value?.meses[sel.value] || null);
</script>

<template>
  <section class="previsao" data-previsao-saldo aria-labelledby="h-previsao">
    <div class="cabeca">
      <h2 id="h-previsao"><Wallet :size="18" :stroke-width="2" /> Dinheiro nas contas</h2>
      <small>saldo real hoje</small>
    </div>
    <p v-if="erro" class="nota">Não foi possível calcular a previsão agora.</p>
    <template v-else-if="dados">
      <strong class="saldo numero-tabular" :class="{ neg: dados.saldoContas < 0 }"><Valor :valor="dados.saldoContas" /></strong>

      <p v-if="vazio" class="nota">Cadastre suas contas, o Custo de vida e as entradas para ver a previsão dos próximos meses.</p>
      <template v-else>
      <figure class="grafico" :aria-label="`Previsão do saldo nos próximos ${dados.meses.length} meses`">
        <svg :viewBox="`0 0 ${L} ${A}`" preserveAspectRatio="none" role="img" aria-hidden="true">
          <line v-if="temNegativo" :x1="0" :x2="L" :y1="yZero" :y2="yZero" class="zero" />
          <path :d="caminho" class="linha-prev" vector-effect="non-scaling-stroke" />
        </svg>
        <div class="marcas">
          <span v-for="(p, i) in pontos" :key="i" class="ponto" :class="{ neg: p.neg, hoje: i === 0, sel: i - 1 === sel }" :style="{ left: (p.x / L * 100) + '%', top: (p.y / A * 100) + '%' }"></span>
        </div>
        <figcaption class="legenda"><span class="traco"></span> Previsto · a fatura conta no vencimento</figcaption>
      </figure>

      <div class="meses" role="tablist" aria-label="Escolha o mês da previsão">
        <span class="mes-hoje">Hoje</span>
        <button v-for="(m, i) in dados.meses" :key="m.mes" type="button" role="tab" :aria-selected="sel === i" :class="{ ativo: sel === i, neg: m.saldo < 0 }" @click="sel = i">{{ curto(m.mes) }}</button>
      </div>

      <div v-if="mesSel" class="composicao" data-composicao>
        <p class="tit">{{ mesSel.atual ? `Até o fim de ${nomeMes(mesSel.rotulo)}` : `Em ${nomeMes(mesSel.rotulo)}` }}</p>
        <ul>
          <li><span>+ Entradas previstas</span><b class="numero-tabular"><Valor :valor="mesSel.entradas" /></b></li>
          <li><span>− Custo de vida{{ mesSel.atual ? ' (o que falta)' : '' }}</span><b class="numero-tabular"><Valor :valor="mesSel.custoDeVida" /></b></li>
          <li><span>− Faturas que vencem</span><b class="numero-tabular"><Valor :valor="mesSel.faturas.total" /></b></li>
          <li><span>− Parcelas de dívidas e acordos</span><b class="numero-tabular"><Valor :valor="mesSel.dividas.total" /></b></li>
          <li class="total" :class="{ neg: mesSel.saldo < 0 }"><span>= Saldo previsto</span><b class="numero-tabular"><Valor :valor="mesSel.saldo" /></b></li>
        </ul>
        <p v-if="dados.semEntradas" class="nota">Sem entradas nos últimos meses: a previsão considera só as saídas.</p>
      </div>

      </template>
      <button v-if="dados.negativoEm" type="button" class="alerta" data-alerta-negativo @click="router.push('/dividas?plano=1')">
        <TriangleAlert :size="18" :stroke-width="2" />
        <span>Mantendo as dívidas atuais, o saldo fica negativo em <b>{{ nomeMes(dados.negativoEm.rotulo) }}</b>. Ver plano de quitação</span>
        <ChevronRight :size="18" :stroke-width="2" />
      </button>
    </template>
    <p v-else class="nota">Calculando…</p>
  </section>
</template>

<style scoped>
.previsao { background: var(--cor-card); border: 1px solid var(--cor-card-borda); border-radius: var(--raio-card, 16px); padding: 16px 18px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.cabeca { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.cabeca h2 { display: inline-flex; align-items: center; gap: 8px; font-family: var(--fonte-display); font-size: 16px; margin: 0; }
.cabeca h2 svg { color: var(--cor-entrada); }
.cabeca small { font-size: 12.5px; color: var(--cor-texto-suave); }
.saldo { font-family: var(--fonte-display); font-size: 26px; line-height: 1.1; }
.saldo.neg, .total.neg b { color: var(--cor-grave); }
.nota { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.grafico { position: relative; margin: 4px 0 0; }
.grafico svg { display: block; width: 100%; height: 110px; overflow: visible; }
.linha-prev { fill: none; stroke: var(--cor-entrada); stroke-width: 2.25; stroke-dasharray: 6 5; stroke-linecap: round; stroke-linejoin: round; }
.zero { stroke: var(--cor-grave); stroke-width: 1; stroke-dasharray: 2 4; opacity: 0.6; vector-effect: non-scaling-stroke; }
.marcas { position: absolute; inset: 0 0 auto 0; height: 110px; pointer-events: none; }
.ponto { position: absolute; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; background: var(--cor-card); border: 2px solid var(--cor-entrada); }
.ponto.hoje { background: var(--cor-entrada); }
.ponto.neg { border-color: var(--cor-grave); }
.ponto.sel { width: 13px; height: 13px; margin: -6.5px 0 0 -6.5px; background: var(--cor-entrada); box-shadow: 0 0 0 4px color-mix(in srgb, var(--cor-entrada) 20%, transparent); }
.ponto.sel.neg { background: var(--cor-grave); box-shadow: 0 0 0 4px color-mix(in srgb, var(--cor-grave) 20%, transparent); }
.legenda { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 11.5px; color: var(--cor-texto-suave); }
.traco { width: 18px; border-top: 2px dashed var(--cor-entrada); }
.meses { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.meses > * { min-height: 40px; display: flex; align-items: center; justify-content: center; font: 600 12px var(--fonte-texto); color: var(--cor-texto-suave); border-radius: 10px; }
.meses button { border: none; background: none; cursor: pointer; padding: 0; }
.meses button:hover { background: var(--cor-realce); }
.meses button.ativo { background: color-mix(in srgb, var(--cor-entrada) 14%, transparent); color: var(--cor-entrada-texto, var(--cor-entrada)); }
.meses button.neg { color: var(--cor-grave); }
.mes-hoje { font-weight: 700; }
.composicao { border-top: 1px solid var(--cor-borda); padding-top: 8px; }
.composicao .tit { margin: 0 0 4px; font-size: 13px; font-weight: 600; }
.composicao ul { list-style: none; margin: 0; padding: 0; }
.composicao li { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; font-size: 13.5px; }
.composicao li span { color: var(--cor-texto-suave); }
.composicao li.total { border-top: 1px solid var(--cor-borda); margin-top: 2px; padding-top: 7px; font-weight: 700; }
.composicao li.total span { color: var(--cor-texto); }
.alerta { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--cor-grave) 35%, transparent); background: color-mix(in srgb, var(--cor-grave) 9%, transparent); color: var(--cor-texto); font: 13.5px/1.45 var(--fonte-texto); text-align: left; cursor: pointer; }
.alerta svg:first-child { color: var(--cor-grave); flex: none; }
.alerta span { flex: 1; }
</style>
