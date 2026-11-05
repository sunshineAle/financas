// Excluir transações (uma ou várias) — usado pelo extrato da conta e por Transações (05/11: seleção para apagar várias).
// Só entram na exclusão em lote as transações "simples": lançadas à mão ou importadas e as compras de cartão manuais.
// Transferências, estornos, Guardar/Resgatar e pagamentos de fatura têm o seu próprio "Desfazer" no detalhe (mexem em
// duas pontas) e ficam de fora da seleção.
const pedir = (url, opcoes = {}) => fetch(url, { credentials: 'include', ...opcoes });

export function podeExcluirEmLote(t) {
  if (!t) return false;
  if (t.tipo_mov) return false; // transferência, estorno, saldo inicial, ajuste, reserva…
  if (t.cartao) return t.cartao_origem === 'manual';
  return t.origem === 'manual';
}

// Apaga a lista; uma compra parcelada no cartão sai inteira (todas as parcelas) — e só uma vez.
export async function excluirVarias(lista) {
  let ok = 0; let falhas = 0;
  const comprasFeitas = new Set();
  for (const t of lista) {
    if (!podeExcluirEmLote(t)) { falhas++; continue; }
    let r;
    if (t.cartao) {
      const chave = `${t.cartao_id}:${t.compra_id}`;
      if (comprasFeitas.has(chave)) continue;
      comprasFeitas.add(chave);
      r = await pedir(`/api/cartoes/${t.cartao_id}/lancamentos/${t.compra_id}`, { method: 'DELETE' }).catch(() => null);
    } else {
      r = await pedir(`/api/transacoes/${t.id}`, { method: 'DELETE' }).catch(() => null);
    }
    if (r && r.ok) ok++; else falhas++;
  }
  return { ok, falhas };
}
