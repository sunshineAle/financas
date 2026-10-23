// Google Drive: Google Identity Services (token flow, sem servidor). Escopo mínimo: drive.file (o app só enxerga arquivos criados por ele; ficam na pasta "Dagda Capital" do Meu Drive).
// O token de acesso vive só na memória (dura ~1h); ao vencer, o app pede outro de forma silenciosa.
import { ErroNuvem, configNuvem, chamar } from './comum.js';

const ESCOPO = 'https://www.googleapis.com/auth/drive.file';
const PASTA = 'Dagda Capital';
let pastaId = null;
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
let tokenAtual = null; // { valor, expira }

function carregarGis() {
  if (typeof window === 'undefined') return Promise.reject(new ErroNuvem('outro', 'Ambiente sem navegador.'));
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new ErroNuvem('rede', 'Não foi possível carregar o login do Google. Verifique a internet.'));
    document.head.appendChild(s);
  });
}

async function pedirToken(prompt) {
  const { googleClientId } = configNuvem();
  if (!googleClientId) throw new ErroNuvem('config', 'Google Drive ainda não foi configurado neste app.');
  await carregarGis();
  return new Promise((resolve, reject) => {
    const limite = setTimeout(() => reject(new ErroNuvem('auth', 'O Google não respondeu. Tente conectar de novo.')), prompt === '' ? 20000 : 180000);
    const cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId, scope: ESCOPO,
      callback: (r) => {
        clearTimeout(limite);
        if (!r || r.error || !r.access_token) return reject(new ErroNuvem(r && r.error === 'access_denied' ? 'cancelado' : 'auth', r && r.error === 'access_denied' ? 'Conexão cancelada.' : 'O Google não liberou o acesso. Tente conectar de novo.'));
        tokenAtual = { valor: r.access_token, expira: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
        resolve();
      },
      error_callback: (e) => { clearTimeout(limite); reject(new ErroNuvem(e && e.type === 'popup_closed' ? 'cancelado' : 'auth', e && e.type === 'popup_closed' ? 'Conexão cancelada.' : 'Não foi possível abrir o login do Google (janela bloqueada?).')); },
    });
    cliente.requestAccessToken({ prompt });
  });
}

// Acha (ou cria, se `criar`) a pasta do app. Com drive.file só aparecem pastas/arquivos criados por este app.
async function acharPasta(prov, criar) {
  if (pastaId) return pastaId;
  const q = new URLSearchParams({ spaces: 'drive', pageSize: '1', fields: 'files(id)', q: `name = '${PASTA}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false` });
  const j = await (await chamar(prov, `${API}/files?${q}`)).json();
  if (j.files && j.files[0]) return (pastaId = j.files[0].id);
  if (!criar) return null;
  const c = await (await chamar(prov, `${API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: PASTA, mimeType: 'application/vnd.google-apps.folder' }) })).json();
  return (pastaId = c.id);
}

export const google = {
  id: 'google', nome: 'Google Drive', escopo: ESCOPO, pasta: 'pasta "Dagda Capital" no Meu Drive',
  configurado: () => !!configNuvem().googleClientId,
  temToken: () => !!(tokenAtual && tokenAtual.expira - 60000 > Date.now()),
  async conectar() { await pedirToken('consent'); },
  // Renovação: silenciosa (sem tela) quando a sessão do Google permite. `forcar` descarta o token atual.
  async renovar(forcar = false) { if (forcar) tokenAtual = null; await pedirToken(''); },
  async token() { if (!this.temToken()) await this.renovar(); return tokenAtual.valor; },
  async desconectar() {
    pastaId = null;
    const t = tokenAtual && tokenAtual.valor; tokenAtual = null;
    try { if (t && window.google && window.google.accounts) window.google.accounts.oauth2.revoke(t, () => {}); } catch { /* ignora */ }
  },
  async enviar(nome, texto) {
    const pasta = await acharPasta(this, true);
    const limite = '----sf' + Math.random().toString(16).slice(2);
    const corpo = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nome, parents: [pasta], mimeType: 'application/octet-stream' })}\r\n--${limite}\r\nContent-Type: application/octet-stream\r\n\r\n${texto}\r\n--${limite}--`;
    const r = await chamar(this, `${UPLOAD}?uploadType=multipart&fields=id,name`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${limite}` }, body: corpo });
    return await r.json();
  },
  async listar() {
    const pasta = await acharPasta(this, false);
    if (!pasta) return [];
    const q = new URLSearchParams({ spaces: 'drive', orderBy: 'createdTime desc', pageSize: '100', fields: 'files(id,name,size,createdTime)', q: `'${pasta}' in parents and name contains '.sfin' and trashed = false` });
    const r = await chamar(this, `${API}/files?${q}`);
    const j = await r.json();
    return (j.files || []).map((f) => ({ id: f.id, nome: f.name, tamanho: Number(f.size) || 0, data: Date.parse(f.createdTime) || 0 }));
  },
  async baixar(item) { const r = await chamar(this, `${API}/files/${encodeURIComponent(item.id)}?alt=media`); return await r.text(); },
  async apagar(item) { await chamar(this, `${API}/files/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); },
};
