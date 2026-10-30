<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Pin, PinOff } from 'lucide-vue-next';
import BarraRodape from './BarraRodape.vue';
import AvisoToast from './AvisoToast.vue';
import LancamentoModal from './LancamentoModal.vue';
import RecorrenciaModal from './RecorrenciaModal.vue';
import MenuAdicionarWeb from './MenuAdicionarWeb.vue';
import RegraModal from './RegraModal.vue';
import { novaRegraAberta, acaoRapidaFoiSalva } from '../services/acoesRapidas.js';
import { avisar as avisarRegra } from '../services/avisos.js';
import TopoApp from './TopoApp.vue';
import MarcaDagda from './MarcaDagda.vue';
import AvisoArmazenamento from './AvisoArmazenamento.vue';
import { MENU_LATERAL, grupoDaRota } from '../config/menu.js';
import { remontagemTransacoes } from '../services/nav.js';
import { ehCelular } from '../services/layout.js';

const router = useRouter();
const route = useRoute();
const usuario = ref(null);

const chaveTela = computed(() => (route.name === 'transacoes' ? `t${remontagemTransacoes.value}` : 'p'));
function itemAtivo(item) {
  if (item.revisar) return route.path === '/transacoes' && !!route.query.revisar;
  if (item.rota === '/transacoes') return route.path === '/transacoes' && !route.query.revisar;
  if (item.rota === '/orcamento') return route.path === '/orcamento';
  // 1.0: as páginas que "moram" num grupo (Contas/Objetivos em Patrimônio, Cartões/Dívidas em Compromissos) acendem o item do grupo
  const grupo = grupoDaRota(route);
  if (grupo && grupo !== 'mais' && grupo !== 'inicio' && item.rota === '/' + grupo) return true;
  return item.rota === '/' ? route.path === '/' : route.path === item.rota || route.path.startsWith(item.rota + '/');
}

// ---- Menu lateral do PC/web (anotação 62) ----
// Recolhido (só ícones, 64px) por padrão. Abre POR CIMA do conteúdo (240px) ao passar o mouse (depois de 150 ms) ou ao focar
// um item pelo teclado; recolhe 300 ms depois que o mouse sai. Tablet sem mouse: tocar no "D" abre e fecha.
// "Manter aberto" (fixar) fica salvo no aparelho; fixado, o menu empurra o conteúdo.
const CHAVE_FIXO = 'sf:menu-fixo';
const lerFixo = () => { try { return localStorage.getItem(CHAVE_FIXO) === '1'; } catch { return false; } };
const fixo = ref(lerFixo());
const aberto = ref(false);
const expandido = computed(() => fixo.value || aberto.value);
const menuRef = ref(null);
let tAbrir = null;
let tFechar = null;
let ultimoPonteiro = 'mouse';
const limparTempos = () => { clearTimeout(tAbrir); clearTimeout(tFechar); };
function aoEntrar(e) {
  if (e.pointerType !== 'mouse') return;
  clearTimeout(tFechar);
  if (!aberto.value) tAbrir = setTimeout(() => { aberto.value = true; }, 150);
}
function aoSair(e) {
  if (e.pointerType !== 'mouse') return;
  clearTimeout(tAbrir);
  if (menuRef.value && menuRef.value.contains(document.activeElement) && document.activeElement.matches(':focus-visible')) return;
  tFechar = setTimeout(() => { aberto.value = false; }, 300);
}
// Só o foco do TECLADO abre (no toque/clique o foco também chega, mas quem decide é o clique no "D").
function aoFocar(e) { if (!e.target.matches(':focus-visible')) return; limparTempos(); aberto.value = true; }
function aoDesfocar(e) {
  if (menuRef.value && e.relatedTarget && menuRef.value.contains(e.relatedTarget)) return;
  if (menuRef.value && menuRef.value.matches(':hover')) return;
  limparTempos();
  aberto.value = false;
}
function aoTocarMarca() {
  if (fixo.value) return;
  limparTempos();
  aberto.value = !aberto.value;
}
function alternarFixo() {
  fixo.value = !fixo.value;
  try { localStorage.setItem(CHAVE_FIXO, fixo.value ? '1' : '0'); } catch { /* sem armazenamento: vale só nesta sessão */ }
  if (!fixo.value) { aberto.value = ultimoPonteiro === 'mouse' && !!(menuRef.value && menuRef.value.matches(':hover')); }
}
function aoApontar(e) {
  ultimoPonteiro = e.pointerType || 'mouse';
  // toque fora do menu aberto (tablet): recolhe
  if (aberto.value && !fixo.value && e.pointerType !== 'mouse' && menuRef.value && !menuRef.value.contains(e.target)) aberto.value = false;
}
watch(() => route.fullPath, () => { if (ultimoPonteiro !== 'mouse' && !fixo.value) aberto.value = false; atualizarRevisar(); });

// "A revisar": os mesmos itens do card "A revisar" do topo de Transações (guardar/resgatar do extrato sem decisão).
const qtdRevisar = ref(0);
async function atualizarRevisar() {
  if (ehCelular.value) return;
  try {
    const r = await fetch('/api/reserva/auto/pendentes', { credentials: 'include' });
    const j = r.ok ? await r.json() : null;
    qtdRevisar.value = (j && Array.isArray(j.pendentes) && j.pendentes.length) || 0;
  } catch { qtdRevisar.value = 0; }
}
const itensMenu = computed(() => MENU_LATERAL.filter((i) => !i.revisar || qtdRevisar.value > 0));

onMounted(async () => {
  document.addEventListener('pointerdown', aoApontar, true);
  const resposta = await fetch('/api/auth/me', { credentials: 'include' });
  if (!resposta.ok) {
    router.push('/login');
    return;
  }
  usuario.value = await resposta.json();
  atualizarRevisar();
});
onUnmounted(() => { limparTempos(); document.removeEventListener('pointerdown', aoApontar, true); });
</script>

<template>
  <div class="casca" :class="{ 'casca-celular': ehCelular, 'menu-fixo': fixo }" v-if="usuario">
    <div v-if="!ehCelular" class="trilho">
      <aside ref="menuRef" class="sidebar" :class="{ expandido, sobreposto: aberto && !fixo }" data-menu-lateral
        @pointerenter="aoEntrar" @pointerleave="aoSair" @focusin="aoFocar" @focusout="aoDesfocar">
        <div class="topo-sidebar">
          <button type="button" class="marca" data-menu-marca :aria-expanded="expandido" :aria-label="expandido ? 'Dagda Capital: recolher o menu' : 'Dagda Capital: abrir o menu'" @click="aoTocarMarca">
            <MarcaDagda class="logo-marca" :tamanho="36" />
            <span class="nome-marca rotulo-texto" data-menu-nome>Dagda Capital</span>
          </button>
        </div>

        <!-- 30/10: "+ Adicionar" no PC, com os mesmos dois níveis do "+" do celular -->
        <MenuAdicionarWeb :expandido="expandido" />
        <nav class="nav-lateral" aria-label="Navegação principal">
          <router-link
            v-for="item in itensMenu"
            :key="item.rota"
            :to="item.rota"
            class="item-nav"
            :class="{ ativo: itemAtivo(item) }"
            :title="expandido ? (item.dica || null) : (item.dica ? `${item.rotulo} (${item.dica})` : item.rotulo)"
            :aria-label="item.revisar ? `${item.rotulo}: ${qtdRevisar}` : item.rotulo"
            :aria-current="itemAtivo(item) ? 'page' : null"
          >
            <span class="icone-caixa">
              <component :is="item.icone" :size="20" :stroke-width="1.8" class="icone-nav" />
              <span v-if="item.revisar" class="contador" aria-hidden="true">{{ qtdRevisar > 99 ? '99+' : qtdRevisar }}</span>
            </span>
            <span class="rotulo-texto">{{ item.rotulo }}</span>
          </router-link>
        </nav>

        <div class="rodape-sidebar">
          <button type="button" class="item-nav fixar" :class="{ ligado: fixo }" data-menu-fixar :aria-pressed="fixo" :title="fixo ? 'Manter aberto: ligado (clique para recolher)' : 'Manter aberto'" @click="alternarFixo">
            <span class="icone-caixa"><component :is="fixo ? PinOff : Pin" :size="20" :stroke-width="1.8" class="icone-nav" /></span>
            <span class="rotulo-texto">Manter aberto</span>
          </button>
        </div>
      </aside>
    </div>

    <main class="conteudo">
      <TopoApp :usuario="usuario" />
      <AvisoArmazenamento v-if="route.name === 'dashboard'" />
      <div :key="chaveTela" class="tela"><slot /></div>
    </main>

    <BarraRodape v-if="ehCelular" />
    <LancamentoModal />
    <!-- Homologação 1.0, seção 12: "Criar recorrência" e "Regra de transação" do "+" -->
    <RecorrenciaModal />
    <RegraModal :aberto="novaRegraAberta" :inicial="{}" @fechar="novaRegraAberta = false" @salvo="(r) => { novaRegraAberta = false; acaoRapidaFoiSalva(); avisarRegra(r && r.aplicadas ? `Regra criada e aplicada a ${r.aplicadas} transações.` : 'Regra criada.', { rota: '/regras' }); }" />
    <AvisoToast />
  </div>
</template>

<style scoped>
/* Coluna do menu: 64px (recolhido, abre por cima do conteúdo) ou 240px quando "Manter aberto" (empurra o conteúdo). */
.casca {
  --menu-fechado: 64px;
  --menu-aberto: 240px;
  display: grid;
  grid-template-columns: var(--menu-fechado) minmax(0, 1fr);
  min-height: 100%;
}
.casca.menu-fixo { grid-template-columns: var(--menu-aberto) minmax(0, 1fr); }

.casca.casca-celular {
  grid-template-columns: 1fr;
}

.trilho { position: sticky; top: 0; height: 100vh; z-index: 60; }

.sidebar {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--menu-fechado);
  background: var(--cor-fundo-sidebar);
  border-right: 1px solid var(--cor-borda);
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  overflow-x: hidden;
  transition: width var(--anim-padrao) var(--anim-curva), box-shadow var(--anim-padrao) ease;
}
.sidebar.expandido { width: var(--menu-aberto); }
.sidebar.sobreposto { box-shadow: 18px 0 40px -18px rgba(0, 0, 0, 0.45); }

.topo-sidebar { display: flex; align-items: center; min-height: 44px; }

.marca {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 0 0 0 4px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--cor-texto);
  -webkit-tap-highlight-color: transparent;
  border-radius: 12px;
}
.marca:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
.logo-marca { width: 36px; flex-shrink: 0; }
.nome-marca { font-family: var(--fonte-display); font-size: 16px; font-weight: 600; letter-spacing: 0.01em; }

.nav-lateral {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.item-nav {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 0 10px;
  border-radius: 12px;
  font-family: var(--fonte-texto);
  font-size: 14px;
  font-weight: 500;
  color: var(--cor-texto-suave);
  text-decoration: none;
  transition: background var(--anim-rapida) ease, color var(--anim-rapida) ease;
  white-space: nowrap;
}
.icone-caixa { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0; }
.icone-nav { width: 20px; height: 20px; flex-shrink: 0; }
/* Nomes: somem com o menu recolhido (sem mudar a posição dos ícones) */
.rotulo-texto { opacity: 0; transition: opacity var(--anim-rapida) ease; overflow: hidden; text-overflow: ellipsis; }
.expandido .rotulo-texto { opacity: 1; }

.item-nav:hover {
  background: var(--cor-realce);
  color: var(--cor-texto);
}
.item-nav:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: -2px; }

.item-nav.ativo {
  background: linear-gradient(135deg, var(--cor-primaria), var(--cor-violeta));
  color: #ffffff;
}

.contador {
  position: absolute; top: -7px; right: -9px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 99px;
  background: var(--cor-alerta, #d98a00); color: #1b1300; font-size: 10.5px; font-weight: 700; line-height: 17px; text-align: center;
  box-shadow: 0 0 0 2px var(--cor-fundo-sidebar);
}

.rodape-sidebar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--cor-borda);
}
.fixar { width: 100%; border: none; background: none; cursor: pointer; text-align: left; }
.fixar.ligado { color: var(--cor-texto); }

@media (prefers-reduced-motion: reduce) { .sidebar, .rotulo-texto { transition: none !important; } }
:global(html[data-reduzir-movimento='1']) .sidebar, :global(html[data-reduzir-movimento='1']) .rotulo-texto { transition: none !important; }

.tela { display: contents; }

/* Sem espaço próprio acima: o TopoApp (altura fixa) + --espaco-secao definem onde o conteúdo começa, igual em todas as páginas */
.conteudo {
  padding: 0 var(--margem-tela) var(--espaco-fim);
  overflow-x: hidden;
  min-width: 0;
}

/* Celular: o rodapé fica fixo embaixo, então o conteúdo ganha espaço para não ficar escondido atrás dele */
.casca-celular .conteudo {
  padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
}
</style>

<style>
/* Anotação 63: o título da página fica só no TopoApp. O <h1> próprio das telas antigas (Apoie, Custo de vida, Manual,
   Regras, Mais, Perfil) some aqui, para nenhuma tela somar uma linha extra acima do conteúdo. */
.casca .tela > .pagina > h1:first-child { display: none; }
</style>
