// Leitura de arquivos no navegador (planilhas e PDF) para a importação. OFX/CSV viajam como texto.
// Devolve o corpo parcial da requisição: { formato, texto | matriz | linhas, nomeArquivo }.
// XLSX e pdf.js são carregados só quando necessários. A senha do PDF nunca é guardada.

export const FORMATOS = '.ofx,.qfx,.csv,.txt,.xlsx,.xls,.ods,.pdf';

function extensao(nome) { return (String(nome).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || ''; }

async function lerTexto(arquivo) {
  const buf = await arquivo.arrayBuffer();
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  // bancos antigos gravam em Windows-1252: se há caracteres de substituição, relê assim
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8;
}

async function lerPlanilha(arquivo) {
  const XLSX = await import('xlsx');
  const buf = await arquivo.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const aba = wb.SheetNames[0];
  const matriz = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: true, defval: '', blankrows: false });
  return matriz.map((l) => l.map((c) => (c instanceof Date ? `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}` : c)));
}

async function pdfjs() {
  const lib = await import('pdfjs-dist/build/pdf.mjs');
  if (!globalThis.pdfjsWorker) globalThis.pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.mjs');
  return lib;
}

// Lê o PDF e junta o texto por linha (itens com a mesma altura). `pedirSenha()` devolve a senha digitada (ou null para cancelar).
async function lerPdf(arquivo, pedirSenha) {
  const lib = await pdfjs();
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  let senha;
  let doc;
  for (let tentativa = 0; ; tentativa++) {
    try {
      doc = await lib.getDocument({ data: dados.slice(), password: senha, useWorkerFetch: false, isEvalSupported: false }).promise;
      break;
    } catch (e) {
      if (e && e.name === 'PasswordException') {
        if (!pedirSenha) throw new Error('Este PDF tem senha.');
        senha = await pedirSenha(tentativa > 0);
        if (senha === null || senha === undefined) throw new Error('Leitura cancelada.');
      } else throw e;
    }
  }
  const linhas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pag = await doc.getPage(p);
    const conteudo = await pag.getTextContent();
    const porY = new Map();
    conteudo.items.forEach((it) => {
      if (!it.str || !it.str.trim()) return;
      const y = Math.round(it.transform[5] / 3);
      if (!porY.has(y)) porY.set(y, []);
      porY.get(y).push({ x: it.transform[4], t: it.str });
    });
    [...porY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, itens]) => {
      linhas.push(itens.sort((a, b) => a.x - b.x).map((i) => i.t).join(' ').replace(/\s+/g, ' ').trim());
    });
  }
  return linhas;
}

export async function lerArquivo(arquivo, { pedirSenha } = {}) {
  const ext = extensao(arquivo.name);
  const nomeArquivo = arquivo.name;
  if (ext === 'ofx' || ext === 'qfx') return { formato: 'ofx', texto: await lerTexto(arquivo), nomeArquivo };
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') return { formato: 'csv', texto: await lerTexto(arquivo), nomeArquivo };
  if (['xlsx', 'xls', 'xlsm', 'ods'].includes(ext)) return { formato: 'xlsx', matriz: await lerPlanilha(arquivo), nomeArquivo };
  if (ext === 'pdf') return { formato: 'pdf', linhas: await lerPdf(arquivo, pedirSenha), nomeArquivo };
  throw new Error('Formato não suportado. Use OFX, CSV, XLSX/XLS ou PDF.');
}
