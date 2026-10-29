// Categoria, cor e ícone de uma transação para a LinhaTransacao (anotação 53), nas listas que não têm regra própria
// (Início, extrato da conta, extrato do cartão, A revisar). A lista de Transações tem a sua (com chave de agrupamento),
// com as mesmas regras: transferência, guardar/resgatar, estorno e pagamento de fatura ficam em cor neutra (anotação 38).
//   infoTransacao(t, { categorias, receitas }) → { nome, cor, icone, neutra, tipoNeutro }
import { corDespesa } from './coresDespesa.js';
import { corReceita } from './coresReceita.js';

const REGEX_FATURA = /pagamento\s+(de\s+)?fatura|pgto\.?\s+fatura/i;
const REGEX_TRANSF = /transfer[eê]ncia\s+(entre\s+contas|interna|propria|própria)/i;
export const ehReservaMov = (t) => /^reserva_|^transferencia_corretora$/.test(String(t.tipo_mov || ''));

export function infoTransacao(t, { categorias = [], receitas = [] } = {}) {
  const mov = String(t.tipo_mov || '');
  if (ehReservaMov(t)) return { nome: t.rotulo_mov || (t.valor > 0 ? 'Resgate' : 'Guardar'), cor: null, icone: null, neutra: true, tipoNeutro: 'reserva' };
  if (mov.startsWith('transferencia')) return { nome: 'Transferência', cor: null, icone: null, neutra: true, tipoNeutro: 'transf' };
  if (mov) return { nome: 'Estornos', cor: null, icone: null, neutra: true, tipoNeutro: 'transf' };
  if (REGEX_FATURA.test(t.descricao || '')) return { nome: 'Pagamento de fatura', cor: null, icone: null, neutra: true, tipoNeutro: 'fatura' };
  if (REGEX_TRANSF.test(t.descricao || '')) return { nome: 'Transferência', cor: null, icone: null, neutra: true, tipoNeutro: 'transf' };
  if (t.valor < 0) {
    const idx = categorias.findIndex((c) => c.id === t.categoria_id);
    const cat = categorias[idx];
    if (!t.categoria_id) return { nome: 'Sem categoria', cor: null, icone: null };
    return { nome: cat?.nome || t.categoria_nome || 'Sem categoria', cor: cat ? corDespesa(cat, Math.max(idx, 0)) : null, icone: cat?.icone || null };
  }
  const nome = t.categoria_receita;
  if (!nome) return { nome: 'Sem categoria', cor: null, icone: null };
  const inf = receitas.find((c) => c.nome === nome);
  return { nome, cor: corReceita(nome, inf?.cor || null), icone: inf?.icone || null };
}
