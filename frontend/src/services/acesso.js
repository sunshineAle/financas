// Senha de acesso NO APARELHO (modo PWA). Não existe servidor: guardamos só um hash PBKDF2 + sal.
// Chave de recuperação (anotação 31): no cadastro o app gera uma CHAVE MESTRA aleatória (cifra os backups) e um CÓDIGO
// de recuperação (24 caracteres). A chave mestra fica guardada embrulhada duas vezes: pela senha e pelo código. O código
// substitui a senha: abre o app e os backups e permite criar uma senha nova. Trocar a senha não invalida os backups.
//   import { configurada, criarSenha, verificarSenha, alterarSenha, senhaDaSessao, bloquear } from './acesso.js';
import { ref } from 'vue';
import { kvGet, kvSet, kvLimparTudo } from './idb.js';

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
  await carregarBiometria();
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
export const acessoEhPin = () => !!(registro && registro.pin);
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
  // Mantém a chave mestra que já existe (troca de senha / recuperação); senão, cria uma nova.
  const mestra = mestraMemoria || aleatorio(32);
  const novo = mestraMemoria === null;
  const base = registro && !novo ? { rec: registro.rec, rec_confirmada: registro.rec_confirmada, rec_cod: registro.rec_cod } : {};
  await gravarRegistro({ v: 2, iter: ITERACOES, sal: b64(sal), hash: b64(hash), apelido: nome || undefined, pin: ehPin(senha), criada_em: (registro && registro.criada_em) || new Date().toISOString(), ...base, ms: await embrulharMestra(mestra, senha) });
  mestraMemoria = mestra;
  senhaMemoria = senha;
  estadoAcesso.value = { ...estadoAcesso.value, desbloqueado: true };
  await reembrulharBiometria();
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
  await abrirMestraComSenha(senha);
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
  const sair = () => { if (!saiu) saiu = Date.now(); };
  const voltar = () => {
    const min = minutosAutoBloqueio();
    const t = saiu; saiu = 0;
    if (min > 0 && t && Date.now() - t > min * 60000) bloquear();
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sair(); else voltar(); });
  window.addEventListener('pagehide', sair);
  window.addEventListener('pageshow', (e) => { if (e.persisted) voltar(); });
}

// ---- Desbloqueio por digital/rosto/PIN do celular (WebAuthn) ----
// Desenho: a credencial de plataforma (userVerification: 'required') só AUTORIZA a tela de bloqueio. A chave de dados
// continua derivada da senha do app (PBKDF2 + backup cifrado). Ao ativar (com o app já desbloqueado pela senha), geramos
// uma chave AES-GCM aleatória NÃO-EXTRAÍVEL (CryptoKey no IndexedDB: o JS não consegue exportá-la) e guardamos a senha
// cifrada por ela. Biometria aprovada -> decifra a senha -> passa pelo mesmo verificarSenha(). A senha continua valendo
// sempre como alternativa, e trocar a senha re-embrulha (ou, se a biometria estiver sem a senha, desliga).
const CHAVE_BIO = 'sf:bio';
let registroBio = null;
const aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n));

export async function biometriaSuportada() {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials || !crypto.subtle) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}
export async function carregarBiometria() {
  try { registroBio = (await kvGet(CHAVE_BIO)) || null; } catch { registroBio = null; }
  if (registroBio && !(registroBio.chave && registroBio.ct && registroBio.cred)) registroBio = null;
  estadoAcesso.value = { ...estadoAcesso.value, biometria: !!registroBio };
  return !!registroBio;
}
export const biometriaAtiva = () => !!registroBio || estadoAcesso.value.biometria === true;
// Espelho síncrono (a tela de acesso decide o botão antes do IndexedDB responder).
export const biometriaMarcada = () => { try { return localStorage.getItem(CHAVE_BIO) === '1'; } catch { return false; } };

async function embrulhar(senha, chave, iv) {
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, enc.encode(senha)));
}
async function marcar(reg) {
  registroBio = reg;
  try { reg ? localStorage.setItem(CHAVE_BIO, '1') : localStorage.removeItem(CHAVE_BIO); } catch { /* ignora */ }
  if (reg) await kvSet(CHAVE_BIO, reg); else await kvSet(CHAVE_BIO, null);
  estadoAcesso.value = { ...estadoAcesso.value, biometria: !!reg };
}
async function reembrulharBiometria() {
  if (!registroBio || senhaMemoria === null) return;
  try {
    const iv = aleatorio(12);
    await marcar({ ...registroBio, iv, ct: await embrulhar(senhaMemoria, registroBio.chave, iv) });
  } catch { await desativarBiometria(); }
}

export async function ativarBiometria() {
  if (senhaMemoria === null) throw new Error('Desbloqueie o app com a senha antes de ativar.');
  if (!(await biometriaSuportada())) throw new Error('Este aparelho não oferece desbloqueio por biometria.');
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: {
      challenge: aleatorio(32),
      rp: { name: 'Dagda Capital' },
      user: { id: aleatorio(16), name: apelidoSalvo() || 'usuario', displayName: apelidoSalvo() || 'Usuário' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none',
    } });
  } catch (e) { throw new Error(e && e.name === 'NotAllowedError' ? 'Ativação cancelada.' : 'Não foi possível ativar a biometria neste aparelho.'); }
  if (!cred) throw new Error('Não foi possível ativar a biometria.');
  const chave = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = aleatorio(12);
  await marcar({ v: 1, cred: new Uint8Array(cred.rawId), chave, iv, ct: await embrulhar(senhaMemoria, chave, iv), criada_em: new Date().toISOString() });
}

export async function desativarBiometria() { await marcar(null); }

export async function desbloquearComBiometria() {
  if (!registroBio) await carregarBiometria();
  if (!registroBio) throw new Error('A biometria não está ativada neste aparelho.');
  try {
    await navigator.credentials.get({ publicKey: {
      challenge: aleatorio(32), timeout: 60000, userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: registroBio.cred, transports: ['internal'] }],
    } });
  } catch (e) { throw new Error(e && e.name === 'NotAllowedError' ? 'Desbloqueio cancelado. Use a senha ou PIN.' : 'Não foi possível usar a biometria. Use a senha ou PIN.'); }
  let senha;
  try { senha = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: registroBio.iv }, registroBio.chave, registroBio.ct)); }
  catch { await desativarBiometria(); throw new Error('A biometria precisa ser ativada de novo. Use a senha ou PIN.'); }
  if (!(await conferirSenha(senha))) { await desativarBiometria(); throw new Error('A senha mudou. Use a senha ou PIN e ative a biometria de novo.'); }
  zerarFalhas();
  senhaMemoria = senha;
  await abrirMestraComSenha(senha);
  estadoAcesso.value = { ...estadoAcesso.value, desbloqueado: true };
  return true;
}

// ---- Chave mestra + código de recuperação ----
let mestraMemoria = null; // Uint8Array(32) só em memória, durante a sessão
export const chaveMestraDaSessao = () => mestraMemoria;
export const codigoRecuperacaoPendente = () => !!registro && !registro.rec_confirmada;

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I
export function gerarCodigo() {
  const b = aleatorio(24);
  let t = '';
  for (let i = 0; i < 24; i++) t += ALFABETO[b[i] % 32];
  return t.match(/.{4}/g).join('-');
}
export const normalizarCodigo = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const codigoValido = (c) => { const n = normalizarCodigo(c); return n.length === 24 && [...n].every((x) => ALFABETO.includes(x)); };

async function chaveAes(segredo, sal, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(segredo), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
// Embrulha a chave mestra com um segredo (senha ou código normalizado). Formato guardado/levado no backup: {sal, iv, ct, iter}.
export async function embrulharMestra(mestra, segredo, iter = ITERACOES) {
  const sal = aleatorio(16); const iv = aleatorio(12);
  const k = await chaveAes(segredo, sal, iter);
  return { sal: b64(sal), iv: b64(iv), iter, ct: b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, mestra))) };
}
export async function desembrulharMestra(emb, segredo) {
  if (!emb) return null;
  try {
    const k = await chaveAes(segredo, deB64(emb.sal), emb.iter || ITERACOES);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(emb.iv) }, k, deB64(emb.ct)));
  } catch { return null; }
}
// Embrulho pelo código, guardado no registro (e levado em cada backup).
export const embrulhoRecuperacao = () => (registro && registro.rec) || null;
export const embrulhoSenha = () => (registro && registro.ms) || null;

async function abrirMestraComSenha(senha) {
  if (!registro) return;
  if (registro.ms) { mestraMemoria = await desembrulharMestra(registro.ms, senha); if (mestraMemoria) return; }
  // Cadastro antigo (antes da chave de recuperação): cria a chave mestra agora; o código fica pendente em Perfil › Segurança.
  mestraMemoria = aleatorio(32);
  await gravarRegistro({ ...registro, v: 2, ms: await embrulharMestra(mestraMemoria, senha), rec: null, rec_cod: null, rec_confirmada: false });
}

// Gera um código NOVO (o anterior deixa de abrir backups futuros; os antigos continuam abrindo com o código antigo).
// A chave vigente também fica guardada CIFRADA pela chave mestra (rec_cod), para "Ver chave atual" (anotação 49):
// só abre com o app desbloqueado e a senha conferida de novo.
async function chaveDaMestra(uso) {
  return crypto.subtle.importKey('raw', mestraMemoria, { name: 'AES-GCM' }, false, uso);
}
async function cifrarCodigo(codigo) {
  const iv = aleatorio(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chaveDaMestra(['encrypt']), enc.encode(codigo));
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}
export async function gerarNovoCodigo() {
  if (!mestraMemoria) throw new Error('Desbloqueie o app com a senha antes.');
  const codigo = gerarCodigo();
  const rec = await embrulharMestra(mestraMemoria, normalizarCodigo(codigo));
  // confere antes de gravar: o código novo abre a MESMA chave mestra
  const teste = await desembrulharMestra(rec, normalizarCodigo(codigo));
  if (!teste || !iguais(teste, mestraMemoria)) throw new Error('Não foi possível gerar a chave. Tente de novo.');
  await gravarRegistro({ ...registro, rec, rec_cod: await cifrarCodigo(codigo), rec_confirmada: false });
  return codigo;
}
export const temCodigoVisivel = () => !!(registro && registro.rec && registro.rec_cod);
export async function verCodigoAtual(senha) {
  if (!(await verificarSenha(senha))) throw new Error('Senha ou PIN incorreto.');
  zerarFalhas();
  if (!registro || !registro.rec) throw new Error('Ainda não há chave de recuperação. Gere uma nova.');
  if (!registro.rec_cod || !mestraMemoria) throw new Error('A chave atual foi criada antes desta versão e não pode ser mostrada. Gere uma nova.');
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(registro.rec_cod.iv) }, await chaveDaMestra(['decrypt']), deB64(registro.rec_cod.ct));
    return new TextDecoder().decode(pt);
  } catch { throw new Error('Não foi possível abrir a chave atual. Gere uma nova.'); }
}
export async function confirmarCodigoGuardado() { if (registro) await gravarRegistro({ ...registro, rec_confirmada: true }); }

// "Esqueci a senha": o código abre a chave mestra deste aparelho e libera criar uma senha nova.
export async function entrarComCodigo(codigo) {
  if (!codigoValido(codigo)) throw new Error('Confira o código: são 24 letras e números (ex.: ABCD-EFGH-…).');
  const espera = esperaRestante();
  if (espera > 0) throw new Error(`Muitas tentativas. Aguarde ${espera}s.`);
  const m = registro && registro.rec ? await desembrulharMestra(registro.rec, normalizarCodigo(codigo)) : null;
  if (!m) { registrarFalha(); throw new Error(registro && !registro.rec ? 'Este aparelho ainda não tem chave de recuperação. Restaure um backup com o código.' : 'Código de recuperação incorreto.'); }
  zerarFalhas();
  mestraMemoria = m;
  return true;
}
// Depois de entrar com o código: cria a senha nova (mantém a chave mestra e o código).
export async function redefinirSenhaComCodigo(nova) {
  if (!mestraMemoria) throw new Error('Entre com o código de recuperação primeiro.');
  const e = validarNovaSenha(nova);
  if (e) throw new Error(e);
  await criarSenha(nova);
}
// Restauração num aparelho novo: adota a chave mestra e o embrulho do código vindos do backup (o mesmo código continua valendo).
let adotarRec;
export function adotarMestra(mestra, rec) { mestraMemoria = mestra; adotarRec = rec || null; }
// O embrulho do código precisa ser o da MESMA chave mestra: sem código no backup, fica pendente (gerar em Segurança).
export async function aplicarRecAdotado() {
  if (adotarRec === undefined || !registro) return;
  await gravarRegistro({ ...registro, rec: adotarRec, rec_cod: null, rec_confirmada: !!adotarRec });
  adotarRec = undefined;
}

// ---- Apagar dados e redefinir o app ----
// Apaga o banco, a senha, a biometria, a chave de recuperação e as preferências deste aparelho. Volta à tela de boas-vindas.
export async function apagarTudo() {
  try { if (globalThis.__PERSISTENCIA_BANCO && globalThis.__PERSISTENCIA_BANCO.apagar) await globalThis.__PERSISTENCIA_BANCO.apagar(); } catch { /* segue */ }
  try { await kvLimparTudo(); } catch { /* segue */ }
  try { Object.keys(localStorage).filter((k) => k.startsWith('sf') || k.startsWith('dagda')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignora */ }
  try { sessionStorage.clear(); } catch { /* ignora */ }
  location.replace(location.pathname + location.search);
}
