<script setup>
// Tela de acesso do PWA (antes do app): criar a senha de acesso na 1ª vez, pedir ao abrir,
// e "Esqueci a senha" -> restaurar um backup (e criar uma senha nova). Tudo no aparelho, sem servidor.
import { ref, computed, onMounted } from 'vue';
import Orbe from '../components/Orbe.vue';
import MarcaDagda from '../components/MarcaDagda.vue';
import { DatabaseBackup, FileUp, Cloud, X, ShieldCheck, WifiOff, LockKeyhole, Download, Fingerprint } from 'lucide-vue-next';
import { configurada, criarSenha, verificarSenha, validarNovaSenha, validarApelido, apelidoSalvo, esperaAteTentar, biometriaMarcada, biometriaSuportada, desbloquearComBiometria, ativarBiometria } from '../services/acesso.js';
import { jaInstalado, conviteDisponivel, instalarApp, instrucoes } from '../services/instalacao.js';
import { perfil } from '../services/perfil.js';
import { lerArquivo, previa, restaurar, recarregarApp, configBackup, salvarConfig, PROVEDORES, listarBackupsNuvem, abrirBackupNuvem } from '../services/backup.js';
import { conectarNuvem } from '../services/nuvem/index.js';

const emit = defineEmits(['liberado']);

const partesOrbe = [
  { nome: 'Entradas', valor: 1, cor: 'var(--entrada-royal-medio)' },
  { nome: 'Metas', valor: 1, cor: 'var(--meta-violeta-medio)' },
  { nome: 'Saídas', valor: 1, cor: 'var(--saida-carmim-medio)' },
  { nome: 'Alerta', valor: 1, cor: 'var(--saida-ambar-medio)' },
  { nome: 'Investimentos', valor: 1, cor: 'var(--investimento-esmeralda-medio)' },
];

// modo: entrar | criar | redefinir (após restaurar) | restaurar
const posRestauro = (() => { try { return sessionStorage.getItem('sf:pos-restauro') === '1'; } catch { return false; } })();
const modo = ref(posRestauro ? 'redefinir' : (configurada() ? 'entrar' : 'criar'));
const apelido = ref(apelidoSalvo() || perfil.nome || '');
const senha = ref('');
const confirmacao = ref('');
const erro = ref('');
const carregando = ref(false);
const espera = ref(0);
let relogio = null;

function iniciarEspera() {
  espera.value = esperaAteTentar();
  clearInterval(relogio);
  if (espera.value > 0) relogio = setInterval(() => { espera.value = esperaAteTentar(); if (espera.value <= 0) clearInterval(relogio); }, 1000);
}
onMounted(iniciarEspera);

// Boas-vindas: só no primeiro acesso (cadastro novo). Quem já tem acesso vê só o desbloqueio.
const boasVindas = computed(() => modo.value === 'criar');
const BENEFICIOS = [
  { icone: ShieldCheck, texto: 'Seus dados ficam só no seu aparelho' },
  { icone: WifiOff, texto: 'Funciona offline, sem servidor' },
  { icone: LockKeyhole, texto: 'Backup criptografado, só você abre' },
];
const mostrarInstrucoes = ref(false);
async function instalar() {
  const r = await instalarApp();
  mostrarInstrucoes.value = r === 'instrucoes';
}

// Desbloqueio por biometria (se foi ativado no Perfil e o aparelho ainda oferece).
const bioDisponivel = ref(false);
onMounted(async () => { bioDisponivel.value = biometriaMarcada() && await biometriaSuportada(); });
async function entrarComBiometria() {
  erro.value = ''; carregando.value = true;
  try { await desbloquearComBiometria(); emit('liberado'); }
  catch (e) { erro.value = e.message; } finally { carregando.value = false; }
}

const titulo = computed(() => ({ entrar: apelidoSalvo() ? `Olá, ${apelidoSalvo()}` : 'Entrar', criar: 'Criar acesso', redefinir: 'Crie um novo acesso', restaurar: 'Restaurar backup' }[modo.value]));
const subtitulo = computed(() => ({
  entrar: 'Digite sua senha ou PIN para abrir o app.',
  criar: 'Escolha um apelido e uma senha ou PIN. Não pedimos e-mail nem usamos servidor.',
  redefinir: 'Backup restaurado. Defina agora o apelido e a senha ou PIN deste aparelho.',
  restaurar: 'Escolha um arquivo .sfin. Os dados atuais deste aparelho serão substituídos.',
}[modo.value]));
const TEXTO_CADASTRO = 'Este cadastro serve para proteger o acesso ao app no seu aparelho. Seus dados são mantidos protegidos no dispositivo.';

async function enviar() {
  erro.value = '';
  carregando.value = true;
  try {
    if (modo.value === 'entrar') {
      const ok = await verificarSenha(senha.value);
      if (!ok) { erro.value = 'Senha incorreta.'; senha.value = ''; iniciarEspera(); return; }
    } else {
      const ea = validarApelido(apelido.value);
      if (ea) { erro.value = ea; return; }
      const e = validarNovaSenha(senha.value);
      if (e) { erro.value = e; return; }
      if (senha.value !== confirmacao.value) { erro.value = 'A confirmação não é igual à senha ou PIN.'; return; }
      await criarSenha(senha.value, apelido.value.trim());
      if (!perfil.nome) perfil.nome = apelido.value.trim();
      try { sessionStorage.removeItem('sf:pos-restauro'); } catch { /* ignora */ }
      const idNuvem = (() => { try { return sessionStorage.getItem('sf:pos-restauro-nuvem'); } catch { return null; } })();
      if (idNuvem && PROVEDORES[idNuvem]) {
        oferta.value = { id: idNuvem, bioOk: await biometriaSuportada(), bio: true, auto: true };
        return;
      }
    }
    emit('liberado');
  } catch (e) {
    erro.value = e.message || 'Não foi possível continuar.';
    iniciarEspera();
  } finally { carregando.value = false; }
}

// Depois de restaurar pela nuvem (aparelho novo): oferece biometria e backup automático nessa nuvem.
const oferta = ref(null);
async function concluirOferta() {
  const o = oferta.value; erro.value = ''; carregando.value = true;
  try {
    if (o.bioOk && o.bio) { try { await ativarBiometria(); } catch (e) { erro.value = e.message + ' Você pode ativar depois em Perfil > Segurança.'; } }
    if (o.auto) { configBackup.ultimoDestino = o.id; configBackup.automatico = true; if (configBackup.intervalo === 'desligado') configBackup.intervalo = 'semanal'; salvarConfig(); }
    try { sessionStorage.removeItem('sf:pos-restauro-nuvem'); } catch { /* ignora */ }
    emit('liberado');
  } finally { carregando.value = false; }
}

// ---- Restaurar backup (a partir do "Esqueci a senha" ou de um aparelho novo) ----
const arquivo = ref(null);
const senhaBackup = ref('');
const dadosPrevia = ref(null);

// Folha "Restaurar Backup": restauração local (arquivo) ou Nuvem (Drive, Proton, OneDrive, Mega). Sem OAuth nem servidor:
// em todos os casos abre o seletor de arquivos do aparelho; o app da nuvem instalado aparece nele.
const folha = ref(false);
const origemRestauro = ref('');
const NUVENS = ['Google Drive', 'OneDrive', 'Dropbox', 'Proton Drive', 'Mega', 'iCloud'];
// "Entrar com Google / Microsoft / Dropbox": login OAuth, acha sozinho o backup mais recente e pede só a senha do backup.
const nuvemRestauro = ref(null); // { id, nome, data }
const ajudaNuvem = ref('');
const ROTULO_ENTRAR = { google: 'Google', microsoft: 'Microsoft', dropbox: 'Dropbox' };
const fmtData = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
async function entrarNuvem(id) {
  const p = PROVEDORES[id];
  if (!p.configurado()) { ajudaNuvem.value = ajudaNuvem.value === id ? '' : id; return; }
  erro.value = ''; carregando.value = true; dadosPrevia.value = null; arquivo.value = null; senhaBackup.value = '';
  try {
    await conectarNuvem(id);
    const itens = await listarBackupsNuvem(id);
    if (!itens.length) throw new Error(`Não encontramos backups do app na sua conta ${p.nome}. Confira se entrou na conta certa.`);
    const mais = itens[0];
    arquivo.value = await abrirBackupNuvem(id, mais);
    nuvemRestauro.value = { id, nome: p.nome, data: mais.data };
    folha.value = false; modo.value = 'restaurar'; origemRestauro.value = p.nome;
    if (!arquivo.value.cifrado) await verPrevia();
  } catch (e) { if (!(e && e.codigo === 'cancelado')) { erro.value = e.message; folha.value = false; modo.value = 'restaurar'; origemRestauro.value = ''; } }
  finally { carregando.value = false; }
}
async function escolher(ev, origem = '') {
  erro.value = '';
  dadosPrevia.value = null;
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  if (folha.value) { folha.value = false; modo.value = 'restaurar'; origemRestauro.value = origem; }
  try {
    arquivo.value = await lerArquivo(f);
    if (!arquivo.value.cifrado) await verPrevia();
  } catch (e) { erro.value = e.message; arquivo.value = null; }
}
async function verPrevia() {
  erro.value = '';
  carregando.value = true;
  try { dadosPrevia.value = await previa(arquivo.value.env, senhaBackup.value); }
  catch (e) { erro.value = e.message; } finally { carregando.value = false; }
}
async function restaurarAgora() {
  erro.value = '';
  carregando.value = true;
  try {
    await restaurar(dadosPrevia.value.dados, 'substituir');
    try { sessionStorage.setItem('sf:pos-restauro', '1'); if (nuvemRestauro.value) sessionStorage.setItem('sf:pos-restauro-nuvem', nuvemRestauro.value.id); } catch { /* ignora */ }
    await recarregarApp();
  } catch (e) { erro.value = e.message; } finally { carregando.value = false; }
}
function abrirRestaurar() { erro.value = ''; modo.value = 'restaurar'; }
function voltar() { nuvemRestauro.value = null; erro.value = ''; arquivo.value = null; dadosPrevia.value = null; origemRestauro.value = ''; modo.value = configurada() ? 'entrar' : 'criar'; }
const rotulosTabela = { contas: 'contas', cartoes: 'cartões', transacoes: 'transações', dividas: 'dívidas', lancamentos_cartao: 'compras no cartão', metas_reserva: 'metas', categorias_orcamento: 'categorias de saída', categorias_receita: 'categorias de entrada' };
const resumo = computed(() => dadosPrevia.value ? Object.entries(dadosPrevia.value.contagens).filter(([, n]) => n).map(([t, n]) => `${n} ${rotulosTabela[t] || t.replace(/_/g, ' ')}`) : []);
</script>

<template>
  <div class="tela-acesso">
    <section class="painel-hero">
      <div class="orbe-entrada"><MarcaDagda :tamanho="340" completa /></div>
      <span v-if="boasVindas" class="titulo-hero">Bem-vindo</span>
      <p class="frase-hero">Seus dados ficam neste aparelho, só com você.</p>
      <template v-if="boasVindas">
        <ul class="beneficios">
          <li v-for="b in BENEFICIOS" :key="b.texto"><component :is="b.icone" :size="18" :stroke-width="1.9" /><span>{{ b.texto }}</span></li>
        </ul>
        <template v-if="!jaInstalado">
          <button type="button" class="instalar" @click="instalar"><Download :size="18" :stroke-width="2" /> Instalar o app</button>
          <p v-if="mostrarInstrucoes || !conviteDisponivel" class="dica-instalar" :class="{ forte: mostrarInstrucoes }">{{ instrucoes() }}</p>
        </template>
      </template>
    </section>

    <section class="painel-form">
      <form v-if="modo !== 'restaurar' && !oferta" class="formulario" @submit.prevent="enviar">
        <h1>{{ titulo }}</h1>
        <p class="subtitulo">{{ subtitulo }}</p>

        <label v-if="modo !== 'entrar'" class="campo">
          <span>Apelido</span>
          <input v-model="apelido" type="text" autocomplete="nickname" maxlength="30" required placeholder="Como quer ser chamado" :autofocus="modo !== 'entrar'" />
        </label>
        <label class="campo">
          <span>{{ modo === 'entrar' ? 'Senha ou PIN' : 'Senha ou PIN' }}</span>
          <input v-model="senha" type="password" :autocomplete="modo === 'entrar' ? 'current-password' : 'new-password'" required :placeholder="modo === 'entrar' ? '••••••••' : 'PIN de 4 a 12 números ou senha com 6+ caracteres'" :autofocus="modo === 'entrar'" />
        </label>
        <label v-if="modo !== 'entrar'" class="campo">
          <span>Repita a senha ou PIN</span>
          <input v-model="confirmacao" type="password" autocomplete="new-password" required placeholder="••••••••" />
        </label>
        <p v-if="modo === 'criar'" class="aviso-senha">Não há como recuperar esta senha ou PIN: se esquecer, só restaurando um backup. Anote em local seguro.</p>
        <p class="texto-cadastro">{{ TEXTO_CADASTRO }}</p>
        <p v-if="espera > 0" class="mensagem-erro">Muitas tentativas. Aguarde {{ espera }}s.</p>
        <p v-if="erro" class="mensagem-erro" role="alert">{{ erro }}</p>

        <button type="submit" :disabled="carregando || espera > 0">{{ carregando ? 'Aguarde…' : (modo === 'entrar' ? 'Entrar' : 'Salvar senha e entrar') }}</button>
        <button v-if="modo === 'entrar' && bioDisponivel" type="button" class="secundario bio" :disabled="carregando" @click="entrarComBiometria"><Fingerprint :size="20" :stroke-width="1.9" /> Entrar com biometria</button>
        <button v-if="modo === 'entrar'" type="button" class="link" @click="abrirRestaurar">Esqueci a senha</button>
        <button type="button" class="restaurar" @click="folha = true"><DatabaseBackup :size="20" :stroke-width="2" /> Restaurar Backup</button>
      </form>

      <div v-else-if="oferta" class="formulario" data-oferta>
        <h1>Restaurado!</h1>
        <p class="subtitulo">Seu acesso foi criado. Quer deixar o app mais prático neste aparelho?</p>
        <label v-if="oferta.bioOk" class="oferta"><input v-model="oferta.bio" type="checkbox" /><span><b>Desbloquear com biometria</b><small>digital, rosto ou PIN do celular; a senha continua valendo</small></span></label>
        <label class="oferta"><input v-model="oferta.auto" type="checkbox" /><span><b>Backup automático no {{ PROVEDORES[oferta.id].nome }}</b><small>envia sozinho ao abrir o app quando passar o prazo</small></span></label>
        <p v-if="erro" class="mensagem-erro" role="alert">{{ erro }}</p>
        <button type="button" :disabled="carregando" @click="concluirOferta">Continuar</button>
      </div>

      <div v-else class="formulario">
        <h1>{{ titulo }}</h1>
        <p class="subtitulo">{{ subtitulo }}</p>
        <p v-if="origemRestauro" class="origem">Origem: {{ origemRestauro }}</p>
        <p v-if="nuvemRestauro" class="origem" data-backup-recente>Backup mais recente: {{ fmtData(nuvemRestauro.data) }}</p>
        <label v-if="!nuvemRestauro" class="campo">
          <span>Arquivo de backup</span>
          <input type="file" accept=".sfin,application/octet-stream" @change="escolher" />
        </label>
        <template v-if="arquivo && arquivo.cifrado">
          <label class="campo">
            <span>Senha usada no backup</span>
            <input v-model="senhaBackup" type="password" autocomplete="off" placeholder="Senha de acesso da época do backup" @keyup.enter="verPrevia" />
          </label>
          <button type="button" class="secundario" :disabled="carregando || !senhaBackup" @click="verPrevia">Abrir backup</button>
        </template>
        <div v-if="dadosPrevia" class="previa">
          <b>Este backup contém</b>
          <ul><li v-for="r in resumo" :key="r">{{ r }}</li><li v-if="!resumo.length">Nenhum registro</li></ul>
          <small>Os dados atuais deste aparelho serão substituídos. Depois você cria uma nova senha de acesso.</small>
        </div>
        <p v-if="erro" class="mensagem-erro" role="alert">{{ erro }}</p>
        <button v-if="dadosPrevia" type="button" :disabled="carregando" @click="restaurarAgora">{{ carregando ? 'Restaurando…' : 'Restaurar e continuar' }}</button>
        <button type="button" class="link" @click="voltar">Voltar</button>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="folha" class="folha-fundo" @click.self="folha = false">
        <div class="folha" role="dialog" aria-modal="true" aria-label="Restaurar Backup">
          <header><h2>Restaurar Backup</h2><button type="button" class="fechar" aria-label="Fechar" @click="folha = false"><X :size="20" :stroke-width="2" /></button></header>
          <label class="opcao">
            <span class="icone"><FileUp :size="22" :stroke-width="1.9" /></span>
            <span class="texto"><b>Restauração local</b><small>Escolher o arquivo .sfin deste aparelho</small></span>
            <input type="file" accept=".sfin,application/octet-stream" @change="escolher($event, 'Arquivo local')" />
          </label>
          <h3>Entrar com sua nuvem</h3>
          <button v-for="(r, id) in ROTULO_ENTRAR" :key="id" type="button" class="opcao entrar" :data-entrar="id" :disabled="carregando" @click="entrarNuvem(id)">
            <span class="icone"><Cloud :size="20" :stroke-width="1.9" /></span>
            <span class="texto"><b>{{ PROVEDORES[id].configurado() ? 'Entrar com ' + r : 'Configurar ' + PROVEDORES[id].nome }}</b><small>{{ PROVEDORES[id].configurado() ? 'Procura o backup mais recente na pasta do app' : 'Falta o ' + (id === 'dropbox' ? 'App key' : 'Client ID') + ' (veja docs-nuvem.md)' }}</small></span>
          </button>
          <p v-if="ajudaNuvem" class="explica" data-ajuda-nuvem>{{ PROVEDORES[ajudaNuvem].nome }} ainda não foi configurado neste app: crie {{ ajudaNuvem === 'dropbox' ? 'a App key' : 'o Client ID' }} e coloque em config.js (passo a passo em docs-nuvem.md).</p>
          <h3>Pelo app da nuvem instalado</h3>
          <div class="nuvens">
            <label v-for="n in NUVENS" :key="n" class="opcao nuvem">
              <span class="icone"><Cloud :size="20" :stroke-width="1.9" /></span>
              <span class="texto"><b>{{ n }}</b></span>
              <input type="file" accept=".sfin,application/octet-stream" @change="escolher($event, n)" />
            </label>
          </div>
          <p class="explica">Sem login: ao tocar, o seletor de arquivos do aparelho abre e você escolhe o .sfin dentro do app da nuvem instalado aqui. A internet só é usada ao entrar com a conta.</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tela-acesso { min-height: 100%; display: grid; grid-template-columns: 1.1fr 1fr; background: var(--cor-fundo); color: var(--cor-texto); overflow: auto; }
.painel-hero { background: var(--cor-fundo-sidebar); border-right: 1px solid var(--cor-borda); display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 48px 32px; gap: 20px; overflow: hidden; }
.orbe-entrada { width: min(340px, 62vw); flex: none; }
.titulo-hero { font-family: var(--fonte-display); font-weight: 700; font-size: clamp(24px, 3vw, 32px); }
.frase-hero { max-width: 34ch; font-size: 17px; line-height: 1.5; opacity: 0.9; margin: 0; }
.painel-form { display: flex; align-items: center; justify-content: center; padding: 40px 24px; }
.formulario { width: 100%; max-width: 360px; display: flex; flex-direction: column; gap: 16px; }
.formulario h1 { font-family: var(--fonte-display); font-size: 28px; margin: 0; }
.subtitulo { margin: -8px 0 4px; color: var(--cor-texto-suave); font-size: 14px; line-height: 1.45; }
.campo { display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 500; }
.campo input { font-family: var(--fonte-texto); font-size: 15px; padding: 11px 14px; border-radius: 10px; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado); color: var(--cor-texto); min-height: 44px; }
.campo input:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 1px; }
.aviso-senha { margin: 0; font-size: 13px; color: var(--cor-texto-suave); line-height: 1.4; }
.mensagem-erro { margin: 0; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--cor-alerta) 12%, transparent); color: var(--cor-alerta); font-size: 14px; }
.previa { padding: 12px 14px; border-radius: 12px; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado); font-size: 14px; }
.previa ul { margin: 6px 0; padding-left: 18px; }
.previa small { color: var(--cor-texto-suave); }
button { font-family: var(--fonte-texto); font-weight: 600; font-size: 15px; padding: 12px 16px; min-height: 46px; border-radius: 10px; border: none; background: var(--cor-primaria); color: #fff; cursor: pointer; transition: background 0.15s ease; }
button:hover:not(:disabled) { background: var(--cor-primaria-hover); }
button:disabled { opacity: 0.6; cursor: default; }
button.link { background: transparent; color: var(--cor-texto-suave); font-weight: 500; min-height: 40px; }
button.link:hover:not(:disabled) { background: var(--cor-realce); color: var(--cor-texto); }
button.secundario { background: var(--cor-fundo-elevado); color: var(--cor-texto); border: 1px solid var(--cor-borda); }
@media (max-width: 860px) {
  .tela-acesso { grid-template-columns: 1fr; grid-template-rows: auto 1fr; height: auto; }
  .painel-hero { flex: none; border-right: none; border-bottom: 1px solid var(--cor-borda); padding: 24px 24px 16px; gap: 8px; }
  .orbe-entrada { width: min(180px, 44vw); }
  .frase-hero { font-size: 14px; }
  .painel-form { align-items: flex-start; padding: 24px 20px calc(24px + env(safe-area-inset-bottom, 0px)); }
}

.beneficios { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; text-align: left; }
.beneficios li { display: flex; align-items: center; gap: 10px; font-size: 14.5px; }
.beneficios li svg { color: var(--cor-primaria); flex: none; }
button.instalar { display: inline-flex; align-items: center; justify-content: center; gap: 8px; margin-top: 6px; }
.dica-instalar { margin: 0; max-width: 34ch; font-size: 13px; line-height: 1.45; color: var(--cor-texto-suave); }
.dica-instalar.forte { color: var(--cor-texto); }
button.bio { display: flex; align-items: center; justify-content: center; gap: 10px; }
@media (max-width: 860px) {
  .beneficios li { font-size: 13.5px; }
  .beneficios { gap: 6px; }
}
.texto-cadastro { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--cor-texto-suave); }
.origem { margin: -6px 0 0; font-size: 13px; color: var(--cor-texto-suave); }
button.restaurar { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 50px; background: color-mix(in srgb, var(--cor-primaria) 12%, transparent); color: var(--cor-primaria); border: 1.5px solid var(--cor-primaria); font-weight: 700; }
button.restaurar:hover:not(:disabled) { background: color-mix(in srgb, var(--cor-primaria) 22%, transparent); }
.folha-fundo { position: fixed; inset: 0; z-index: 1000; background: rgba(0, 0, 0, 0.55); display: flex; align-items: flex-end; justify-content: center; }
.folha { width: 100%; max-width: 460px; background: var(--cor-fundo-elevado); color: var(--cor-texto); border: 1px solid var(--cor-borda); border-radius: 20px 20px 0 0; padding: 18px 18px calc(22px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 12px; max-height: 90vh; overflow: auto; }
@media (min-width: 700px) { .folha-fundo { align-items: center; } .folha { border-radius: 20px; } }
.folha header { display: flex; align-items: center; justify-content: space-between; }
.folha h2 { margin: 0; font-family: var(--fonte-display); font-size: 20px; }
.folha h3 { margin: 4px 2px -4px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cor-texto-suave); }
.fechar { width: 40px; min-height: 40px; padding: 0; background: transparent; color: var(--cor-texto-suave); display: inline-flex; align-items: center; justify-content: center; }
.opcao { position: relative; display: flex; align-items: center; gap: 14px; min-height: 58px; padding: 8px 12px; border-radius: 14px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); cursor: pointer; }
.opcao:hover, .opcao:focus-within { background: var(--cor-realce); }
.opcao input[type=file] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; font-size: 0; }
.opcao .icone { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--cor-primaria) 14%, transparent); color: var(--cor-primaria); flex: none; }
.opcao .texto { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.opcao .texto b { font-size: 15px; font-weight: 600; }
.opcao .texto small { font-size: 12.5px; color: var(--cor-texto-suave); }
.opcao.entrar { width: 100%; text-align: left; font: inherit; color: inherit; }
.opcao.entrar:disabled { opacity: 0.6; }
.oferta { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border: 1px solid var(--cor-borda); border-radius: 12px; font-size: 14px; }
.oferta input { width: 22px; height: 22px; accent-color: var(--cor-primaria); flex: none; }
.oferta span { display: flex; flex-direction: column; gap: 2px; }
.oferta small { color: var(--cor-texto-suave); font-size: 12.5px; }
.nuvens { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.opcao.nuvem { min-height: 52px; padding: 6px 10px; gap: 10px; }
.opcao.nuvem .icone { width: 34px; height: 34px; }
.explica { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--cor-texto-suave); }
</style>
