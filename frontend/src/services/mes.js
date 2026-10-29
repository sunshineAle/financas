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

// Diretiva v-deslizar-mes: arrastar para a esquerda = mês seguinte; para a direita = anterior.
// Funciona com dedo (touch), caneta e mouse, via pointer events. O elemento ganha touch-action: pan-y pinch-zoom,
// assim o navegador NÃO toma o gesto horizontal (antes, com touch events + touch-action padrão, o navegador
// cancelava o toque ao menor desvio na vertical e o mouse nem era tratado). A rolagem vertical segue normal.
// Não vale se o gesto começar em algo marcado com data-sem-deslizar (ex.: carrossel de cartões) nem em
// campos de texto/seletores/sliders. No mouse, após um arrasto o clique seguinte é descartado (não aciona botões).
const LIMITE_X = 56; // px mínimos de arrasto horizontal
const IGNORAR = '[data-sem-deslizar], [role="tablist"], input, textarea, select, [contenteditable="true"], [role="slider"]';
export const diretivaDeslizarMes = {
  mounted(el) {
    let ini = null;
    let travou = false;
    const prevTA = el.style.touchAction;
    el.style.touchAction = 'pan-y pinch-zoom';
    const limpar = () => {
      ini = null;
      window.removeEventListener('pointermove', mover_);
      window.removeEventListener('pointerup', fim);
      window.removeEventListener('pointercancel', cancelar);
    };
    function mover_(e) {
      if (!ini || e.pointerId !== ini.id) return;
      const dx = e.clientX - ini.x, dy = e.clientY - ini.y;
      if (!travou && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        travou = true;
        if (e.pointerType === 'mouse') document.documentElement.style.userSelect = 'none';
      }
    }
    function fim(e) {
      if (!ini || e.pointerId !== ini.id) return;
      const dx = e.clientX - ini.x, dy = e.clientY - ini.y, tipo = ini.tipo;
      limpar();
      document.documentElement.style.userSelect = '';
      const valeu = Math.abs(dx) >= LIMITE_X && Math.abs(dx) >= Math.abs(dy) * 1.5;
      if (valeu) {
        mover(dx < 0 ? 1 : -1);
        if (tipo === 'mouse') window.addEventListener('click', engolir, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', engolir, true), 0);
      }
      travou = false;
    }
    function cancelar() { limpar(); travou = false; document.documentElement.style.userSelect = ''; }
    function engolir(e) { e.stopPropagation(); e.preventDefault(); }
    function inicio(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!e.isPrimary) return;
      if (e.target.closest && e.target.closest(IGNORAR)) return;
      ini = { x: e.clientX, y: e.clientY, id: e.pointerId, tipo: e.pointerType };
      travou = false;
      window.addEventListener('pointermove', mover_, { passive: true });
      window.addEventListener('pointerup', fim);
      window.addEventListener('pointercancel', cancelar);
    }
    el.__dm = { inicio, limpar, prevTA };
    el.addEventListener('pointerdown', inicio, { passive: true });
  },
  unmounted(el) {
    if (!el.__dm) return;
    el.removeEventListener('pointerdown', el.__dm.inicio);
    el.__dm.limpar();
    el.style.touchAction = el.__dm.prevTA;
    document.documentElement.style.userSelect = '';
  },
};
