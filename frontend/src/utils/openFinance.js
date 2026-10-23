// Abre o widget da Pluggy e devolve o resumo da sincronização.
// O script vem do CDN oficial da Pluggy e é carregado só quando precisa.
let carregando = null;
function carregarScript() {
  if (window.PluggyConnect) return Promise.resolve();
  if (!carregando) {
    carregando = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js';
      s.onload = ok;
      s.onerror = () => { carregando = null; falha(new Error('Não consegui carregar o widget da Pluggy. Verifique a internet.')); };
      document.head.appendChild(s);
    });
  }
  return carregando;
}

const post = async (url, corpo) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(corpo || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Algo deu errado.');
  return j;
};

// Retorna o resumo ({ contas, cartoes, transacoesNovas, ... }) ou null se o usuário fechou o widget
export async function conectarBanco() {
  const { connectToken, incluirSandbox } = await post('/api/open-finance/connect-token');
  await carregarScript();
  const Construtor = window.PluggyConnect.default || window.PluggyConnect;
  const itemId = await new Promise((ok, falha) => {
    let terminou = false;
    new Construtor({
      connectToken,
      includeSandbox: !!incluirSandbox,
      onSuccess: ({ item }) => { terminou = true; ok(item.id); },
      onError: (e) => { terminou = true; falha(new Error(e?.message || 'Erro no widget da Pluggy.')); },
      onClose: () => setTimeout(() => { if (!terminou) ok(null); }, 600),
    }).init();
  });
  if (!itemId) return null;
  return (await post('/api/open-finance/conexoes', { itemId })).resumo;
}

export async function sincronizarTudo() {
  return (await post('/api/open-finance/sincronizar')).resumo;
}

export function textoResumo(r) {
  if (!r) return '';
  const partes = [];
  if (r.contas) partes.push(`${r.contas} conta${r.contas > 1 ? 's' : ''}`);
  if (r.cartoes) partes.push(`${r.cartoes} cartão${r.cartoes > 1 ? 'ões' : ''}`);
  partes.push(`${r.transacoesNovas} transaç${r.transacoesNovas === 1 ? 'ão nova' : 'ões novas'}`);
  if (r.lancamentosNovos) partes.push(`${r.lancamentosNovos} compra${r.lancamentosNovos > 1 ? 's' : ''} no cartão`);
  if (r.investimentos) partes.push(`${r.investimentos} investimento${r.investimentos > 1 ? 's' : ''}`);
  return partes.join(' · ') + (r.avisos?.length ? '. Aviso: ' + r.avisos.join(' ') : '');
}
