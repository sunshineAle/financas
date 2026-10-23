// Peças comuns do backup em nuvem (sem Vue, testável em Node): erros tipados, configuração pública, PKCE e chamadas HTTP.
// Nunca guarda nem registra o conteúdo do backup em claro: o arquivo .sfin já chega aqui cifrado.
export class ErroNuvem extends Error {
  constructor(codigo, mensagem) { super(mensagem); this.name = 'ErroNuvem'; this.codigo = codigo; }
}
// codigo: 'config' | 'auth' | 'permissao' | 'rede' | 'cota' | 'servidor' | 'cancelado' | 'outro'

export function configNuvem() {
  const c = (typeof window !== 'undefined' && window.__SF_CONFIG__ && window.__SF_CONFIG__.nuvem) || {};
  return { googleClientId: String(c.googleClientId || '').trim(), microsoftClientId: String(c.microsoftClientId || '').trim(), dropboxAppKey: String(c.dropboxAppKey || '').trim() };
}

const b64url = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function aleatorio(n = 32) { return b64url(crypto.getRandomValues(new Uint8Array(n))); }
export async function desafioPkce(verificador) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador))));
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Chama a API com o token do provedor. 401: renova uma vez e repete. 403/429/5xx/rede viram ErroNuvem com texto em português.
// `prov` precisa de: token() -> Promise<string>, renovar() -> Promise<void>, nome.
export async function chamar(prov, url, opcoes = {}, { semAuth = false, resposta = true } = {}) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const headers = { ...(opcoes.headers || {}) };
    if (!semAuth) headers.Authorization = 'Bearer ' + (await prov.token());
    let r;
    try { r = await fetch(url, { ...opcoes, headers }); }
    catch { throw new ErroNuvem('rede', `Sem conexão com ${prov.nome}. Verifique a internet e tente de novo.`); }
    if (r.status === 401 && !semAuth) {
      if (tentativa === 0) { await prov.renovar(true); continue; }
      throw new ErroNuvem('auth', `A sessão com ${prov.nome} expirou. Conecte a conta de novo.`);
    }
    if (r.ok) return r;
    let corpo = '';
    try { corpo = await r.text(); } catch { /* sem corpo */ }
    if (r.status === 403 || r.status === 429 || r.status === 507) {
      if (/quota|storageQuota|insufficientStorage|quotaLimitReached|insufficient_space/i.test(corpo) || r.status === 507) throw new ErroNuvem('cota', `Sem espaço livre no ${prov.nome}. Libere espaço e tente de novo.`);
      if (r.status === 429 || /rateLimit|throttl|too ?many/i.test(corpo)) throw new ErroNuvem('servidor', `${prov.nome} pediu para esperar um pouco. Tente de novo em alguns minutos.`);
      throw new ErroNuvem('permissao', `${prov.nome} negou a permissão. Reconecte a conta e aceite o acesso à pasta do app.`);
    }
    if (r.status === 409 && /insufficient_space/.test(corpo)) throw new ErroNuvem('cota', `Sem espaço livre no ${prov.nome}. Libere espaço e tente de novo.`);
    if (r.status === 404 || (r.status === 409 && /not_found/.test(corpo))) throw new ErroNuvem('outro', `Arquivo não encontrado no ${prov.nome}.`);
    if (r.status >= 500) throw new ErroNuvem('servidor', `${prov.nome} está indisponível agora (erro ${r.status}). Tente mais tarde.`);
    throw new ErroNuvem('outro', `${prov.nome} recusou o pedido (erro ${r.status}).`);
  }
  throw new ErroNuvem('auth', `A sessão com ${prov.nome} expirou. Conecte a conta de novo.`);
}
export { esperar };

// Janela de login OAuth (pop-up). Resolve com o `code` repassado por retorno.js (postMessage da própria origem).
export function janelaLogin(url, state) {
  return new Promise((resolve, reject) => {
    const w = window.open(url, 'sf-oauth', 'width=480,height=680');
    if (!w) return reject(new ErroNuvem('auth', 'O navegador bloqueou a janela de login. Libere pop-ups para este site e tente de novo.'));
    let fim = false;
    const terminar = (fn, v) => { if (fim) return; fim = true; window.removeEventListener('message', ouvir); clearInterval(timer); try { w.close(); } catch { /* ignora */ } fn(v); };
    const ouvir = (e) => {
      if (e.origin !== location.origin || !e.data || e.data.tipo !== 'sf:oauth' || e.data.state !== state) return;
      if (e.data.erro) return terminar(reject, new ErroNuvem(e.data.erro === 'access_denied' ? 'cancelado' : 'auth', e.data.erro === 'access_denied' ? 'Conexão cancelada.' : 'O login foi recusado: ' + (e.data.descricao || e.data.erro)));
      terminar(resolve, e.data.code);
    };
    window.addEventListener('message', ouvir);
    const timer = setInterval(() => { if (w.closed) terminar(reject, new ErroNuvem('cancelado', 'Conexão cancelada.')); }, 700);
  });
}
