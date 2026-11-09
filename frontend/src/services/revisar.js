// 1.2.2: quantos itens a página A revisar tem (guardar/resgatar pendentes + lançamentos sem categoria).
// Usado pelo menu lateral, pelo card do Início e pela faixa de Transações/Metas.
export async function contarRevisar() {
  const ler = async (url) => {
    try { const r = await fetch(url, { credentials: 'include' }); return r.ok ? await r.json() : null; } catch { return null; }
  };
  const [p, c, t] = await Promise.all([ler('/api/reserva/auto/pendentes'), ler('/api/transacoes/sem-categoria'), ler('/api/transacoes/transferencias-pendentes')]);
  const pend = (p && Array.isArray(p.pendentes)) ? p.pendentes : [];
  const transfers = t?.itens || [];
  const ids = new Set([...pend.map((x) => x.transacao && x.transacao.id), ...transfers.map((x) => x.id)]);
  // guardar/resgatar detectado ainda não tem categoria: conta uma vez só (fica no bloco Guardar e resgatar)
  const semCat = ((c && Array.isArray(c.itens)) ? c.itens : []).filter((i) => !ids.has(i.id));
  return pend.length + semCat.length + transfers.length;
}
