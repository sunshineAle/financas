// OneDrive: Microsoft identity platform, código de autorização + PKCE (cliente "Aplicativo de página única"), Graph via fetch.
// Escopo mínimo: Files.ReadWrite.AppFolder (pasta Aplicativos/<nome do app>). O refresh token fica no IndexedDB; o access token, na memória.
import { ErroNuvem, configNuvem, chamar, aleatorio, desafioPkce, janelaLogin } from './comum.js';
import { kvGet, kvSet, kvDel } from '../idb.js';

const ESCOPO = 'Files.ReadWrite.AppFolder offline_access';
const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const CHAVE_REFRESH = 'nuvem:ms:refresh';
let tokenAtual = null; // { valor, expira }
let refreshMem = null;  // espelho em memória (cobre IndexedDB indisponível)

const redirectUri = () => location.origin + location.pathname;

async function trocar(corpo) {
  const { microsoftClientId } = configNuvem();
  let r;
  try { r = await fetch(`${AUTH}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: microsoftClientId, scope: ESCOPO, ...corpo }) }); }
  catch { throw new ErroNuvem('rede', 'Sem conexão com o OneDrive. Verifique a internet e tente de novo.'); }
  let j = {};
  try { j = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok || !j.access_token) {
    if (j.error === 'invalid_grant' || j.error === 'interaction_required') throw new ErroNuvem('auth', 'A sessão com o OneDrive expirou. Conecte a conta de novo.');
    throw new ErroNuvem(r.status >= 500 ? 'servidor' : 'auth', 'A Microsoft não liberou o acesso. Tente conectar de novo.');
  }
  tokenAtual = { valor: j.access_token, expira: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  if (j.refresh_token) { refreshMem = j.refresh_token; await kvSet(CHAVE_REFRESH, j.refresh_token); }
}

export const microsoft = {
  id: 'microsoft', nome: 'OneDrive', pasta: 'pasta Aplicativos do OneDrive',
  configurado: () => !!configNuvem().microsoftClientId,
  temToken: () => !!(tokenAtual && tokenAtual.expira - 60000 > Date.now()),
  async conectar() {
    const { microsoftClientId } = configNuvem();
    if (!microsoftClientId) throw new ErroNuvem('config', 'OneDrive ainda não foi configurado neste app.');
    const verificador = aleatorio(48); const state = 'sfnuvem.' + aleatorio(12);
    const url = `${AUTH}/authorize?` + new URLSearchParams({ client_id: microsoftClientId, response_type: 'code', redirect_uri: redirectUri(), response_mode: 'query', scope: ESCOPO, state, code_challenge: await desafioPkce(verificador), code_challenge_method: 'S256', prompt: 'select_account' });
    const codigo = await janelaLogin(url, state);
    await trocar({ grant_type: 'authorization_code', code: codigo, redirect_uri: redirectUri(), code_verifier: verificador });
  },
  async renovar(forcar = false) {
    if (forcar) tokenAtual = null;
    const rt = refreshMem || (await kvGet(CHAVE_REFRESH));
    if (!rt) throw new ErroNuvem('auth', 'A sessão com o OneDrive expirou. Conecte a conta de novo.');
    await trocar({ grant_type: 'refresh_token', refresh_token: rt });
  },
  async token() { if (!this.temToken()) await this.renovar(); return tokenAtual.valor; },
  async desconectar() { tokenAtual = null; refreshMem = null; await kvDel(CHAVE_REFRESH); },
  async enviar(nome, texto) {
    const caminho = `${GRAPH}/me/drive/special/approot:/${encodeURIComponent(nome)}:`;
    if (texto.length < 3.5 * 1024 * 1024) {
      const r = await chamar(this, `${caminho}/content`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: texto });
      return await r.json();
    }
    const s = await (await chamar(this, `${caminho}/createUploadSession`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }) })).json();
    const bytes = new TextEncoder().encode(texto);
    const r = await chamar({ ...this, token: async () => '' }, s.uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes 0-${bytes.length - 1}/${bytes.length}` }, body: bytes }, { semAuth: true });
    return await r.json();
  },
  async listar() {
    const q = new URLSearchParams({ $orderby: 'lastModifiedDateTime desc', $top: '100', $select: 'id,name,size,lastModifiedDateTime,@microsoft.graph.downloadUrl' });
    const j = await (await chamar(this, `${GRAPH}/me/drive/special/approot/children?${q}`)).json();
    return (j.value || []).filter((f) => /\.sfin$/i.test(f.name)).map((f) => ({ id: f.id, nome: f.name, tamanho: Number(f.size) || 0, data: Date.parse(f.lastModifiedDateTime) || 0, url: f['@microsoft.graph.downloadUrl'] || null }));
  },
  async baixar(item) {
    // O link pré-autenticado do Graph dispensa o cabeçalho Authorization (evita problema de CORS no redirecionamento).
    if (item.url) { const r = await chamar(this, item.url, {}, { semAuth: true }); return await r.text(); }
    return await (await chamar(this, `${GRAPH}/me/drive/items/${encodeURIComponent(item.id)}/content`)).text();
  },
  async apagar(item) { await chamar(this, `${GRAPH}/me/drive/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); },
};
