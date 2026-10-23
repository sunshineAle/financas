<script setup>
// Perfil e configurações: cada seção é SUA página (/mais/:secao), e o índice é a tela Mais (/mais, views/Mais.vue).
// Seções: perfil · financas · reserva · dados-backup · seguranca · configuracoes · notificacoes · sobre. Este arquivo guarda
// a lógica de todas e mostra só a da rota. As rotas antigas (/perfil, /configuracoes, /backup) redirecionam (ver router.js).
// Nome, e-mail e foto ficam só neste aparelho (services/perfil.js); senha: PUT /api/auth/senha (web) ou senha de acesso (PWA).
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  Pencil, KeyRound, ShieldCheck, Lock, CalendarClock, Tags, Gauge as GaugeIcon, ListChecks, FileUp, BookOpen, Heart, RotateCcw, RefreshCw, Bell,
  ChevronRight, Sun, Moon, SunMoon, Zap, ZapOff, Gauge, Info, Users, User, Wallet, DatabaseBackup, SlidersHorizontal,
} from 'lucide-vue-next';
import FormularioModal from '../components/FormularioModal.vue';
import CardPadrao from '../components/CardPadrao.vue';
import CampoTexto from '../components/CampoTexto.vue';
import PerfilAvatar from '../components/PerfilAvatar.vue';
import PerfilAbas from '../components/PerfilAbas.vue';
import AlterarSenhaAcesso from '../components/AlterarSenhaAcesso.vue';
import DesbloqueioBiometrico from '../components/DesbloqueioBiometrico.vue';
import ResetDemoModal from '../components/ResetDemoModal.vue';
import PlanoReserva from '../components/PlanoReserva.vue';
import Backup from './Backup.vue';
import { destino } from '../config/destino.js';
import { perfil, nomeExibido, inicialDe, trocarSenha } from '../services/perfil.js';
import { avisar } from '../services/avisos.js';
import { minutosAutoBloqueio, definirAutoBloqueio, definirApelido, bloquear } from '../services/acesso.js';
import { atualizacaoBacen, atualizacaoInvestimentos } from '../services/atualizacoes.js';
import { atualizar as atualizarBacen, estadoBacen } from '../services/bacen.js';
import { resetDisponivel } from '../services/resetDemo.js';
import { textoVersao } from '../services/versao.js';
import { modoTema, definirTema, movimento, definirMovimento } from '../services/tema.js';
import { configAlertas, ativarNotificacoes, desativarNotificacoes, permissaoNotificacao } from '../services/alertas.js';

const router = useRouter();
const route = useRoute();
const ehPwa = !!import.meta.env.VITE_PWA;

import { SECOES_PERFIL as SECOES } from '../config/perfilSecoes.js';
const secao = computed(() => String(route.params.secao || 'perfil'));
const tituloSecao = computed(() => (SECOES.find((x) => x.id === secao.value) || SECOES[0]).rotulo);

// ---- 1. Perfil ----
const conta = ref({ nome: '', email: '' });
const nome = ref('');
const email = ref('');
onMounted(async () => {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    if (r.ok) conta.value = await r.json();
  } catch { /* sem rede: usa o que está guardado */ }
  nome.value = perfil.nome || conta.value.nome || '';
  email.value = perfil.email || conta.value.email || '';
});
const nomeTopo = computed(() => nomeExibido(conta.value) || 'Você');
const emailAtual = computed(() => perfil.email || conta.value.email || '');
const inicial = computed(() => inicialDe(conta.value));
const emailInvalido = computed(() => email.value.trim() !== '' && !/^\S+@\S+\.\S+$/.test(email.value.trim()));

const editando = ref(false);
const erroDados = ref('');
function abrirEditar() {
  nome.value = perfil.nome || conta.value.nome || '';
  email.value = perfil.email || conta.value.email || '';
  erroDados.value = '';
  editando.value = true;
}
async function salvarDados() {
  if (emailInvalido.value) { erroDados.value = 'Confira o e-mail digitado.'; return; }
  if (ehPwa) {
    try { await definirApelido(nome.value.trim()); } catch (e) { erroDados.value = e.message; return; }
  }
  perfil.nome = nome.value.trim();
  if (!ehPwa) perfil.email = email.value.trim();
  editando.value = false;
  avisar(ehPwa ? 'Apelido salvo neste aparelho.' : 'Dados do perfil salvos neste aparelho.', { tipo: 'ok' });
}

// Senha: web = janela com senha atual/nova/confirmação; PWA = janela da senha de acesso (AlterarSenhaAcesso).
const modalAcesso = ref(false);
const modalSenha = ref(false);
const senhaAtual = ref('');
const novaSenha = ref('');
const confirmar = ref('');
const erros = ref({});
const trocando = ref(false);
function abrirSenha() {
  if (ehPwa) { modalAcesso.value = true; return; }
  senhaAtual.value = ''; novaSenha.value = ''; confirmar.value = ''; erros.value = {};
  modalSenha.value = true;
}
async function enviarSenha() {
  const e = {};
  if (!senhaAtual.value) e.atual = 'Informe a senha atual.';
  if (novaSenha.value.length < 8) e.nova = 'Use ao menos 8 caracteres.';
  if (confirmar.value !== novaSenha.value) e.confirmar = 'A confirmação não bate com a nova senha.';
  erros.value = e;
  if (Object.keys(e).length) return;
  trocando.value = true;
  try {
    await trocarSenha(senhaAtual.value, novaSenha.value);
    modalSenha.value = false;
    avisar('Senha alterada. Entre de novo.', { tipo: 'ok' });
    setTimeout(() => router.push('/login'), 1200);
  } catch (x) {
    erros.value = { atual: x.message };
  } finally {
    trocando.value = false;
  }
}

// ---- 2. Minhas finanças ----
// "Regras" abre a tela de regras de categorização quando ela existir (setor Categorias); até lá, cai em Categorias.
const rotaRegras = computed(() => (router.getRoutes().some((r) => r.path === '/regras') ? '/regras' : '/orcamento?aba=regras'));
const FINANCAS = computed(() => [
  { rotulo: 'Custos fixos', sub: 'aluguel, internet… e a projeção do mês seguinte', icone: CalendarClock, rota: '/custos-fixos' },
  { rotulo: 'Categorias', sub: 'criar, editar, cores e ícones', icone: Tags, rota: '/orcamento' },
  { rotulo: 'Orçamento por categoria', sub: 'quanto planeja gastar em cada uma', icone: GaugeIcon, rota: '/orcamento' },
  { rotulo: 'Regras de categorização', sub: 'o app aprende: "Padaria do José" vai para Mercado', icone: ListChecks, rota: rotaRegras.value },
]);

// ---- 4. Segurança ----
const autoMin = ref(String(minutosAutoBloqueio()));
function mudarAuto() { definirAutoBloqueio(Number(autoMin.value)); }
async function encerrarTodasSessoes() {
  if (!confirm('Isso vai desconectar este e todos os outros dispositivos logados. Continuar?')) return;
  await fetch('/api/auth/encerrar-sessoes', { method: 'POST', credentials: 'include' });
  router.push('/login');
}

// ---- 5. Configurações ----
const TEMAS = [
  { id: 'auto', rotulo: 'Automático', icone: SunMoon },
  { id: 'claro', rotulo: 'Claro', icone: Sun },
  { id: 'escuro', rotulo: 'Escuro', icone: Moon },
];
const MOVIMENTOS = [
  { id: 'auto', rotulo: 'Do aparelho', icone: Gauge },
  { id: 'normal', rotulo: 'Normal', icone: Zap },
  { id: 'reduzido', rotulo: 'Reduzidas', icone: ZapOff },
];
const erroNotif = ref('');
const notifLigada = computed(() => configAlertas.notificar && permissaoNotificacao() === 'granted');
async function alternarNotif() {
  erroNotif.value = '';
  if (notifLigada.value) { desativarNotificacoes(); return; }
  const r = await ativarNotificacoes();
  if (!r.ok) erroNotif.value = r.motivo;
}
const config = ref(null);
async function carregarConfig() {
  try {
    const r = await fetch('/api/configuracoes', { credentials: 'include' });
    if (r.ok) config.value = await r.json();
  } catch { /* sem config: esconde os avisos extras */ }
}
async function salvarConfig() {
  try {
    const r = await fetch('/api/configuracoes', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ notificarCategoriaEstourada: config.value.notificar_categoria_estourada, notificarFaturaProxima: config.value.notificar_fatura_proxima }),
    });
    if (r.ok) config.value = await r.json();
  } catch { /* mantém o que está na tela */ }
}
onMounted(carregarConfig);

// ---- 6. Sobre o app ----
const dataBacen = ref('—');
const dataInvest = ref('—');
async function carregarDatas() { dataBacen.value = await atualizacaoBacen(); dataInvest.value = await atualizacaoInvestimentos(); }
onMounted(carregarDatas);
async function atualizarIndices() { await atualizarBacen({ forcar: true }); await carregarDatas(); avisar('Índices do Bacen atualizados.', { tipo: 'ok' }); }
const passoReset = ref(0);
const versao = ref('—');
onMounted(async () => { versao.value = await textoVersao(); });
function carregarExemplo() {
  if (!confirm('Carregar dados de exemplo? Eles são adicionados a este aparelho; faça um backup antes se já tem dados seus.')) return;
  window.dispatchEvent(new Event('sf:carregar-exemplo'));
}

</script>

<template>
  <div class="pagina">
    <h1 class="so-leitor">{{ tituloSecao }}</h1>

    <nav class="indice" aria-label="Seções">
      <button v-for="s in SECOES" :key="s.id" type="button" :class="{ ativa: secao === s.id }" :aria-current="secao === s.id ? 'page' : null" @click="router.push('/mais/' + s.id)">
        <component :is="s.icone" :size="15" :stroke-width="2" /> {{ s.rotulo }}
      </button>
    </nav>

    <!-- 1. Perfil -->
    <section v-if="secao === 'perfil'" id="perfil" class="secao" aria-labelledby="h-perfil">
      <h2 id="h-perfil">Perfil</h2>
      <header class="topo-perfil">
        <PerfilAvatar :inicial="inicial" />
        <strong>{{ nomeTopo }}</strong>
        <small>{{ emailAtual || destino.rotulo }}</small>
      </header>
      <CardPadrao>
        <div class="linhas">
          <div class="linha fixa"><span class="quadro"><User :size="20" :stroke-width="1.8" /></span><span class="texto"><b>{{ ehPwa ? 'Apelido' : 'Nome' }}</b><small>{{ nomeTopo }}</small></span></div>
          <div v-if="!ehPwa" class="linha fixa"><span class="quadro"><Info :size="20" :stroke-width="1.8" /></span><span class="texto"><b>E-mail</b><small>{{ emailAtual || 'não informado' }}</small></span></div>
          <button type="button" class="linha atalho" @click="abrirSenha">
            <span class="quadro"><KeyRound :size="20" :stroke-width="1.8" /></span>
            <span class="texto"><b>{{ ehPwa ? 'Senha ou PIN' : 'Senha' }}</b><small>•••••••• · toque para alterar</small></span>
            <ChevronRight :size="18" :stroke-width="1.8" class="seta" />
          </button>
        </div>
        <template #rodape><button type="button" class="botao-prim" @click="abrirEditar"><Pencil :size="18" :stroke-width="2" /> Editar dados</button></template>
      </CardPadrao>
    </section>

    <!-- 2. Minhas finanças -->
    <section v-if="secao === 'financas'" id="financas" class="secao" aria-labelledby="h-financas">
      <h2 id="h-financas">Minhas finanças</h2>
      <CardPadrao>
        <div class="linhas">
          <button v-for="i in FINANCAS" :key="i.rotulo" type="button" class="linha atalho" @click="router.push(i.rota)">
            <span class="quadro"><component :is="i.icone" :size="20" :stroke-width="1.8" /></span>
            <span class="texto"><b>{{ i.rotulo }}</b><small>{{ i.sub }}</small></span>
            <ChevronRight :size="18" :stroke-width="1.8" class="seta" />
          </button>
        </div>
      </CardPadrao>
    </section>

    <!-- 2b. Plano da Reserva de Liberdade -->
    <section v-if="secao === 'reserva'" id="reserva" class="secao" aria-labelledby="h-reserva">
      <h2 id="h-reserva">Plano da Reserva de Liberdade</h2>
      <PlanoReserva />
    </section>

    <!-- 3. Dados e backup -->
    <section v-if="secao === 'dados-backup'" id="dados-backup" class="secao" aria-labelledby="h-dados">
      <h2 id="h-dados">Dados e backup</h2>
      <CardPadrao>
        <div class="linhas">
          <button type="button" class="linha atalho" @click="router.push('/importar')">
            <span class="quadro"><FileUp :size="20" :stroke-width="1.8" /></span>
            <span class="texto"><b>Importar extrato ou fatura</b><small>OFX, CSV, planilha ou PDF; sem duplicar</small></span>
            <ChevronRight :size="18" :stroke-width="1.8" class="seta" />
          </button>
        </div>
      </CardPadrao>
      <Backup embutido />
    </section>

    <!-- 4. Segurança -->
    <section v-if="secao === 'seguranca'" id="seguranca" class="secao" aria-labelledby="h-seg">
      <h2 id="h-seg">Segurança</h2>
      <CardPadrao :subtitulo="ehPwa ? 'protege o app neste aparelho' : 'acesso à sua conta'">
        <p v-if="ehPwa" class="nota">A senha ou PIN é pedida ao abrir o app e também protege seus backups. Fica só neste aparelho: se esquecer, restaure um backup.</p>
        <div class="linhas">
          <button type="button" class="linha atalho" @click="abrirSenha">
            <span class="quadro"><KeyRound :size="20" :stroke-width="1.8" /></span>
            <span class="texto"><b>{{ ehPwa ? 'Alterar senha ou PIN' : 'Trocar senha' }}</b><small>{{ ehPwa ? 'senha de acesso ao app' : 'trocar encerra as sessões abertas' }}</small></span>
            <ChevronRight :size="18" :stroke-width="1.8" class="seta" />
          </button>
          <template v-if="ehPwa">
            <DesbloqueioBiometrico />
            <label class="linha">
              <span class="quadro"><Lock :size="20" :stroke-width="1.8" /></span>
              <span class="texto"><b>Bloquear sozinho</b><small>depois de ficar fora do app</small></span>
              <select v-model="autoMin" aria-label="Bloqueio automático" @change="mudarAuto">
                <option value="0">Nunca</option><option value="1">1 minuto</option><option value="5">5 minutos</option><option value="15">15 minutos</option><option value="60">1 hora</option>
              </select>
            </label>
            <button type="button" class="linha atalho" @click="bloquear">
              <span class="quadro"><ShieldCheck :size="20" :stroke-width="1.8" /></span>
              <span class="texto"><b>Bloquear agora</b><small>volta para a tela de senha ou PIN</small></span>
              <ChevronRight :size="18" :stroke-width="1.8" class="seta" />
            </button>
          </template>
          <button v-else type="button" class="linha atalho" @click="encerrarTodasSessoes">
            <span class="quadro"><Users :size="20" :stroke-width="1.8" /></span>
            <span class="texto"><b>Encerrar todas as sessões</b><small>desconecta este e os outros aparelhos</small></span>
            <ChevronRight :size="18" :stroke-width="1.8" class="seta" />
          </button>
        </div>
      </CardPadrao>
    </section>

    <!-- 5. Configurações -->
    <section v-if="secao === 'configuracoes'" id="configuracoes" class="secao" aria-labelledby="h-conf">
      <h2 id="h-conf">Configurações</h2>
      <CardPadrao>
        <div class="bloco">
          <div class="linha fixa"><span class="quadro"><component :is="TEMAS.find((t) => t.id === modoTema).icone" :size="20" :stroke-width="1.8" /></span><span class="texto"><b>Tema</b><small>claro, escuro ou o do aparelho</small></span></div>
          <PerfilAbas :model-value="modoTema" :opcoes="TEMAS" rotulo="Tema" @update:model-value="definirTema" />
        </div>
        <div class="bloco">
          <div class="linha fixa"><span class="quadro"><Zap :size="20" :stroke-width="1.8" /></span><span class="texto"><b>Animações</b><small>menos movimento nas telas e gráficos</small></span></div>
          <PerfilAbas :model-value="movimento" :opcoes="MOVIMENTOS" rotulo="Animações" @update:model-value="definirMovimento" />
        </div>
      </CardPadrao>
    </section>

    <!-- 5b. Notificações -->
    <section v-if="secao === 'notificacoes'" id="notificacoes" class="secao" aria-labelledby="h-notif">
      <h2 id="h-notif">Notificações</h2>
      <CardPadrao subtitulo="os avisos também aparecem no sino do topo">
        <div class="linhas">
          <div class="linha">
            <span class="quadro"><Bell :size="20" :stroke-width="1.8" /></span>
            <span class="texto"><b>Avisos no aparelho</b><small>fatura, parcela e acordo vencendo, orçamento no limite e backup atrasado (1 por dia)</small></span>
            <button type="button" class="chave" role="switch" :aria-checked="notifLigada" :aria-label="notifLigada ? 'Desligar avisos no aparelho' : 'Ligar avisos no aparelho'" :class="{ on: notifLigada }" @click="alternarNotif"><span></span></button>
          </div>
          <p v-if="erroNotif" class="nota erro" role="alert">{{ erroNotif }}</p>
          <template v-if="config">
            <div class="linha">
              <span class="quadro"><Bell :size="20" :stroke-width="1.8" /></span>
              <span class="texto"><b>Orçamento chegando a 90%</b><small>avisar quando uma categoria passar de 90% do teto do mês</small></span>
              <button type="button" class="chave" role="switch" :aria-checked="!!config.notificar_categoria_estourada" aria-label="Avisar aos 90% do orçamento" :class="{ on: !!config.notificar_categoria_estourada }" @click="config.notificar_categoria_estourada = !config.notificar_categoria_estourada; salvarConfig()"><span></span></button>
            </div>
            <div class="linha">
              <span class="quadro"><Bell :size="20" :stroke-width="1.8" /></span>
              <span class="texto"><b>Fatura perto do vencimento</b><small>avisar alguns dias antes de vencer</small></span>
              <button type="button" class="chave" role="switch" :aria-checked="!!config.notificar_fatura_proxima" aria-label="Avisar fatura perto do vencimento" :class="{ on: !!config.notificar_fatura_proxima }" @click="config.notificar_fatura_proxima = !config.notificar_fatura_proxima; salvarConfig()"><span></span></button>
            </div>
          </template>
        </div>
      </CardPadrao>
    </section>

    <!-- 6. Sobre o app -->
    <section v-if="secao === 'sobre'" id="sobre" class="secao" aria-labelledby="h-sobre">
      <h2 id="h-sobre">Sobre o app</h2>
      <CardPadrao>
        <div class="linhas">
          <div class="linha fixa"><span class="quadro"><RefreshCw :size="20" :stroke-width="1.8" /></span><span class="texto"><b>Índices do Bacen</b><small>Selic, CDI, IPCA · atualizados em {{ dataBacen }}</small></span>
            <button type="button" class="mini" :disabled="estadoBacen.atualizando" @click="atualizarIndices">{{ estadoBacen.atualizando ? 'Atualizando…' : 'Atualizar' }}</button></div>
          <div class="linha fixa"><span class="quadro"><RefreshCw :size="20" :stroke-width="1.8" /></span><span class="texto"><b>Investimentos e metas</b><small>última atualização: {{ dataInvest }}</small></span></div>
          <div class="linha fixa"><span class="quadro"><Info :size="20" :stroke-width="1.8" /></span><span class="texto"><b>Sobre o sistema</b><small>{{ destino.rotulo }} · versão de testes · {{ versao }}</small></span></div>
          <button type="button" class="linha atalho" @click="router.push('/manual')">
            <span class="quadro"><BookOpen :size="20" :stroke-width="1.8" /></span><span class="texto"><b>Manual / Tutorial</b><small>passo a passo do sistema</small></span><ChevronRight :size="18" :stroke-width="1.8" class="seta" />
          </button>
          <button v-if="resetDisponivel()" type="button" class="linha atalho" @click="carregarExemplo">
            <span class="quadro"><DatabaseBackup :size="20" :stroke-width="1.8" /></span><span class="texto"><b>Carregar dados de exemplo</b><small>opcional: preenche o app para você conhecer</small></span><ChevronRight :size="18" :stroke-width="1.8" class="seta" />
          </button>
          <button v-if="resetDisponivel()" type="button" class="linha atalho" @click="passoReset = 1">
            <span class="quadro"><RotateCcw :size="20" :stroke-width="1.8" /></span><span class="texto"><b>Reset</b><small>apaga todos os dados deste aparelho (faça um backup antes)</small></span><ChevronRight :size="18" :stroke-width="1.8" class="seta" />
          </button>
          <button type="button" class="linha atalho" @click="router.push('/apoie')">
            <span class="quadro"><Heart :size="20" :stroke-width="1.8" /></span><span class="texto"><b>Apoie o desenvolvedor</b><small>projeto independente e gratuito</small></span><ChevronRight :size="18" :stroke-width="1.8" class="seta" />
          </button>
        </div>
      </CardPadrao>
    </section>

    <FormularioModal :aberto="editando" titulo="Editar dados" rotulo-salvar="Salvar" :erro="erroDados" @salvar="salvarDados" @fechar="editando = false">
      <CampoTexto v-model="nome" :rotulo="ehPwa ? 'Apelido' : 'Nome'" :placeholder="ehPwa ? 'Como quer ser chamado' : 'Seu nome'" maxlength="60" autocomplete="name" />
      <CampoTexto v-if="!ehPwa" v-model="email" rotulo="E-mail" type="email" placeholder="voce@email.com" maxlength="120" autocomplete="email" :erro="emailInvalido ? 'Confira o e-mail digitado.' : ''" />
    </FormularioModal>
    <FormularioModal :aberto="modalSenha" titulo="Trocar senha" rotulo-salvar="Trocar senha" :carregando="trocando" @salvar="enviarSenha" @fechar="modalSenha = false">
      <CampoTexto v-model="senhaAtual" rotulo="Senha atual" type="password" autocomplete="current-password" :erro="erros.atual" />
      <CampoTexto v-model="novaSenha" rotulo="Nova senha" type="password" autocomplete="new-password" dica="Mínimo de 8 caracteres." :erro="erros.nova" />
      <CampoTexto v-model="confirmar" rotulo="Confirmar nova senha" type="password" autocomplete="new-password" :erro="erros.confirmar" />
    </FormularioModal>
    <AlterarSenhaAcesso :aberto="modalAcesso" @fechar="modalAcesso = false" />
    <ResetDemoModal v-model:passo="passoReset" />
  </div>
</template>

<style scoped>
.pagina { padding: 8px 0 40px; max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 22px; }
.so-leitor { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.indice { display: none; position: sticky; top: 0; z-index: 5; display: flex; gap: 6px; overflow-x: auto; padding: 8px 2px; margin: 0 -2px; background: var(--cor-fundo); scrollbar-width: none; }
.indice::-webkit-scrollbar { display: none; }
.indice button { flex: none; min-height: 36px; display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto-suave); font-family: var(--fonte-texto); font-size: 13px; font-weight: 600; cursor: pointer; }
.indice button.ativa { background: var(--cor-interface, var(--cor-primaria)); border-color: transparent; color: var(--cor-sobre-cor); }
@media (min-width: 768px) { .indice { display: flex; flex-wrap: wrap; overflow: visible; position: static; } }
.secao { display: flex; flex-direction: column; gap: 12px; scroll-margin-top: 56px; }
.secao > h2 { margin: 0 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cor-texto-suave); }
.topo-perfil { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 0 4px; text-align: center; }
.topo-perfil strong { margin-top: 4px; font-family: var(--fonte-display); font-size: 20px; }
.topo-perfil small { color: var(--cor-texto-suave); font-size: 13px; }
.nota { margin: 0 0 8px; font-size: 13.5px; color: var(--cor-texto-suave); line-height: 1.5; }
.nota.erro { color: var(--cor-grave, var(--cor-saida)); }
.linhas { display: flex; flex-direction: column; gap: 4px; }
.linha { display: flex; align-items: center; gap: 14px; min-height: 56px; }
.linha.fixa { cursor: default; }
.quadro { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--cor-entrada-fundo); color: var(--cor-primaria); flex-shrink: 0; }
.texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.texto b { font-size: 15px; font-weight: 600; }
.texto small { font-size: 12.5px; color: var(--cor-texto-suave); }
.atalho { width: 100%; background: none; border: none; border-radius: 12px; padding: 4px 6px; color: var(--cor-texto); font-family: var(--fonte-texto); text-align: left; cursor: pointer; }
.atalho:hover, .atalho:active { background: var(--cor-realce); }
.seta { color: var(--cor-texto-suave); flex-shrink: 0; }
.bloco { display: flex; flex-direction: column; gap: 8px; padding: 0 0 10px; }
select { min-height: 44px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado); color: var(--cor-texto); font-family: var(--fonte-texto); font-size: 14px; }
.botao-prim { width: 100%; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: none; border-radius: 12px; color: var(--cor-sobre-cor); background: var(--cor-interface, var(--cor-primaria)); font-family: var(--fonte-texto); font-size: 15px; font-weight: 600; cursor: pointer; }
.mini { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); font-family: var(--fonte-texto); font-size: 13px; font-weight: 600; cursor: pointer; }
.mini:disabled { opacity: 0.5; cursor: default; }
.sair { align-self: stretch; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 13px; border-radius: 14px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-saida-texto, var(--cor-saida)); font-family: var(--fonte-texto); font-size: 15px; font-weight: 600; cursor: pointer; }
.chave { position: relative; width: 48px; height: 28px; flex: none; border-radius: 99px; border: 1px solid var(--cor-borda); background: var(--cor-realce); cursor: pointer; padding: 0; transition: background 0.15s ease; }
.chave span { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--cor-texto-suave); transition: transform 0.15s ease, background 0.15s ease; }
.chave.on { background: color-mix(in srgb, var(--cor-interface, var(--cor-primaria)) 35%, transparent); border-color: var(--cor-interface, var(--cor-primaria)); }
.chave.on span { transform: translateX(20px); background: var(--cor-interface, var(--cor-primaria)); }
@media (prefers-reduced-motion: reduce) { .chave, .chave span { transition: none; } }
</style>
