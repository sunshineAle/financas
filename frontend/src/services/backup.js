// Backup do Sistema Financeiro: arquivo .sfin (JSON do estado inteiro, compactado e cifrado com a senha de acesso).
// Formato e rotas: /home/claude/work-cartoes/CONTRATO-SFIN.md.
//   import { configBackup, gerarArquivo, baixar, salvarNaPasta, compartilhar, lerArquivo, restaurar, verificarLembrete } from './backup.js';
import { reactive, ref } from 'vue';
import { kvGet, kvSet, kvDel } from './idb.js';
import { senhaDaSessao, modoPWA } from './acesso.js';
import { avisar } from './avisos.js';
import { PROVEDORES, estadoNuvem, nuvemConectada, enviarParaNuvem, listarNuvem, baixarDaNuvem } from './nuvem/index.js';

const CFG = 'sf:backup:cfg';
const ITER = 250000;
export const INTERVALOS = [
  { id: 'desligado', rotulo: 'Sem lembrete', dias: 0 },
  { id: 'diario', rotulo: 'Todo dia', dias: 1 },
  { id: 'semanal', rotulo: 'Toda semana', dias: 7 },
  { id: 'quinzenal', rotulo: 'A cada 15 dias', dias: 15 },
  { id: 'mensal', rotulo: 'Todo mês', dias: 30 },
];

// ---- Configuração (localStorage: é preferência do aparelho) --------------------------------
function lerCfg() {
  const base = { intervalo: 'semanal', criptografar: true, automatico: true, manter: 10, ultimo: null, ultimoDestino: null, instalado_em: new Date().toISOString() };
  try { return { ...base, ...(JSON.parse(localStorage.getItem(CFG) || 'null') || {}) }; } catch { return base; }
}
export const configBackup = reactive(lerCfg());
export function salvarConfig() { try { localStorage.setItem(CFG, JSON.stringify({ ...configBackup })); } catch { /* ignora */ } }
salvarConfig();

export const estadoPasta = reactive({ nome: null, permissao: null }); // permissao: 'granted' | 'prompt' | 'denied' | null
export const suporte = {
  pasta: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
  // Web Share com ARQUIVO (celular: "Salvar em" Drive, OneDrive, Dropbox, Proton, Mega, iCloud). Testa de verdade com um arquivo-amostra.
  compartilhar: () => { try { return typeof navigator !== 'undefined' && !!navigator.canShare && !!navigator.share && navigator.canShare({ files: [new File(['x'], 'a.sfin', { type: 'application/octet-stream' })] }); } catch { return false; } },
  cripto: typeof crypto !== 'undefined' && !!crypto.subtle,
  gzip: typeof CompressionStream !== 'undefined',
};
export const ocupado = ref(false);

// ---- base64 / gzip / AES-GCM -------------------------------------------------------------
const b64 = (bytes) => { const u = new Uint8Array(bytes); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const deB64 = (t) => { const bin = atob(t); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
async function fluxo(bytes, Transform, formato) {
  const t = new Transform(formato);
  const w = t.writable.getWriter();
  w.write(bytes); w.close();
  return new Uint8Array(await new Response(t.readable).arrayBuffer());
}
const gzip = (b) => fluxo(b, CompressionStream, 'gzip');
const gunzip = (b) => fluxo(b, DecompressionStream, 'gzip');
async function chaveDe(senha, sal, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// ---- Exportar / importar (rotas do backend; fallback: banco SQLite bruto no PWA) ------------
export async function exportarDados() {
  let r = null;
  try { r = await fetch('/api/backup/exportar', { credentials: 'include' }); } catch { r = null; }
  if (r && r.ok) return await r.json();
  if (modoPWA && globalThis.__BANCO_DEMO && globalThis.__BANCO_DEMO.exportarBytes) {
    return { formato: 'sqlite-bruto', versao_esquema: 0, exportado_em: new Date().toISOString(), base64: b64(globalThis.__BANCO_DEMO.exportarBytes()) };
  }
  throw new Error('Não foi possível ler os dados para o backup.');
}

export function contarDados(dados) {
  if (!dados) return {};
  if (dados.formato === 'sqlite-bruto') return { 'banco completo': Math.round((dados.base64.length * 3) / 4 / 1024) + ' KB' };
  const out = {};
  for (const [t, linhas] of Object.entries(dados.tabelas || {})) {
    if (t === 'diario_alteracoes') continue;
    out[t] = (linhas || []).filter((l) => !l.excluido_em).length;
  }
  return out;
}

const dois = (n) => String(n).padStart(2, '0');
export function nomeDoArquivo(d = new Date()) {
  return `sistema-financeiro-${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}-${dois(d.getHours())}${dois(d.getMinutes())}.sfin`;
}

export async function empacotar(dados, { criptografar = configBackup.criptografar, senha = senhaDaSessao() } = {}) {
  const env = { sfin: 1, criado_em: new Date().toISOString(), versao_esquema: dados.versao_esquema ?? null, aparelho: (dados.aparelho && dados.aparelho.id) || null, tipo: dados.formato === 'sqlite-bruto' ? 'sqlite-bruto' : 'dados', compressao: null, criptografia: null, dados: null };
  let bytes = new TextEncoder().encode(JSON.stringify(dados));
  if (suporte.gzip) { bytes = await gzip(bytes); env.compressao = 'gzip'; }
  if (criptografar) {
    if (!senha) throw new Error('Desbloqueie o app com a senha de acesso para cifrar o backup.');
    if (!suporte.cripto) throw new Error('Este navegador não oferece criptografia. Desligue a criptografia ou use o app instalado (HTTPS).');
    const sal = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const chave = await chaveDe(senha, sal, ITER);
    bytes = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, bytes));
    env.criptografia = { alg: 'AES-GCM-256', kdf: 'PBKDF2-SHA256', iteracoes: ITER, sal: b64(sal), iv: b64(iv) };
  }
  env.dados = b64(bytes);
  return JSON.stringify(env);
}

export function lerEnvelope(texto) {
  let env;
  try { env = JSON.parse(texto); } catch { throw new Error('Este arquivo não é um backup .sfin válido.'); }
  if (!env || env.sfin !== 1 || env.dados == null) throw new Error('Este arquivo não é um backup .sfin válido.');
  return env;
}
export const estaCifrado = (env) => !!env.criptografia;

export async function abrirEnvelope(env, senha) {
  let bytes;
  if (typeof env.dados !== 'string') return env.dados;
  bytes = deB64(env.dados);
  if (env.criptografia) {
    if (!senha) throw new Error('Informe a senha usada neste backup.');
    try {
      const c = env.criptografia;
      const chave = await chaveDe(senha, deB64(c.sal), c.iteracoes || ITER);
      bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(c.iv) }, chave, bytes));
    } catch { throw new Error('Senha incorreta para este backup (use a senha de acesso da época em que ele foi feito).'); }
  }
  if (env.compressao === 'gzip') bytes = await gunzip(bytes);
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('O conteúdo do backup está corrompido.'); }
}

// ---- Gerar e entregar ---------------------------------------------------------------------
export async function gerarArquivo(opcoes) {
  const dados = await exportarDados();
  const texto = await empacotar(dados, opcoes);
  return { nome: nomeDoArquivo(), blob: new Blob([texto], { type: 'application/octet-stream' }), tamanho: texto.length };
}

function marcarFeito(destino) {
  configBackup.ultimo = new Date().toISOString();
  configBackup.ultimoDestino = destino;
  salvarConfig();
}

export async function baixar() {
  const { nome, blob } = await gerarArquivo();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  marcarFeito('arquivo');
  return nome;
}

export async function compartilhar() {
  const { nome, blob } = await gerarArquivo();
  const arquivo = new File([blob], nome, { type: 'application/octet-stream' });
  if (!navigator.canShare || !navigator.canShare({ files: [arquivo] })) throw new Error('Este aparelho não compartilha arquivos. Use "Baixar arquivo".');
  await navigator.share({ files: [arquivo], title: 'Backup Dagda Capital' });
  marcarFeito('compartilhado');
  return nome;
}

// ---- Pasta da nuvem (File System Access API) -----------------------------------------------
let handlePasta = null;
export async function carregarPasta() {
  try { handlePasta = await kvGet('pasta-backup'); } catch { handlePasta = null; }
  estadoPasta.nome = handlePasta ? handlePasta.name : null;
  estadoPasta.permissao = null;
  if (handlePasta && handlePasta.queryPermission) {
    try { estadoPasta.permissao = await handlePasta.queryPermission({ mode: 'readwrite' }); } catch { /* ignora */ }
  }
  return estadoPasta;
}
export async function escolherPasta() {
  if (!suporte.pasta) throw new Error('Este navegador não deixa escolher uma pasta. Use "Baixar arquivo" ou "Compartilhar".');
  const h = await window.showDirectoryPicker({ id: 'sf-backup', mode: 'readwrite' });
  handlePasta = h;
  await kvSet('pasta-backup', h);
  estadoPasta.nome = h.name; estadoPasta.permissao = 'granted';
  return h.name;
}
export async function esquecerPasta() { handlePasta = null; await kvDel('pasta-backup'); estadoPasta.nome = null; estadoPasta.permissao = null; }

async function garantirPermissao(pedir) {
  if (!handlePasta) throw new Error('Escolha uma pasta primeiro.');
  let p = await handlePasta.queryPermission({ mode: 'readwrite' });
  if (p !== 'granted' && pedir) p = await handlePasta.requestPermission({ mode: 'readwrite' });
  estadoPasta.permissao = p;
  return p === 'granted';
}

export async function salvarNaPasta({ pedirPermissao = true } = {}) {
  if (!handlePasta) await carregarPasta();
  if (!(await garantirPermissao(pedirPermissao))) throw new Error('Sem permissão para gravar na pasta. Toque em "Salvar na pasta" para liberar.');
  const { nome, blob } = await gerarArquivo();
  const fh = await handlePasta.getFileHandle(nome, { create: true });
  const w = await fh.createWritable();
  await w.write(blob); await w.close();
  try { // mantém só os N mais recentes
    const nomes = [];
    for await (const [n, h] of handlePasta.entries()) if (h.kind === 'file' && /^sistema-financeiro-.*\.sfin$/.test(n)) nomes.push(n);
    nomes.sort().reverse();
    for (const velho of nomes.slice(Math.max(1, Number(configBackup.manter) || 10))) await handlePasta.removeEntry(velho);
  } catch { /* limpeza é opcional */ }
  marcarFeito('pasta');
  return nome;
}

export async function listarDaPasta() {
  if (!handlePasta) await carregarPasta();
  if (!(await garantirPermissao(true))) throw new Error('Sem permissão para ler a pasta.');
  const itens = [];
  for await (const [n, h] of handlePasta.entries()) {
    if (h.kind === 'file' && n.endsWith('.sfin')) { const f = await h.getFile(); itens.push({ nome: n, tamanho: f.size, data: f.lastModified, file: f }); }
  }
  return itens.sort((a, b) => b.nome.localeCompare(a.nome));
}

// ---- Nuvem (Google Drive / OneDrive via OAuth no navegador; ver services/nuvem/) -----------------
// Envia o .sfin JÁ cifrado (o texto nunca sai em claro); mantém só os `manter` mais recentes na pasta do app.
export async function enviarNuvem(id) {
  const { nome, blob } = await gerarArquivo();
  await enviarParaNuvem(id, nome, await blob.text(), { manter: configBackup.manter });
  marcarFeito(id);
  return nome;
}
export const listarBackupsNuvem = (id) => listarNuvem(id);
// Baixa o item escolhido e entrega no mesmo formato de lerArquivo (env, cifrado...), para seguir o fluxo de prévia/restauração.
export async function abrirBackupNuvem(id, item) {
  const texto = await baixarDaNuvem(id, item);
  return lerArquivo(new File([texto], item.nome, { type: 'application/octet-stream' }));
}
export { PROVEDORES, estadoNuvem, nuvemConectada };

// ---- Restaurar ------------------------------------------------------------------------------
export async function lerArquivo(file) {
  const texto = await file.text();
  const env = lerEnvelope(texto);
  return { env, cifrado: estaCifrado(env), nome: file.name, tamanho: file.size };
}
export async function previa(env, senha) {
  const dados = await abrirEnvelope(env, senha);
  return { dados, contagens: contarDados(dados), criado_em: env.criado_em, aparelho: env.aparelho };
}

export async function guardarCopiaDeSeguranca() {
  const dados = await exportarDados();
  const ok = await kvSet('copia-seguranca', { em: new Date().toISOString(), dados });
  return ok;
}
export async function temCopiaDeSeguranca() { const c = await kvGet('copia-seguranca'); return c ? c.em : null; }

async function aplicar(dados, modo) {
  if (dados.formato === 'sqlite-bruto') {
    if (modo === 'mesclar') throw new Error('Este backup é do tipo "banco completo" e só permite Substituir.');
    const h = globalThis.__PERSISTENCIA_BANCO;
    if (!h || !h.gravarAgora) throw new Error('Não foi possível gravar o banco neste ambiente.');
    await h.gravarAgora(deB64(dados.base64));
    return { ok: true, recarregar: true };
  }
  const r = await fetch('/api/backup/importar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo, dados }) });
  let corpo = {};
  try { corpo = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) throw new Error(corpo.erro || 'Não foi possível restaurar o backup.');
  return { ...corpo, recarregar: true };
}

// Restaura. Antes de SUBSTITUIR, guarda uma cópia de segurança do estado atual (desfazível).
export async function restaurar(dados, modo = 'substituir') {
  ocupado.value = true;
  try {
    if (modo === 'substituir') await guardarCopiaDeSeguranca().catch(() => {});
    return await aplicar(dados, modo);
  } finally { ocupado.value = false; }
}
export async function desfazerRestauracao() {
  const c = await kvGet('copia-seguranca');
  if (!c) throw new Error('Não há cópia de segurança guardada.');
  return aplicar(c.dados, 'substituir');
}

// ---- Lembrete -------------------------------------------------------------------------------
export function diasDesdeUltimo() {
  const ref0 = configBackup.ultimo || configBackup.instalado_em;
  return (Date.now() - new Date(ref0).getTime()) / 86400000;
}
export function backupDevido() {
  const it = INTERVALOS.find((i) => i.id === configBackup.intervalo);
  if (!it || !it.dias) return false;
  return diasDesdeUltimo() >= it.dias;
}
export function textoUltimoBackup() {
  if (!configBackup.ultimo) return 'Nenhum backup feito ainda';
  const d = new Date(configBackup.ultimo);
  return `Último backup: ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

let rodando = false;
export async function verificarLembrete() {
  if (rodando || !backupDevido()) return;
  rodando = true;
  try {
    if (configBackup.automatico && configBackup.ultimoDestino === 'pasta') {
      await carregarPasta();
      if (estadoPasta.permissao === 'granted') {
        await salvarNaPasta({ pedirPermissao: false });
        avisar('Backup automático salvo na pasta.', { tipo: 'ok' });
        return;
      }
    }
    const nuv = nuvemConectada();
    if (configBackup.automatico && nuv && configBackup.ultimoDestino === nuv) {
      try {
        await enviarNuvem(nuv);
        avisar(`Backup automático enviado ao ${PROVEDORES[nuv].nome}.`, { tipo: 'ok' });
        return;
      } catch (e) {
        avisar(`Não deu para enviar ao ${PROVEDORES[nuv].nome}: ${(e && e.message) || 'erro'} Toque para tentar.`, { rota: '/backup?fazer=1', tipo: 'alerta', duracao: 12000 });
        return;
      }
    }
    avisar('Hora do backup. Toque para fazer agora.', { rota: '/backup?fazer=1', tipo: 'alerta', duracao: 12000 });
  } catch (e) {
    avisar('Hora do backup. Toque para fazer agora.', { rota: '/backup?fazer=1', tipo: 'alerta', duracao: 12000 });
  } finally { rodando = false; }
}

let ligado = false;
export function iniciarLembrete() {
  if (ligado) return;
  ligado = true;
  carregarPasta().catch(() => {});
  setTimeout(verificarLembrete, 2500);
  let ultimaVez = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - ultimaVez > 600000) { ultimaVez = Date.now(); verificarLembrete(); }
  });
}

// Recarrega o app depois de restaurar, garantindo que o banco local já foi gravado.
export async function recarregarApp() {
  try { const h = globalThis.__PERSISTENCIA_BANCO; if (h && h.flush) await h.flush(); } catch { /* ignora */ }
  location.reload();
}
