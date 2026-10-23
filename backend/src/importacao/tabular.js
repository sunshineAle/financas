// Leitor de planilhas/CSV: recebe uma MATRIZ (linhas x colunas), acha o cabeçalho, mapeia as colunas
// (data, descrição, valor ou débito/crédito) e ignora cabeçalhos extras, totais e rodapés.
const { normalizar, parseData, parseValor, limparDescricao, hash } = require('./texto');

const PALAVRAS = {
  data: ['data', 'date', 'dt', 'data lancamento', 'data da compra', 'data compra', 'data movimento', 'data movimentacao', 'data transacao', 'movimentacao', 'dia', 'data da transacao', 'data lanc'],
  descricao: ['descricao', 'historico', 'title', 'titulo', 'estabelecimento', 'lancamento', 'detalhe', 'detalhes', 'memo', 'nome', 'description', 'histórico', 'complemento', 'local', 'transacao'],
  valor: ['valor', 'amount', 'quantia', 'montante', 'valor r', 'value', 'valor rs', 'valor (r)', 'valor em r'],
  debito: ['debito', 'saida', 'saidas', 'debit', 'debitos', 'valor debito'],
  credito: ['credito', 'entrada', 'entradas', 'credit', 'creditos', 'valor credito'],
  tipo: ['tipo', 'natureza', 'dc', 'd c', 'tipo lancamento', 'tipo de lancamento', 'operacao'],
  saldo: ['saldo', 'balance', 'saldo apos', 'saldo r'],
  parcela: ['parcela', 'parcelas', 'parc'],
  categoria: ['categoria', 'category'],
  id: ['identificador', 'id', 'fitid', 'documento', 'numero documento', 'nsu', 'protocolo'],
};

function tipoDeCabecalho(celula) {
  const n = normalizar(celula);
  if (!n) return null;
  for (const [campo, lista] of Object.entries(PALAVRAS)) {
    const palavras = lista.map(normalizar);
    if (palavras.includes(n)) return campo;
  }
  // contém: "data lançamento", "valor (R$)", "histórico de compra"
  const ordem = ['debito', 'credito', 'saldo', 'valor', 'data', 'descricao', 'parcela', 'categoria', 'tipo', 'id'];
  for (const campo of ordem) {
    const palavras = PALAVRAS[campo].map(normalizar);
    if (palavras.some((p) => p.length >= 4 && (n === p || n.startsWith(p + ' ') || n.endsWith(' ' + p) || n.includes(' ' + p + ' ')))) return campo;
  }
  return null;
}

function achaCabecalho(matriz) {
  const limite = Math.min(matriz.length, 40);
  let melhor = null;
  for (let i = 0; i < limite; i++) {
    const cols = {};
    const descricoes = [];
    (matriz[i] || []).forEach((c, j) => {
      const tp = tipoDeCabecalho(c);
      if (tp === 'descricao') descricoes.push(j);
      if (tp && cols[tp] === undefined) cols[tp] = j;
    });
    if (descricoes.length > 1) cols.descricoes = descricoes;
    const tem = (k) => cols[k] !== undefined;
    const ok = tem('data') && (tem('valor') || tem('debito') || tem('credito'));
    const pts = Object.keys(cols).length + (ok ? 10 : 0);
    if (ok && (!melhor || pts > melhor.pts)) melhor = { linha: i, cols, pts };
    if (ok) break; // primeiro cabeçalho completo
  }
  return melhor;
}

// Sem cabeçalho: descobre pelas colunas (quantas células parecem data / número / texto)
function inferirPorConteudo(matriz) {
  const amostra = matriz.slice(0, 60);
  const largura = Math.max(...amostra.map((l) => l.length), 0);
  const stats = [];
  for (let j = 0; j < largura; j++) {
    let datas = 0; let nums = 0; let textos = 0; let total = 0; let comprimento = 0;
    amostra.forEach((l) => {
      const c = l[j];
      if (c === undefined || c === null || String(c).trim() === '') return;
      total++;
      if (parseData(c, new Date().getFullYear())) datas++;
      else if (parseValor(c) !== null && /\d/.test(String(c)) && /^[\sR$()+\-−.,\d]*[DCdc]?$/.test(String(c))) nums++;
      else { textos++; comprimento += String(c).length; }
    });
    stats.push({ j, datas, nums, textos, total, comprimento });
  }
  const data = stats.filter((s) => s.total && s.datas / s.total > 0.6).sort((a, b) => b.datas - a.datas)[0];
  const valor = stats.filter((s) => s.total && s.nums / s.total > 0.6 && (!data || s.j !== data.j)).sort((a, b) => b.nums - a.nums)[0];
  const descr = stats.filter((s) => s.textos && (!data || s.j !== data.j) && (!valor || s.j !== valor.j)).sort((a, b) => b.comprimento - a.comprimento)[0];
  if (!data || !valor || !descr) return null;
  return { cols: { data: data.j, descricao: descr.j, valor: valor.j }, linha: -1 };
}

function assinaturaDe(matriz, linha, cols) {
  if (linha >= 0 && matriz[linha]) return 'cab:' + matriz[linha].map((c) => normalizar(c)).filter(Boolean).join('|');
  return 'sem-cab:' + Math.max(...matriz.slice(0, 20).map((l) => l.length), 0) + ':' + Object.keys(cols).join(',');
}

// `mapeamento` informado pela pessoa (ou perfil salvo): { linhaCabecalho, data, descricao, valor, debito, credito, tipo, saldo, parcela, categoria, id, formatoData }
function lerTabela(matriz, mapeamento) {
  matriz = (matriz || []).map((l) => (l || []).map((c) => (c === null || c === undefined ? '' : c)));
  if (!matriz.length) throw new Error('A planilha está vazia.');
  let cols; let linhaCab;
  let automatico = false;
  if (mapeamento && mapeamento.data !== undefined && mapeamento.data !== null && mapeamento.data !== '') {
    const n = (v) => (v === undefined || v === null || v === '' ? undefined : Number(v));
    cols = { data: n(mapeamento.data), descricao: n(mapeamento.descricao), valor: n(mapeamento.valor), debito: n(mapeamento.debito), credito: n(mapeamento.credito), tipo: n(mapeamento.tipo), saldo: n(mapeamento.saldo), parcela: n(mapeamento.parcela), categoria: n(mapeamento.categoria), id: n(mapeamento.id) };
    if (Array.isArray(mapeamento.descricoes) && mapeamento.descricoes.length > 1) cols.descricoes = mapeamento.descricoes.map(Number);
    linhaCab = mapeamento.linhaCabecalho === undefined || mapeamento.linhaCabecalho === null ? -1 : Number(mapeamento.linhaCabecalho);
  } else {
    const cab = achaCabecalho(matriz);
    const inf = cab || inferirPorConteudo(matriz);
    if (!inf) return { precisaMapeamento: true, matriz, colunas: matriz[0] || [], motivo: 'Não consegui identificar as colunas (data, descrição e valor).' };
    cols = { ...inf.cols }; linhaCab = inf.linha; automatico = true;
    if (cols.descricoes) cols.descricao = cols.descricoes[0];
  }
  const { data: cData, descricao: cDesc, valor: cVal, debito: cDeb, credito: cCred, tipo: cTipo } = cols;
  if (cData === undefined || (cVal === undefined && cDeb === undefined && cCred === undefined)) {
    return { precisaMapeamento: true, matriz, colunas: matriz[linhaCab >= 0 ? linhaCab : 0] || [], motivo: 'Indique a coluna da data e a do valor.' };
  }
  const anoRef = new Date().getFullYear();
  const linhas = [];
  const ignoradas = [];
  for (let i = linhaCab + 1; i < matriz.length; i++) {
    const l = matriz[i];
    if (i === linhaCab) continue;
    const brutoData = l[cData];
    const data = parseData(brutoData, anoRef);
    let valor = null;
    if (cVal !== undefined) valor = parseValor(l[cVal]);
    if (cDeb !== undefined || cCred !== undefined) {
      const d = cDeb !== undefined ? parseValor(l[cDeb]) : null;
      const c = cCred !== undefined ? parseValor(l[cCred]) : null;
      if (valor === null || valor === 0) {
        if (d) valor = -Math.abs(d);
        else if (c) valor = Math.abs(c);
        else if (d === 0 || c === 0) valor = 0;
      }
    }
    if (cTipo !== undefined && valor !== null) {
      const tp = normalizar(l[cTipo]);
      if (/^(d|debito|saida|deb)\b|debito/.test(tp)) valor = -Math.abs(valor);
      else if (/^(c|credito|entrada|cred)\b|credito/.test(tp)) valor = Math.abs(valor);
    }
    let descricao;
    if (cols.descricoes) {
      const partes = [];
      cols.descricoes.forEach((j) => { const p = limparDescricao(l[j]); if (p && !partes.some((x) => normalizar(x) === normalizar(p))) partes.push(p); });
      descricao = partes.join(' ');
    } else descricao = limparDescricao(cDesc !== undefined ? l[cDesc] : l.filter((_, j) => j !== cData && j !== cVal).join(' '));
    const semDados = !data && valor === null;
    if (semDados) { if (limparDescricao(l.join(' '))) ignoradas.push({ linha: i + 1, texto: limparDescricao(l.join(' ')).slice(0, 120) }); continue; }
    if (!data || valor === null) {
      // linha parcial: cabeçalho repetido, subtotal, "saldo anterior"... fica de fora, mas é contada
      ignoradas.push({ linha: i + 1, texto: limparDescricao(l.join(' ')).slice(0, 120) });
      continue;
    }
    if (/^(saldo (anterior|final|do dia|inicial|total)|total( da| do)?( fatura| periodo)?|subtotal)\b/.test(normalizar(descricao))) { ignoradas.push({ linha: i + 1, texto: descricao.slice(0, 120) }); continue; }
    const fitid = cols.id !== undefined && l[cols.id] ? String(l[cols.id]).trim() : null;
    linhas.push({
      idx: linhas.length, data, descricao: descricao || '(sem descrição)', valor, fitid,
      parcelaTexto: cols.parcela !== undefined ? String(l[cols.parcela] || '') : '',
      categoriaOrigem: cols.categoria !== undefined ? limparDescricao(l[cols.categoria]) : '',
      confianca: descricao ? 'alta' : 'baixa',
      bruto: limparDescricao(l.join(' | ')).slice(0, 200),
      numeroLinha: i + 1,
    });
  }
  const cabecalho = linhaCab >= 0 ? matriz[linhaCab] : [];
  return {
    linhas, ignoradas, automatico,
    mapeamento: { linhaCabecalho: linhaCab >= 0 ? linhaCab : null, ...cols, descricoes: cols.descricoes },
    assinatura: assinaturaDe(matriz, linhaCab, cols),
    colunas: cabecalho,
    amostra: matriz.slice(Math.max(0, linhaCab + 1), Math.max(0, linhaCab + 1) + 6),
  };
}

module.exports = { lerTabela, achaCabecalho, tipoDeCabecalho, assinaturaDe, hash };
