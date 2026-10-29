// Estrutura do menu: UM arquivo só. O rodapé do celular e o menu lateral do PC/web leem daqui,
// então reorganizar (mover uma tela de grupo, trocar nome ou ícone) não mexe em nenhuma tela.
//
// Cada grupo vira um botão do rodapé (Início · Contas · Transações · Cartões · Mais).
// Tocar num grupo inativo abre a última tela usada dele; tocar no grupo já ativo abre o submenu radial
// com as telas (se tiver mais de uma). No "Mais", tocar no ativo volta à tela inicial dele (/mais).
// `centro` = botão central do rodapé; `acoes` = opções de lançamento do botão central (+ ou segurar).
import {
  House, Landmark, ArrowLeftRight, CreditCard, ReceiptText, Target, Ellipsis,
  ChartColumn, Tags, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Heart, FileUp, CalendarClock,
} from 'lucide-vue-next';

export const GRUPOS = [
  {
    id: 'inicio', rotulo: 'Início', icone: House,
    itens: [{ rota: '/', rotulo: 'Início', icone: House }],
  },
  {
    id: 'contas', rotulo: 'Contas', icone: Landmark,
    itens: [
      { rota: '/contas', rotulo: 'Contas', icone: Landmark },
      { rota: '/objetivos', rotulo: 'Objetivos', icone: Target },
    ],
  },
  {
    id: 'transacoes', rotulo: 'Transações', icone: ArrowLeftRight, centro: true,
    itens: [{ rota: '/transacoes', rotulo: 'Transações', icone: ArrowLeftRight }],
  },
  {
    id: 'cartoes', rotulo: 'Cartões', icone: CreditCard,
    itens: [
      { rota: '/cartoes', rotulo: 'Cartões e Crédito', rotuloCurto: 'Cartões', icone: CreditCard },
      { rota: '/dividas', rotulo: 'Dívidas', icone: ReceiptText },
    ],
  },
  {
    id: 'mais', rotulo: 'Mais', icone: Ellipsis,
    // No celular o botão "Mais" abre a tela /mais (lista de configurações), que lista tudo isto; no PC/web são itens do menu lateral.
    rotaCelular: '/mais',
    itens: [
      { rota: '/relatorios', rotulo: 'Relatórios', icone: ChartColumn },
      { rota: '/orcamento', rotulo: 'Categorias', icone: Tags },
      { rota: '/custos-fixos', rotulo: 'Custo de vida', icone: CalendarClock },
      { rota: '/importar', rotulo: 'Importar extrato', rotuloCurto: 'Importar', icone: FileUp },
      // Perfil fica só no rodapé do menu (avatar + nome) e Configurações logo abaixo dele; o Manual fica em Sobre o app.
      { rota: '/apoie', rotulo: 'Apoie o desenvolvedor', rotuloCurto: 'Apoie', icone: Heart },
    ],
  },
];

// Opções do "+" / segurar Transações. A rota já é tratada por Transacoes.vue (?novo=entrada|saida|transferencia).
export const ACOES_LANCAR = [
  { id: 'entrada', rotulo: 'Lançar entrada', icone: ArrowDownLeft, rota: '/transacoes?novo=entrada', tom: 'entrada' },
  { id: 'saida', rotulo: 'Lançar saída', icone: ArrowUpRight, rota: '/transacoes?novo=saida', tom: 'saida' },
  { id: 'transferencia', rotulo: 'Transferência', icone: ArrowRightLeft, rota: '/transacoes?novo=transferencia' },
];

// Rotas que "pertencem" a um grupo mesmo não sendo itens dele (ex.: o extrato abre sobre Cartões).
const EXTRAS = { 'cartao-extrato': 'cartoes', mais: 'mais', regras: 'mais', manual: 'mais' };

export function grupoDaRota(rota) {
  if (rota.name && EXTRAS[rota.name]) return EXTRAS[rota.name];
  if (rota.name === 'mais-secao') return 'mais'; // /mais/<seção> (Perfil e configurações)
  for (const g of GRUPOS) {
    for (const i of g.itens) {
      if (i.rota === '/' ? rota.path === '/' : rota.path === i.rota || rota.path.startsWith(i.rota + '/')) return g.id;
    }
  }
  return null;
}

// Telas internas do "Mais" (todas menos a inicial /mais): ganham o botão Voltar no celular.
export function ehTelaInternaDoMais(rota) {
  return grupoDaRota(rota) === 'mais' && rota.path !== '/mais';
}

// Grupo com submenu (mais de uma tela e sem tela própria de lista): ganha o sinal discreto no rodapé.
export const temSubmenu = (g) => g.itens.length > 1 && !g.rotaCelular;

// Item do grupo que corresponde à rota atual (o rodapé mostra o ícone/nome DELE no botão do grupo).
export function itemDaRota(g, rota) {
  return g.itens.find((i) => (i.rota === '/' ? rota.path === '/' : rota.path === i.rota || rota.path.startsWith(i.rota + '/')))
    || (rota.name === 'cartao-extrato' ? g.itens.find((i) => i.rota === '/cartoes') : null)
    || g.itens[0];
}

// Telas que mostram o TopoApp (foto do perfil à esquerda → Mais; sino de avisos à direita). O AppLayout o coloca.
export const ROTAS_COM_TOPO = ['dashboard', 'contas', 'objetivos', 'transacoes', 'cartoes', 'dividas'];
