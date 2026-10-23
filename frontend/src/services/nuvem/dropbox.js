// Dropbox: OAuth2 código + PKCE (sem segredo, sem servidor), API HTTP via fetch. App criado com acesso "App folder"
// (escopos files.content.read/write): o app só enxerga Aplicativos/<nome do app>. O refresh token fica no IndexedDB.
import { ErroNuvem, configNuvem, chamar, aleatorio, desafioPkce, janelaLogin } from './comum.js';
import { kvGet, kvSet, kvDel } from '../idb.js';

const AUTH = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN = 'https://api.dropboxapi.com/oauth2/token';
const RPC = 'https://api.dropboxapi.com/2';
const CONTEUDO = 'https://content.dropboxapi.com/2';
const CHAVE_REFRESH = 'nuvem:dbx:refresh';
let tokenAtual = null; let refreshMem = null;
const redirectUri = () => location.origin + location.pathname;
// Cabeçalho Dropbox-API-Arg precisa ser ASCII: escapa tudo acima de 0x7F.
const arg = (o) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

async function trocar(corpo) {
  let r;
  try { r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: configNuvem().dropboxAppKey, ...corpo }) }); }
  catch { throw new ErroNuvem('rede', 'Sem conexão com o Dropbox. Verifique a internet e tente de novo.'); }
  let j = {}; try { j = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok || !j.access_token) {
    if (j.error === 'invalid_grant') throw new ErroNuvem('auth', 'A sessão com o Dropbox expirou. Conecte a conta de novo.');
    throw new ErroNuvem(r.status >= 500 ? 'servidor' : 'auth', 'O Dropbox não liberou o acesso. Tente conectar de novo.');
  }
  tokenAtual = { valor: j.access_token, expira: Date.now() + (Number(j.expires_in) || 14400) * 1000 };
  if (j.refresh_token) { refreshMem = j.refresh_token; await kvSet(CHAVE_REFRESH, j.refresh_token); }
}

export const dropbox = {
  id: 'dropbox', nome: 'Dropbox', pasta: 'pasta Aplicativos do Dropbox',
  configurado: () => !!configNuvem().dropboxAppKey,
  temToken: () => !!(tokenAtual && tokenAtual.expira - 60000 > Date.now()),
  async conectar() {
    if (!configNuvem().dropboxAppKey) throw new ErroNuvem('config', 'Dropbox ainda não foi configurado neste app.');
    const verificador = aleatorio(48); const state = 'sfnuvem.' + aleatorio(12);
    const url = `${AUTH}?` + new URLSearchParams({ client_id: configNuvem().dropboxAppKey, response_type: 'code', redirect_uri: redirectUri(), token_access_type: 'offline', state, code_challenge: await desafioPkce(verificador), code_challenge_method: 'S256' });
    const codigo = await janelaLogin(url, state);
    await trocar({ grant_type: 'authorization_code', code: codigo, redirect_uri: redirectUri(), code_verifier: verificador });
  },
  async renovar(forcar = false) {
    if (forcar) tokenAtual = null;
    const rt = refreshMem || (await kvGet(CHAVE_REFRESH));
    if (!rt) throw new ErroNuvem('auth', 'A sessão com o Dropbox expirou. Conecte a conta de novo.');
    await trocar({ grant_type: 'refresh_token', refresh_token: rt });
  },
  async token() { if (!this.temToken()) await this.renovar(); return tokenAtual.valor; },
  async desconectar() {
    const t = tokenAtual && tokenAtual.valor; tokenAtual = null; refreshMem = null; await kvDel(CHAVE_REFRESH);
    try { if (t) await fetch(`${RPC}/auth/token/revoke`, { method: 'POST', headers: { Authorization: 'Bearer ' + t } }); } catch { /* ignora */ }
  },
  async enviar(nome, texto) {
    const r = await chamar(this, `${CONTEUDO}/files/upload`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': arg({ path: '/' + nome, mode: 'overwrite', mute: true }) }, body: texto });
    return await r.json();
  },
  async listar() {
    const r = await chamar(this, `${RPC}/files/list_folder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '', limit: 500 }) });
    const j = await r.json();
    return (j.entries || []).filter((f) => f['.tag'] === 'file' && /\.sfin$/i.test(f.name)).map((f) => ({ id: f.path_lower || '/' + f.name, nome: f.name, tamanho: Number(f.size) || 0, data: Date.parse(f.server_modified) || 0 }));
  },
  async baixar(item) { return await (await chamar(this, `${CONTEUDO}/files/download`, { method: 'POST', headers: { 'Dropbox-API-Arg': arg({ path: item.id }) } })).text(); },
  async apagar(item) { await chamar(this, `${RPC}/files/delete_v2`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: item.id }) }); },
};
