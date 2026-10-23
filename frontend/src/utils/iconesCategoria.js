// Ícones de categoria (v2). Fonte única: assets/icones-categorias/manifest.json
//   [{ file:'cat-saida-mercado', tipo:'saida'|'entrada', secao, label, busca, outline:'<svg…>', filled:'<svg…>' }]
// Para trocar o conjunto, substitua o manifest.json (mesmo formato) — nenhum código muda.
// O que se grava na categoria é a chave `file` (ex.: 'cat-saida-mercado'). Emojis antigos ainda salvos são traduzidos aqui.
import manifest from '../assets/icones-categorias/manifest.json';

const LISTA_BRUTA = Array.isArray(manifest) ? manifest : (manifest && manifest.icones) || [];

export const normalizarBusca = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Pega só o miolo do <svg> e tira o que não deve rodar (script, eventos, foreignObject).
function interno(svg) {
  const m = String(svg || '').match(/<svg[^>]*>([\s\S]*?)<\/svg>\s*$/i);
  if (!m) return '';
  return m[1].replace(/<(script|foreignObject)[\s\S]*?<\/\1>/gi, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/javascript:/gi, '').trim();
}

export const ICONES_CATEGORIA = LISTA_BRUTA.map((i) => ({
  chave: i.file, tipo: i.tipo, secao: i.secao, label: i.label, busca: i.busca || '',
  outline: interno(i.outline), filled: interno(i.filled || i.outline),
  _label: normalizarBusca(i.label), _busca: normalizarBusca(i.busca), _secao: normalizarBusca(i.secao),
}));
const POR_CHAVE = new Map(ICONES_CATEGORIA.map((i) => [i.chave, i]));

export const GERAL = { saida: 'cat-saida-geral', entrada: 'cat-entrada-geral' };
export const iconeCat = (chave) => POR_CHAVE.get(chave) || null;
export const ehChaveCategoria = (v) => POR_CHAVE.has(String(v || ''));
export const doTipo = (tipo) => ICONES_CATEGORIA.filter((i) => i.tipo === (tipo === 'entrada' || tipo === 'receita' ? 'entrada' : 'saida'));
export const tipoCat = (t) => (t === 'entrada' || t === 'receita' ? 'entrada' : 'saida');

/** Grade agrupada por seção (na ordem do manifest), opcionalmente filtrada por texto (sem acento/maiúscula). */
export function secoesDoTipo(tipo, texto = '') {
  const termos = normalizarBusca(texto).split(' ').filter(Boolean);
  const mapa = new Map();
  for (const i of doTipo(tipo)) {
    if (termos.length && !termos.every((t) => i._label.includes(t) || i._busca.includes(t) || i._secao.includes(t))) continue;
    if (!mapa.has(i.secao)) mapa.set(i.secao, []);
    mapa.get(i.secao).push(i);
  }
  return [...mapa].map(([secao, itens]) => ({ secao, itens }));
}

/** Ícone sugerido para o nome digitado ("Uber" → Uber/táxi, "ração" → Ração, "Netflix" → Cinema/streaming). Sem match = null. */
export function sugerirIcone(nome, tipo = 'saida') {
  const n = normalizarBusca(nome);
  if (n.length < 2) return null;
  const palavras = n.split(' ').filter((p) => p.length >= 2);
  let melhor = null;
  for (const i of doTipo(tipo)) {
    let s = 0;
    const tl = i._label.split(' ').filter(Boolean);
    const tb = i._busca.split(' ').filter(Boolean);
    if (i._label === n) s = 100;
    else if (i._label.startsWith(n)) s = 80;
    else if (n.length >= 4 && i._label.includes(n)) s = 65;
    if (!s) {
      for (const p of palavras) {
        if (tl.includes(p)) s = Math.max(s, 70);
        else if (tb.includes(p)) s = Math.max(s, 55);
        else if (p.length >= 4 && (tl.some((t) => t.length >= 4 && (t.startsWith(p) || p.startsWith(t))) )) s = Math.max(s, 45);
        else if (p.length >= 4 && tb.some((t) => t.length >= 4 && (t.startsWith(p) || p.startsWith(t)))) s = Math.max(s, 35);
      }
      // o nome digitado contém o rótulo inteiro ("Conta de luz" ~ Luz)
      if (!s && i._label.length >= 3 && n.includes(i._label)) s = 50;
    }
    if (s && (!melhor || s > melhor.s || (s === melhor.s && i._label.length < melhor.i._label.length))) melhor = { s, i };
  }
  return melhor && melhor.s >= 35 ? melhor.i : null;
}

// Emojis que o usuário já tem salvos → ícone novo (por tipo).
const LEGADO = {
  saida: {
    '🛒': 'mercado', '🍽': 'restaurante', '🏠': 'aluguel', '🚗': 'manutencao-carro', '⛽': 'combustivel', '💊': 'farmacia', '🎓': 'curso', '🎮': 'jogos',
    '👕': 'roupas', '✈': 'viagem', '🎁': 'presentes', '🐶': 'pets', '📱': 'celular', '💡': 'luz', '🎬': 'cinema-streaming', '💇': 'beleza', '🏋': 'academia',
    '🍺': 'bares', '🧾': 'impostos', '📦': 'geral', '🏷': 'geral', '🩺': 'consulta', '🛍': 'compras-online', '💰': 'geral', '🪙': 'geral',
  },
  entrada: {
    '💼': 'salario', '💻': 'freelance', '💰': 'geral', '💵': 'vendas', '📈': 'rendimentos', '🏦': 'rendimentos', '🤝': 'freelance', '🏠': 'aluguel-recebido',
    '🍽': 'pensao-beneficio', '🎁': 'presente', '↩': 'reembolso', '🛍': 'vendas', '🎓': 'geral', '🧾': 'restituicao-ir', '🪙': 'geral', '📦': 'geral', '🏷': 'geral',
  },
};
// Chaves do catálogo antigo (lucide) → ícone novo.
const CHAVES_ANTIGAS = {
  mercado: 'mercado', restaurante: 'restaurante', moradia: 'aluguel', carro: 'manutencao-carro', combustivel: 'combustivel', farmacia: 'farmacia', saude: 'consulta',
  educacao: 'curso', lazer: 'jogos', vestuario: 'roupas', viagem: 'viagem', presente: 'presentes', pet: 'pets', celular: 'celular', 'contas-casa': 'luz', cinema: 'cinema-streaming',
  beleza: 'beleza', academia: 'academia', bar: 'bares', impostos: 'impostos', compras: 'compras-online', outros: 'geral', 'saida-generica': 'geral',
  salario: 'salario', freela: 'freelance', rendimentos: 'rendimentos', 'outras-entradas': 'geral',
};

/** Qualquer valor salvo (chave nova, emoji antigo, chave antiga) → chave do manifest; null se for logo enviada ou desconhecido. */
export function resolverIconeCategoria(valor, tipo = 'saida') {
  const t = tipoCat(tipo);
  const v = String(valor || '').replace(/️/g, '').trim();
  if (!v) return null;
  if (POR_CHAVE.has(v)) return v;
  const viaEmoji = LEGADO[t][v];
  if (viaEmoji && POR_CHAVE.has(`cat-${t}-${viaEmoji}`)) return `cat-${t}-${viaEmoji}`;
  const viaChave = CHAVES_ANTIGAS[v];
  if (viaChave && POR_CHAVE.has(`cat-${t}-${viaChave}`)) return `cat-${t}-${viaChave}`;
  if (POR_CHAVE.has(`cat-${t}-${v}`)) return `cat-${t}-${v}`;
  return null;
}

/** Sempre devolve uma chave válida do tipo (cai em "Geral"). */
export const chaveFinalCategoria = (valor, tipo = 'saida') => resolverIconeCategoria(valor, tipo) || GERAL[tipoCat(tipo)];
