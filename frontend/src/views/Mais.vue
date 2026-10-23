<script setup>
// Mais (botão "Mais" do rodapé do celular): atalhos para as telas e para as seções do Perfil e configurações (/perfil#...).
// Perfil, backup, segurança, tema e sobre vivem todos em UMA página (Perfil.vue); aqui só há os atalhos.
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChartColumn, Tags, CalendarClock, ListChecks, FileUp, DatabaseBackup, ShieldCheck, SlidersHorizontal, Info, LogOut, ChevronRight, BookOpen, Heart } from 'lucide-vue-next';
import AvatarMini from '../components/AvatarMini.vue';
import { perfil, nomeExibido, inicialDe } from '../services/perfil.js';

const router = useRouter();
const rotaRegras = computed(() => (router.getRoutes().some((r) => r.path === '/regras') ? '/regras' : '/orcamento?aba=regras'));
const GRUPOS = computed(() => [
  { titulo: 'Análises', itens: [{ rotulo: 'Relatórios', sub: 'evolução, comparações, categorias', icone: ChartColumn, rota: '/relatorios' }] },
  { titulo: 'Minhas finanças', itens: [
    { rotulo: 'Categorias', sub: 'categorias, cores e orçamento por categoria', icone: Tags, rota: '/orcamento' },
    { rotulo: 'Custos fixos', sub: 'aluguel, internet… e a projeção do mês seguinte', icone: CalendarClock, rota: '/custos-fixos' },
    { rotulo: 'Regras de categorização', sub: 'ativar, desativar e excluir regras', icone: ListChecks, rota: rotaRegras.value },
  ] },
  { titulo: 'Dados e configurações', itens: [
    { rotulo: 'Importar extrato ou fatura', sub: 'OFX, CSV, planilha ou PDF; sem duplicar', icone: FileUp, rota: '/importar' },
    { rotulo: 'Dados e backup', sub: 'backup, restaurar e armazenamento', icone: DatabaseBackup, rota: '/perfil#dados-backup' },
    { rotulo: 'Segurança', sub: 'senha, PIN e bloqueio', icone: ShieldCheck, rota: '/perfil#seguranca' },
    { rotulo: 'Configurações', sub: 'tema, animações e notificações', icone: SlidersHorizontal, rota: '/perfil#configuracoes' },
    { rotulo: 'Sobre o app', sub: 'atualizações, manual e reset', icone: Info, rota: '/perfil#sobre' },
  ] },
  { titulo: 'Ajuda', itens: [
    { rotulo: 'Manual / Tutorial', sub: 'passo a passo do sistema', icone: BookOpen, rota: '/manual' },
    { rotulo: 'Apoie o desenvolvedor', sub: 'projeto independente e gratuito', icone: Heart, rota: '/apoie' },
  ] },
]);

const conta = ref({ nome: '', email: '' });
onMounted(async () => {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    if (r.ok) conta.value = await r.json();
  } catch { /* sem rede */ }
});
const nomeTopo = computed(() => nomeExibido(conta.value) || 'Você');
const emailTopo = computed(() => perfil.email || conta.value.email || '');
const inicial = computed(() => inicialDe(conta.value));

async function sair() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  router.push('/login');
}
</script>

<template>
  <div class="pagina">
    <h1 class="titulo-pagina">Mais</h1>

    <div class="card">
      <button type="button" class="linha perfil-atalho" @click="router.push('/perfil')">
        <AvatarMini :inicial="inicial" :tamanho="48" />
        <span class="texto"><b>{{ nomeTopo }}</b><small>{{ emailTopo || 'Perfil e configurações' }}</small></span>
        <ChevronRight :size="18" :stroke-width="1.8" class="seta" />
      </button>
    </div>

    <section v-for="g in GRUPOS" :key="g.titulo" class="grupo">
      <h2>{{ g.titulo }}</h2>
      <div class="card">
        <button v-for="i in g.itens" :key="i.rotulo" type="button" class="linha" @click="router.push(i.rota)">
          <span class="quadro"><component :is="i.icone" :size="20" :stroke-width="1.8" /></span>
          <span class="texto"><b>{{ i.rotulo }}</b><small>{{ i.sub }}</small></span>
          <ChevronRight :size="18" :stroke-width="1.8" class="seta" />
        </button>
      </div>
    </section>

    <button type="button" class="sair" @click="sair"><LogOut :size="18" :stroke-width="1.8" /> Sair</button>
  </div>
</template>

<style scoped>
.pagina { padding: 40px; max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
@media (max-width: 480px) { .pagina { padding: 20px 16px; } }
.titulo-pagina { font-family: var(--fonte-display); font-size: 22px; margin: 0; text-align: center; }
.grupo { display: flex; flex-direction: column; gap: 8px; }
.grupo h2 { margin: 0 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cor-texto-suave); }
.card { background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); border-radius: var(--raio-padrao); padding: 6px; display: flex; flex-direction: column; }
.linha { display: flex; align-items: center; gap: 14px; min-height: 60px; padding: 8px 10px; background: none; border: none; border-radius: 12px; color: var(--cor-texto); font-family: var(--fonte-texto); text-align: left; cursor: pointer; width: 100%; }
button.linha:hover, button.linha:active { background: var(--cor-realce); }
.quadro { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--cor-entrada-fundo); color: var(--cor-primaria); flex-shrink: 0; }
.texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.texto b { font-size: 15px; font-weight: 600; }
.texto small { font-size: 12.5px; color: var(--cor-texto-suave); }
.seta { color: var(--cor-texto-suave); flex-shrink: 0; }
.sair { align-self: stretch; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 13px; border-radius: 14px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-saida); font-family: var(--fonte-texto); font-size: 15px; font-weight: 600; cursor: pointer; }
.perfil-atalho { min-height: 68px; }
</style>
