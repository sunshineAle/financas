// Utilidades de texto, datas e valores usadas pelos leitores de arquivo (JS puro: roda no servidor e no navegador).

const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12, feb: 2, apr: 4, may: 5, aug: 8, sep: 9, oct: 10, dec: 12 };

const pad = (n) => String(n).padStart(2, '0');

function semAcento(t) {
  return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// minúsculas, sem acento, só letras/números/espaço
function normalizar(t) {
  return semAcento(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function diaValido(a, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(a, m, 0)).getUTCDate();
}

function iso(a, m, d) {
  return diaValido(a, m, d) ? `${a}-${pad(m)}-${pad(d)}` : null;
}

// Aceita 2026-10-05, 05/10/2026, 05/10/26, 5-10-2026, 05.10.2026, 20261005, 20261005120000[-3:BRT], "05 out 2026", "5 de outubro de 2026".
// `anoPadrao` é usado quando o texto traz só dia/mês (05/10).
function parseData(valor, anoPadrao) {
  if (valor == null) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : iso(valor.getFullYear(), valor.getMonth() + 1, valor.getDate());
  const t = String(valor).trim();
  if (!t) return null;
  let m;
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = t.match(/^(\d{4})(\d{2})(\d{2})(?:\d{0,6}.*)?$/)) && t.length >= 8 && /^\d{8}/.test(t)) return iso(+m[1], +m[2], +m[3]);
  if ((m = t.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})(?:\D.*)?$/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:\D.*)?$/))) {
    let a = +m[3];
    if (m[3].length === 2) a += a >= 70 ? 1900 : 2000;
    return iso(a, +m[2], +m[1]);
  }
  if ((m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})$/)) && anoPadrao) return iso(anoPadrao, +m[2], +m[1]);
  const s = semAcento(t).toLowerCase();
  if ((m = s.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]{3})[a-z]*\.?\s*(?:de\s+)?(\d{2,4})?$/)) && MESES[m[2]]) {
    let a = m[3] ? +m[3] : anoPadrao;
    if (!a) return null;
    if (a < 100) a += 2000;
    return iso(a, MESES[m[2]], +m[1]);
  }
  return null;
}

// Valor monetário em formato brasileiro ou internacional: "R$ 1.234,56", "-1234.56", "(45,00)", "45,00 D", "1.234,56-".
// Devolve número (negativo para débito/parênteses/sinal de menos/sufixo D) ou null.
function parseValor(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let t = String(valor).trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/(^|\s)-|-\s*$|−/.test(t)) neg = true;
  if (/\b[dD]\s*$/.test(t) && !/\b[cC]\s*$/.test(t)) neg = true;
  t = t.replace(/[Rr]\$|\s|[A-Za-z]+|[−\-+()]/g, '');
  if (!t || !/\d/.test(t)) return null;
  const temV = t.includes(',');
  const temP = t.includes('.');
  let n;
  if (temV && temP) {
    const dec = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.';
    const mil = dec === ',' ? '.' : ',';
    n = Number(t.split(mil).join('').replace(dec, '.'));
  } else if (temV) {
    n = t.split(',').length > 2 ? Number(t.split(',').join('')) : Number(t.replace(',', '.'));
  } else if (temP) {
    const partes = t.split('.');
    // "1.234" ou "1.234.567": ponto como separador de milhar (bancos usam 2 casas decimais)
    n = partes.length > 2 || (partes[1].length === 3 && partes[0].length <= 3 && partes[0] !== '0') ? Number(partes.join('')) : Number(t);
  } else n = Number(t);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

const arredondar = (v) => Math.round(v * 100) / 100;

// Limpa a descrição: espaços, caracteres de controle, prefixos repetitivos
function limparDescricao(t) {
  return String(t == null ? '' : t).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Parcela na descrição: "01/03", "1/3", "parc 2 de 6", "parcela 02/12", "(2/6)", "2 de 6". Devolve { atual, total, base } ou null.
function extrairParcela(descricao, { estrito = false } = {}) {
  const d = limparDescricao(descricao);
  const padroes = [
    /\b(?:parc(?:ela)?\.?\s*)(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i,
    /\(\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\)/,
    /(?:^|[\s\-–])(\d{1,2})\s*\/\s*(\d{1,2})\s*$/,
    /\b(\d{1,2})\s+de\s+(\d{1,2})\b/i,
  ];
  // estrito (extrato de conta): só com a palavra "parcela" ou entre parênteses, para não confundir com datas
  for (const re of estrito ? padroes.slice(0, 2) : padroes) {
    const m = d.match(re);
    if (!m) continue;
    const atual = +m[1];
    const total = +m[2];
    if (total >= 2 && total <= 72 && atual >= 1 && atual <= total) {
      // evita confundir datas (05/10) — só aceita quando não parece dia/mês válido seguido de ano
      const base = limparDescricao(d.replace(m[0], ' ').replace(/\s*[-–]\s*$/, ''));
      return { atual, total, base };
    }
  }
  return null;
}

// Semelhança de descrições (0 a 1): tokens em comum (ignora palavras genéricas e números).
const GENERICAS = new Set(['compra', 'debito', 'credito', 'pagamento', 'pag', 'pix', 'ted', 'doc', 'transferencia', 'enviada', 'recebida', 'enviado', 'recebido', 'cartao', 'de', 'da', 'do', 'em', 'no', 'na', 'a', 'o', 'e', 'com', 'para', 'por', 'br', 'ltda', 'sa', 'me', 'parcela', 'parc', 'estorno', 'cancelamento', 'devolucao']);
function tokens(t) {
  return normalizar(t).split(' ').filter((p) => p.length > 1 && !/^\d+$/.test(p) && !GENERICAS.has(p));
}
function semelhanca(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.length || !B.length) {
    const na = normalizar(a); const nb = normalizar(b);
    return na && na === nb ? 1 : 0;
  }
  const sb = new Set(B);
  let comuns = 0;
  A.forEach((x) => { if (sb.has(x) || B.some((y) => (y.length > 3 && x.length > 3 && (y.startsWith(x) || x.startsWith(y))))) comuns++; });
  return comuns / Math.min(A.length, B.length);
}

// Hash curto e estável (FNV-1a) para montar chaves
function hash(texto) {
  let h = 0x811c9dc5;
  const s = String(texto);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

function somarDias(dataIso, n) {
  const [a, m, d] = dataIso.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}
function diasEntre(a, b) {
  const [a1, m1, d1] = a.split('-').map(Number);
  const [a2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}
function somarMeses(dataIso, n) {
  const [a, m, d] = dataIso.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  const ano = Math.floor(t / 12);
  const mes = (t % 12) + 1;
  const ult = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${pad(mes)}-${pad(Math.min(d, ult))}`;
}

module.exports = { normalizar, semAcento, parseData, parseValor, arredondar, limparDescricao, extrairParcela, semelhanca, tokens, hash, somarDias, diasEntre, somarMeses, iso, pad, MESES };
