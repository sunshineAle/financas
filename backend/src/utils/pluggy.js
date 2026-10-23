// Cliente mínimo da API da Pluggy (Open Finance). Usa o fetch nativo (Node 18+).
// As chaves ficam só no .env do servidor; o navegador recebe apenas um
// token temporário para abrir o widget.
const BASE = process.env.PLUGGY_BASE_URL || 'https://api.pluggy.ai';

let chave = null;
let chaveValidaAte = 0;

function configurado() {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
}

async function chamar(caminho, opcoes = {}, tentarDeNovo = true) {
  if (!configurado()) {
    throw new Error('Open Finance não configurado: preencha PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env do servidor.');
  }
  const r = await fetch(BASE + caminho, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': await obterChave(), ...(opcoes.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && tentarDeNovo) {
    chave = null; // a chave dura ~2h; renova e tenta uma vez
    return chamar(caminho, opcoes, false);
  }
  if (!r.ok) throw new Error(`Pluggy ${caminho.split('?')[0]} → ${r.status}: ${j.message || 'erro'}`);
  return j;
}

async function obterChave() {
  if (chave && Date.now() < chaveValidaAte) return chave;
  const r = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Pluggy recusou as chaves (${r.status}): ${j.message || 'erro'}`);
  chave = j.apiKey;
  chaveValidaAte = Date.now() + 90 * 60 * 1000;
  return chave;
}

async function paginas(caminho) {
  let pagina = 1, total = 1, saida = [];
  do {
    const j = await chamar(`${caminho}${caminho.includes('?') ? '&' : '?'}pageSize=500&page=${pagina}`);
    saida = saida.concat(j.results || []);
    total = j.totalPages || 1;
    pagina++;
  } while (pagina <= total);
  return saida;
}

const pluggy = {
  configurado,
  async criarConnectToken() {
    const j = await chamar('/connect_token', { method: 'POST', body: JSON.stringify({ options: { clientUserId: 'sistema-financeiro' } }) });
    return j.accessToken;
  },
  item: (itemId) => chamar(`/items/${encodeURIComponent(itemId)}`),
  contas: (itemId) => paginas(`/accounts?itemId=${encodeURIComponent(itemId)}`),
  investimentos: (itemId) => paginas(`/investments?itemId=${encodeURIComponent(itemId)}`),
  // Transações: endpoint /v2 com paginação por cursor ("next" já vem como query string)
  async transacoes(accountId, desdeISO) {
    let consulta = `?accountId=${encodeURIComponent(accountId)}&dateFrom=${encodeURIComponent(desdeISO)}`;
    let saida = [];
    for (let i = 0; i < 100 && consulta; i++) {
      const j = await chamar(`/v2/transactions${consulta}`);
      saida = saida.concat(j.results || []);
      consulta = j.next || null;
    }
    return saida;
  },
};

module.exports = pluggy;
