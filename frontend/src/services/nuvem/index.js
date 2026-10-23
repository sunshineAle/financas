// Backup em nuvem (Google Drive, OneDrive e Dropbox) sem servidor: orquestra conexão, envio, listagem e restauração.
//   import { PROVEDORES, estadoNuvem, conectarNuvem, desconectarNuvem, enviarParaNuvem, listarNuvem, baixarDaNuvem, nuvemConectada } from './nuvem/index.js';
// Client IDs: window.__SF_CONFIG__.nuvem.googleClientId / .microsoftClientId (public/config.js). Passo a passo: docs-nuvem.md.
import { reactive } from 'vue';
import { google } from './google.js';
import { microsoft } from './microsoft.js';
import { dropbox } from './dropbox.js';
import { ErroNuvem } from './comum.js';

export { ErroNuvem };
export const PROVEDORES = { google, microsoft, dropbox };
const CHAVE = 'sf:nuvem:estado';

// Estado do aparelho (localStorage: só marcas e datas, nunca token nem conteúdo).
function ler() { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null') || {}; } catch { return {}; } }
const base = ler();
export const estadoNuvem = reactive({
  google: { conectado: false, ultimoEnvio: null, ultimoErro: null, ...(base.google || {}) },
  microsoft: { conectado: false, ultimoEnvio: null, ultimoErro: null, ...(base.microsoft || {}) },
  dropbox: { conectado: false, ultimoEnvio: null, ultimoErro: null, ...(base.dropbox || {}) },
  ocupado: null, // id do provedor em operação
});
function gravar() { try { localStorage.setItem(CHAVE, JSON.stringify({ google: estadoNuvem.google, microsoft: estadoNuvem.microsoft, dropbox: estadoNuvem.dropbox })); } catch { /* ignora */ } }

export const nuvemConectada = () => Object.keys(PROVEDORES).find((id) => estadoNuvem[id].conectado && PROVEDORES[id].configurado()) || null;
const exigir = (id) => { const p = PROVEDORES[id]; if (!p) throw new ErroNuvem('outro', 'Nuvem desconhecida.'); if (!p.configurado()) throw new ErroNuvem('config', `${p.nome} ainda não foi configurado neste app.`); return p; };

async function operar(id, fn, { marcarErro = true } = {}) {
  estadoNuvem.ocupado = id;
  try { return await fn(); }
  catch (e) {
    const erro = e instanceof ErroNuvem ? e : new ErroNuvem('outro', (e && e.message) || 'Não foi possível falar com a nuvem.');
    if (marcarErro && erro.codigo !== 'cancelado' && erro.codigo !== 'config') {
      estadoNuvem[id].ultimoErro = { codigo: erro.codigo, mensagem: erro.message, em: new Date().toISOString() };
      if (erro.codigo === 'auth' || erro.codigo === 'permissao') estadoNuvem[id].precisaReconectar = true;
      gravar();
    }
    throw erro;
  } finally { estadoNuvem.ocupado = null; }
}

export async function conectarNuvem(id) {
  const p = exigir(id);
  return operar(id, async () => {
    await p.conectar();
    // Teste de acesso: falha aqui = escopo/permissão errados, melhor saber agora.
    await p.listar();
    Object.assign(estadoNuvem[id], { conectado: true, ultimoErro: null, precisaReconectar: false });
    gravar();
  });
}
export async function desconectarNuvem(id) {
  try { await PROVEDORES[id].desconectar(); } catch { /* ignora */ }
  Object.assign(estadoNuvem[id], { conectado: false, ultimoErro: null, precisaReconectar: false });
  gravar();
}

// Envia o texto (.sfin já cifrado) e mantém só os `manter` mais recentes. Falha na limpeza não invalida o envio.
export async function enviarParaNuvem(id, nome, texto, { manter = 10 } = {}) {
  const p = exigir(id);
  return operar(id, async () => {
    await p.enviar(nome, texto);
    estadoNuvem[id].ultimoEnvio = new Date().toISOString(); estadoNuvem[id].ultimoErro = null; estadoNuvem[id].precisaReconectar = false; gravar();
    try {
      const todos = (await p.listar()).filter((i) => /^sistema-financeiro-.*\.sfin$/.test(i.nome)).sort((a, b) => b.nome.localeCompare(a.nome));
      for (const velho of todos.slice(Math.max(1, Number(manter) || 10))) await p.apagar(velho);
    } catch { /* limpeza é opcional */ }
    return nome;
  });
}
export async function listarNuvem(id) { const p = exigir(id); return operar(id, async () => (await p.listar()).sort((a, b) => b.nome.localeCompare(a.nome)), { marcarErro: false }); }
export async function baixarDaNuvem(id, item) { const p = exigir(id); return operar(id, () => p.baixar(item), { marcarErro: false }); }
