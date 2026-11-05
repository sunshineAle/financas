// Excluir transações (uma ou várias) — extrato da conta e Transações (05/11).
// Tudo o que foi lançado no app (à mão ou importado) pode ser excluído: transferência (sai das DUAS contas), estorno
// (a despesa original volta a contar), saldo inicial, ajuste de saldo e transações ignoradas. O servidor
// (DELETE /api/transacoes/:id) desfaz o par inteiro. Ficam de fora só os Guardar/Resgatar e aportes/resgates de
// investimento, que mexem na meta/no ativo e são apagados por lá.
import { confirmar } from './confirmar.js';

const pedir = (url, opcoes = {}) => fetch(url, { credentials: 'include', ...opcoes });
const mov = (t) => String((t && t.tipo_mov) || '');
export const ehReservaMov = (t) => /^reserva_|^transferencia_corretora$/.test(mov(t));
export const ehTransferenciaMov = (t) => mov(t).startsWith('transferencia') && !ehReservaMov(t);
export const ehEstornoMov = (t) => /^estorn/.test(mov(t));

export function podeExcluirEmLote(t) {
  if (!t) return false;
  if (ehReservaMov(t)) return false;
  if (t.cartao) return t.cartao_origem === 'manual';
  return t.origem === 'manual';
}

// Texto da confirmação conforme o tipo
export function textoExclusao(t) {
  const nome = `"${t.descricao_base || t.descricao}"`;
  if (ehTransferenciaMov(t)) return { titulo: 'Excluir transferência?', texto: `${nome} sai das duas contas, a de origem e a de destino, e os saldos voltam ao que eram.` };
  if (ehEstornoMov(t)) return { titulo: 'Excluir estorno?', texto: `${nome} sai e a despesa original volta a contar nos totais.` };
  if (mov(t) === 'saldo_inicial') return { titulo: 'Excluir saldo inicial?', texto: 'O saldo da conta deixa de ter esse ponto de partida. Você pode lançar outro em Ajustar saldo.' };
  if (mov(t) === 'ajuste_saldo') return { titulo: 'Excluir ajuste de saldo?', texto: 'O saldo da conta volta ao que era antes do ajuste.' };
  if (t.ignorada === 1) return { titulo: 'Excluir transação ignorada?', texto: `${nome} já não contava nos totais; agora sai do extrato.` };
  if (t.cartao && t.total_parcelas > 1) return { titulo: 'Excluir compra?', texto: `${nome} sai com todas as ${t.total_parcelas} parcelas.` };
  return { titulo: 'Excluir transação?', texto: `${nome} sai do extrato e o saldo volta ao que era.` };
}

async function apagar(t) {
  if (t.cartao) {
    if (ehEstornoMov(t) && t.vinculo) return pedir(`/api/transacoes/estorno-cartao/${t.vinculo}`, { method: 'DELETE' });
    return pedir(`/api/cartoes/${t.cartao_id}/lancamentos/${t.compra_id}`, { method: 'DELETE' });
  }
  return pedir(`/api/transacoes/${t.id}`, { method: 'DELETE' });
}

// Uma só, com a confirmação no visual do app. Devolve true se apagou.
export async function excluirComAviso(t) {
  if (!podeExcluirEmLote(t)) return false;
  const { titulo, texto } = textoExclusao(t);
  if (!(await confirmar({ titulo, texto, acao: 'Excluir' }))) return false;
  const r = await apagar(t).catch(() => null);
  if (!r || !r.ok) { const j = r ? await r.json().catch(() => ({})) : {}; throw new Error(j.erro || 'Não foi possível excluir.'); }
  return true;
}

// Várias de uma vez; uma compra parcelada sai inteira e um par (transferência/estorno) só uma vez.
export async function excluirVarias(lista) {
  let ok = 0; let falhas = 0;
  const feitos = new Set();
  for (const t of lista) {
    if (!podeExcluirEmLote(t)) { falhas++; continue; }
    const chave = t.cartao ? `c:${t.cartao_id}:${t.compra_id}` : t.vinculo ? `v:${t.vinculo}` : `t:${t.id}`;
    if (feitos.has(chave)) continue;
    feitos.add(chave);
    const r = await apagar(t).catch(() => null);
    if (r && r.ok) ok++; else falhas++;
  }
  return { ok, falhas };
}
