// PONTO ÚNICO de ícones do sistema.
//
// Catálogo { chave -> componente lucide-vue-next + metadados } e tradução dos emojis legados
// (os que o usuário já escolheu e estão salvos no banco) para chaves. As telas NUNCA importam
// lucide direto para ícones "de significado" (categoria, meta, status, navegação): usam
//   <Icone nome="mercado" />  ou  <IconeCategoria valor="🛒" tipo="saida" />
// Quando o designer entregar o set próprio, basta soltar os SVGs em src/assets/icones/
// (ver README.md ali): eles têm prioridade sobre o lucide, sem tocar em tela nenhuma.
//
// Convenções: chaves em minúsculas, sem acento, com hífen. Grupos: navegacao, acao, status,
// saida, entrada, conta, meta, investimento, geral.
import {
  LayoutDashboard, Landmark, ArrowLeftRight, CreditCard, ReceiptText, Receipt, NotebookText, Target, Ellipsis, ChartColumn, Tags, Tag,
  SlidersHorizontal, UserRound, Plus, Pencil, Trash2, RefreshCw, Download, Upload, Filter, Search, X, Check, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Undo2, Copy, Share2, Eye, EyeOff, EllipsisVertical, Link2, Plug, LogOut, Sun, Moon, SunMoon, Archive, Calendar,
  CalendarClock, List, Layers, GalleryHorizontal, ArrowDownLeft, ArrowUpRight, ArrowDown, ArrowUp, HandCoins, Bell, Zap, ZapOff,
  CircleCheck, TriangleAlert, CircleAlert, CircleX, Info, Clock, Lock, LockOpen, Repeat, Layers2, ShieldCheck, Infinity as InfinityIcon,
  ShoppingCart, ShoppingBag, UtensilsCrossed, House, Car, Bus, Fuel, Pill, HeartPulse, Stethoscope, GraduationCap, Gamepad2, Shirt, Plane,
  Gift, PawPrint, Smartphone, Lightbulb, Clapperboard, Scissors, Dumbbell, Beer, Package, Wifi, Wrench, Baby, Bike, Truck, Coffee,
  Briefcase, Laptop, Banknote, Coins, TrendingUp, Handshake, Store, Key, Tractor, ChartCandlestick,
  Wallet, PiggyBank, Circle, Vault, Gem, TreePalm, Tent, Star, Heart, Mountain, Sprout, Rocket, Flag,
  Building2, Scale, Globe, Bitcoin, Medal, ChartPie, ChartLine, Factory, Droplets, Umbrella, ScrollText, FileText, Percent,
  CircleDollarSign, Hourglass, CircleHelp, Sparkles,
} from 'lucide-vue-next';

// i(componente, grupo, rotulo, { legado: [emojis], linha: true })
//  linha = ícone de traço aberto (setas, +, ✓...): não tem versão "preenchida" (usa só mais traço).
const i = (c, grupo, rotulo, extra = {}) => ({ c, grupo, rotulo, legado: [], linha: false, ...extra });

export const CATALOGO = {
  // ---------- Navegação ----------
  inicio: i(LayoutDashboard, 'navegacao', 'Início'),
  contas: i(Landmark, 'navegacao', 'Contas'),
  transacoes: i(NotebookText, 'navegacao', 'Transações'), // ≠ transferir (ArrowLeftRight): ver "Revisão dos ícones piloto"
  cartoes: i(CreditCard, 'navegacao', 'Cartões e Crédito'),
  dividas: i(ReceiptText, 'navegacao', 'Dívidas'),
  objetivos: i(Target, 'navegacao', 'Objetivos'),
  relatorios: i(ChartColumn, 'navegacao', 'Relatórios'),
  categorias: i(Tags, 'navegacao', 'Categorias'),
  configuracoes: i(SlidersHorizontal, 'navegacao', 'Dados e conexões'),
  perfil: i(UserRound, 'navegacao', 'Perfil'),
  mais: i(Ellipsis, 'navegacao', 'Mais', { linha: true }),
  investimentos: i(TrendingUp, 'navegacao', 'Investimentos', { linha: true }),
  reserva: i(ShieldCheck, 'navegacao', 'Reserva de Liberdade', { legado: ['🛡️'] }),

  // ---------- Ações ----------
  adicionar: i(Plus, 'acao', 'Adicionar', { linha: true }),
  editar: i(Pencil, 'acao', 'Editar', { linha: true }),
  excluir: i(Trash2, 'acao', 'Excluir'),
  atualizar: i(RefreshCw, 'acao', 'Atualizar / sincronizar', { linha: true }),
  baixar: i(Download, 'acao', 'Baixar / exportar', { linha: true }),
  enviar: i(Upload, 'acao', 'Enviar / importar', { linha: true }),
  filtrar: i(Filter, 'acao', 'Filtrar'),
  buscar: i(Search, 'acao', 'Buscar', { linha: true }),
  fechar: i(X, 'acao', 'Fechar', { linha: true, legado: ['✕', '✖️'] }),
  confirmar: i(Check, 'acao', 'Confirmar', { linha: true, legado: ['✓', '✔️'] }),
  voltar: i(ChevronLeft, 'acao', 'Voltar', { linha: true }),
  avancar: i(ChevronRight, 'acao', 'Avançar', { linha: true }),
  expandir: i(ChevronDown, 'acao', 'Expandir', { linha: true }),
  recolher: i(ChevronUp, 'acao', 'Recolher', { linha: true }),
  desfazer: i(Undo2, 'acao', 'Desfazer / estornar', { linha: true, legado: ['↩️'] }),
  copiar: i(Copy, 'acao', 'Copiar'),
  compartilhar: i(Share2, 'acao', 'Compartilhar'),
  ver: i(Eye, 'acao', 'Mostrar'),
  ocultar: i(EyeOff, 'acao', 'Ocultar'),
  menu: i(EllipsisVertical, 'acao', 'Menu ⋮', { linha: true }),
  vincular: i(Link2, 'acao', 'Vincular', { linha: true }),
  conectar: i(Plug, 'acao', 'Conectar'),
  sair: i(LogOut, 'acao', 'Sair', { linha: true }),
  'tema-claro': i(Sun, 'acao', 'Tema claro'),
  'tema-escuro': i(Moon, 'acao', 'Tema escuro'),
  'tema-auto': i(SunMoon, 'acao', 'Tema automático'),
  transferir: i(ArrowLeftRight, 'acao', 'Transferir', { linha: true }),
  pagar: i(ArrowUpRight, 'acao', 'Pagar', { linha: true }),
  receber: i(ArrowDownLeft, 'acao', 'Receber', { linha: true }),
  'seta-baixo': i(ArrowDown, 'acao', 'Entrada (seta para baixo)', { linha: true }),
  'seta-cima': i(ArrowUp, 'acao', 'Saída (seta para cima)', { linha: true }),
  arquivar: i(Archive, 'acao', 'Arquivar'),
  calendario: i(Calendar, 'acao', 'Calendário'),
  lista: i(List, 'acao', 'Lista'),
  empilhar: i(Layers, 'acao', 'Visão empilhada'),
  carrossel: i(GalleryHorizontal, 'acao', 'Carrossel'),
  notificacao: i(Bell, 'acao', 'Avisos'),
  animacao: i(Zap, 'acao', 'Animações ligadas'),
  'sem-animacao': i(ZapOff, 'acao', 'Animações desligadas'),

  // ---------- Status ----------
  ok: i(CircleCheck, 'status', 'Tudo certo / pago', { legado: ['✅'] }),
  alerta: i(TriangleAlert, 'status', 'Atenção', { legado: ['⚠️'] }),
  erro: i(CircleX, 'status', 'Erro'),
  info: i(Info, 'status', 'Informação', { legado: ['ℹ️'] }),
  pendente: i(Clock, 'status', 'Pendente'),
  atrasado: i(CircleAlert, 'status', 'Atrasado / vencido'),
  'fatura-aberta': i(LockOpen, 'status', 'Fatura aberta'),       // cadeado ABERTO (revisão dos ícones piloto)
  'fatura-fechada': i(Lock, 'status', 'Fatura fechada'),
  'fatura-paga': i(CircleCheck, 'status', 'Fatura paga'),
  'fatura-futura': i(CalendarClock, 'status', 'Fatura futura'),
  parcelado: i(Layers2, 'status', 'Parcelado'),
  recorrente: i(Repeat, 'status', 'Recorrente', { linha: true }),
  'sem-limite': i(InfinityIcon, 'status', 'Sem limite', { linha: true }),
  protegido: i(ShieldCheck, 'status', 'Protegido'),
  prazo: i(Hourglass, 'status', 'Prazo'),

  // ---------- Categorias de saída ----------
  mercado: i(ShoppingCart, 'saida', 'Mercado', { legado: ['🛒'] }),
  restaurante: i(UtensilsCrossed, 'saida', 'Restaurante / alimentação', { legado: ['🍽️', '🍽'] }),
  moradia: i(House, 'saida', 'Moradia', { legado: ['🏠'] }),
  carro: i(Car, 'saida', 'Carro', { legado: ['🚗'] }),
  transporte: i(Bus, 'saida', 'Transporte'),
  combustivel: i(Fuel, 'saida', 'Combustível', { legado: ['⛽'] }),
  farmacia: i(Pill, 'saida', 'Farmácia', { legado: ['💊'] }),
  saude: i(HeartPulse, 'saida', 'Saúde', { legado: ['🩺'] }),
  educacao: i(GraduationCap, 'saida', 'Educação', { legado: ['🎓'] }),
  lazer: i(Gamepad2, 'saida', 'Lazer / jogos', { legado: ['🎮'] }),
  vestuario: i(Shirt, 'saida', 'Vestuário', { legado: ['👕'] }),
  viagem: i(Plane, 'saida', 'Viagem', { legado: ['✈️', '✈'] }),
  presente: i(Gift, 'saida', 'Presente', { legado: ['🎁'] }),
  pet: i(PawPrint, 'saida', 'Pet', { legado: ['🐶'] }),
  celular: i(Smartphone, 'saida', 'Celular / telefone', { legado: ['📱'] }),
  'contas-casa': i(Lightbulb, 'saida', 'Luz, água e contas da casa', { legado: ['💡'] }),
  cinema: i(Clapperboard, 'saida', 'Cinema / streaming', { legado: ['🎬'] }),
  beleza: i(Scissors, 'saida', 'Beleza / cabeleireiro', { legado: ['💇'] }),
  academia: i(Dumbbell, 'saida', 'Academia', { legado: ['🏋️', '🏋'] }),
  bar: i(Beer, 'saida', 'Bar / bebidas', { legado: ['🍺'] }),
  impostos: i(Receipt, 'saida', 'Impostos e taxas', { legado: ['🧾'] }),
  compras: i(ShoppingBag, 'saida', 'Compras', { legado: ['🛍️', '🛍'] }),
  outros: i(Package, 'saida', 'Outros', { legado: ['📦'] }),
  internet: i(Wifi, 'saida', 'Internet'),
  manutencao: i(Wrench, 'saida', 'Manutenção'),
  filhos: i(Baby, 'saida', 'Filhos'),
  esporte: i(Bike, 'saida', 'Esporte'),
  entrega: i(Truck, 'saida', 'Entrega / frete'),
  cafe: i(Coffee, 'saida', 'Café / padaria'),
  'saida-generica': i(Tag, 'saida', 'Categoria (padrão)', { legado: ['🏷️', '🏷'] }),

  // ---------- Categorias de entrada ----------
  salario: i(Briefcase, 'entrada', 'Salário', { legado: ['💼'] }),
  freela: i(Laptop, 'entrada', 'Renda extra / freela', { legado: ['💻'] }),
  beneficio: i(UtensilsCrossed, 'entrada', 'Benefício (VR/VA)'),
  rendimentos: i(TrendingUp, 'entrada', 'Rendimentos', { legado: ['📈'], linha: true }),
  reembolso: i(Undo2, 'entrada', 'Reembolso', { linha: true }),
  'presente-recebido': i(Gift, 'entrada', 'Presente recebido'),
  dinheiro: i(Banknote, 'entrada', 'Dinheiro', { legado: ['💵'] }),
  parceria: i(Handshake, 'entrada', 'Parceria / serviço', { legado: ['🤝'] }),
  aluguel: i(Key, 'entrada', 'Aluguel recebido'),
  vendas: i(Store, 'entrada', 'Vendas'),
  'outras-entradas': i(Coins, 'entrada', 'Outras entradas', { legado: ['🪙', '💰'] }),
  'entrada-generica': i(CircleDollarSign, 'entrada', 'Entrada (padrão)'),

  // ---------- Contas e cartões ----------
  banco: i(Landmark, 'conta', 'Banco / conta', { legado: ['🏦'] }),
  cartao: i(CreditCard, 'conta', 'Cartão', { legado: ['💳'] }),
  carteira: i(Wallet, 'conta', 'Carteira', { legado: ['👛'] }),
  'caixa-eletronico': i(Vault, 'conta', 'Saque / caixa', { legado: ['🏧'] }),
  porquinho: i(PiggyBank, 'conta', 'Poupança / porquinho', { legado: ['🐷'] }),
  'ponto-roxo': i(Circle, 'conta', 'Marcador roxo', { legado: ['🟣'], cor: 'var(--meta-roxo-medio)', solido: true }),
  'ponto-laranja': i(Circle, 'conta', 'Marcador laranja', { legado: ['🟠'], cor: 'var(--saida-laranja-medio)', solido: true }),
  'ponto-amarelo': i(Circle, 'conta', 'Marcador amarelo', { legado: ['🟡'], cor: 'var(--saida-ambar-medio)', solido: true }),
  'ponto-azul': i(Circle, 'conta', 'Marcador azul', { legado: ['🔵'], cor: 'var(--entrada-azul-medio)', solido: true }),
  'ponto-verde': i(Circle, 'conta', 'Marcador verde', { legado: ['🟢'], cor: 'var(--investimento-folha-medio)', solido: true }),

  // ---------- Metas ----------
  alvo: i(Target, 'meta', 'Alvo / objetivo', { legado: ['🎯'] }),
  'meta-reserva': i(ShieldCheck, 'meta', 'Reserva de Liberdade'),
  ferias: i(TreePalm, 'meta', 'Férias', { legado: ['🏖️', '🏖', '🌴'] }),
  casamento: i(Gem, 'meta', 'Casamento', { legado: ['💍'] }),
  estrela: i(Star, 'meta', 'Sonho', { legado: ['🌟', '⭐'] }),
  coracao: i(Heart, 'meta', 'Família / coração'),
  aventura: i(Mountain, 'meta', 'Aventura'),
  futuro: i(Rocket, 'meta', 'Projeto / futuro'),
  conquista: i(Flag, 'meta', 'Conquista'),
  'meta-pets': i(PawPrint, 'meta', 'Pets', { legado: ['🐶', '🐾', '🐕'] }),
  acampar: i(Tent, 'meta', 'Aventura / acampar'),

  // ---------- Tipos de investimento (chave = tipo do backend, com prefixo inv-) ----------
  'inv-cdb': i(Landmark, 'investimento', 'CDB'),
  'inv-cdi': i(Percent, 'investimento', 'CDI / Renda fixa', { linha: true }),
  'inv-lci': i(House, 'investimento', 'LCI'),
  'inv-lca': i(Sprout, 'investimento', 'LCA'),
  'inv-tesouro': i(ScrollText, 'investimento', 'Tesouro Direto'),
  'inv-poupanca': i(PiggyBank, 'investimento', 'Poupança / Porquinho'),
  'inv-debentures': i(Factory, 'investimento', 'Debêntures'),
  'inv-cri_cra': i(FileText, 'investimento', 'CRI / CRA'),
  'inv-coe': i(Scale, 'investimento', 'COE'),
  'inv-previdencia': i(Umbrella, 'investimento', 'Previdência privada'),
  'inv-fundo': i(ChartPie, 'investimento', 'Fundos de investimento'),
  'inv-fii': i(Building2, 'investimento', 'Fundos imobiliários (FIIs)'),
  'inv-fiagro': i(Tractor, 'investimento', 'Fiagro'),
  'inv-etf': i(ChartLine, 'investimento', 'ETFs', { linha: true }),
  'inv-bdr': i(Globe, 'investimento', 'BDRs'),
  'inv-acoes': i(ChartCandlestick, 'investimento', 'Ações'),
  'inv-cripto': i(Bitcoin, 'investimento', 'Criptomoedas'),
  'inv-ouro': i(Medal, 'investimento', 'Ouro'),

  // ---------- Genérico (fallback) ----------
  generico: i(CircleHelp, 'geral', 'Ícone desconhecido'),
  destaque: i(Sparkles, 'geral', 'Destaque'),
};

export const GRUPOS_ICONES = ['navegacao', 'acao', 'status', 'saida', 'entrada', 'conta', 'meta', 'investimento', 'geral'];

// ---------- Emojis legados -> chave ----------
// Gerado a partir dos `legado` do catálogo (um emoji -> uma chave). Ambiguidades por contexto
// (o mesmo emoji vale coisas diferentes numa categoria de entrada, saída ou meta) ficam abaixo.
const strip = (e) => String(e || '').replace(/\uFE0F/g, '').trim();
export const LEGADO = {};
for (const [chave, d] of Object.entries(CATALOGO)) for (const e of d.legado) if (!(strip(e) in LEGADO)) LEGADO[strip(e)] = chave;

// Sobrescritas por contexto (tipo da categoria/lista onde o emoji aparece)
export const LEGADO_POR_TIPO = {
  entrada: { '🍽': 'beneficio', '🏠': 'aluguel', '🎁': 'presente-recebido', '💰': 'outras-entradas', '🏦': 'banco', '🎓': 'educacao', '🧾': 'impostos', '📦': 'outros', '🛍': 'vendas' },
  saida: { '💰': 'outras-entradas' },
  // Metas: um ícone DIFERENTE por emoji que o backend aceita (🏖 e 🌴 eram o mesmo coqueiro; ✈ fica como viagem)
  meta: { '🏖': 'acampar', '🌴': 'ferias', '✈': 'viagem', '🐶': 'meta-pets', '🛡': 'meta-reserva', '🚗': 'carro', '🏠': 'moradia', '🎓': 'educacao', '🩺': 'saude', '🎁': 'presente', '💼': 'salario', '📱': 'celular', '🐷': 'porquinho', '💰': 'dinheiro' },
};

// Emojis padrão por contexto (o que o sistema grava quando o usuário não escolhe)
export const PADRAO_POR_TIPO = { saida: 'saida-generica', entrada: 'entrada-generica', conta: 'banco', meta: 'alvo', investimento: 'inv-fundo' };

// Sugestões que os seletores de ícone (SeletorIcone) podem oferecer no lugar dos emojis
export const ESCOLHAS = {
  saida: ['mercado', 'restaurante', 'moradia', 'carro', 'combustivel', 'farmacia', 'educacao', 'lazer', 'vestuario', 'viagem', 'presente', 'pet', 'celular', 'contas-casa', 'cinema', 'beleza', 'academia', 'bar', 'impostos', 'outros', 'saude', 'transporte', 'internet', 'compras'],
  entrada: ['salario', 'freela', 'dinheiro', 'rendimentos', 'parceria', 'beneficio', 'aluguel', 'reembolso', 'presente-recebido', 'vendas', 'outras-entradas'],
  conta: ['banco', 'cartao', 'dinheiro', 'outras-entradas', 'caixa-eletronico', 'carteira', 'porquinho', 'ponto-roxo', 'ponto-laranja', 'ponto-amarelo', 'ponto-azul', 'ponto-verde'],
  meta: ['meta-reserva', 'ferias', 'viagem', 'acampar', 'carro', 'moradia', 'educacao', 'casamento', 'saude', 'meta-pets', 'presente', 'salario', 'celular', 'porquinho', 'dinheiro', 'alvo', 'estrela'],
};

// ---------- Resolução ----------
const ehImagem = (v) => String(v || '').startsWith('data:image/');
const ehEmoji = (v) => /\p{Extended_Pictographic}/u.test(String(v || ''));

/** Devolve a chave do catálogo para uma chave nova OU um emoji legado; null se não conhecer. */
export function resolverChave(valor, tipo) {
  const v = String(valor || '').trim();
  if (!v || ehImagem(v)) return null;
  if (CATALOGO[v]) return v;
  const e = strip(v);
  return (tipo && LEGADO_POR_TIPO[tipo]?.[e]) || LEGADO[e] || null;
}

/** Chave -> definição do catálogo (ou do fallback `generico`). */
export function definicao(chave) {
  return CATALOGO[chave] || CATALOGO.generico;
}

/** Chave de um tipo de investimento do backend ('cri_cra' -> 'inv-cri_cra'). */
export const chaveInvestimento = (tipo) => (CATALOGO['inv-' + tipo] ? 'inv-' + tipo : 'generico');

export { ehImagem, ehEmoji };

// ---------- Cores por família (para o quadrado do IconeCategoria) ----------
// Saída = paleta quente; entrada = azuis; meta = roxos; investimento = verdes. Sempre tokens.
const FAMILIA = {
  saida: ['carmim', 'vermelho', 'brasa', 'coral', 'tangerina', 'laranja', 'abobora', 'ambar'].map((n) => `var(--saida-${n}-medio)`),
  entrada: ['ceruleo', 'oceano', 'ceu', 'aco', 'azul', 'royal', 'cobalto', 'safira'].map((n) => `var(--entrada-${n}-medio)`),
  meta: ['indigo', 'violeta', 'roxo', 'purpura', 'ametista', 'orquidea', 'ameixa', 'uva-rose'].map((n) => `var(--meta-${n}-medio)`),
  investimento: ['anis', 'lima', 'pistache', 'folha', 'esmeralda', 'menta', 'jade', 'verde-agua'].map((n) => `var(--investimento-${n}-medio)`),
};
FAMILIA.conta = FAMILIA.entrada;

/** Cor estável (mesma chave = mesma cor) dentro da família do tipo. */
export function corDaChave(chave, tipo = 'saida') {
  const def = CATALOGO[chave];
  if (def?.cor) return def.cor;
  const lista = FAMILIA[tipo] || FAMILIA.saida;
  let h = 0;
  for (const ch of String(chave || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return lista[h % lista.length];
}
