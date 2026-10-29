// Mês (ou ano) escolhido — COMPARTILHADO por todas as telas com histórico (Transações, Dashboard, extratos,
// relatórios...). Escolheu setembro numa tela, as outras também mostram setembro. Volta sozinho ao mês atual
// quando o app abre, a página recarrega (F5) ou o usuário volta ao Dashboard.
//
// Uso nas telas:
//   import { periodo, mes, ano, anoInteiro, ehAtual, mover, voltarAtual } from '../services/mes.js';
//   watch(() => periodo.value.chave, carregar);           // 'YYYY-MM' ou 'YYYY' (visão anual)
//   <CabecalhoPagina titulo="X" cor="var(--cor-...)">                // fichário de meses (components/SeletorMes.vue)
//     <template #corpo> <div v-deslizar-mes> ...conteúdo... </div> </template>   // corpo = BLOCO ÚNICO com o fundo da aba
//   </CabecalhoPagina>                                     // (sem #corpo a aba fica solta; <SeletorMes /> avulso também vale)
//   deslizar para o lado (v-deslizar-mes) troca de mês
import { ref, computed } from 'vue';
import { chaveDaData, intervaloDoMes, ehPadrao, iso } from '../utils/mesFinanceiro.js';

// Mês FINANCEIRO de hoje (anotação 51): com o início no 5º dia útil, dia 3 ainda pertence ao mês anterior.
const hoje = new Date();
const chaveHoje = chaveDaData(iso(hoje));
const [anoHoje, mesHoje] = chaveHoje.split('-').map(Number);

export const ano = ref(anoHoje);
export const mesNum = ref(mesHoje); // 1..12
export const anoInteiro = ref(false);

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MESES_CURTOS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

export const mes = computed(() => `${ano.value}-${String(mesNum.value).padStart(2, '0')}`); // 'YYYY-MM' (mesmo no modo ano)
export const periodo = computed(() => ({
  tipo: anoInteiro.value ? 'ano' : 'mes',
  ano: ano.value,
  mes: mesNum.value,
  chave: anoInteiro.value ? String(ano.value) : mes.value,
  // intervalo de datas ISO do período (mês financeiro: pode começar no dia 7 e ir até o dia 4 do mês seguinte)
  ...(anoInteiro.value ? { de: intervaloDoMes(ano.value, 1).de, ate: intervaloDoMes(ano.value, 12).ate } : intervaloDoMes(ano.value, mesNum.value)),
}));
// "07/11 a 04/12" quando o mês financeiro não começa no dia 1 (o filtro de meses mostra o período real).
const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
export const intervaloTxt = computed(() => (anoInteiro.value || ehPadrao() ? '' : `${dm(periodo.value.de)} a ${dm(periodo.value.ate)}`));
export const ehAtual = computed(() => !anoInteiro.value && mes.value === chaveHoje);
export const rotuloPeriodo = computed(() => (anoInteiro.value ? String(ano.value) : `${MESES[mesNum.value - 1]} de ${ano.value}`));

export function mover(delta) {
  if (anoInteiro.value) { ano.value += delta; return; }
  const total = ano.value * 12 + (mesNum.value - 1) + delta;
  ano.value = Math.floor(total / 12);
  mesNum.value = (total % 12) + 1;
}
export function escolher(a, m) { // m = null → ano inteiro
  ano.value = a;
  if (m === null) { anoInteiro.value = true; return; }
  anoInteiro.value = false;
  mesNum.value = m;
}
export function alternarAno() { // 'Ano inteiro' <-> mês (mantém o ano e o mês)
  anoInteiro.value = !anoInteiro.value;
}
export function voltarAtual() {
  ano.value = anoHoje;
  mesNum.value = mesHoje;
  anoInteiro.value = false;
}
// Seletor de ano (anotação 47): troca o ano mantendo o mês.
export function trocarAno(a) { ano.value = a; anoInteiro.value = false; }
export const anoAtual = anoHoje;

// O Dashboard sempre abre no mês atual (a menos que já estivesse nele).
export function iniciarMes(router) {
  router.afterEach((to, from) => {
    if (to.path === '/' && from.path !== '/' ) voltarAtual();
    // A visão anual existe só em Relatórios (anotação 47): ao sair de lá, as outras telas voltam a ver por mês.
    if (anoInteiro.value && to.name !== 'relatorios') anoInteiro.value = false;
  });
}

// Diretiva v-deslizar-mes — DESLIGADA (anotação 60.2): deslizar o dedo para trocar de mês conflitava com carrosséis e com
// os gestos das Regras. O mês muda só pelo filtro (setas, toque nos meses vizinhos e menu de ano). A diretiva continua
// registrada (no-op) para as telas que ainda têm o atributo não quebrarem; pode ser tirada delas aos poucos.
export const diretivaDeslizarMes = {};
