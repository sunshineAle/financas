// Catálogo de instituições (bancos, bandeiras, vouchers, lojas, corretoras...) com logos locais
// exportados do Figma (src/assets/bancos/<slug>/{logo,icone,icone-fundo}.svg). Funciona offline.
import { DADOS_BANCOS } from './dadosBancos.js';

const ARQUIVOS = import.meta.glob('../assets/bancos/*/*.svg', { eager: true, query: '?url', import: 'default' });

// Normaliza: minúsculas, sem acentos, sem pontuação, sem palavras genéricas
const RUIDO = /\b(s\/?a|sa|ltda|me|epp|banco|bank|instituicao de pagamento|instituicao financeira|ip|scfi|scd|sep|cooperativa|de|do|da|dos|das|e)\b/g;
export function normalizar(texto, tirarRuido = false) {
  let t = String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[._\-/&+]+/g, ' ').replace(/[^a-z0-9 ]+/g, ' ');
  if (tirarRuido) t = t.replace(RUIDO, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

export const BANCOS = DADOS_BANCOS.map(([slug, nome, categoria, cor, codigoCompe, apelidos, iconeEscuro, monograma]) => {
  const arq = (k) => ARQUIVOS[`../assets/bancos/${slug}/${k}.svg`] || null;
  return {
    slug, nome, categoria, cor, codigoCompe, apelidos, iconeEscuro: !!iconeEscuro, monograma: !!monograma,
    arquivos: { logo: arq('logo'), icone: arq('icone'), iconeFundo: arq('icone-fundo') },
  };
});

const porSlug = new Map(BANCOS.map((b) => [b.slug, b]));
const porCodigo = new Map();
for (const b of BANCOS) if (b.codigoCompe && !porCodigo.has(b.codigoCompe)) porCodigo.set(b.codigoCompe, b);

// Índice: chave normalizada -> banco (nome, slug, apelidos)
const exatos = new Map();
const chaves = []; // [chave, banco] para busca por "contém"
function indexar(chave, b) {
  const k = normalizar(chave);
  if (!k) return;
  if (!exatos.has(k)) exatos.set(k, b);
  const kr = normalizar(chave, true);
  if (kr && !exatos.has(kr)) exatos.set(kr, b);
  if (k.length >= 4) chaves.push([k, b]);
}
// apelidos explícitos têm prioridade sobre nomes genéricos
for (const b of BANCOS) for (const a of b.apelidos) indexar(a, b);
for (const b of BANCOS) { indexar(b.nome, b); indexar(b.slug, b); }
// palavras comuns demais para reconhecer por "contém" ("gasto extra"): só valem como nome inteiro
const SO_EXATO = new Set(['extra']);
for (let i = chaves.length - 1; i >= 0; i--) if (SO_EXATO.has(chaves[i][0])) chaves.splice(i, 1);
chaves.sort((a, b) => b[0].length - a[0].length);

export function bancoPorSlug(slug) { return porSlug.get(slug) || null; }

// Reconhece um banco a partir de texto livre ou {nome, codigo}. Devolve o item do catálogo ou null.
export function reconhecerBanco(entrada) {
  const nome = typeof entrada === 'object' && entrada ? entrada.nome : entrada;
  const codigo = typeof entrada === 'object' && entrada ? entrada.codigo : null;
  if (codigo != null && codigo !== '') {
    const c = String(codigo).replace(/\D/g, '').padStart(3, '0');
    if (porCodigo.has(c)) return porCodigo.get(c);
  }
  const k = normalizar(nome);
  if (!k) return null;
  const kr = normalizar(nome, true);
  if (exatos.has(k)) return exatos.get(k);
  if (kr && exatos.has(kr)) return exatos.get(kr);
  // texto contém a chave como palavra inteira (ex.: "Cartão Nubank Ultravioleta", "Conta Itaú PJ")
  const alvo = ` ${k} `;
  for (const [chave, b] of chaves) if (alvo.includes(` ${chave} `)) return b;
  // chaves curtas (bb, c6, vr, xp, bv...) só quando a palavra aparece inteira
  for (const [chave, b] of exatos) if (chave.length < 4 && chave.length >= 2 && alvo.includes(` ${chave} `)) return b;
  return null;
}

export function listarBancos(categoria) {
  return categoria ? BANCOS.filter((b) => b.categoria === categoria) : BANCOS;
}

// Reconhece banco, loja, bandeira ou voucher pelo nome/apelido digitado ("Cartão Magalu", "Lojas Renner",
// "Mercado Pago"...). Devolve { slug, nome, cor, categoria, monograma, banco } ou null.
// `cor` é a cor da marca; `monograma` = true quando o ícone é um monograma próprio (sem logo oficial).
export function reconhecerInstituicao(nome) {
  const b = reconhecerBanco(nome);
  return b ? { slug: b.slug, nome: b.nome, cor: b.cor, categoria: b.categoria, monograma: b.monograma, banco: b } : null;
}

// Busca para o campo "Instituição": por nome, apelido ou código (COMPE). Ordena por relevância.
// `categorias` (opcional) limita as categorias do catálogo. Devolve até `limite` itens.
export function buscarBancos(texto, limite = 6, categorias = null) {
  const q = normalizar(texto);
  const qr = normalizar(texto, true);
  const num = String(texto || '').trim();
  if (!q && !/^\d{1,3}$/.test(num)) return [];
  const pontos = new Map();
  for (const b of BANCOS) {
    if (categorias && !categorias.includes(b.categoria)) continue;
    let p = 0;
    if (/^\d{1,3}$/.test(num) && b.codigoCompe && b.codigoCompe === num.padStart(3, '0')) p = 100;
    const nomes = [normalizar(b.nome), b.slug.replace(/-/g, ' '), ...b.apelidos.map((a) => normalizar(a))];
    const nr = normalizar(b.nome, true);
    for (const n of nomes) {
      if (!q) break;
      if (n === q) p = Math.max(p, 90);
      else if (n.startsWith(q)) p = Math.max(p, 70);
      else if (n.split(' ').some((w) => w.startsWith(q))) p = Math.max(p, 50);
      else if (q.length >= 3 && n.includes(q)) p = Math.max(p, 30);
    }
    if (qr && qr !== q && (nr === qr || nr.startsWith(qr))) p = Math.max(p, 60);
    if (p) pontos.set(b, p + (b.categoria === 'banco' ? 1 : 0));
  }
  return [...pontos.entries()].sort((a, b) => b[1] - a[1] || a[0].nome.localeCompare(b[0].nome, 'pt-BR')).slice(0, limite).map(([b]) => b);
}
