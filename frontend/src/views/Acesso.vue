<script setup>
// Tela de acesso do PWA (antes do app): criar a senha de acesso na 1ª vez, pedir ao abrir,
// e "Esqueci a senha" -> restaurar um backup (e criar uma senha nova). Tudo no aparelho, sem servidor.
import { ref, computed, onMounted } from 'vue';
import Orbe from '../components/Orbe.vue';
import { DatabaseBackup, FileUp, Cloud, X } from 'lucide-vue-next';
import { configurada, criarSenha, verificarSenha, validarNovaSenha, validarApelido, apelidoSalvo, esperaAteTentar } from '../services/acesso.js';
import { perfil } from '../services/perfil.js';
import { lerArquivo, previa, restaurar, recarregarApp } from '../services/backup.js';

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
    }
    emit('liberado');
  } catch (e) {
    erro.value = e.message || 'Não foi possível continuar.';
    iniciarEspera();
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
const NUVENS = ['Google Drive', 'Proton Drive', 'OneDrive', 'Mega'];
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
    try { sessionStorage.setItem('sf:pos-restauro', '1'); } catch { /* ignora */ }
    await recarregarApp();
  } catch (e) { erro.value = e.message; } finally { carregando.value = false; }
}
function abrirRestaurar() { erro.value = ''; modo.value = 'restaurar'; }
function voltar() { erro.value = ''; arquivo.value = null; dadosPrevia.value = null; origemRestauro.value = ''; modo.value = configurada() ? 'entrar' : 'criar'; }
const rotulosTabela = { contas: 'contas', cartoes: 'cartões', transacoes: 'transações', dividas: 'dívidas', lancamentos_cartao: 'compras no cartão', metas_reserva: 'metas', categorias_orcamento: 'categorias de saída', categorias_receita: 'categorias de entrada' };
const resumo = computed(() => dadosPrevia.value ? Object.entries(dadosPrevia.value.contagens).filter(([, n]) => n).map(([t, n]) => `${n} ${rotulosTabela[t] || t.replace(/_/g, ' ')}`) : []);
</script>

<template>
  <div class="tela-acesso">
    <section class="painel-hero">
      <div class="orbe-entrada" aria-hidden="true"><Orbe :partes="partesOrbe" :tamanho="340" :arcos="false" girar /></div>
      <span class="titulo-hero">Sistema Financeiro</span>
      <p class="frase-hero">Seus dados ficam neste aparelho, só com você.</p>
    </section>

    <section class="painel-form">
      <form v-if="modo !== 'restaurar'" class="formulario" @submit.prevent="enviar">
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
        <button v-if="modo === 'entrar'" type="button" class="link" @click="abrirRestaurar">Esqueci a senha</button>
        <button type="button" class="restaurar" @click="folha = true"><DatabaseBackup :size="20" :stroke-width="2" /> Restaurar Backup</button>
      </form>

      <div v-else class="formulario">
        <h1>{{ titulo }}</h1>
        <p class="subtitulo">{{ subtitulo }}</p>
        <p v-if="origemRestauro" class="origem">Origem: {{ origemRestauro }}</p>
        <label class="campo">
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
          <h3>Nuvem</h3>
          <div class="nuvens">
            <label v-for="n in NUVENS" :key="n" class="opcao nuvem">
              <span class="icone"><Cloud :size="20" :stroke-width="1.9" /></span>
              <span class="texto"><b>{{ n }}</b></span>
              <input type="file" accept=".sfin,application/octet-stream" @change="escolher($event, n)" />
            </label>
          </div>
          <p class="explica">Sem login e sem servidor: ao tocar, o seletor de arquivos do aparelho abre e você escolhe o .sfin dentro do app da nuvem (Drive, Proton, OneDrive ou Mega) instalado aqui.</p>
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
.nuvens { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.opcao.nuvem { min-height: 52px; padding: 6px 10px; gap: 10px; }
.opcao.nuvem .icone { width: 34px; height: 34px; }
.explica { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--cor-texto-suave); }
</style>
