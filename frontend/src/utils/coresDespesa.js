// Cores das categorias de despesa — paleta categórica v2 (12 tons, onda 5). O vermelho puro (#D5211A) NÃO entra aqui:
// é reservado a alerta grave (--cor-alerta). Cada categoria tem um degradê próprio (cor -> tom ~18% mais escuro),
// nenhuma barra/fatia termina "seca". A cor escolhida pelo usuário vale; sem escolha vale a do nome padrão ou, por fim, a ordem.
export const CATEGORICA_DESPESA = [
  { nome: 'Moradia', de: '#CE2239', ate: '#A91C2F' },
  { nome: 'Mercado', de: '#E8641B', ate: '#BE5216' },
  { nome: 'Transporte', de: '#DFA511', ate: '#B7870E' },
  { nome: 'Saúde', de: '#C2307A', ate: '#9F2764' },
  { nome: 'Educação', de: '#557A9E', ate: '#466482' },
  { nome: 'Lazer', de: '#E9867A', ate: '#BF6E64' },
  { nome: 'Restaurantes', de: '#A4502F', ate: '#864227' },
  { nome: 'Assinaturas', de: '#8E7CC3', ate: '#7466A0' },
  { nome: 'Vestuário', de: '#3A9AD9', ate: '#307EB2' },
  { nome: 'Pets', de: '#8C8A1E', ate: '#737119' },
  { nome: 'Presentes', de: '#B59A6A', ate: '#947E57' },
  { nome: 'Outros', de: '#4F5D75', ate: '#414C60' },
];
// 12 tons-base na ordem oficial (mantém o nome antigo exportado)
export const PALETA_DESPESA = CATEGORICA_DESPESA.map((c) => c.de);

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const POR_NOME = new Map(CATEGORICA_DESPESA.map((c, i) => [norm(c.nome), i]));

export function corDespesa(categoria, indice = 0) {
  if (categoria && categoria.cor) return categoria.cor;
  const i = categoria && categoria.nome ? POR_NOME.get(norm(categoria.nome)) : undefined;
  if (i !== undefined) return PALETA_DESPESA[i];
  return PALETA_DESPESA[Math.max(0, indice) % PALETA_DESPESA.length];
}

// Tom final do degradê de uma cor (par oficial se for uma das 12; senão ~18% mais escuro)
export function corDespesaAte(cor) {
  const i = PALETA_DESPESA.findIndex((c) => c.toLowerCase() === String(cor).toLowerCase());
  return i >= 0 ? CATEGORICA_DESPESA[i].ate : `color-mix(in srgb, ${cor} 82%, black)`;
}
// { de, ate } pronto para BarraDegrade / SVG
export function degradeDespesa(cor) {
  return { de: cor, ate: corDespesaAte(cor) };
}
