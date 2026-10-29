// Leitura do arquivo: escolhe o leitor pelo formato, aplica o perfil salvo (CSV/planilha) e normaliza os sinais.
const { parseOfx } = require('./ofx');
const { parseCsv } = require('./csv');
const { lerTabela, assinaturaDe } = require('./tabular');
const { parsePdf } = require('./pdf');
const { identificarBanco } = require('./bancos');
const { normalizar } = require('./texto');
const { tipoDeCredito } = require('./integracoes');

function detectarFormato(entrada) {
  if (entrada.formato && ['ofx', 'csv', 'xlsx', 'pdf'].includes(entrada.formato)) return entrada.formato;
  const nome = String(entrada.nomeArquivo || '').toLowerCase();
  if (/\.(ofx|qfx)$/.test(nome)) return 'ofx';
  if (/\.(xlsx|xls|xlsm|ods)$/.test(nome)) return 'xlsx';
  if (/\.pdf$/.test(nome)) return 'pdf';
  if (/\.(csv|txt|tsv)$/.test(nome)) return 'csv';
  if (entrada.matriz) return 'xlsx';
  if (entrada.linhas) return 'pdf';
  if (/<OFX|OFXHEADER|<STMTTRN>/i.test(String(entrada.texto || '').slice(0, 5000))) return 'ofx';
  return 'csv';
}

// perfis: [{ id, nome, formato, assinatura, mapeamento(JSON texto) }]
class ErroLeitura extends Error {
  constructor(m) { super(m); this.status = 400; }
}

function lerEntrada(entrada, perfis = []) {
  try { return lerEntradaInterna(entrada, perfis); } catch (e) { if (e.status) throw e; throw new ErroLeitura(e.message); }
}

function lerEntradaInterna(entrada, perfis) {
  const formato = detectarFormato(entrada);
  let r;
  if (formato === 'ofx') {
    const o = parseOfx(entrada.texto);
    r = { formato, linhas: o.linhas, meta: o.meta, ignoradas: [] };
    // Anotação 61: no OFX de cartão o saldo (LEDGERBAL) é o total da fatura (negativo = a pagar)
    if (o.meta.tipoConta === 'cartao' && o.meta.saldo !== null && o.meta.saldo !== undefined) r.meta.totalFatura = o.meta.saldo;
  } else if (formato === 'pdf') {
    const p = parsePdf(entrada.linhas);
    r = { formato, linhas: p.linhas, meta: p.meta, ignoradas: p.ignoradas };
  } else {
    let matriz = entrada.matriz;
    let separador = null;
    if (formato === 'csv') { const c = parseCsv(entrada.texto); matriz = c.matriz; separador = c.separador; }
    if (!Array.isArray(matriz) || !matriz.length) throw new Error('O arquivo está vazio ou não tem linhas legíveis.');
    let mapeamento = entrada.mapeamento || null;
    let perfilAplicado = null;
    if (!mapeamento) {
      for (const p of perfis) {
        let m; try { m = JSON.parse(p.mapeamento); } catch (e) { continue; }
        const cols = {};
        ['data', 'descricao', 'valor', 'debito', 'credito', 'tipo', 'saldo', 'parcela', 'categoria', 'id'].forEach((k) => { if (m[k] !== undefined && m[k] !== null) cols[k] = m[k]; });
        const lc = m.linhaCabecalho === null || m.linhaCabecalho === undefined ? -1 : Number(m.linhaCabecalho);
        if (assinaturaDe(matriz, lc, cols) === p.assinatura) { mapeamento = m; perfilAplicado = { id: p.id, nome: p.nome }; break; }
      }
    }
    const t = lerTabela(matriz, mapeamento);
    if (t.precisaMapeamento) {
      return { formato, precisaMapeamento: true, motivo: t.motivo, colunas: t.colunas, amostra: matriz.slice(0, 15), totalLinhas: matriz.length, separador };
    }
    const temSinalProprio = t.mapeamento.debito !== undefined || t.mapeamento.credito !== undefined || t.mapeamento.tipo !== undefined;
    r = {
      formato, linhas: t.linhas, ignoradas: t.ignoradas, mapeamento: t.mapeamento, assinatura: t.assinatura, colunas: t.colunas,
      perfilAplicado, meta: { formato, separador, sinalNormalizado: temSinalProprio, inicio: null, fim: null, totalFatura: t.totalFatura === undefined ? null : t.totalFatura },
    };
  }
  r.banco = identificarBanco({ bancoId: r.meta.bancoId, org: r.meta.org || r.meta.fid, nomeArquivo: entrada.nomeArquivo, texto: entrada.texto || (entrada.linhas || []).slice(0, 30).join(' ') });
  return r;
}

// Em fatura de cartão a convenção "compra negativa" nem sempre vale (muitos CSV trazem compras positivas e créditos
// negativos; outros, o contrário). Anotação 61 — o sentido é conferido assim, nesta ordem:
//  1) total declarado no arquivo (linha "Total da fatura", total do PDF, LEDGERBAL do OFX): vale o sentido em que
//     compras − créditos bate com ele;
//  2) linhas que NÃO são crédito pelo texto (compras, IOF, juros): a maioria delas tem de ficar como saída;
//  3) plano B antigo: a maioria das linhas fica como saída.
// Nos formatos com sinal próprio (OFX, D/C do PDF, colunas débito/crédito) só inverte com prova forte (total ou 2 × 1).
// Depois do sentido: linha com palavra de crédito (estorno, devolução, pagamento, cashback, ajuste a crédito...) é
// SEMPRE crédito, mesmo que o arquivo traga tudo com o mesmo sinal.
function normalizarSinais(leitura, destinoTipo, inverterManual) {
  const { linhas, meta } = leitura;
  let auto = false;
  let motivo = null;
  const fixo = !!(meta.sinalNormalizado || leitura.formato === 'ofx');
  const ehFatura = destinoTipo === 'fatura';
  const tipoCred = ehFatura ? linhas.map((l) => tipoDeCredito(l.descricao)) : [];
  // valor de cada linha num sentido (inv) já com os créditos pelo texto virados para positivo
  const valorNo = (l, i, inv) => { const v = inv ? -l.valor : l.valor; return tipoCred[i] && v < 0 ? -v : v; };
  if (ehFatura && linhas.length) {
    const total = Number(meta.totalFatura);
    if (meta.totalFatura !== null && meta.totalFatura !== undefined && Number.isFinite(total) && Math.abs(total) > 0.004) {
      const bate = (inv) => [false, true].some((semPag) => {
        const soma = linhas.reduce((s, l, i) => (semPag && tipoCred[i] === 'pagamento' ? s : s - valorNo(l, i, inv)), 0);
        return Math.abs(Math.abs(soma) - Math.abs(total)) <= 0.011 && soma > 0;
      });
      const [a, b] = [bate(false), bate(true)];
      if (a !== b) { auto = b; motivo = 'total'; }
    }
    if (!motivo) {
      const comuns = linhas.filter((l, i) => !tipoCred[i] && l.valor !== 0);
      const pos = comuns.filter((l) => l.valor > 0).length;
      const neg = comuns.filter((l) => l.valor < 0).length;
      if (fixo) { if (comuns.length >= 3 && pos >= 2 * Math.max(1, neg)) { auto = true; motivo = 'compras'; } }
      else if (pos !== neg) { auto = pos > neg; motivo = 'compras'; }
      else {
        const p = linhas.filter((l) => l.valor > 0).length;
        const n = linhas.filter((l) => l.valor < 0).length;
        auto = p > n; motivo = 'maioria';
      }
    }
  }
  const inverter = inverterManual === undefined || inverterManual === null ? auto : !!inverterManual;
  let creditosPorTexto = 0;
  linhas.forEach((l, i) => {
    if (inverter) l.valor = -l.valor;
    if (ehFatura && tipoCred[i]) {
      l.tipoCredito = tipoCred[i];
      if (l.valor < 0) { l.valor = -l.valor; l.creditoPorTexto = true; creditosPorTexto++; }
    }
  });
  return { sinalAuto: auto, sinalInvertido: inverter, motivoSinal: motivo, creditosPorTexto };
}

module.exports = { lerEntrada, normalizarSinais, detectarFormato };
