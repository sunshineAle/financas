// Leitor de OFX (v1 SGML e v2 XML). Devolve as transações com FITID e os metadados do arquivo.
const { parseData, parseValor, limparDescricao } = require('./texto');

function decodificar(t) {
  return String(t == null ? '' : t)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

// Valor de uma tag: <TAG>valor (até a próxima "<" ou quebra de linha), com ou sem </TAG>.
function tag(bloco, nome) {
  const re = new RegExp(`<${nome}>\\s*([^<\\r\\n]*)`, 'i');
  const m = bloco.match(re);
  return m ? decodificar(m[1]).trim() : '';
}

function ehOfx(texto) {
  return /<OFX[\s>]/i.test(texto) || /OFXHEADER\s*:/i.test(texto) || /<STMTTRN>/i.test(texto);
}

function parseOfx(texto) {
  const t = String(texto || '');
  if (!ehOfx(t)) throw new Error('O arquivo não parece ser um OFX válido.');
  const corpo = t.slice(Math.max(0, t.search(/<OFX/i)));
  const cartao = /<CCSTMTRS>|<CREDITCARDMSGSRSV1>|<CCACCTFROM>/i.test(corpo);

  const meta = {
    formato: 'ofx',
    tipoConta: cartao ? 'cartao' : 'conta',
    org: tag(corpo, 'ORG'),
    fid: tag(corpo, 'FID'),
    bancoId: tag(corpo, 'BANKID'),
    agencia: tag(corpo, 'BRANCHID'),
    contaNumero: tag(corpo, 'ACCTID'),
    moeda: tag(corpo, 'CURDEF') || 'BRL',
    inicio: parseData(tag(corpo, 'DTSTART')),
    fim: parseData(tag(corpo, 'DTEND')),
    saldo: null,
    saldoData: null,
  };
  const saldoBloco = corpo.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>|$)/i);
  if (saldoBloco) {
    meta.saldo = parseValor(tag(saldoBloco[1], 'BALAMT'));
    meta.saldoData = parseData(tag(saldoBloco[1], 'DTASOF'));
  }

  const linhas = [];
  const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi;
  let m;
  let i = 0;
  while ((m = re.exec(corpo))) {
    const b = m[1];
    const data = parseData(tag(b, 'DTPOSTED')) || parseData(tag(b, 'DTUSER'));
    const valor = parseValor(tag(b, 'TRNAMT'));
    const nome = limparDescricao(tag(b, 'NAME'));
    const memo = limparDescricao(tag(b, 'MEMO'));
    let descricao = memo || nome;
    if (memo && nome && !memo.toLowerCase().includes(nome.toLowerCase()) && !nome.toLowerCase().includes(memo.toLowerCase())) descricao = `${nome} ${memo}`;
    const fitid = tag(b, 'FITID') || null;
    linhas.push({
      idx: i++, data, descricao, valor, fitid,
      tipoOfx: tag(b, 'TRNTYPE') || null,
      confianca: data && valor != null && descricao ? 'alta' : 'baixa',
      bruto: limparDescricao(b).slice(0, 200),
    });
  }
  if (!linhas.length) throw new Error('Nenhuma transação encontrada no OFX.');
  return { linhas, meta };
}

module.exports = { parseOfx, ehOfx };
