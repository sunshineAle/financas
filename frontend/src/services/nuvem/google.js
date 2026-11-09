// Google Drive: Google Identity Services (sem servidor). drive.appdata limita o acesso à área oculta deste app.
// O token de acesso vive só na memória (dura ~1h); ao vencer, o app pede outro de forma silenciosa.
import { ErroNuvem, configNuvem, chamar } from './comum.js';

const ESCOPO = 'https://www.googleapis.com/auth/drive.appdata';
const ESCOPO_RESTAURAR = ESCOPO + ' https://www.googleapis.com/auth/drive.file';
let ultimoEscopo = ESCOPO;
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
let gisCarregando = null;
let tokenAtual = null; // { valor, expira }

function carregarGis() {
  if (typeof window === 'undefined') return Promise.reject(new ErroNuvem('outro', 'Ambiente sem navegador.'));
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (gisCarregando) return gisCarregando;
  gisCarregando = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisCarregando = null; s.remove(); reject(new ErroNuvem('rede', 'Não foi possível carregar o login do Google. Verifique a internet.')); };
    document.head.appendChild(s);
  });
  return gisCarregando;
}

async function pedirToken(prompt, escopo = ultimoEscopo) {
  const { googleClientId } = configNuvem();
  if (!googleClientId) throw new ErroNuvem('config', 'Google Drive ainda não foi configurado neste app.');
  await carregarGis();
  return new Promise((resolve, reject) => {
    const limite = setTimeout(() => reject(new ErroNuvem('auth', 'O Google não respondeu. Tente conectar de novo.')), prompt === '' ? 20000 : 180000);
    const cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId, scope: escopo,
      callback: (r) => {
        clearTimeout(limite);
        if (!r || r.error || !r.access_token) return reject(new ErroNuvem(r && r.error === 'access_denied' ? 'cancelado' : 'auth', r && r.error === 'access_denied' ? 'Conexão cancelada.' : 'O Google não liberou o acesso. Tente conectar de novo.'));
        ultimoEscopo = escopo;
        tokenAtual = { valor: r.access_token, expira: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
        resolve();
      },
      error_callback: (e) => { clearTimeout(limite); reject(new ErroNuvem(e && e.type === 'popup_closed' ? 'cancelado' : 'auth', e && e.type === 'popup_closed' ? 'Conexão cancelada.' : 'Não foi possível abrir o login do Google (janela bloqueada?).')); },
    });
    cliente.requestAccessToken({ prompt });
  });
}

export const google = {
  preparar: carregarGis,
  id: 'google', nome: 'Google Drive', escopo: ESCOPO, pasta: 'área oculta do app no Google Drive',
  configurado: () => !!configNuvem().googleClientId,
  temToken: () => !!(tokenAtual && tokenAtual.expira - 60000 > Date.now()),
  async conectar() { await pedirToken('consent', ESCOPO); },
  async conectarParaRestaurar() { await pedirToken('consent', ESCOPO_RESTAURAR); },
  // Renovação: silenciosa (sem tela) quando a sessão do Google permite. `forcar` descarta o token atual.
  async renovar(forcar = false) { if (forcar) tokenAtual = null; await pedirToken(''); },
  async token() { if (!this.temToken()) await this.renovar(); return tokenAtual.valor; },
  async desconectar() {
    const t = tokenAtual && tokenAtual.valor; tokenAtual = null;
    try { if (t && window.google && window.google.accounts) window.google.accounts.oauth2.revoke(t, () => {}); } catch { /* ignora */ }
  },
  async enviar(nome, texto) {
    const limite = '----sf' + Math.random().toString(16).slice(2);
    const corpo = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nome, parents: ['appDataFolder'], mimeType: 'application/octet-stream' })}\r\n--${limite}\r\nContent-Type: application/octet-stream\r\n\r\n${texto}\r\n--${limite}--`;
    const r = await chamar(this, `${UPLOAD}?uploadType=multipart&fields=id,name`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${limite}` }, body: corpo });
    return await r.json();
  },
  async listar({ restaurar = false } = {}) {
    const arquivos = [];
    let pagina;
    do {
      const q = new URLSearchParams({ spaces: 'appDataFolder', orderBy: 'createdTime desc', pageSize: '100', fields: 'nextPageToken,files(id,name,size,createdTime)', q: "trashed = false and name contains '.sfin'" });
      if (pagina) q.set('pageToken', pagina);
      const j = await (await chamar(this, `${API}/files?${q}`)).json();
      arquivos.push(...(j.files || []));
      pagina = j.nextPageToken;
    } while (pagina);
    return arquivos.filter((f) => f.name.endsWith('.sfin') && (restaurar || (import.meta.env?.VITE_PREVIA ? f.name.startsWith('previa-') : !f.name.startsWith('previa-')))).map((f) => ({ id: f.id, nome: f.name, tamanho: Number(f.size) || 0, data: Date.parse(f.createdTime) || 0 }));
  },
  // Compatibilidade: somente leitura da pasta usada pelo mesmo Client ID antes da área oculta.
  // Não migra, não renomeia e não remove os backups antigos.
  async listarAntigos() {
    const listar = async (consulta, fields) => {
      const arquivos = []; let pagina;
      do {
        const q = new URLSearchParams({ spaces: 'drive', pageSize: '100', fields: `nextPageToken,files(${fields})`, q: consulta });
        if (pagina) q.set('pageToken', pagina);
        const j = await (await chamar(this, `${API}/files?${q}`)).json();
        arquivos.push(...(j.files || [])); pagina = j.nextPageToken;
      } while (pagina);
      return arquivos;
    };
    const pastas = await listar("name = 'Dagda Capital' and mimeType = 'application/vnd.google-apps.folder' and trashed = false", 'id,name');
    const arquivos = [];
    for (const pasta of pastas) {
      if (!/^[a-zA-Z0-9_-]+$/.test(pasta.id)) continue;
      arquivos.push(...await listar(`'${pasta.id}' in parents and trashed = false and name contains '.sfin'`, 'id,name,size,createdTime'));
    }
    return arquivos.filter(f => f.name.endsWith('.sfin')).map(f => ({ id: f.id, nome: f.name, tamanho: Number(f.size) || 0, data: Date.parse(f.createdTime) || 0, legado: true }));
  },
  async baixar(item) { const r = await chamar(this, `${API}/files/${encodeURIComponent(item.id)}?alt=media`); return await r.text(); },
  async apagar(item) { await chamar(this, `${API}/files/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); },
};
