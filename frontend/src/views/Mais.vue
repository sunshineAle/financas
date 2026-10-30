<script setup>
// Mais = tela-índice (botão "Mais" do rodapé): cabeçalho com foto/nome e a lista de seções, cada uma em SUA página (/mais/<seção>,
// renderizada por Perfil.vue). Homologação 1.0, seção 21: a mesma ordem do painel da foto (PerfilConteudo) — atalhos em
// blocos + Início do mês, Tema e Animações ali mesmo, e a lista; Relatórios entra no começo da lista (no celular não está no rodapé).
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChartColumn, FileUp, LogOut, ChevronRight } from 'lucide-vue-next';
import AvatarMini from '../components/AvatarMini.vue';
import PerfilConteudo from '../components/PerfilConteudo.vue';
import { perfil, nomeExibido, inicialDe, ultimoBackup } from '../services/perfil.js';
import { SECOES_PERFIL } from '../config/perfilSecoes.js';
import { modoTema } from '../services/tema.js';
import { configAlertas, permissaoNotificacao } from '../services/alertas.js';
import { textoVersao } from '../services/versao.js';
import { modoPWA, biometriaSuportada, biometriaAtiva, carregarBiometria } from '../services/acesso.js';
import { ehCelular } from '../services/layout.js';

const router = useRouter();
const rotaRegras = computed(() => (router.getRoutes().some((r) => r.path === '/regras') ? '/regras' : '/orcamento?aba=regras'));
// Resumo de uma linha de cada seção de Perfil e configurações (o índice mostra só ícone, título, resumo e seta).
const bioLigada = ref(false);
const versao = ref('');
function resumoBackup() {
  const iso = ultimoBackup();
  if (!iso) return 'Nenhum backup ainda';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (!(dias >= 0)) return 'Backup recente';
  return dias === 0 ? 'Backup hoje' : dias === 1 ? 'Backup ontem' : `Backup há ${dias} dias`;
}
const NOMES_TEMA = { auto: 'automático', claro: 'claro', escuro: 'escuro' };
const resumos = computed(() => ({
  perfil: emailTopo.value || nomeTopo.value,
  financas: 'Início do mês, custo de vida, quanto guardar e regras',
  reserva: 'Quanto guardar por mês',
  'dados-backup': resumoBackup(),
  seguranca: modoPWA ? (bioLigada.value ? 'Biometria ativada' : 'Senha ou PIN') : 'Senha e sessões',
  configuracoes: `Tema ${NOMES_TEMA[modoTema.value] || 'automático'}`,
  notificacoes: configAlertas.notificar && permissaoNotificacao() === 'granted' ? 'Avisos ligados' : 'Avisos desligados',
  sobre: versao.value ? `Versão ${versao.value}` : 'Atualizações, manual e apoio',
}));
const GRUPOS = computed(() => [
  { titulo: 'Análises', itens: [{ rotulo: 'Relatórios', sub: 'evolução, comparações, categorias', icone: ChartColumn, rota: '/relatorios' }] },
  { titulo: 'Dados', itens: [{ rotulo: 'Importar extrato ou fatura', sub: 'OFX, CSV, planilha ou PDF; sem duplicar', icone: FileUp, rota: '/importar' }] },
  { titulo: 'Configurações', itens: SECOES_PERFIL.filter((x) => x.id !== 'perfil').map((x) => ({ rotulo: x.rotulo, sub: resumos.value[x.id], icone: x.icone, rota: '/mais/' + x.id })) },
]);
onMounted(async () => {
  try { versao.value = await textoVersao(); } catch { /* sem versão */ }
  if (modoPWA) { try { if (await biometriaSuportada()) { await carregarBiometria(); bioLigada.value = biometriaAtiva(); } } catch { /* sem biometria */ } }
});

const conta = ref({ nome: '', email: '' });
onMounted(async () => {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    if (r.ok) conta.value = await r.json();
  } catch { /* sem rede */ }
});
const nomeTopo = computed(() => nomeExibido(conta.value) || 'Você');
const emailTopo = computed(() => { const e = perfil.email || conta.value.email || ''; return e === 'local@aparelho' ? '' : e; });
const inicial = computed(() => inicialDe(conta.value));

const EXTRAS = [{ id: 'relatorios', rotulo: 'Relatórios', sub: 'evolução, comparações, categorias', icone: ChartColumn }];
function abrir(id) { router.push(id === 'relatorios' ? '/relatorios' : id === 'apoie' ? '/apoie' : '/mais/' + id); }
async function sair() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  router.push('/login');
}
</script>

<template>
  <div class="pagina">
    <h1 class="titulo-pagina">{{ ehCelular ? 'Mais' : 'Configurações' }}</h1>

    <div class="card">
      <button type="button" class="linha perfil-atalho" @click="router.push('/mais/perfil')">
        <AvatarMini :inicial="inicial" :tamanho="48" />
        <span class="texto"><b>{{ nomeTopo }}</b><small>{{ emailTopo || 'Ver perfil' }}</small></span>
        <ChevronRight :size="18" :stroke-width="1.8" class="seta" />
      </button>
    </div>

    <PerfilConteudo :extras="EXTRAS" @ir="(r) => router.push(r)" @abrir="abrir" />

    <button type="button" class="sair" @click="sair"><LogOut :size="18" :stroke-width="1.8" /> Sair</button>
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
.titulo-pagina { font-family: var(--fonte-display); font-size: 22px; margin: 0; text-align: center; }
.grupo { display: flex; flex-direction: column; gap: 8px; }
.grupo h2 { margin: 0 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cor-texto-suave); }
.card { background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); border-radius: var(--raio-padrao); padding: 6px; display: flex; flex-direction: column; }
.linha { display: flex; align-items: center; gap: 14px; min-height: 60px; padding: 8px 10px; background: none; border: none; border-radius: 12px; color: var(--cor-texto); font-family: var(--fonte-texto); text-align: left; cursor: pointer; width: 100%; }
button.linha:hover, button.linha:active { background: var(--cor-realce); }
.quadro { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--cor-primaria) 12%, transparent); color: var(--cor-primaria); flex-shrink: 0; }
.texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.texto b { font-size: 15px; font-weight: 600; }
.texto small { font-size: 12.5px; color: var(--cor-texto-suave); }
.seta { color: var(--cor-texto-suave); flex-shrink: 0; }
.sair { align-self: stretch; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 13px; border-radius: 14px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-saida); font-family: var(--fonte-texto); font-size: 15px; font-weight: 600; cursor: pointer; }
.perfil-atalho { min-height: 68px; }
</style>
