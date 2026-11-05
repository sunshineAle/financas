// Tour por página — Versão 1.0 (plano-versao-final.md, seções 2 e 3; textos aprovados em 29/10, ajustados às telas da 1.0).
// "Como usar …": 3 passos numerados com ícone, Entendi · Pular. Aparece UMA vez, na primeira visita a cada página;
// depois, só pelo Manual › Rever tour. Regra "uma janela por vez": o tour espera enquanto houver outra janela aberta.
// "Já visto" fica no aparelho (localStorage) e vai junto no backup das preferências do aparelho.
import { ref } from 'vue';
import {
  House, Plus, CircleUserRound, CalendarRange, TrendingUp, ListChecks, Landmark, Scale, ChevronDown, ListOrdered, ChartPie,
  Search, Hand, Tags, ChartColumn, Filter, CreditCard, ReceiptText, CalendarClock, ArrowLeftRight, Wallet, ScrollText, Target,
  PiggyBank, Link2, LineChart, Coins, FileUp, ArrowRightLeft, CheckCheck, WandSparkles, CalendarDays, Calculator, Shield, Cloud,
  KeyRound, Sparkles, MoveHorizontal, CircleHelp,
} from 'lucide-vue-next';

export const TOURS = {
  geral: { titulo: 'Como usar o Dagda Capital', passos: [
    { icone: House, titulo: 'O rodapé', texto: 'Início, Patrimônio, Transações, Compromissos e Mais. Tocar de novo no item aceso volta à página principal.' },
    { icone: Plus, titulo: 'O "+"', texto: 'Lance uma entrada, saída ou transferência, crie uma recorrência ou uma regra.' },
    { icone: CircleUserRound, titulo: 'Sua foto', texto: 'Avisos do app e o menu completo: backup, segurança e configurações.' },
  ] },
  inicio: { titulo: 'Como usar o Início', passos: [
    { icone: Wallet, titulo: 'Saldo do mês', texto: 'O que entrou menos o que saiu no seu mês financeiro.' },
    { icone: CalendarRange, titulo: 'Previsão', texto: 'Escolha um mês futuro no filtro para ver o saldo previsto, mantendo as parcelas e o custo de vida.' },
    { icone: Scale, titulo: 'Seus saldos', texto: 'Contas, guardado, faturas e dívidas. As cores do contorno mostram quanto cada um pesa.' },
  ] },
  patrimonio: { titulo: 'Como usar o Patrimônio', passos: [
    { icone: Scale, titulo: 'Patrimônio líquido', texto: 'Tudo o que você tem menos tudo o que deve, hoje.' },
    { icone: ArrowLeftRight, titulo: 'Ativos e Passivos', texto: 'Toque nas abas para alternar. Parcelas futuras ficam em Compromissos.' },
    { icone: ChevronDown, titulo: 'Toque num bloco', texto: 'Ele abre para baixo com o detalhe; "Acessar …" leva à página de contas, metas ou investimentos.' },
  ] },
  transacoes: { titulo: 'Como usar Transações', passos: [
    { icone: ListOrdered, titulo: 'Últimas transações', texto: 'Arraste para a esquerda para editar ou excluir. Segure para selecionar várias e apagar de uma vez.' },
    { icone: ChartPie, titulo: 'Por categoria', texto: 'O gráfico e as categorias mostram para onde foi o dinheiro; toque numa para ver o mês a mês e o limite.' },
    { icone: Search, titulo: 'Ver todas e buscar', texto: '"Ver todas" abre o extrato completo; a lupa busca por nome, categoria ou valor.' },
  ] },
  'transacoes-cat': { titulo: 'Como usar uma categoria', passos: [
    { icone: Tags, titulo: 'Troque de categoria', texto: 'Pelos chips do topo.' },
    { icone: ChartColumn, titulo: 'Mês a mês', texto: 'O gráfico e o limite da categoria; toque em "Definir limite" para mudar.' },
    { icone: Filter, titulo: 'Subcategorias', texto: 'Filtre as transações pela subcategoria.' },
  ] },
  revisar: { titulo: 'Como usar o A revisar', passos: [
    { icone: CircleHelp, titulo: 'O que é', texto: 'O que o app não soube classificar sozinho.' },
    { icone: CheckCheck, titulo: 'Decida', texto: 'Resgate, estorno, duplicidade ou sem categoria.' },
    { icone: WandSparkles, titulo: 'Vire regra', texto: 'Da próxima vez o app faz sozinho.' },
  ] },
  compromissos: { titulo: 'Como usar Compromissos', passos: [
    { icone: ReceiptText, titulo: 'Total a pagar', texto: 'Faturas abertas mais as parcelas de dívidas deste mês.' },
    { icone: CreditCard, titulo: 'Crédito', texto: 'Cartões, cartão de loja e crediário. Toque num para ver a fatura, pagar ou lançar uma compra.' },
    { icone: CalendarClock, titulo: 'Dívidas e Futuros', texto: 'Acordos e empréstimos, e as parcelas dos próximos meses.' },
  ] },
  contas: { titulo: 'Como usar Contas', passos: [
    { icone: Landmark, titulo: 'Suas contas', texto: 'Arraste para ver todas; toque e segure para reordenar.' },
    { icone: Scale, titulo: 'Saldo inicial e Ajustar saldo', texto: 'Deixe o saldo igual ao do banco.' },
    { icone: MoveHorizontal, titulo: 'Extrato', texto: 'Arraste uma transação para editar ou excluir; segure para selecionar várias.' },
  ] },
  objetivos: { titulo: 'Como usar Metas e Investimentos', passos: [
    { icone: Target, titulo: 'Reserva de Liberdade', texto: 'Quanto você já guardou e quanto falta.' },
    { icone: PiggyBank, titulo: 'Guardar e Resgatar', texto: 'Move dinheiro para a meta sem contar como gasto.' },
    { icone: Link2, titulo: 'Caixinha do banco', texto: 'Ligue a meta à caixinha e o app reconhece no extrato. Em Investimentos, cada ativo tem compras, proventos e preço médio.' },
  ] },
  cartoes: { titulo: 'Como usar Cartões', passos: [
    { icone: CreditCard, titulo: 'Seus cartões', texto: 'Arraste para trocar de cartão; a cor e o limite são do cartão.' },
    { icone: ReceiptText, titulo: 'A fatura', texto: 'Veja a fatura, registre o pagamento ou lance uma compra.' },
    { icone: CalendarClock, titulo: 'Parcelas', texto: 'Cada parcela cai na fatura do mês dela.' },
  ] },
  dividas: { titulo: 'Como usar Dívidas', passos: [
    { icone: ScrollText, titulo: 'Suas dívidas', texto: 'Empréstimos, financiamentos, crediários e acordos, com o saldo que falta.' },
    { icone: Coins, titulo: 'Pagamentos e acordos', texto: 'Registre cada parcela paga ou um acordo novo.' },
    { icone: TrendingUp, titulo: 'Plano de quitação', texto: 'Avalanche (juros maiores primeiro) ou bola de neve (menores primeiro).' },
  ] },
  importar: { titulo: 'Como importar', passos: [
    { icone: FileUp, titulo: 'Tipo', texto: 'Extrato de conta ou fatura de cartão.' },
    { icone: ArrowRightLeft, titulo: 'Destino', texto: 'A conta ou o cartão em que as linhas entram.' },
    { icone: CheckCheck, titulo: 'Resultado', texto: 'Confira o total do app com o do arquivo. Dá para desfazer depois.' },
  ] },
  relatorios: { titulo: 'Como usar Relatórios', passos: [
    { icone: CalendarRange, titulo: 'Mês ou Ano', texto: 'Escolha o período no botão do topo.' },
    { icone: LineChart, titulo: 'Relação mensal', texto: 'Toque ou arraste no gráfico para escolher o mês.' },
    { icone: ChartPie, titulo: 'Detalhes', texto: 'Toque numa parte do gráfico para ver o que tem nela.' },
  ] },
  regras: { titulo: 'Como usar Regras', passos: [
    { icone: WandSparkles, titulo: 'Trecho → categoria', texto: 'Ensine o app a categorizar pelo nome que aparece no extrato.' },
    { icone: Hand, titulo: 'Arraste', texto: 'Para a esquerda pausa; para a direita exclui.' },
    { icone: Target, titulo: 'Metas e investimentos', texto: 'Uma regra também pode guardar numa meta ou registrar um aporte.' },
  ] },
  'custos-fixos': { titulo: 'Como usar o Custo de vida', passos: [
    { icone: CalendarDays, titulo: 'Mês financeiro', texto: 'Quando o seu mês começa (no menu, Início do mês).' },
    { icone: Calculator, titulo: 'Custo de vida', texto: 'Fixos e essenciais: o que você gasta todo mês.' },
    { icone: PiggyBank, titulo: 'Quanto guardar', texto: 'A Reserva de Liberdade ideal e o valor por mês.' },
  ] },
  backup: { titulo: 'Como usar Dados e backup', passos: [
    { icone: Shield, titulo: 'Backup', texto: 'Uma cópia dos seus dados, protegida pela sua senha.' },
    { icone: Cloud, titulo: 'Aparelho ou nuvem', texto: 'Guarde o arquivo no aparelho ou no Google Drive, OneDrive ou Dropbox.' },
    { icone: KeyRound, titulo: 'Chave de recuperação', texto: 'Sem ela e sem a senha, ninguém recupera os dados.' },
  ] },
  'o-que-mudou': { titulo: 'O que mudou na Versão 1.0', mudou: true, passos: [
    { icone: House, titulo: 'Rodapé novo', texto: 'Início · Patrimônio · Transações · Compromissos · Mais.' },
    { icone: Scale, titulo: 'Patrimônio', texto: 'Contas, metas e investimentos (e o que você deve) numa página só.' },
    { icone: CreditCard, titulo: 'Compromissos', texto: 'Cartões, dívidas e as parcelas dos próximos meses juntos.' },
    { icone: Sparkles, titulo: 'Dicas e Manual', texto: 'O "?" explica cada parte; o Manual tem o tour de cada página.' },
  ] },
};
export const NOMES_TOUR = {
  geral: 'Visão geral', inicio: 'Início', patrimonio: 'Patrimônio', transacoes: 'Transações', 'transacoes-cat': 'Categoria (em Transações)', revisar: 'A revisar',
  compromissos: 'Compromissos', contas: 'Contas', objetivos: 'Metas e Investimentos', cartoes: 'Cartões', dividas: 'Dívidas', importar: 'Importar',
  relatorios: 'Relatórios', regras: 'Regras', 'custos-fixos': 'Custo de vida', backup: 'Dados e backup', 'o-que-mudou': 'O que mudou na 1.0',
};

const CHAVE = 'sf:tours';
function ler() { try { return { vistos: [], ligado: true, ...(JSON.parse(localStorage.getItem(CHAVE) || '{}')) }; } catch { return { vistos: [], ligado: true }; } }
function gravar(e) { try { localStorage.setItem(CHAVE, JSON.stringify(e)); } catch { /* ignora */ } }
export const tourAberto = ref(null); // chave do tour na tela
export const toursLigados = () => ler().ligado;
export function ligarTours(sim) { const e = ler(); e.ligado = !!sim; gravar(e); }
export const jaVisto = (chave) => ler().vistos.includes(chave);
export function marcarVisto(chave) { const e = ler(); if (!e.vistos.includes(chave)) e.vistos.push(chave); gravar(e); }
export function reverTour(chave) { tourAberto.value = chave; }

// Rota → tour
export function chaveDaRota(r) {
  if (!r || !r.name) return null;
  if (r.name === 'transacoes') return r.query.revisar ? 'revisar' : r.query.cat ? 'transacoes-cat' : 'transacoes';
  if (r.name === 'mais-secao') return r.params.secao === 'dados-backup' ? 'backup' : null;
  const MAPA = { dashboard: 'inicio', patrimonio: 'patrimonio', compromissos: 'compromissos', contas: 'contas', objetivos: 'objetivos', cartoes: 'cartoes', dividas: 'dividas', importar: 'importar', relatorios: 'relatorios', regras: 'regras', 'custos-fixos': 'custos-fixos' };
  return MAPA[r.name] || null;
}

// "Uma janela por vez": há outra janela aberta na tela?
export function temJanelaAberta() {
  return !!document.querySelector('.fundo-modal:not([data-tour-fundo]), .seletor-fundo, .pc-fundo, [data-painel-caixa], .menu-adicionar');
}

// Quem já usava antes da 1.0: viu alguma versão 0.N → mostra "O que mudou" uma vez (no lugar do tour geral).
export function precisaOQueMudou() {
  if (ehContaNova()) return false; // conta criada agora: ela vê o tour geral, não "O que mudou"
  try { const v = localStorage.getItem('sf:novidades-vista'); return !!v && /^0\./.test(v) && !jaVisto('o-que-mudou'); } catch { return false; }
}
// Conta nova (cadastro feito nesta instalação): o tour geral vem antes do tour do Início.
export const ehContaNova = () => { try { return localStorage.getItem('sf:primeiro-cadastro') === 'pendente'; } catch { return false; } };
