// Datas de "última atualização" mostradas em Mais: índices do Bacen (services/bacen.js, do módulo de backup/PWA,
// carregado só se existir) e investimentos conectados. Sempre devolve texto; "—" quando não houver informação.
const formatar = (iso) => {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

// import.meta.glob não falha quando o arquivo não existe (vira objeto vazio) e empacota quando existir.
const MODULOS_BACEN = import.meta.glob('./bacen.js');

export async function atualizacaoBacen() {
  try {
    const carregar = MODULOS_BACEN['./bacen.js'];
    if (!carregar) return '—';
    const m = await carregar();
    const v = typeof m.ultimaAtualizacao === 'function' ? await m.ultimaAtualizacao() : null;
    return formatar(v instanceof Date ? v.toISOString() : v);
  } catch { return '—'; }
}

// Investimentos e metas: data da última movimentação registrada (guardar, resgatar, rendimento). Sem movimentação,
// o rendimento das metas usa o CDI do Bacen: mostra a data dos índices. Nunca depende do Open Finance (versão offline).
export async function atualizacaoInvestimentos() {
  try {
    const r = await fetch('/api/investimentos', { credentials: 'include' });
    if (r.ok) {
      const j = await r.json();
      const v = j && j.atualizado_em;
      if (v) return formatar(String(v).includes('T') || String(v).endsWith('Z') ? v : String(v).replace(' ', 'T') + 'Z');
    }
  } catch { /* segue para o Bacen */ }
  const b = await atualizacaoBacen();
  return b === '—' ? 'nenhuma movimentação ainda' : `rendimentos pelo CDI de ${b}`;
}
