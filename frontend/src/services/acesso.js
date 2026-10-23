// Senha de acesso NO APARELHO (modo PWA). Não existe servidor: guardamos só um hash PBKDF2 + sal.
// Recuperação = restaurar um backup (a senha não vai dentro do backup; cria-se uma nova depois).
//   import { configurada, criarSenha, verificarSenha, alterarSenha, senhaDaSessao, bloquear } from './acesso.js';
import { ref } from 'vue';
import { kvGet, kvSet } from './idb.js';

export const modoPWA = !!import.meta.env.VITE_PWA;

const CHAVE = 'sf:acesso';
const ITERACOES = 250000;
const enc = new TextEncoder();

const b64 = (bytes) => { let s = ''; const u = new Uint8Array(bytes); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const deB64 = (t) => { const bin = atob(t); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

async function derivar(senha, sal, iteracoes) {
  const base = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, base, 256));
}
const iguais = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };

// Registro {v, sal, hash, iter}. Guardado no IndexedDB e espelhado no localStorage.
let registro = null;
export const estadoAcesso = ref({ carregado: false, configurada: false, desbloqueado: false });

export async function carregarAcesso() {
  let r = null;
  try { r = await kvGet(CHAVE); } catch { /* ignora */ }
  if (!r) { try { r = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { r = null; } }
  registro = r && r.hash && r.sal ? r : null;
  sincronizarSessao();
  estadoAcesso.value = { ...estadoAcesso.value, carregado: true, configurada: !!registro };
  return !!registro;
}
export const configurada = () => !!registro;

// O "usuário" local do PWA (rota /api/auth/me) passa a se chamar pelo apelido: a saudação do Início usa esse nome.
function sincronizarSessao() {
  try {
    const u = globalThis.__SESSAO_DEMO && globalThis.__SESSAO_DEMO.usuario;
    if (u && registro && registro.apelido) u.nome = registro.apelido;
  } catch { /* sem sessão local */ }
}

async function gravarRegistro(r) {
  registro = r;
  sincronizarSessao();
  try { localStorage.setItem(CHAVE, JSON.stringify(r)); } catch { /* ignora */ }
  await kvSet(CHAVE, r);
  estadoAcesso.value = { ...estadoAcesso.value, configurada: true };
}

// Senha em memória só durante a sessão (serve para cifrar backups). Some ao recarregar/bloquear.
let senhaMemoria = null;
export const senhaDaSessao = () => senhaMemoria;

// Senha (6+ caracteres) ou PIN numérico (4 a 12 números). O PIN é mais prático, mas mais fácil de adivinhar: serve
// para o acesso no aparelho; para backups na nuvem prefira uma senha longa.
export function validarNovaSenha(s) {
  if (!s) return 'Informe a senha ou o PIN.';
  if (/^\d+$/.test(s)) {
    if (s.length < 4) return 'O PIN precisa ter pelo menos 4 números.';
    if (s.length > 12) return 'O PIN pode ter até 12 números.';
    return '';
  }
  if (s.length < 6) return 'Use uma senha com pelo menos 6 caracteres ou um PIN de 4 a 12 números.';
  return '';
}
export const ehPin = (s) => /^\d+$/.test(s || '');

// Apelido: o único dado de cadastro (sem e-mail, sem servidor). Fica no registro de acesso, neste aparelho.
export const apelidoSalvo = () => (registro && registro.apelido) || '';
export function validarApelido(a) {
  const t = String(a || '').trim();
  if (!t) return 'Informe um apelido.';
  if (t.length > 30) return 'O apelido pode ter até 30 caracteres.';
  return '';
}

export async function criarSenha(senha, apelido) {
  const erro = validarNovaSenha(senha);
  if (erro) throw new Error(erro);
  const nome = apelido !== undefined ? String(apelido || '').trim() : apelidoSalvo();
  if (nome) { const e2 = validarApelido(nome); if (e2) throw new Error(e2); }
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(senha, sal, ITERACOES);
  await gravarRegistro({ v: 1, iter: ITERACOES, sal: b64(sal), hash: b64(hash), apelido: nome || undefined, criada_em: new Date().toISOString() });
  senhaMemoria = senha;
  estadoAcesso.value = { ...estadoAcesso.value, desbloqueado: true };
}

// Troca o apelido (sem mexer na senha). Só no PWA; fora dele não há registro de acesso.
export async function definirApelido(a) {
  const e = validarApelido(a);
  if (e) throw new Error(e);
  if (!registro) return;
  await gravarRegistro({ ...registro, apelido: String(a).trim() });
}

// Tentativas erradas: espera crescente (só em memória + localStorage), contra tentativa em sequência.
function esperaRestante() {
  try {
    const t = JSON.parse(localStorage.getItem('sf:acesso:falhas') || 'null');
    if (!t) return 0;
    return Math.max(0, Math.ceil((t.ate - Date.now()) / 1000));
  } catch { return 0; }
}
function registrarFalha() {
  try {
    const t = JSON.parse(localStorage.getItem('sf:acesso:falhas') || 'null') || { n: 0, ate: 0 };
    t.n += 1;
    const seg = t.n >= 5 ? Math.min(300, 2 ** (t.n - 4) * 5) : 0;
    t.ate = Date.now() + seg * 1000;
    localStorage.setItem('sf:acesso:falhas', JSON.stringify(t));
  } catch { /* ignora */ }
}
const zerarFalhas = () => { try { localStorage.removeItem('sf:acesso:falhas'); } catch { /* ignora */ } };
export const esperaAteTentar = esperaRestante;

export async function conferirSenha(senha) {
  if (!registro) return false;
  const h = await derivar(senha, deB64(registro.sal), registro.iter || ITERACOES);
  return iguais(h, deB64(registro.hash));
}

export async function verificarSenha(senha) {
  const espera = esperaRestante();
  if (espera > 0) throw new Error(`Muitas tentativas. Aguarde ${espera}s.`);
  const ok = await conferirSenha(senha);
  if (!ok) { registrarFalha(); return false; }
  zerarFalhas();
  senhaMemoria = senha;
  estadoAcesso.value = { ...estadoAcesso.value, desbloqueado: true };
  return true;
}

export async function alterarSenha(atual, nova) {
  if (!(await conferirSenha(atual))) throw new Error('A senha atual não confere.');
  const erro = validarNovaSenha(nova);
  if (erro) throw new Error(erro);
  await criarSenha(nova);
}

// Bloquear = recarregar o app: a senha some da memória e a tela de acesso volta.
export function bloquear() { location.reload(); }

// Bloqueio automático após ficar fora do app por X minutos (0 = nunca). Padrão: 5.
export const minutosAutoBloqueio = () => { try { const v = localStorage.getItem('sf:acesso:auto'); return v === null ? 5 : Number(v); } catch { return 5; } };
export const definirAutoBloqueio = (min) => { try { localStorage.setItem('sf:acesso:auto', String(min)); } catch { /* ignora */ } };

let autoLigado = false;
export function iniciarAutoBloqueio() {
  if (autoLigado || !modoPWA) return;
  autoLigado = true;
  let saiu = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { saiu = Date.now(); return; }
    const min = minutosAutoBloqueio();
    if (min > 0 && saiu && Date.now() - saiu > min * 60000) bloquear();
    saiu = 0;
  });
}
