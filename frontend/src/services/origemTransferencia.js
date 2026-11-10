// Mesma decisão para A revisar e para a conferência manual no detalhe de um lançamento.
export async function carregarOrigem(id) {
  const r = await fetch(`/api/transacoes/${encodeURIComponent(id)}/origem`, { credentials: 'include' });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || 'Não foi possível conferir a origem. Tente novamente.');
  return dados.item || dados;
}
export async function confirmarOrigem(id, decisao) {
  const r = await fetch(`/api/transacoes/${encodeURIComponent(id)}/revisar-transferencia`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(decisao) });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || 'Não foi possível salvar a origem. Tente novamente.');
  return dados;
}
export function linhaDaOrigem(t) {
  return { ...t, conta_nome: t.contaNome || t.conta_nome, conta_icone: t.contaIcone || t.conta_icone, conta_cor: t.contaCor || t.conta_cor, conta_tipo: t.contaTipo || t.conta_tipo, a_revisar: false };
}
export const nomeDaConta = t => t.contaNome || t.conta_nome || 'Conta';
export const dataDaOrigem = texto => {
  const [a, m, d] = String(texto || '').slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : '';
};
