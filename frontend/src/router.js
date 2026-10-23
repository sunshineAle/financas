import { createRouter, createWebHistory, createMemoryHistory, createWebHashHistory } from 'vue-router';
import Login from './views/Login.vue';
import Dashboard from './views/Dashboard.vue';
import MeuDinheiro from './views/MeuDinheiro.vue';
import Transacoes from './views/Transacoes.vue';
import Cartoes from './views/Cartoes.vue';
import CartaoExtrato from './views/CartaoExtrato.vue';
import Dividas from './views/Dividas.vue';
import Orcamento from './views/Orcamento.vue';
import Relatorios from './views/Relatorios.vue';
import Objetivos from './views/Objetivos.vue';
import Perfil from './views/Perfil.vue';
import Mais from './views/Mais.vue';
import { bloquear } from './services/acesso.js';
import Manual from './views/Manual.vue';
import Apoie from './views/Apoie.vue';
import Importar from './views/Importar.vue';
import CustosFixos from './views/CustosFixos.vue';
import Regras from './views/Regras.vue';

const router = createRouter({
  // A versão de demonstração (sem servidor) navega em memória, sem depender da URL.
  // PWA instalado: rota no hash (#/...), sobrevive a recarregar e funciona offline; demo: em memória.
  history: import.meta.env.VITE_PWA ? createWebHashHistory() : import.meta.env.VITE_DEMO ? createMemoryHistory() : createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: Login },
    { path: '/', name: 'dashboard', component: Dashboard, meta: { titulo: 'Início' } },
    { path: '/contas', name: 'contas', component: MeuDinheiro, meta: { titulo: 'Contas' } },
    { path: '/transacoes', name: 'transacoes', component: Transacoes, meta: { titulo: 'Transações' } },
    { path: '/cartoes', name: 'cartoes', component: Cartoes, meta: { titulo: 'Cartões e Crédito' } },
    { path: '/cartoes/:id/extrato', name: 'cartao-extrato', component: CartaoExtrato },
    { path: '/dividas', name: 'dividas', component: Dividas, meta: { titulo: 'Dívidas' } },
    { path: '/orcamento', name: 'orcamento', component: Orcamento, meta: { titulo: 'Categorias' } },
    { path: '/objetivos', name: 'objetivos', component: Objetivos, meta: { titulo: 'Objetivos' } },
    { path: '/reserva', redirect: '/objetivos' },
    { path: '/mais', name: 'mais', component: Mais, meta: { titulo: 'Mais' } },
    { path: '/manual', name: 'manual', component: Manual, meta: { titulo: 'Manual' } },
    { path: '/apoie', name: 'apoie', component: Apoie, meta: { titulo: 'Apoie o desenvolvedor' } },
    { path: '/regras', name: 'regras', component: Regras, meta: { titulo: 'Regras de categorização' } },
    { path: '/custos-fixos', name: 'custos-fixos', component: CustosFixos, meta: { titulo: 'Custos fixos' } },
    { path: '/importar', name: 'importar', component: Importar, meta: { titulo: 'Importar extrato ou fatura' } },
    // Rotas antigas: tudo vive em /perfil (Perfil e configurações), com âncoras. Mantidas para links, avisos e favoritos.
    { path: '/backup', name: 'backup', redirect: (to) => ({ path: '/mais/dados-backup', query: to.query }) },
    { path: '/perfil', name: 'perfil', redirect: (to) => ({ path: '/mais/' + (String(to.hash).replace('#', '') || 'perfil'), query: to.query }) },
    { path: '/mais/:secao(perfil|financas|reserva|dados-backup|seguranca|configuracoes|notificacoes|sobre)', name: 'mais-secao', component: Perfil, meta: { titulo: 'Perfil e configurações' } },
    { path: '/relatorios', name: 'relatorios', component: Relatorios, meta: { titulo: 'Relatórios' } },
    { path: '/configuracoes', name: 'configuracoes', redirect: '/mais/configuracoes' },
  ],
});

// PWA: não há tela de login por e-mail. Quem "sai" (rota /login) na verdade bloqueia o app (volta à tela de acesso).
router.beforeEach((to) => {
  if (import.meta.env.VITE_PWA && to.name === 'login') { bloquear(); return false; }
  return true;
});

router.afterEach((to) => {
  const t = to.meta && to.meta.titulo;
  document.title = t ? `${t} · Dagda Capital` : 'Dagda Capital';
});

// Página de onde o extrato do cartão (pop-up) foi aberto, para o "fechar" voltar a ela.
export let origemExtrato = null;
router.afterEach((to, from) => {
  if (to.name === 'cartao-extrato' && from.name && from.name !== 'cartao-extrato') origemExtrato = from.fullPath;
});

if (import.meta.env.VITE_DEMO && !import.meta.env.VITE_PWA) router.push('/');

export default router;
