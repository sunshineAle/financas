<script setup>
// "Seus saldos" (homologação 1.0, seção 1 — decisão final do usuário, 29/10 21h59). Fica no Início, logo abaixo do
// filtro de meses. Arcos finos em MEIA-LUA, um por número (Contas, Guardado, Faturas, Dívidas), concêntricos e com o
// final sumindo (regra do degradê); o Patrimônio líquido fica no centro e a legenda ao lado, sem quebrar linha.
// É uma POSIÇÃO de hoje (não muda com o mês). O detalhe de cada número fica em Relatórios › Resumo financeiro.
//   <SeusSaldos :saldos="{ contas, guardado, faturas, dividas, patrimonio }" @patrimonio="abrir detalhe" />
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronRight } from 'lucide-vue-next';
import Valor from './Valor.vue';
import AjudaSecao from './AjudaSecao.vue';

const props = defineProps({ saldos: { type: Object, default: null } });
const emit = defineEmits(['patrimonio']);
const router = useRouter();
const pronto = ref(false);
onMounted(() => requestAnimationFrame(() => { pronto.value = true; }));

const ITENS = [
  { chave: 'contas', nome: 'Contas', sinal: '+', de: 'var(--entrada-verde-claro, #4CC27A)', cor: 'var(--cor-entrada)' },
  { chave: 'guardado', nome: 'Guardado', sinal: '+', de: 'var(--meta-violeta-claro, #A87EF1)', cor: 'var(--meta-violeta-medio, #5E18D8)' },
  { chave: 'faturas', nome: 'Faturas', sinal: '−', de: 'var(--saida-ambar-medio, #DFA511)', cor: 'var(--saida-tangerina-medio, #E15F0E)' },
  { chave: 'dividas', nome: 'Dívidas', sinal: '−', de: 'var(--saida-tangerina-medio, #E15F0E)', cor: 'var(--saida-carmim-medio, #CE2239)' },
];
const ESP = 3.5, VAO = 3; // espessura e vão entre os arcos, em px (o tamanho do bloco é fixo: 150 × 75)
const L = 150;
const arcos = computed(() => {
  const s = props.saldos || {};
  const max = Math.max(1, ...ITENS.map((i) => Math.abs(s[i.chave] || 0)));
  return ITENS.map((i, n) => {
    const v = s[i.chave] || 0;
    const graus = Math.abs(v) < 0.005 ? 0 : Math.max(6, (Math.abs(v) / max) * 180);
    const fora = L / 2 - n * (ESP + VAO);
    const g = pronto.value ? graus : 0;
    // conic: 0deg = topo; a meia-lua começa na esquerda (270deg) e anda no sentido horário até a direita
    const fundo = g ? `conic-gradient(from 270deg, ${i.de} 0deg, ${i.cor} ${(g * 0.5).toFixed(1)}deg, color-mix(in srgb, ${i.cor} 10%, transparent) ${g.toFixed(1)}deg, transparent ${g.toFixed(1)}deg)` : 'none';
    const mascara = `radial-gradient(circle closest-side, transparent ${fora - ESP - 0.5}px, #000 ${fora - ESP}px, #000 ${fora}px, transparent ${fora + 0.5}px)`;
    return { ...i, v, fora, fundo, mascara };
  });
});
const patrimonio = computed(() => props.saldos?.patrimonio || 0);
</script>

<template>
  <section v-if="saldos" class="seus-saldos" aria-labelledby="t-seus-saldos" data-seus-saldos>
    <div class="cabeca">
      <h2 id="t-seus-saldos">Seus saldos <small>hoje</small><AjudaSecao secao="inicio.saldos" /></h2>
    </div>
    <div class="corpo">
      <button type="button" class="meia-lua" :aria-label="`Patrimônio líquido: ver Ativos e Passivos`" aria-haspopup="dialog" @click="emit('patrimonio')">
        <span class="recorte" aria-hidden="true">
          <i v-for="a in arcos" :key="a.chave" class="trilho" :style="{ '-webkit-mask': a.mascara, mask: a.mascara }"></i>
          <i v-for="a in arcos" :key="a.chave + 'v'" class="arco" :style="{ background: a.fundo, '-webkit-mask': a.mascara, mask: a.mascara }"></i>
        </span>
        <span class="centro">
          <b class="numero-tabular" :class="{ neg: patrimonio < 0 }"><Valor :valor="patrimonio" /></b>
          <small>Patrimônio</small>
        </span>
      </button>
      <ul class="legenda">
        <li v-for="a in arcos" :key="a.chave">
          <i class="ponto" :style="{ background: `linear-gradient(135deg, ${a.de}, ${a.cor})` }" aria-hidden="true"></i>
          <span class="nome">{{ a.nome }}</span>
          <b class="numero-tabular"><span class="sinal" aria-hidden="true">{{ a.sinal }}</span><Valor :valor="Math.abs(a.v)" /></b>
        </li>
      </ul>
    </div>
    <button type="button" class="link" data-detalhes-relatorios @click="router.push('/relatorios')">Detalhes em Relatórios<ChevronRight :size="15" :stroke-width="2" /></button>
  </section>
</template>

<style scoped>
.seus-saldos { background: var(--cor-card); border: 1px solid var(--cor-card-borda); border-radius: var(--raio-card, 16px); padding: 14px 16px 6px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.cabeca h2 { display: flex; align-items: center; gap: 6px; margin: 0; font-family: var(--fonte-display); font-size: 16px; }
.cabeca small { font-family: var(--fonte-texto); font-weight: 400; font-size: 12px; color: var(--cor-texto-suave); }
.corpo { display: flex; align-items: center; gap: 12px; min-width: 0; }
.meia-lua { position: relative; flex: none; width: 150px; height: 77px; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; border-radius: 12px; }
.meia-lua:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
.recorte { position: absolute; left: 0; top: 0; width: 150px; height: 75px; overflow: hidden; }
.trilho, .arco { position: absolute; left: 0; top: 0; width: 150px; height: 150px; border-radius: 50%; }
.trilho { background: var(--cor-trilho); opacity: 0.55; }
.arco { transition: background var(--anim-lenta) var(--anim-curva-suave, ease); }
.centro { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; line-height: 1.1; width: 92px; gap: 1px; }
.centro b { font-family: var(--fonte-display); font-size: 13.5px; white-space: nowrap; }
.centro b.neg { color: var(--cor-saida-texto, var(--cor-saida)); }
.centro small { font-size: 10.5px; color: var(--cor-texto-suave); }
.legenda { list-style: none; margin: 0; padding: 0 0 2px; flex: 1 1 auto; min-width: 0; display: grid; grid-template-columns: 8px auto auto; justify-content: end; gap: 6px 6px; align-items: center; font-size: 12px; white-space: nowrap; }
.legenda li { display: contents; }
.ponto { width: 8px; height: 8px; border-radius: 50%; }
.nome { color: var(--cor-texto-suave); }
.legenda b { justify-self: end; font-weight: 600; color: var(--cor-texto); }
.sinal { color: var(--cor-texto-suave); font-weight: 500; margin-right: 2px; }
.link { align-self: flex-end; display: inline-flex; align-items: center; gap: 2px; min-height: 36px; padding: 0; border: 0; background: none; color: var(--cor-primaria); font: 600 13px var(--fonte-texto); cursor: pointer; }
.link:hover { text-decoration: underline; }
@media (max-width: 360px) { .corpo { gap: 8px; } .legenda { font-size: 11.5px; gap: 5px 4px; } }
@media (min-width: 600px) { .corpo { justify-content: flex-start; gap: 28px; } .legenda { justify-content: start; font-size: 13px; } }
</style>
