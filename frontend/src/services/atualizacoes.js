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

export async function atualizacaoInvestimentos() {
  try {
    const r = await fetch('/api/open-finance/status', { credentials: 'include' });
    if (!r.ok) return '—';
    const itens = ((await r.json()).investimentos || {}).itens || [];
    const datas = itens.map((i) => i.atualizado_em).filter(Boolean).sort();
    return datas.length ? formatar(datas[datas.length - 1].replace(' ', 'T') + (datas[datas.length - 1].includes('Z') ? '' : 'Z')) : '—';
  } catch { return '—'; }
}
