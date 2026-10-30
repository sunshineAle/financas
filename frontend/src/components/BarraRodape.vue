<script setup>
// Barra de navegação do celular (padrão REF-08): Início · Contas · Transações (centro) · Cartões · Mais.
// O grupo ativo sobe para uma bolha elevada que desliza até o novo item. Toque num grupo inativo → abre a
// última tela dele; toque no ativo → submenu RADIAL (ícones circulares em arco). No "Mais", tocar no ativo
// volta à tela inicial dele. Transações: o "+" (ou segurar o botão) abre "Lançar entrada / saída".
// Os grupos vêm de config/menu.js.
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Plus } from 'lucide-vue-next';
import NavRadial from './NavRadial.vue';
import { GRUPOS, ACOES_LANCAR, ACOES_MAIS, grupoDaRota, temSubmenu, itemDaRota } from '../config/menu.js';
import { abrirRecorrencia, abrirNovaRegra } from '../services/acoesRapidas.js';
import { abrirLancamento } from '../services/lancamento.js';

const router = useRouter();
const route = useRoute();

const INDICE_CENTRO = Math.max(0, GRUPOS.findIndex((g) => g.centro));
const ativoId = computed(() => grupoDaRota(route));
const indiceAtivo = computed(() => {
  const i = GRUPOS.findIndex((g) => g.id === ativoId.value);
  return i < 0 ? INDICE_CENTRO : i;
});
const grupoAtivo = computed(() => GRUPOS[indiceAtivo.value]);
// Dentro de um grupo com submenu (Contas: Contas/Objetivos; Cartões: Cartões/Dívidas) o botão passa a mostrar
// o ícone e o nome da PÁGINA ATUAL (ex.: em Objetivos aparece o alvo, não o banco).
const itemAtivoDoGrupo = computed(() => (temSubmenu(grupoAtivo.value) ? itemDaRota(grupoAtivo.value, route) : null));
// Última tela usada em cada grupo (memória só da sessão: ao reabrir o app volta ao padrão).
// Declarada aqui em cima porque o ícone/rótulo dos grupos inativos também a usam.
const ultimaRota = reactive({});
// Item que o botão do grupo representa: o da rota atual (grupo ativo) ou a última tela usada (grupo inativo).
// Ícone, nome e destino do toque saem SEMPRE deste mesmo item, então nunca ficam desencontrados.
function itemDoBotao(g) {
  if (g.id === ativoId.value) return itemDaRota(g, route);
  const lembrado = ultimaRota[g.id];
  return g.itens.find((i) => lembrado && (lembrado === i.rota || lembrado.startsWith(i.rota + '/'))) || g.itens[0];
}
const iconeDe = (g) => (temSubmenu(g) ? itemDoBotao(g).icone : g.icone);
const rotuloDe = (g) => {
  if (!temSubmenu(g)) return g.rotulo;
  const i = itemDoBotao(g);
  return i.rotuloCurto || i.rotulo;
};
const semGrupo = computed(() => !ativoId.value);
// A bolha elevada do botão central é desenhada pelo próprio botão (ele já é elevado).
const bolhaOculta = computed(() => semGrupo.value || !!grupoAtivo.value.centro);

// Registra a última tela aberta em cada grupo (para voltar nela ao tocar no grupo).
watch(() => route.fullPath, () => {
  const id = grupoDaRota(route);
  if (id) ultimaRota[id] = route.path;
}, { immediate: true });

// Submenu aberto: { tipo: 'grupo', id } | { tipo: 'lancar' } | null
const radial = ref(null);
const escondida = ref(false);
const ancoraDe = (i) => `calc(${i} * 20% + 10%)`;

const grupoDoRadial = computed(() => (radial.value && radial.value.id ? GRUPOS.find((g) => g.id === radial.value.id) : null));
const radialItens = computed(() => {
  if (!radial.value) return [];
  if (radial.value.tipo === 'lancar') return ACOES_MAIS.map((a) => ({ id: a.id, rotulo: a.rotulo, icone: a.icone }));
  if (radial.value.tipo === 'transacao') return ACOES_LANCAR.map((a) => ({ id: a.id, rotulo: a.rotulo, icone: a.icone, tom: a.tom }));
  return grupoDoRadial.value.itens.map((i) => ({ id: i.rota, rotulo: i.rotuloCurto || i.rotulo, icone: i.icone, atual: route.path === i.rota }));
});
const radialAncora = computed(() => {
  if (!radial.value) return '50%';
  return radial.value.tipo === 'lancar' || radial.value.tipo === 'transacao' ? ancoraDe(INDICE_CENTRO) : ancoraDe(GRUPOS.findIndex((g) => g.id === radial.value.id));
});
const radialTitulo = computed(() => (radial.value ? (radial.value.tipo === 'lancar' ? 'Adicionar' : radial.value.tipo === 'transacao' ? 'Nova transação' : `Telas de ${grupoDoRadial.value.rotulo}`) : ''));

function fechar() { radial.value = null; }

// Segurar o botão central abre as opções de lançamento (toque curto navega normalmente).
let timerSegurar = null;
let segurou = false;
function comecarSegurar() {
  segurou = false;
  clearTimeout(timerSegurar);
  timerSegurar = setTimeout(() => { segurou = true; radial.value = { tipo: 'lancar' }; if (navigator.vibrate) { try { navigator.vibrate(12); } catch { /* sem vibração */ } } }, 480);
}
function pararSegurar() { clearTimeout(timerSegurar); }

function tocar(g) {
  if (g.centro && segurou) { segurou = false; return; }
  if (g.id === ativoId.value) {
    if (g.rotaCelular) { fechar(); router.push(g.rotaCelular); return; } // Mais: volta à tela inicial dele
    if (g.itens.length > 1) {
      radial.value = radial.value && radial.value.id === g.id ? null : { tipo: 'grupo', id: g.id };
    } else fechar();
    return;
  }
  fechar();
  router.push(g.rotaCelular || (temSubmenu(g) ? itemDoBotao(g).rota : g.itens[0].rota));
}
function abrirLancar() { radial.value = radial.value && (radial.value.tipo === 'lancar' || radial.value.tipo === 'transacao') ? null : { tipo: 'lancar' }; }
function escolher(it) {
  const r = radial.value;
  if (r && r.tipo === 'lancar') {
    // 1º nível do "+": Transação abre o 2º nível (Entrada · Saída · Transferência); os outros abrem a janela deles
    if (it.id === 'transacao') { radial.value = { tipo: 'transacao' }; return; }
    fechar();
    if (it.id === 'recorrencia') abrirRecorrencia();
    else if (it.id === 'regra') abrirNovaRegra();
    return;
  }
  fechar();
  if (r && r.tipo === 'transacao') {
    const a = ACOES_LANCAR.find((x) => x.id === it.id);
    abrirLancamento({ tipo: a.id }); // abre a janela sobre a página atual (nunca troca de página)
  } else router.push(it.id);
}

// A barra some ao rolar para baixo e volta ao rolar para cima (mais espaço para as listas).
let ultimoY = 0;
function aoRolar() {
  const y = window.scrollY;
  if (Math.abs(y - ultimoY) < 8) return;
  escondida.value = y > ultimoY && y > 120;
  if (escondida.value) fechar();
  ultimoY = y;
}
watch(() => route.fullPath, () => { escondida.value = false; ultimoY = window.scrollY; fechar(); });
onMounted(() => window.addEventListener('scroll', aoRolar, { passive: true }));
onUnmounted(() => { window.removeEventListener('scroll', aoRolar); clearTimeout(timerSegurar); });
</script>

<template>
  <NavRadial :aberto="!!radial" :itens="radialItens" :ancora="radialAncora" :titulo="radialTitulo" @escolher="escolher" @fechar="fechar" />

  <nav class="barra" :class="{ escondida }" :style="{ '--i': indiceAtivo }" aria-label="Navegação principal">
    <span class="bolha" :class="{ oculta: bolhaOculta }" aria-hidden="true">
      <component :is="itemAtivoDoGrupo ? itemAtivoDoGrupo.icone : grupoAtivo.icone" :key="grupoAtivo.id + (itemAtivoDoGrupo ? itemAtivoDoGrupo.rota : '')" :size="24" :stroke-width="2" class="icone-bolha" />
      <i v-if="temSubmenu(grupoAtivo)" class="sinal sinal-bolha"></i>
    </span>
    <template v-for="g in GRUPOS" :key="g.id">
      <div v-if="g.centro" class="slot-centro" :class="{ 'centro-ativo': g.id === ativoId }">
        <button
          type="button"
          class="item centro"
          :class="{ ativo: g.id === ativoId }"
          :aria-current="g.id === ativoId ? 'page' : undefined"
          :aria-haspopup="true"
          @click="tocar(g)"
          @pointerdown="comecarSegurar"
          @pointerup="pararSegurar"
          @pointerleave="pararSegurar"
          @pointercancel="pararSegurar"
          @contextmenu.prevent
        >
          <!-- Ativo: círculo elevado (bolha). Inativo: ícone na mesma escala dos demais. -->
          <span v-if="g.id === ativoId" class="fab"><component :is="g.icone" :size="24" :stroke-width="2" /></span>
          <span v-else class="caixa-icone"><component :is="g.icone" :size="22" :stroke-width="1.7" class="icone-item" /></span>
          <span class="rotulo">{{ g.rotulo }}</span>
        </button>
        <button type="button" class="mais-lancar" aria-label="Adicionar: transação, recorrência ou regra" @click="abrirLancar">
          <Plus :size="13" :stroke-width="3" />
        </button>
      </div>
      <button
        v-else
        type="button"
        class="item"
        :class="{ ativo: g.id === ativoId }"
        :aria-current="g.id === ativoId ? 'page' : undefined"
        @click="tocar(g)"
      >
        <span class="caixa-icone">
          <component :is="iconeDe(g)" :size="22" :stroke-width="1.7" class="icone-item" />
          <i v-if="temSubmenu(g)" class="sinal" aria-hidden="true"></i>
        </span>
        <span class="rotulo">{{ rotuloDe(g) }}</span>
      </button>
    </template>
  </nav>
</template>

<style scoped>
.barra {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  background: var(--cor-fundo-elevado);
  border-top: 1px solid var(--cor-borda);
  border-radius: 22px 22px 0 0;
  padding: 6px 0 calc(6px + env(safe-area-inset-bottom, 0px));
  box-shadow: 0 -10px 30px -18px rgba(0, 0, 0, 0.55);
  transition: transform var(--anim-padrao) var(--anim-curva);
}
.barra.escondida { transform: translateY(110%); }

.item {
  flex: 1 1 0;
  min-width: 0;
  min-height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  padding: 4px 0 2px;
  background: none;
  border: none;
  color: var(--cor-texto-suave);
  font-family: var(--fonte-texto);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.item .icone-item { transition: opacity var(--anim-rapida) ease, transform var(--anim-padrao) var(--anim-curva); }
.item:active .icone-item { transform: scale(0.88); }
.item.ativo { color: var(--cor-texto); font-weight: 700; }
.item.ativo .icone-item { opacity: 0; }
.caixa-icone { position: relative; display: inline-flex; }
/* Sinal discreto de que o botão abre um submenu: dois pontinhos (mini-arco) no canto do ícone */
.sinal { position: absolute; top: -1px; right: -6px; width: 9px; height: 5px; pointer-events: none; opacity: 0.75; background:
  radial-gradient(circle at 25% 75%, currentColor 0 1.4px, transparent 1.6px),
  radial-gradient(circle at 75% 75%, currentColor 0 1.4px, transparent 1.6px),
  radial-gradient(circle at 50% 25%, currentColor 0 1.4px, transparent 1.6px); }
.item.ativo .sinal { opacity: 0; }
.sinal-bolha { top: 9px; right: 9px; opacity: 0.85; color: #fff; }
.rotulo { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Bolha elevada do item ativo: desliza de um grupo para outro */
.bolha {
  position: absolute;
  top: -24px;
  left: calc(var(--i) * 20% + 10%);
  width: 54px;
  height: 54px;
  margin-left: -27px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, var(--cor-primaria), var(--cor-violeta));
  box-shadow: 0 0 0 6px var(--cor-fundo), 0 10px 18px -8px color-mix(in srgb, var(--cor-primaria) 70%, transparent);
  transition: left var(--anim-padrao) var(--anim-curva), opacity var(--anim-rapida) ease;
  pointer-events: none;
}
.bolha.oculta { opacity: 0; }
.icone-bolha { animation: pop var(--anim-padrao) var(--anim-curva) both; }
@keyframes pop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }

/* Botão central (Transações): círculo elevado fixo, com um "+" pequeno sobreposto */
.slot-centro { position: relative; flex: 1 1 0; min-width: 0; display: flex; }
.slot-centro .item { flex: 1 1 0; -webkit-touch-callout: none; user-select: none; }
.fab {
  position: absolute;
  top: -24px;
  left: 50%;
  width: 54px;
  height: 54px;
  margin-left: -27px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cor-primaria);
  background: var(--cor-fundo-elevado);
  border: 1.5px solid color-mix(in srgb, var(--cor-primaria) 55%, var(--cor-borda));
  box-shadow: 0 0 0 6px var(--cor-fundo), 0 10px 18px -8px color-mix(in srgb, var(--cor-primaria) 55%, transparent);
  transition: background var(--anim-padrao) ease, color var(--anim-padrao) ease, transform var(--anim-padrao) var(--anim-curva);
}
.item.centro:active .fab { transform: scale(0.94); }
.item.centro.ativo .fab { color: var(--cor-sobre-cor); border-color: transparent; background: linear-gradient(135deg, var(--cor-primaria), var(--cor-violeta)); }
.mais-lancar {
  position: absolute;
  /* Inativo: badge pequeno no canto superior direito do ícone, na escala dos demais ícones */
  top: 3px;
  left: calc(50% + 6px);
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cor-sobre-cor);
  background: var(--cor-investimento);
  border: none;
  box-shadow: 0 0 0 3px var(--cor-fundo);
  cursor: pointer;
  z-index: 2;
  -webkit-tap-highlight-color: transparent;
}
.mais-lancar svg { width: 11px; height: 11px; }
.slot-centro.centro-ativo .mais-lancar svg { width: 13px; height: 13px; }
.slot-centro.centro-ativo .mais-lancar { top: -28px; left: calc(50% + 14px); width: 22px; height: 22px; }
.mais-lancar::before { content: ''; position: absolute; inset: -11px; border-radius: 50%; }
.mais-lancar:active { transform: scale(0.9); }
</style>
