<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { LogOut, Sun, Moon, SunMoon } from 'lucide-vue-next';
import BarraRodape from './BarraRodape.vue';
import AvisoToast from './AvisoToast.vue';
import LancamentoModal from './LancamentoModal.vue';
import BotaoVoltar from './BotaoVoltar.vue';
import TopoApp from './TopoApp.vue';
import AvisoArmazenamento from './AvisoArmazenamento.vue';
import AvatarMini from './AvatarMini.vue';
import { GRUPOS, grupoDaRota, ehTelaInternaDoMais, ROTAS_COM_TOPO } from '../config/menu.js';
import { remontagemTransacoes } from '../services/nav.js';
import { nomeExibido, inicialDe } from '../services/perfil.js';
import { ehCelular } from '../services/layout.js';
import { modoTema, definirTema } from '../services/tema.js';

const router = useRouter();
const route = useRoute();
const usuario = ref(null);

// Menu lateral (PC/web): fixo, com todas as páginas sempre visíveis e sem setas de recolher.
// Grupos recolhíveis existem só no celular (rodapé com submenu radial).
const chaveTela = computed(() => (route.name === 'transacoes' ? `t${remontagemTransacoes.value}` : 'p'));
const grupoAtual = computed(() => grupoDaRota(route));
const comTopo = computed(() => ROTAS_COM_TOPO.includes(route.name));
function itemAtivo(item) {
  return item.rota === '/' ? route.path === '/' : route.path === item.rota || route.path.startsWith(item.rota + '/') || (route.name === 'cartao-extrato' && item.rota === '/cartoes');
}

const ICONE_TEMA = { auto: SunMoon, claro: Sun, escuro: Moon };
const ROTULO_TEMA = { auto: 'Tema: automático', claro: 'Tema: claro', escuro: 'Tema: escuro' };
function alternarTema() {
  const ordem = ['auto', 'claro', 'escuro'];
  definirTema(ordem[(ordem.indexOf(modoTema.value) + 1) % ordem.length]);
}

async function sair() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  router.push('/login');
}

onMounted(async () => {
  const resposta = await fetch('/api/auth/me', { credentials: 'include' });
  if (!resposta.ok) {
    router.push('/login');
    return;
  }
  usuario.value = await resposta.json();
});
</script>

<template>
  <div class="casca" :class="{ 'casca-celular': ehCelular }" v-if="usuario">
    <aside v-if="!ehCelular" class="sidebar">
      <div class="topo-sidebar">
        <div class="marca" title="Dagda Capital">
          <svg viewBox="0 0 32 32" class="logo-marca" aria-label="Dagda Capital">
            <defs>
              <linearGradient id="gradLogo" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#5E18D8" />
                <stop offset="1" stop-color="#1597A8" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="9" fill="url(#gradLogo)" />
            <path d="M8 20l5-6 4 3 7-9" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="24" cy="8" r="1.6" fill="#ffffff" />
          </svg>
        </div>
      </div>

      <nav class="nav-lateral" aria-label="Navegação principal">
        <div v-for="g in GRUPOS" :key="g.id" class="secao-nav">
          <h2 v-if="g.itens.length > 1" class="titulo-secao" :class="{ atual: grupoAtual === g.id }">{{ g.rotulo }}</h2>
          <div class="itens-secao">
            <router-link
              v-for="item in g.itens"
              :key="item.rota"
              :to="item.rota"
              class="item-nav"
              :class="{ ativo: itemAtivo(item) }"
              :title="item.rotulo"
            >
              <component :is="item.icone" :size="20" :stroke-width="1.8" class="icone-nav" />
              <span class="rotulo-texto">{{ item.rotulo }}</span>
            </router-link>
          </div>
        </div>
      </nav>

      <div class="rodape-sidebar">
        <div class="usuario" title="Conta atual">
          <AvatarMini :inicial="inicialDe(usuario)" :tamanho="32" />
          <span class="usuario-nome rotulo-texto">{{ nomeExibido(usuario) }}</span>
        </div>
        <button type="button" class="botao-tema" @click="alternarTema" :title="ROTULO_TEMA[modoTema]" :aria-label="ROTULO_TEMA[modoTema]">
          <component :is="ICONE_TEMA[modoTema]" :size="20" :stroke-width="1.8" class="icone-nav" />
          <span class="rotulo-texto">{{ ROTULO_TEMA[modoTema] }}</span>
        </button>
        <button type="button" @click="sair" title="Sair">
          <LogOut :size="20" :stroke-width="1.8" class="icone-nav" />
          <span class="rotulo-texto">Sair</span>
        </button>
      </div>
    </aside>

    <main class="conteudo">
      <TopoApp v-if="comTopo" :usuario="usuario" />
      <AvisoArmazenamento v-if="route.name === 'dashboard'" />
      <BotaoVoltar v-if="ehCelular && ehTelaInternaDoMais(route)" para="/mais" />
      <div :key="chaveTela" class="tela"><slot /></div>
    </main>

    <BarraRodape v-if="ehCelular" />
    <LancamentoModal />
    <AvisoToast />
  </div>
</template>

<style scoped>
.casca {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100%;
}

.casca.casca-celular {
  grid-template-columns: 1fr;
}

.sidebar {
  background: var(--cor-fundo-sidebar);
  border-right: 1px solid var(--cor-borda);
  padding: 24px 14px;
  display: flex;
  flex-direction: column;
  gap: 28px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
}

.topo-sidebar { display: flex; align-items: center; }

.marca {
  display: flex;
  align-items: center;
}

.logo-marca {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
}

.nav-lateral {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
}

.secao-nav { display: flex; flex-direction: column; gap: 4px; }
.itens-secao { display: flex; flex-direction: column; gap: 4px; }
.titulo-secao {
  margin: 0 0 2px;
  padding: 0 12px;
  color: var(--cor-texto-suave);
  font-family: var(--fonte-texto);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.titulo-secao.atual { color: var(--cor-texto); }

.item-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  color: var(--cor-texto-suave);
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.icone-nav {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.item-nav:hover {
  background: var(--cor-realce);
  color: var(--cor-texto);
}

.item-nav.ativo {
  background: linear-gradient(135deg, var(--cor-primaria), var(--cor-violeta));
  color: #ffffff;
}

.rodape-sidebar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--cor-borda);
}

.usuario { display: flex; align-items: center; gap: 10px; padding: 4px 6px; border-radius: 10px; text-decoration: none; min-width: 0; }
.usuario-nome {
  font-size: 13px;
  color: var(--cor-texto-suave);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rodape-sidebar button {
  display: flex;
  align-items: center;
  gap: 10px;
  align-self: stretch;
  font-family: var(--fonte-texto);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--cor-borda);
  background: transparent;
  color: var(--cor-texto);
  cursor: pointer;
}

.tela { display: contents; }

.conteudo {
  padding: 32px 40px;
  overflow-x: hidden;
}

/* Ajustes gerais para telas estreitas — a colapsagem da sidebar em si já é
   decidida via JS (matchMedia) lá em cima, para poder ser sobreposta pelo
   toggle manual mesmo dentro dessas faixas. */
@media (max-width: 900px) {
  .conteudo {
    padding: 24px 20px;
  }
}

@media (max-width: 480px) {
  .conteudo {
    padding: 16px;
  }
}

/* Celular: o rodapé fica fixo embaixo, então o conteúdo ganha espaço para não ficar escondido atrás dele */
.casca-celular .conteudo {
  padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
}
</style>
