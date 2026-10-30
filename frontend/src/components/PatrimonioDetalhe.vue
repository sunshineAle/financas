<script setup>
// <PatrimonioDetalhe :aberto="x" @fechar="x = false" /> — janela "Patrimônio" do Início (anotação 60, item 4).
// Lê GET /api/patrimonio (o MESMO cálculo do card do Início). Seletor Ativos | Passivos, blocos com anel de % e total,
// gráfico rosca ↔ barras e os compromissos futuros numa linha à parte (fora do total). Cada bloco leva à página dele.
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ChartPie, ChartBar, ChevronRight, TriangleAlert, CalendarClock } from 'lucide-vue-next';
import Modal from './Modal.vue';
import AbasSeletor from './AbasSeletor.vue';
import DashRosca from './DashRosca.vue';
import BarraDegrade from './BarraDegrade.vue';
import Anel from './Anel.vue';
import Valor from './Valor.vue';
import IconeBanco from './IconeBanco.vue';
import IconeCategoria from './IconeCategoria.vue';
import { guardarRetorno, pegarRetorno } from '../services/retornoPatrimonio.js';

const props = defineProps({ aberto: { type: Boolean, default: false } });
const emit = defineEmits(['fechar']);
const router = useRouter();

const dados = ref(null);
const carregando = ref(false);
const erro = ref('');
const lado = ref('ativos');
const grafico = ref('rosca');
const abertos = ref({});

const ABAS = [
  { id: 'ativos', rotulo: 'Ativos' },
  { id: 'passivos', rotulo: 'Passivos' },
];
// Cor de cada bloco (degradê de/ate da paleta v2)
const CORES = {
  contas: ['var(--entrada-ceu-medio)', 'var(--entrada-royal-medio)'],
  reserva: ['var(--meta-violeta-medio)', 'var(--meta-orquidea-medio)'],
  renda_fixa: ['var(--investimento-esmeralda-medio)', 'var(--investimento-verde-agua-medio)'],
  renda_variavel: ['var(--investimento-menta-medio)', 'var(--investimento-anis-medio)'], // ciano claro: separa da renda fixa (petróleo)
  faturas: ['var(--saida-carmim-medio)', 'var(--saida-tangerina-medio)'],
  dividas: ['var(--saida-vermelho-medio)', 'var(--saida-brasa-medio)'],
  cheque_especial: ['var(--saida-coral-medio)', 'var(--saida-ambar-medio)'],
};
const cor = (chave) => CORES[chave] || ['var(--cor-interface)', 'var(--cor-interface)'];

async function carregar() {
  carregando.value = true;
  erro.value = '';
  try {
    const r = await fetch('/api/patrimonio', { credentials: 'include' });
    if (!r.ok) throw new Error();
    dados.value = await r.json();
  } catch {
    erro.value = 'Não deu para carregar o patrimônio agora. Tente de novo.';
  } finally {
    carregando.value = false;
  }
}
const caixa = ref(null);
watch(() => props.aberto, async (v) => {
  if (!v) return;
  const r = pegarRetorno(); // voltou de uma conta/meta: reabre como estava (seção 9)
  lado.value = r ? r.lado : lado.value;
  abertos.value = r ? r.abertos : {};
  await carregar();
  if (r) setTimeout(() => { const el = caixa.value?.closest('.corpo, .modal-corpo, [data-modal-corpo]') || caixa.value?.parentElement; if (el) el.scrollTop = r.rolagem; }, 60);
}, { immediate: true });

const blocos = computed(() => {
  const l = (dados.value ? dados.value[lado.value] : []) || [];
  return lado.value === 'ativos' ? [...l].sort((a, b) => ORDEM.indexOf(a.chave) - ORDEM.indexOf(b.chave)) : l;
});
const totalLado = computed(() => (dados.value ? (lado.value === 'ativos' ? dados.value.totalAtivos : dados.value.totalPassivos) : 0));
const pct = (v) => (totalLado.value > 0 ? Math.round((v / totalLado.value) * 100) : 0);
const segmentos = computed(() => blocos.value.map((b) => ({ nome: b.rotulo, valor: b.total, cor: cor(b.chave)[0] })));
const compromissos = computed(() => dados.value?.compromissos || { total: 0, itens: [] });
const temaModal = computed(() => (lado.value === 'ativos' ? 'entrada' : 'saida'));

function irPara(rota) {
  const el = caixa.value?.closest('.corpo, .modal-corpo, [data-modal-corpo]') || caixa.value?.parentElement;
  guardarRetorno({ lado: lado.value, abertos: { ...abertos.value }, rolagem: el ? el.scrollTop : 0 });
  emit('fechar');
  router.push(rota);
}
// Toque num item: conta → extrato da conta; meta → extrato da meta; ativo → detalhe do ativo; o resto → página do bloco.
function irItem(b, i) {
  if (b.chave === 'contas' || b.chave === 'cheque_especial') return irPara({ path: '/contas', query: { conta: i.id } });
  if (b.chave === 'reserva' && i.detalhe === 'Meta') return irPara({ path: '/objetivos', query: { meta: i.id } });
  if (b.chave === 'renda_fixa' || b.chave === 'renda_variavel') return irPara({ path: '/objetivos', query: { ativo: i.id } });
  return irPara(b.rota);
}
const TIPO_CONTA = { corrente: 'Conta corrente', poupanca: 'Poupança', corretora: 'Corretora', dinheiro: 'Dinheiro', beneficio: 'Benefício', outra: 'Outra' };
const subItem = (b, i) => (b.chave === 'contas' ? TIPO_CONTA[i.tipo] || 'Conta' : i.detalhe || '');
// "Seus investimentos" acima de "Reserva e metas": a ordem dos ativos passa a ser Contas · Renda fixa · Renda variável · Reserva.
const ORDEM = ['contas', 'renda_fixa', 'renda_variavel', 'reserva'];
const alternar = (chave) => { abertos.value = { ...abertos.value, [chave]: !abertos.value[chave] }; };
const mesFatura = (chave) => {
  const [a, m] = String(chave || '').split('-').map(Number);
  if (!a || !m) return '';
  return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
};
</script>

<template>
  <Modal :aberto="aberto" titulo="Patrimônio" ajuda="inicio.patrimonio" :tema="temaModal" :largura="560" @fechar="emit('fechar')">
    <div ref="caixa" class="patrimonio">
      <p v-if="carregando && !dados" class="estado">Carregando…</p>
      <p v-else-if="erro" class="estado erro" role="alert">{{ erro }}</p>
      <template v-if="dados">
        <!-- Resumo: líquido = ativos − passivos -->
        <div class="resumo">
          <div class="liquido">
            <small>Patrimônio líquido</small>
            <strong class="numero-tabular" :class="{ negativo: dados.patrimonioLiquido < 0 }"><Valor :valor="dados.patrimonioLiquido" /></strong>
          </div>
          <div class="conta numero-tabular">
            <span class="pos"><Valor :valor="dados.totalAtivos" /></span>
            <span class="op">−</span>
            <span class="neg"><Valor :valor="dados.totalPassivos" /></span>
          </div>
        </div>

        <p v-if="!dados.confere" class="aviso" role="status">
          <TriangleAlert :size="16" :stroke-width="2" aria-hidden="true" />O total não bateu com o Início; avise no feedback.
        </p>

        <AbasSeletor v-model="lado" :abas="ABAS" :tema="lado === 'ativos' ? 'entrada' : 'saida'" bloco />

        <!-- Gráfico (rosca ↔ barras) -->
        <section class="grafico" :aria-label="lado === 'ativos' ? 'Gráfico dos ativos' : 'Gráfico dos passivos'">
          <div class="grafico-topo">
            <span class="total-lado">{{ lado === 'ativos' ? 'Total de ativos' : 'Total de passivos' }} · <b class="numero-tabular"><Valor :valor="totalLado" /></b></span>
            <button type="button" class="troca" :aria-label="grafico === 'rosca' ? 'Ver em barras' : 'Ver em rosca'" :title="grafico === 'rosca' ? 'Ver em barras' : 'Ver em rosca'" @click="grafico = grafico === 'rosca' ? 'barras' : 'rosca'">
              <component :is="grafico === 'rosca' ? ChartBar : ChartPie" :size="16" :stroke-width="2" aria-hidden="true" />
              <span>{{ grafico === 'rosca' ? 'Barras' : 'Rosca' }}</span>
            </button>
          </div>
          <DashRosca v-if="grafico === 'rosca'" :segmentos="segmentos" :rotulo-total="lado === 'ativos' ? 'ativos' : 'passivos'"
            :rotulo-vazio="lado === 'ativos' ? 'Nenhum ativo ainda.' : 'Nenhum passivo. Ótimo!'" />
          <ul v-else class="barras">
            <li v-for="b in blocos" :key="b.chave">
              <div class="barra-rotulo"><span>{{ b.rotulo }}</span><b class="numero-tabular"><Valor :valor="b.total" /></b><small>{{ pct(b.total) }}%</small></div>
              <BarraDegrade :pct="pct(b.total)" :de="cor(b.chave)[0]" :ate="cor(b.chave)[1]" :altura="8" :marcador="false" />
            </li>
          </ul>
        </section>

        <!-- Blocos -->
        <ul class="blocos">
          <template v-for="b in blocos" :key="b.chave">
          <li v-if="b.chave === 'reserva'" class="link-inv">
            <button type="button" data-seus-investimentos @click="irPara('/objetivos?aba=investimentos')">Seus investimentos<ChevronRight :size="16" :stroke-width="2" aria-hidden="true" /></button>
          </li>
          <li class="bloco" :class="{ vazio: !b.itens.length }">
            <div class="bloco-topo">
              <Anel :pct="pct(b.total)" :tamanho="44" :espessura="13" :de="cor(b.chave)[0]" :ate="cor(b.chave)[1]">
                <span class="anel-pct numero-tabular">{{ pct(b.total) }}%</span>
              </Anel>
              <button type="button" class="bloco-info" :aria-expanded="!!abertos[b.chave]" :disabled="!b.itens.length" @click="alternar(b.chave)">
                <span class="bloco-nome">{{ b.rotulo }}</span>
                <small>{{ b.itens.length ? `${b.itens.length} ${b.itens.length === 1 ? 'item' : 'itens'}` : 'Nada aqui' }}</small>
              </button>
              <b class="bloco-total numero-tabular"><Valor :valor="b.total" /></b>
              <button type="button" class="ir" :aria-label="`Abrir ${b.rotulo}`" :title="`Abrir ${b.rotulo}`" @click="irPara(b.rota)">
                <ChevronRight :size="18" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
            <!-- seção 9: linhas mais ricas — ícone maior, nome, tipo embaixo e saldo à direita; toque abre o extrato -->
            <ul v-if="abertos[b.chave] && b.itens.length" class="itens">
              <li v-for="i in b.itens" :key="i.id">
                <button type="button" class="item-linha" :aria-label="`${i.nome}: ${b.chave === 'contas' || b.chave === 'cheque_especial' ? 'ver extrato da conta' : 'abrir'}`" @click="irItem(b, i)">
                  <span class="item-icone" aria-hidden="true">
                    <IconeBanco v-if="b.chave === 'contas' || b.chave === 'cheque_especial' || b.chave === 'faturas'" :icone="i.icone || ''" :nome="i.nome" :tamanho="36" :padrao="b.chave === 'faturas' ? '💳' : '🏦'" />
                    <IconeCategoria v-else :valor="i.icone || i.tipo || (b.chave === 'reserva' ? '🎯' : '')" :tipo="b.chave === 'reserva' ? 'meta' : 'investimento'" :tamanho="36" />
                  </span>
                  <span class="item-nome">{{ i.nome }}<small v-if="subItem(b, i)">{{ subItem(b, i) }}<template v-if="i.fatura"> · fatura {{ mesFatura(i.fatura) }}</template></small></span>
                  <b class="numero-tabular"><Valor :valor="i.valor" /></b>
                </button>
              </li>
            </ul>
            <button v-if="abertos[b.chave] && b.chave === 'contas' && b.itens.length === 1" type="button" class="ver-extrato" @click="irItem(b, b.itens[0])">Ver extrato da conta<ChevronRight :size="15" :stroke-width="2" aria-hidden="true" /></button>
          </li>
          </template>
        </ul>

        <!-- Compromissos futuros: informativo, fora do total -->
        <div v-if="lado === 'passivos' || compromissos.total > 0" class="compromissos">
          <button type="button" class="comp-topo" :aria-expanded="!!abertos.compromissos" :disabled="!compromissos.itens.length" @click="alternar('compromissos')">
            <CalendarClock :size="18" :stroke-width="2" aria-hidden="true" />
            <span class="comp-nome">Compromissos futuros<small>Parcelas das próximas faturas · fora do total</small></span>
            <b class="numero-tabular"><Valor :valor="compromissos.total" /></b>
          </button>
          <ul v-if="abertos.compromissos && compromissos.itens.length" class="itens">
            <li v-for="i in compromissos.itens" :key="i.id">
              <span class="item-icone" aria-hidden="true"><IconeBanco :icone="i.icone || ''" :nome="i.nome" :tamanho="22" padrao="💳" /></span>
              <span class="item-nome">{{ i.nome }}<small>{{ i.detalhe }} · fatura {{ mesFatura(i.fatura) }}</small></span>
              <b class="numero-tabular"><Valor :valor="i.valor" /></b>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </Modal>
</template>

<style scoped>
.patrimonio { display: flex; flex-direction: column; gap: 14px; }
.estado { color: var(--cor-texto-suave); text-align: center; padding: 24px 0; }
.estado.erro { color: var(--cor-saida-texto); }

.resumo { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.liquido { display: flex; flex-direction: column; gap: 2px; }
.liquido small { color: var(--cor-texto-suave); font-size: 0.8rem; }
.liquido strong { font-size: 1.6rem; font-weight: 700; color: var(--cor-entrada-texto); }
.liquido strong.negativo { color: var(--cor-saida-texto); }
.conta { display: flex; gap: 6px; align-items: baseline; font-size: 0.85rem; }
.conta .pos { color: var(--cor-entrada-texto); }
.conta .neg { color: var(--cor-saida-texto); }
.conta .op { color: var(--cor-texto-suave); }

.aviso {
  display: flex; align-items: center; gap: 8px; margin: 0; padding: 8px 12px; border-radius: 10px; font-size: 0.82rem;
  background: color-mix(in srgb, var(--cor-amarelo) 16%, transparent); color: var(--cor-texto);
}
.aviso svg { color: var(--cor-amarelo); flex-shrink: 0; }

.grafico { display: flex; flex-direction: column; gap: 10px; }
.grafico-topo { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.total-lado { font-size: 0.85rem; color: var(--cor-texto-suave); }
.total-lado b { color: var(--cor-texto); }
.troca {
  display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: 999px;
  border: 1px solid var(--cor-borda); background: transparent; color: var(--cor-texto); font: inherit; font-size: 0.8rem; cursor: pointer;
}
.troca:hover { background: var(--cor-realce); }
.troca:focus-visible, .ir:focus-visible, .bloco-info:focus-visible, .comp-topo:focus-visible { outline: 2px solid var(--cor-interface); outline-offset: 2px; }

.barras { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.barra-rotulo { display: flex; align-items: baseline; gap: 8px; font-size: 0.85rem; margin-bottom: 4px; }
.barra-rotulo span { flex: 1; }
.barra-rotulo small { color: var(--cor-texto-suave); min-width: 34px; text-align: right; }

.blocos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.bloco { border: 1px solid var(--cor-borda); border-radius: 14px; background: var(--cor-fundo-elevado); overflow: hidden; }
.bloco-topo { display: flex; align-items: center; gap: 10px; padding: 8px 6px 8px 10px; }
.anel-pct { font-size: 0.62rem; font-weight: 600; color: var(--cor-texto-suave); }
.bloco-info {
  flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; min-height: 44px; justify-content: center;
  background: none; border: 0; padding: 0; color: var(--cor-texto); font: inherit; text-align: left; cursor: pointer;
}
.bloco-info:disabled { cursor: default; }
.bloco-nome { font-weight: 600; font-size: 0.95rem; }
.bloco-info small { color: var(--cor-texto-suave); font-size: 0.75rem; }
.bloco.vazio .bloco-nome, .bloco.vazio .bloco-total { color: var(--cor-texto-suave); }
.bloco-total { font-size: 0.95rem; white-space: nowrap; }
.ir {
  display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex-shrink: 0; border-radius: 12px;
  background: none; border: 0; color: var(--cor-texto-suave); cursor: pointer;
}
.ir:hover { background: var(--cor-realce); color: var(--cor-texto); }

.itens { list-style: none; margin: 0; padding: 4px 12px 10px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--cor-borda); }
.itens li { display: block; padding-top: 4px; font-size: 0.92rem; }
.item-linha { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 4px 4px; border: 0; border-radius: 12px; background: none; color: var(--cor-texto); font: inherit; text-align: left; cursor: pointer; }
.item-linha:hover { background: var(--cor-realce); }
.item-linha:focus-visible { outline: 2px solid var(--cor-interface); outline-offset: 1px; }
.item-icone { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0; border-radius: 50%; overflow: hidden; }
.item-nome { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; overflow-wrap: anywhere; font-weight: 600; }
.item-nome small { color: var(--cor-texto-suave); font-size: 0.76rem; font-weight: 400; }
.ver-extrato { display: flex; align-items: center; gap: 2px; margin: 0 12px 10px auto; min-height: 36px; padding: 0; border: 0; background: none; color: var(--cor-primaria); font: 600 0.82rem var(--fonte-texto); cursor: pointer; }
/* "Seus investimentos": linha discreta, sem destaque de holofote */
.link-inv button { display: flex; align-items: center; gap: 2px; min-height: 36px; padding: 0 6px; border: 0; background: none; color: var(--cor-texto-suave); font: 600 0.84rem var(--fonte-texto); cursor: pointer; }
.link-inv button:hover { color: var(--cor-texto); }
.itens b { white-space: nowrap; font-weight: 600; }

.compromissos { border: 1px dashed var(--cor-borda); border-radius: 14px; overflow: hidden; }
.comp-topo {
  width: 100%; display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 8px 12px; background: none; border: 0;
  color: var(--cor-texto); font: inherit; text-align: left; cursor: pointer;
}
.comp-topo:disabled { cursor: default; }
.comp-topo svg { color: var(--cor-texto-suave); flex-shrink: 0; }
.comp-nome { flex: 1; display: flex; flex-direction: column; font-size: 0.92rem; }
.comp-nome small { color: var(--cor-texto-suave); font-size: 0.74rem; }
.comp-topo b { color: var(--cor-texto-suave); white-space: nowrap; }
.nota { margin: 0; font-size: 0.75rem; color: var(--cor-texto-suave); }
</style>
