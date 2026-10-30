<script setup>
// Perfil e configurações: cada seção é SUA página (/mais/:secao), e o índice é a tela Mais (/mais, views/Mais.vue).
// Seções: perfil · financas · reserva · dados-backup · seguranca · configuracoes · notificacoes · sobre. Este arquivo guarda
// a lógica de todas e mostra só a da rota. As rotas antigas (/perfil, /configuracoes, /backup) redirecionam (ver router.js).
// Nome, e-mail e foto ficam só neste aparelho (services/perfil.js); senha: PUT /api/auth/senha (web) ou senha de acesso (PWA).
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  Pencil, KeyRound, ShieldCheck, Lock, CalendarClock, Tags, Gauge as GaugeIcon, ListChecks, FileUp, BookOpen, Heart, RotateCcw, RefreshCw, Bell,
  ChevronRight, ChevronDown, MessageSquare, Sun, Moon, SunMoon, Zap, ZapOff, Gauge, Info, Users, User, Wallet, DatabaseBackup, SlidersHorizontal, Trash2,
} from 'lucide-vue-next';
import FormularioModal from '../components/FormularioModal.vue';
import CardPadrao from '../components/CardPadrao.vue';
import AjudaSecao from '../components/AjudaSecao.vue';
import CampoTexto from '../components/CampoTexto.vue';
import PerfilAvatar from '../components/PerfilAvatar.vue';
import PerfilAbas from '../components/PerfilAbas.vue';
import AlterarSenhaAcesso from '../components/AlterarSenhaAcesso.vue';
import DesbloqueioBiometrico from '../components/DesbloqueioBiometrico.vue';
import ApagarDadosModal from '../components/ApagarDadosModal.vue';
import ChaveRecuperacao from '../components/ChaveRecuperacao.vue';
import Modal from '../components/Modal.vue';
import FeedbackModal from '../components/FeedbackModal.vue';
import { carregarNovidades, dataCurta, rotuloVersao, ehTeste } from '../services/novidades.js';
import PlanoReserva from '../components/PlanoReserva.vue';
import Backup from './Backup.vue';
import { destino } from '../config/destino.js';
import { perfil, nomeExibido, inicialDe, trocarSenha } from '../services/perfil.js';
import { avisar } from '../services/avisos.js';
import { minutosAutoBloqueio, definirAutoBloqueio, definirApelido, bloquear, conferirSenha, gerarNovoCodigo, confirmarCodigoGuardado, codigoRecuperacaoPendente, verCodigoAtual, temCodigoVisivel } from '../services/acesso.js';
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
import { lerInicio, gravarInicio, descreverInicio, intervaloDoMes } from '../utils/mesFinanceiro.js';
// Homologação 1.0, seção 13: no PC a seção também abre DENTRO do painel da foto (<Perfil secao-fixa="seguranca" embutido />).
const propsPerfil = defineProps({ secaoFixa: { type: String, default: '' }, embutido: { type: Boolean, default: false } });
const secao = computed(() => String(propsPerfil.secaoFixa || route.params.secao || 'perfil'));
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
  { rotulo: 'Custo de vida', sub: 'fixos e essenciais do mês, e a projeção do mês seguinte', icone: CalendarClock, rota: '/custos-fixos' },
  { rotulo: 'Quanto guardar', sub: 'meta e valor por mês da Reserva de Liberdade', icone: Wallet, rota: '/mais/reserva' },
  { rotulo: 'Categorias', sub: 'criar, editar, cores, ícones e orçamento', icone: Tags, rota: '/orcamento' },
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
// Início do mês financeiro (anotação 51): dia 1 (padrão), dia fixo (1–28 ou último) ou 5º dia útil.
const ini = lerInicio();
const inicioTipo = ref(ini.tipo === 'util' ? 'util' : (Number(ini.dia) === 1 ? 'padrao' : 'dia'));
const inicioDia = ref(ini.tipo === 'dia' && Number(ini.dia) !== 1 ? String(ini.dia) : '5');
const TIPOS_INICIO = [{ id: 'padrao', rotulo: 'Dia 1' }, { id: 'dia', rotulo: 'Dia fixo' }, { id: 'util', rotulo: '5º dia útil' }];
const cfgInicio = computed(() => (inicioTipo.value === 'util' ? { tipo: 'util', n: 5 } : inicioTipo.value === 'dia' ? { tipo: 'dia', dia: inicioDia.value === 'ultimo' ? 'ultimo' : Number(inicioDia.value) } : { tipo: 'dia', dia: 1 }));
const exemploInicio = computed(() => {
  const h = new Date();
  const { de, ate } = intervaloDoMes(h.getFullYear(), h.getMonth() + 1, cfgInicio.value);
  const dm = (x) => `${x.slice(8, 10)}/${x.slice(5, 7)}`;
  return `Ex.: o mês de ${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][h.getMonth()]} vai de ${dm(de)} a ${dm(ate)}.`;
});
const inicioMudou = computed(() => JSON.stringify(cfgInicio.value) !== JSON.stringify(lerInicio().tipo === 'dia' && Number(lerInicio().dia) === 1 ? { tipo: 'dia', dia: 1 } : lerInicio()));
async function salvarInicio() {
  gravarInicio(cfgInicio.value);
  // vai também para o banco, que entra no backup (anotação 54)
  try { await fetch('/api/configuracoes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ inicioMes: cfgInicio.value }) }); } catch { /* fica no aparelho */ }
  avisar(`Mês financeiro começa no ${descreverInicio(cfgInicio.value)}.`, { tipo: 'ok' });
  setTimeout(() => location.reload(), 700); // recarrega para todas as telas usarem o novo período
}

// ---- 6. Sobre o app ----
const dataBacen = ref('—');
const dataInvest = ref('—');
async function carregarDatas() { dataBacen.value = await atualizacaoBacen(); dataInvest.value = await atualizacaoInvestimentos(); }
onMounted(carregarDatas);
async function atualizarIndices() { await atualizarBacen({ forcar: true }); await carregarDatas(); avisar('Índices do Bacen atualizados.', { tipo: 'ok' }); }
const apagarAberto = ref(false);
// ---- Novidades da versão e feedback (anotação 40) ----
const versaoAberta = ref(route.query.novidades === '1');
const novidades = ref([]);
const abertasAnt = ref([]);
const alternarAnt = (v) => { abertasAnt.value = abertasAnt.value.includes(v) ? abertasAnt.value.filter((x) => x !== v) : [...abertasAnt.value, v]; };
onMounted(async () => { novidades.value = await carregarNovidades(); });
const feedbackAberto = ref(false);
const versao = ref('—');
onMounted(async () => { versao.value = await textoVersao(); });
// ---- Chave de recuperação (Segurança, anotação 49): "Ver chave atual" ou "Gerar nova", sempre pedindo a senha ----
const recPendente = ref(codigoRecuperacaoPendente());
const modalRec = ref(false);
const recModo = ref('ver'); // 'ver' | 'gerar'
const senhaRec = ref('');
const erroRec = ref('');
const codigoRec = ref('');
const recSomenteVer = ref(false);
const recCarregando = ref(false);
const podeVerRec = ref(false);
function abrirRec() {
  senhaRec.value = ''; erroRec.value = ''; codigoRec.value = ''; recSomenteVer.value = false;
  podeVerRec.value = temCodigoVisivel();
  recModo.value = podeVerRec.value ? 'ver' : 'gerar';
  modalRec.value = true;
}
async function confirmarRec() {
  if (!senhaRec.value || recCarregando.value) return;
  erroRec.value = ''; recCarregando.value = true;
  try {
    if (recModo.value === 'ver') { codigoRec.value = await verCodigoAtual(senhaRec.value); recSomenteVer.value = true; return; }
    if (!(await conferirSenha(senhaRec.value))) { erroRec.value = 'Senha ou PIN incorreto.'; return; }
    codigoRec.value = await gerarNovoCodigo();
    recSomenteVer.value = false; recPendente.value = true;
  } catch (e) { erroRec.value = (e && e.message) || 'Não foi possível concluir. Tente de novo.'; }
  finally { recCarregando.value = false; senhaRec.value = ''; }
}
async function recGuardado() { await confirmarCodigoGuardado(); recPendente.value = false; modalRec.value = false; avisar('Chave de recuperação guardada. Faça um backup novo para ela valer também no arquivo.', { tipo: 'ok', rota: '/backup?fazer=1', duracao: 10000 }); }

</script>

<template>
  <div class="pagina" :class="{ embutida: propsPerfil.embutido }">
    <h1 class="so-leitor">{{ tituloSecao }}</h1>


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
      <CardPadrao subtitulo="quando começa o seu mês">
        <div class="bloco" data-inicio-mes>
          <div class="linha fixa"><span class="quadro"><CalendarClock :size="20" :stroke-width="1.8" /></span><span class="texto"><b>Início do mês financeiro<AjudaSecao secao="perfil.inicio-mes" /></b></span></div>
          <PerfilAbas v-model="inicioTipo" :opcoes="TIPOS_INICIO" rotulo="Início do mês financeiro" />
          <label v-if="inicioTipo === 'dia'" class="linha">
            <span class="texto"><b>Dia do mês</b></span>
            <select v-model="inicioDia" aria-label="Dia em que o mês começa">
              <option v-for="d in 27" :key="d" :value="String(d + 1)">Dia {{ d + 1 }}</option>
              <option value="ultimo">Último dia do mês</option>
            </select>
          </label>
          <p class="nota">{{ exemploInicio }}</p>
          <button v-if="inicioMudou" type="button" class="botao-prim" data-salvar-inicio @click="salvarInicio">Salvar e recarregar</button>
        </div>
      </CardPadrao>
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

    <!-- 2b. Quanto guardar (antes "Plano da Reserva de Liberdade", anotação 43) -->
    <section v-if="secao === 'reserva'" id="reserva" class="secao" aria-labelledby="h-reserva">
      <h2 id="h-reserva">Quanto guardar</h2>
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
      <CardPadrao v-if="resetDisponivel()">
        <button type="button" class="linha atalho perigo" data-apagar @click="apagarAberto = true">
          <span class="quadro"><Trash2 :size="20" :stroke-width="1.8" /></span>
          <span class="texto"><b>Apagar dados e redefinir o app</b><small>apaga tudo deste aparelho e volta à tela de boas-vindas</small></span>
          <ChevronRight :size="18" :stroke-width="1.8" class="seta" />
        </button>
      </CardPadrao>
    </section>

    <!-- 4. Segurança -->
    <section v-if="secao === 'seguranca'" id="seguranca" class="secao" aria-labelledby="h-seg">
      <h2 id="h-seg">Segurança</h2>
      <CardPadrao :subtitulo="ehPwa ? 'protege o app neste aparelho' : 'acesso à sua conta'">
        <p v-if="ehPwa" class="nota">A senha ou PIN é pedida ao abrir o app e também protege seus backups. Se esquecer, use o código de recuperação.</p>
        <div class="linhas">
          <button type="button" class="linha atalho" @click="abrirSenha">
            <span class="quadro"><KeyRound :size="20" :stroke-width="1.8" /></span>
            <span class="texto"><b>{{ ehPwa ? 'Alterar senha ou PIN' : 'Trocar senha' }}</b><small>{{ ehPwa ? 'senha de acesso ao app' : 'trocar encerra as sessões abertas' }}</small></span>
            <ChevronRight :size="18" :stroke-width="1.8" class="seta" />
          </button>
          <template v-if="ehPwa">
            <button type="button" class="linha atalho" data-chave-rec @click="abrirRec">
              <span class="quadro"><KeyRound :size="20" :stroke-width="1.8" /></span>
              <span class="texto"><b>Chave de recuperação</b><small>{{ recPendente ? 'pendente: gere e guarde a sua chave' : 'ver a chave atual ou gerar uma nova' }}</small></span>
              <ChevronRight :size="18" :stroke-width="1.8" class="seta" />
            </button>
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
        <div class="sobre-topo">
          <b>Dagda Capital</b>
          <small>{{ destino.rotulo }}</small>
        </div>
        <!-- Versão tocável: expande para baixo com as novidades (anotação 40) -->
        <button type="button" class="linha atalho versao" :aria-expanded="versaoAberta" data-versao @click="versaoAberta = !versaoAberta">
          <span class="quadro"><Info :size="20" :stroke-width="1.8" /></span>
          <span class="texto"><b>{{ novidades[0] ? rotuloVersao(novidades[0]) : 'Versão' }}<span v-if="novidades[0] && ehTeste(novidades[0])" class="selo-teste">teste</span></b><small>build {{ versao }}</small></span>
          <ChevronDown :size="18" :stroke-width="1.8" class="seta gira" :class="{ aberta: versaoAberta }" />
        </button>
        <div v-if="versaoAberta" class="novidades" data-novidades>
          <template v-if="novidades.length">
            <section v-for="(n, i) in novidades" :key="n.versao" class="nov">
              <button v-if="i > 0" type="button" class="nov-cab" :aria-expanded="abertasAnt.includes(n.versao)" @click="alternarAnt(n.versao)">
                <b>Versão {{ n.versao }}</b><small>{{ dataCurta(n.data) }}</small><ChevronDown :size="16" :stroke-width="1.8" class="gira" :class="{ aberta: abertasAnt.includes(n.versao) }" />
              </button>
              <div v-else class="nov-cab atual"><b>Versão {{ n.versao }} · atual</b><small>{{ dataCurta(n.data) }}</small></div>
              <template v-if="i === 0 || abertasAnt.includes(n.versao)">
                <p class="nov-resumo">{{ n.resumo }}</p>
                <ul><li v-for="(t, k) in n.itens" :key="k">{{ t }}</li></ul>
              </template>
            </section>
          </template>
          <p v-else class="nota">Sem as novidades agora (sem internet). Tente de novo mais tarde.</p>
        </div>
        <div class="linhas">
          <button type="button" class="linha atalho" @click="router.push('/manual')">
            <span class="quadro"><BookOpen :size="20" :stroke-width="1.8" /></span><span class="texto"><b>Manual / Tutorial</b><small>passo a passo do sistema</small></span><ChevronRight :size="18" :stroke-width="1.8" class="seta" />
          </button>
          <button type="button" class="linha atalho" data-feedback @click="feedbackAberto = true">
            <span class="quadro"><MessageSquare :size="20" :stroke-width="1.8" /></span><span class="texto"><b>Enviar feedback</b><small>erro, dúvida, sugestão ou elogio</small></span><ChevronRight :size="18" :stroke-width="1.8" class="seta" />
          </button>
          <button type="button" class="linha atalho" @click="router.push('/apoie')">
            <span class="quadro"><Heart :size="20" :stroke-width="1.8" /></span><span class="texto"><b>Apoie o desenvolvedor</b><small>projeto independente e gratuito</small></span><ChevronRight :size="18" :stroke-width="1.8" class="seta" />
          </button>
        </div>
        <div class="indices" data-indices>
          <p><RefreshCw :size="13" :stroke-width="2" /> Índices do Bacen (Selic, CDI, IPCA): {{ dataBacen }}
            <button type="button" class="link-mini" :disabled="estadoBacen.atualizando" @click="atualizarIndices">{{ estadoBacen.atualizando ? 'Atualizando…' : 'Atualizar' }}</button></p>
          <p>Investimentos e metas: {{ dataInvest }}</p>
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
    <ApagarDadosModal v-model:aberto="apagarAberto" />
    <FeedbackModal v-model:aberto="feedbackAberto" />
    <Modal :aberto="modalRec" titulo="Chave de recuperação" :largura="480" @fechar="modalRec = false">
      <div v-if="!codigoRec" class="rec" data-rec-form>
        <PerfilAbas v-if="podeVerRec" v-model="recModo" :opcoes="[{ id: 'ver', rotulo: 'Ver chave atual', icone: KeyRound }, { id: 'gerar', rotulo: 'Gerar nova', icone: RefreshCw }]" rotulo="Chave de recuperação" />
        <p v-if="recModo === 'ver'" class="nota">Para mostrar a chave que vale hoje, confirme a sua senha ou PIN.</p>
        <template v-else>
          <p class="nota">A chave de recuperação substitui a senha se você a esquecer: abre o app e os backups.</p>
          <p class="alerta-rec" role="note"><b>Ao gerar uma nova, a chave anterior deixa de abrir o app.</b> Backups antigos continuam abrindo com a chave da época ou com a senha; faça um backup novo depois.</p>
        </template>
        <CampoTexto v-model="senhaRec" type="password" rotulo="Sua senha ou PIN" autocomplete="current-password" :erro="erroRec" @keyup.enter="confirmarRec" />
        <button type="button" class="botao-prim" :disabled="!senhaRec || recCarregando" data-rec-confirmar @click="confirmarRec">
          <KeyRound :size="18" :stroke-width="2" /> {{ recCarregando ? 'Aguarde…' : recModo === 'ver' ? 'Mostrar chave atual' : 'Gerar nova chave' }}
        </button>
      </div>
      <ChaveRecuperacao v-else :codigo="codigoRec" :somente-ver="recSomenteVer" rotulo-continuar="Concluir" @guardado="recGuardado" />
      <template v-if="codigoRec && recSomenteVer" #rodape><button type="button" class="botao-prim" @click="modalRec = false">Fechar</button></template>
    </Modal>
  </div>
</template>

<style scoped>
.pagina { padding: 0 0 var(--espaco-fim); max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--espaco-secao); }
.so-leitor { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
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
.quadro { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--cor-primaria) 12%, transparent); color: var(--cor-primaria); flex-shrink: 0; }
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
.sobre-topo { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 0 10px; text-align: center; }
.sobre-topo b { font-family: var(--fonte-display); font-size: 17px; }
.sobre-topo small { font-size: 12.5px; color: var(--cor-texto-suave); }
.indices { margin-top: 8px; padding-top: 10px; border-top: 1px solid var(--cor-borda); display: flex; flex-direction: column; gap: 4px; }
.indices p { margin: 0; font-size: 12px; color: var(--cor-texto-suave); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.link-mini { background: none; border: none; padding: 2px 4px; color: var(--cor-primaria); font: 600 12px var(--fonte-texto); cursor: pointer; text-decoration: underline; }
.link-mini:disabled { opacity: 0.5; }
.perigo .quadro { background: color-mix(in srgb, var(--cor-grave, #c0283c) 12%, transparent); color: var(--cor-grave, #c0283c); }
.perigo b { color: var(--cor-grave, #c0283c); }
.rec { display: flex; flex-direction: column; gap: 12px; width: 100%; }
.rec .nota { margin: 0; }
.alerta-rec { margin: 0; padding: 10px 12px; border-radius: 12px; font-size: 13.5px; line-height: 1.45; background: color-mix(in srgb, var(--cor-grave, #c0283c) 9%, transparent); border: 1px solid color-mix(in srgb, var(--cor-grave, #c0283c) 30%, transparent); }
.selo-teste { margin-left: 6px; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 99px; border: 1px solid var(--cor-borda); color: var(--cor-texto-suave); vertical-align: 1px; }
.gira { transition: transform var(--anim-padrao, .2s) ease; color: var(--cor-texto-suave); flex-shrink: 0; }
.gira.aberta { transform: rotate(180deg); }
.novidades { display: flex; flex-direction: column; gap: 10px; padding: 4px 6px 8px 60px; }
.nov { display: flex; flex-direction: column; gap: 4px; }
.nov-cab { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 36px; padding: 0; border: none; background: none; color: var(--cor-texto); font: inherit; text-align: left; cursor: pointer; }
.nov-cab b { font-size: 14px; }
.nov-cab small { font-size: 12px; color: var(--cor-texto-suave); flex: 1; }
.nov-cab.atual { cursor: default; }
.nov-resumo { margin: 0; font-size: 13.5px; line-height: 1.45; }
.nov ul { margin: 2px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; line-height: 1.45; color: var(--cor-texto-suave); }
@media (prefers-reduced-motion: reduce) { .gira { transition: none; } }
:global(html[data-reduzir-movimento='1']) .gira { transition: none; }
</style>
