// Cores das categorias de receita — 5 verdes (v2, onda 5). Entradas = verde; azul é só interface.
// A cor escolhida pelo usuário vale; sem escolha, vale a cor padrão da categoria. O degradê é sempre cor -> ~18% mais escura.
// A mesma cor aparece na tela Categorias, na pizza de entradas e no "+" do Dashboard.
export const PALETA_RECEITA = [
  '#17713D',
  '#22A55A',
  '#5BAA3A',
  '#8BBF2E',
  '#63C98A',
];
export const COR_SEM_CATEGORIA = '#4F5D75'; // neutro ("Outros")

// Categorias padrão têm cor fixa; as criadas pelo usuário recebem uma cor estável pelo nome.
const PADRAO = ['Salário', 'Renda extra / freela', 'Benefício', 'Outras entradas', 'Presente', 'Reembolso', 'Rendimentos'];

export function corReceita(nome, escolhida = null) {
  if (escolhida) return escolhida;
  if (nome === 'Sem categoria') return COR_SEM_CATEGORIA;
  const n = PALETA_RECEITA.length;
  const i = PADRAO.indexOf(nome);
  if (i >= 0) return PALETA_RECEITA[i % n];
  let h = 0;
  for (const ch of String(nome || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PALETA_RECEITA[h % n];
}
export function corReceitaAte(cor) {
  return `color-mix(in srgb, ${cor} 82%, black)`;
}
export function degradeReceita(cor) {
  return { de: cor, ate: corReceitaAte(cor) };
}
