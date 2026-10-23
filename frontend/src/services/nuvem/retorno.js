// Retorno do login da Microsoft (OAuth2 PKCE): a janela de login volta para a raiz do app com ?code=&state=.
// Esta função roda bem no início do app, só repassa o código à janela que a abriu e fecha. Sem dependências.
export function tratarRetornoOAuth() {
  try {
    const q = new URLSearchParams(location.search);
    if (!(q.has('code') || q.has('error')) || !q.has('state')) return false;
    if (!String(q.get('state')).startsWith('sfnuvem.')) return false;
    if (!window.opener) return false;
    window.opener.postMessage({ tipo: 'sf:oauth', state: q.get('state'), code: q.get('code'), erro: q.get('error'), descricao: q.get('error_description') }, location.origin);
    document.documentElement.innerHTML = '<body style="font:16px system-ui;padding:32px;text-align:center">Conta conectada. Pode fechar esta janela.</body>';
    setTimeout(() => window.close(), 150);
    return true;
  } catch { return false; }
}
