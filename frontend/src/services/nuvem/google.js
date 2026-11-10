// Google Drive: o vínculo local não é uma credencial. Tokens e permissões atuais ficam só na memória.
// A sessão Google pode exigir nova interação; o app não força consentimento a cada backup.
import { ErroNuvem, configNuvem, chamar } from './comum.js';

const ESCOPO = 'https://www.googleapis.com/auth/drive.appdata';
const ESCOPO_ARQUIVOS = 'https://www.googleapis.com/auth/drive.file';
const ESCOPO_RESTAURAR = ESCOPO + ' ' + ESCOPO_ARQUIVOS;
const VINCULO = 'sf:google:vinculo';
const CONHECIDOS = new Set([ESCOPO, ESCOPO_ARQUIVOS]);
let ultimoEscopo = ESCOPO;
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
let gisCarregando = null;
let tokenAtual = null; // valor, expira, clientId e escopos efetivamente informados pelo Google; nunca persistidos.
let requisicaoAtual = null;
let cancelarPedido = null;
let interacaoPendente = null; // só depois de o Google informar que interação é necessária.
const escoposDe = escopo => String(escopo || '').split(/\s+/).filter(Boolean);
const cobre = (concedidos, pedido) => escoposDe(pedido).every(e => concedidos.includes(e));
function tokenServe(escopo) {
  return !!(tokenAtual && tokenAtual.clientId === configNuvem().googleClientId && tokenAtual.expira - 60000 > Date.now() && cobre(tokenAtual.escopos, escopo));
}
function lerVinculo() {
  try {
    const v = JSON.parse(localStorage.getItem(VINCULO) || 'null');
    if (v?.clientId === configNuvem().googleClientId && Array.isArray(v.escopos)) return v.escopos.filter(e => CONHECIDOS.has(e));
  } catch { /* marca opcional */ }
  return [];
}
function gravarVinculo(escopos, clientId) {
  // Só metadados públicos de autorização. Nem token, senha, código ou identidade da conta vão ao storage.
  try { localStorage.setItem(VINCULO, JSON.stringify({ clientId, escopos: escopos.filter(e => CONHECIDOS.has(e)) })); } catch { /* sem storage, o token da sessão continua utilizável */ }
}
function carregarGis() {
  if (typeof window === 'undefined') return Promise.reject(new ErroNuvem('outro', 'Ambiente sem navegador.'));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
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
function erroDeAutorizacao(r, escopo) {
  const codigo = r?.error;
  if (codigo === 'consent_required' || codigo === 'invalid_scope') interacaoPendente = { escopo, prompt: 'consent' };
  else if (codigo === 'login_required' || codigo === 'interaction_required') interacaoPendente = { escopo, prompt: 'select_account' };
  if (codigo === 'access_denied') return new ErroNuvem('cancelado', 'Conexão cancelada. Seu vínculo anterior foi preservado.');
  return new ErroNuvem('auth', 'A sessão Google precisa de uma nova confirmação. Toque em conectar novamente.');
}
async function pedirToken(prompt, escopo) {
  const { googleClientId } = configNuvem();
  if (!googleClientId) throw new ErroNuvem('config', 'Google Drive ainda não foi configurado neste app.');
  await carregarGis();
  if (requisicaoAtual) {
    await requisicaoAtual.catch(() => {});
    if (tokenServe(escopo)) { ultimoEscopo = escopo; return; }
    return pedirToken(prompt, escopo);
  }
  const atual = new Promise((resolve, reject) => {
    let encerrado = false;
    const concluir = (erro) => {
      if (encerrado) return;
      encerrado = true; clearTimeout(limite);
      if (erro) reject(erro); else resolve();
    };
    cancelarPedido = () => concluir(new ErroNuvem('cancelado', 'Conexão cancelada.'));
    const limite = setTimeout(() => concluir(new ErroNuvem('auth', 'O Google não respondeu. Toque em conectar para tentar novamente.')), prompt === '' ? 20000 : 180000);
    try {
      const cliente = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId, scope: escopo, include_granted_scopes: true,
        callback: (r) => {
          if (encerrado) return;
          if (!r || r.error || !r.access_token) { concluir(erroDeAutorizacao(r, escopo)); return; }
          // O pedido e a marca local não provam a concessão: usar somente os escopos da resposta real.
          const recebidos = escoposDe(r.scope);
          const segundos = Number(r.expires_in);
          if (!recebidos.length || !Number.isFinite(segundos) || segundos <= 0) {
            concluir(new ErroNuvem('auth', 'O Google não confirmou as permissões e a validade da sessão. Conecte novamente.')); return;
          }
          if (configNuvem().googleClientId !== googleClientId) { concluir(new ErroNuvem('auth', 'A configuração Google mudou. Conecte novamente.')); return; }
          tokenAtual = { valor: r.access_token, expira: Date.now() + segundos * 1000, clientId: googleClientId, escopos: recebidos };
          gravarVinculo(recebidos, googleClientId);
          if (!cobre(recebidos, escopo)) {
            interacaoPendente = { escopo, prompt: 'consent' };
            concluir(new ErroNuvem('permissao', 'O Google não autorizou todas as permissões desta operação. As permissões já concedidas continuam disponíveis.')); return;
          }
          ultimoEscopo = escopo;
          if (interacaoPendente?.escopo === escopo) interacaoPendente = null;
          concluir();
        },
        error_callback: (e) => {
          if (encerrado) return;
          if (e?.type !== 'popup_closed') interacaoPendente = { escopo, prompt: 'select_account' };
          concluir(new ErroNuvem(e?.type === 'popup_closed' ? 'cancelado' : 'auth', e?.type === 'popup_closed' ? 'Conexão cancelada. Seu vínculo anterior foi preservado.' : 'Não foi possível abrir o login do Google. Toque em conectar e permita a janela.'));
        },
      });
      cliente.requestAccessToken({ prompt });
    } catch { concluir(new ErroNuvem('auth', 'Não foi possível iniciar a conexão Google. Tente novamente.')); }
  });
  requisicaoAtual = atual;
  try { await atual; } finally { if (requisicaoAtual === atual) { requisicaoAtual = null; cancelarPedido = null; } }
}
async function conectarComEscopo(escopo) {
  if (tokenServe(escopo)) { ultimoEscopo = escopo; return; }
  const lembrados = lerVinculo();
  const prompt = interacaoPendente?.escopo === escopo ? interacaoPendente.prompt : cobre(lembrados, escopo) ? '' : 'consent';
  await pedirToken(prompt, escopo);
}

export const google = {
  preparar: carregarGis,
  id: 'google', nome: 'Google Drive', escopo: ESCOPO, pasta: 'área oculta do app no Google Drive',
  configurado: () => !!configNuvem().googleClientId,
  temToken: () => tokenServe(ESCOPO),
  async conectar() { await conectarComEscopo(ESCOPO); },
  async conectarParaRestaurar() { await conectarComEscopo(ESCOPO_RESTAURAR); },
  // Renovação: silenciosa (sem tela) quando a sessão do Google permite. `forcar` descarta o token atual.
  async renovar(forcar = false) {
    if (forcar) tokenAtual = null;
    // Chamadas de API não forçam uma nova tela de consentimento. Se falhar, um clique explícito reconecta.
    await pedirToken('', ultimoEscopo);
  },
  async token() { if (!tokenServe(ultimoEscopo)) await this.renovar(); return tokenAtual.valor; },
  async desconectar() {
    cancelarPedido?.();
    const t = tokenAtual && tokenAtual.valor; tokenAtual = null; ultimoEscopo = ESCOPO; interacaoPendente = null;
    try { localStorage.removeItem(VINCULO); } catch { /* sem marca local */ }
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
    return arquivos.filter((f) => f.name.endsWith('.sfin') && (import.meta.env?.VITE_PREVIA ? (restaurar || f.name.startsWith('previa-')) : !f.name.startsWith('previa-'))).map((f) => ({ id: f.id, nome: f.name, tamanho: Number(f.size) || 0, data: Date.parse(f.createdTime) || 0 }));
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
