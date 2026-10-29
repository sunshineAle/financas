// Leitor genérico de PDF com texto. O navegador/Node extrai as LINHAS de texto (ver frontend services/leitorArquivo.js);
// aqui cada linha vira data + descrição + valor. Linhas duvidosas ficam com confiança "baixa" para a pessoa conferir.
const { parseData, parseValor, limparDescricao, normalizar, iso, MESES, somarDias, diasEntre } = require('./texto');

const RE_VALOR = /(?:R\$\s*)?[-−(]?\s*\d{1,3}(?:\.\d{3})*,\d{2}\)?(?:\s*(?:CR|DB|[CD]))?(?=\s|$)|(?:R\$\s*)?[-−]?\d+,\d{2}(?:\s*(?:CR|DB|[CD]))?(?=\s|$)/g;
const RE_DATA_INI = /^\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}\s+(?:de\s+)?(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?:\s+(?:de\s+)?\d{2,4})?)\b\s*/i;
// Linhas COM data que são resumo/cabeçalho. IOF, juros, encargos e multa com data são cobranças da fatura e ficam
// (antes eram descartados e o total importado ficava menor que o da fatura). Só o resumo "juros/encargos a.m." sai.
const IGNORAR = /^(total|subtotal|saldo|limite|resumo|vencimento|fechamento|pagamento minimo|valor minimo|data|descricao|lancamentos|compras|periodo|pagina|cartao final|fatura|cet|(?:juros|encargos|iof)\b.*\b(?:a ?m|a ?a|ao mes|ao ano|maximo|proxima fatura|proximo periodo))\b/;

// Procura a data de referência (vencimento/fim do período) e o ano predominante.
function referencia(linhas) {
  const texto = linhas.join('\n');
  let venc = null;
  const mv = texto.match(/vencimento[^\d]{0,30}(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (mv) venc = parseData(mv[1]);
  const anos = {};
  (texto.match(/\b\d{1,2}\/\d{1,2}\/(20\d{2})\b/g) || []).forEach((d) => { const a = d.slice(-4); anos[a] = (anos[a] || 0) + 1; });
  const ano = Object.keys(anos).sort((a, b) => anos[b] - anos[a])[0];
  let periodo = null;
  const mp = texto.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*(?:a|até|-|à)\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (mp) periodo = { inicio: parseData(mp[1]), fim: parseData(mp[2]) };
  // Anotação 61: total declarado da fatura ("Total da fatura R$ 196,75"), para conferir o sentido dos sinais e o total importado
  let total = null;
  const mt = texto.match(/(?:total\s+(?:da|desta)\s+fatura|valor\s+total(?:\s+da\s+fatura)?|total\s+a\s+pagar)[^\d\n−-]{0,30}([-−]?\s*(?:R\$\s*)?[-−]?\d{1,3}(?:\.\d{3})*,\d{2})/i);
  if (mt) { const v = parseValor(mt[1].replace(/R\$\s*/, '').replace('−', '-').replace(/\s+/g, '')); if (v !== null) total = v; }
  return { vencimento: venc, ano: ano ? +ano : null, periodo, total };
}

function valorDoToken(tok) {
  const t = tok.trim();
  const sufixo = (t.match(/(CR|DB|[CD])$/i) || [])[1];
  let v = parseValor(t.replace(/(CR|DB|[CD])$/i, ''));
  if (v === null) return null;
  v = Math.abs(v) * (/^[-−(]/.test(t.replace(/^R\$\s*/, '')) ? -1 : 1);
  if (sufixo) { v = /^(D|DB)$/i.test(sufixo) ? -Math.abs(v) : Math.abs(v); return { v, explicito: true }; }
  return { v, explicito: false };
}

function parsePdf(linhasTexto) {
  const linhas = (linhasTexto || []).map((l) => limparDescricao(l)).filter(Boolean);
  if (!linhas.length) throw new Error('Não encontrei texto no PDF. Se ele for uma imagem escaneada, use OFX, CSV ou planilha.');
  const ref = referencia(linhas);
  const hoje = new Date();
  const anoRef = ref.vencimento ? +ref.vencimento.slice(0, 4) : ref.ano || hoje.getFullYear();
  const refData = ref.vencimento || (ref.periodo && ref.periodo.fim) || null;
  const saida = [];
  const ignoradas = [];
  let algumExplicito = false;
  linhas.forEach((l, n) => {
    const md = l.match(RE_DATA_INI);
    if (!md) return;
    let resto = l.slice(md[0].length);
    const valores = [...resto.matchAll(RE_VALOR)];
    if (!valores.length) return;
    // valores ao final da linha (pode haver valor + saldo)
    const finais = [];
    for (let i = valores.length - 1; i >= 0; i--) {
      const fim = valores[i].index + valores[i][0].length;
      const depois = resto.slice(fim).trim();
      if (!depois || (finais.length && resto.slice(fim, finais[0].ini).trim() === '')) finais.unshift({ tok: valores[i][0], ini: valores[i].index });
      else break;
    }
    if (!finais.length) return;
    const descricao = limparDescricao(resto.slice(0, finais[0].ini));
    let baixa = false;
    let escolhido = finais[0];
    if (finais.length >= 2) { escolhido = finais[finais.length - 2]; baixa = finais.length > 2; } // [valor, saldo]
    const val = valorDoToken(escolhido.tok);
    if (!val) return;
    const texto = normalizar(descricao);
    if (!texto || IGNORAR.test(texto)) { ignoradas.push({ linha: n + 1, texto: l.slice(0, 120) }); return; }
    // data: com ano explícito vale; senão usa o ano de referência (virada de ano: compra de dezembro em fatura de janeiro)
    let data = parseData(md[1], anoRef);
    if (data && !/\d{4}|\d\d$/.test(md[1].replace(/^\d{1,2}\/\d{1,2}$/, ''))) {
      if (refData && diasEntre(refData, data) > 40) data = `${+data.slice(0, 4) - 1}${data.slice(4)}`;
    }
    if (!data) return;
    if (val.explicito) algumExplicito = true;
    if (descricao.length < 3) baixa = true;
    saida.push({
      idx: saida.length, data, descricao, valor: val.v, fitid: null,
      sinalExplicito: val.explicito,
      confianca: baixa ? 'baixa' : 'alta', bruto: l.slice(0, 200), numeroLinha: n + 1,
    });
  });
  if (!saida.length) throw new Error('Não reconheci lançamentos neste PDF (esperava linhas com data, descrição e valor). Tente OFX, CSV ou planilha, ou escolha outro PDF.');
  return {
    linhas: saida, ignoradas,
    meta: { formato: 'pdf', vencimento: ref.vencimento, totalFatura: ref.total, inicio: ref.periodo ? ref.periodo.inicio : null, fim: ref.periodo ? ref.periodo.fim : null, sinalNormalizado: algumExplicito && saida.every((s) => s.sinalExplicito) },
  };
}

module.exports = { parsePdf };
