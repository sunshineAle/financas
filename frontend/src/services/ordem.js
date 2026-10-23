// Ordem personalizada de listas (Contas e Cartões): salva no aparelho (localStorage) só a lista de ids.
//   const lista = aplicarOrdem('contas', dadosDoServidor);            // aplica a ordem salva (itens novos vão para o fim)
//   contas.value = moverItem('contas', contas.value, de, para);        // move, SALVA e devolve a nova lista
// Chaves em uso: 'contas' | 'cartoes'. Gravação ao vivo no localStorage ('sf:ordem:<chave>'); sem localStorage, ignora.
const CHAVE = (k) => `sf:ordem:${k}`;
const idDe = (x) => String(x && typeof x === 'object' ? x.id : x);

export function lerOrdem(chave) {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE(chave)) || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch { return []; }
}
export function salvarOrdem(chave, lista) {
  try { localStorage.setItem(CHAVE(chave), JSON.stringify(lista.map(idDe))); } catch { /* sem armazenamento: segue sem salvar */ }
}
// Ordena `lista` pela ordem salva; quem não está salvo mantém a ordem original e vai para o fim.
export function aplicarOrdem(chave, lista) {
  const salva = lerOrdem(chave);
  if (!salva.length || !Array.isArray(lista)) return lista;
  const pos = new Map(salva.map((id, i) => [id, i]));
  return lista
    .map((x, i) => ({ x, i, p: pos.has(idDe(x)) ? pos.get(idDe(x)) : Infinity }))
    .sort((a, b) => (a.p === b.p ? a.i - b.i : a.p - b.p))
    .map((o) => o.x);
}
// Move o item `de` para a posição `para`, salva e devolve a nova lista (não altera a original).
export function moverItem(chave, lista, de, para) {
  const nova = lista.slice();
  if (de < 0 || de >= nova.length || para < 0 || para >= nova.length || de === para) return nova;
  nova.splice(para, 0, nova.splice(de, 1)[0]);
  salvarOrdem(chave, nova);
  return nova;
}
