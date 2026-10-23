// Identificação do banco/emissor a partir do arquivo (OFX BANKID/ORG, nome do arquivo, cabeçalho) e sugestão
// de qual conta/cartão do usuário é o destino. Também guarda dicas de como baixar o arquivo em cada banco.
const { normalizar } = require('./texto');

const BANCOS = [
  { nome: 'Nubank', ids: ['260'], chaves: ['nubank', 'nu pagamentos', 'nu bank'], dica: 'No app Nubank: Cartão → Fatura → ícone de exportar (CSV). Para a conta: Conta → Extrato → Exportar (OFX/CSV).' },
  { nome: 'Itaú', ids: ['341'], chaves: ['itau', 'itaú'], dica: 'No Itaú (internet banking): Extrato → Salvar/Exportar → OFX ou Excel. Fatura: Cartões → Fatura → Exportar.' },
  { nome: 'Bradesco', ids: ['237'], chaves: ['bradesco'], dica: 'No Bradesco: Extrato → Salvar em outros formatos → OFX ou Excel.' },
  { nome: 'Banco do Brasil', ids: ['001'], chaves: ['banco do brasil', 'bb '], dica: 'No BB: Extrato → Salvar → OFX. Cartão: Fatura → Exportar.' },
  { nome: 'Santander', ids: ['033'], chaves: ['santander'], dica: 'No Santander: Extrato → Exportar → OFX ou Excel.' },
  { nome: 'Caixa', ids: ['104'], chaves: ['caixa economica', 'caixa econômica', 'cef'], dica: 'Na Caixa: Extrato → Exportar (OFX ou PDF).' },
  { nome: 'Inter', ids: ['077'], chaves: ['banco inter', 'inter '], dica: 'No Inter: Extrato → Exportar → OFX/CSV/PDF. Fatura: Cartão → Fatura → Exportar.' },
  { nome: 'C6 Bank', ids: ['336'], chaves: ['c6 bank', 'c6bank', 'banco c6'], dica: 'No C6: Extrato → Exportar (OFX/CSV). Fatura: Cartão → Fatura → Baixar.' },
  { nome: 'PicPay', ids: ['380'], chaves: ['picpay'], dica: 'No PicPay: Extrato → Exportar (CSV/PDF).' },
  { nome: 'Mercado Pago', ids: ['323'], chaves: ['mercado pago', 'mercadopago'], dica: 'No Mercado Pago: Atividades → Relatórios → Baixar (CSV/PDF).' },
  { nome: 'Sicredi', ids: ['748'], chaves: ['sicredi'], dica: 'No Sicredi: Extrato → Exportar OFX.' },
  { nome: 'Sicoob', ids: ['756'], chaves: ['sicoob'], dica: 'No Sicoob: Extrato → Exportar OFX.' },
  { nome: 'PagBank', ids: ['290'], chaves: ['pagbank', 'pagseguro'], dica: 'No PagBank: Extrato → Exportar.' },
  { nome: 'BTG Pactual', ids: ['208'], chaves: ['btg'], dica: 'No BTG: Extrato → Exportar.' },
  { nome: 'Safra', ids: ['422'], chaves: ['safra'], dica: '' },
  { nome: 'Neon', ids: ['655'], chaves: ['neon'], dica: '' },
  { nome: 'Original', ids: ['212'], chaves: ['banco original'], dica: '' },
  { nome: 'BS2', ids: ['218'], chaves: ['bs2'], dica: '' },
  { nome: 'XP', ids: ['348'], chaves: ['xp investimentos', 'banco xp'], dica: '' },
  { nome: 'Shopee', ids: [], chaves: ['shopee'], dica: '' },
  { nome: 'Magalu', ids: [], chaves: ['magalu', 'magazine luiza', 'luizacred'], dica: '' },
  { nome: 'Carrefour', ids: [], chaves: ['carrefour'], dica: '' },
  { nome: 'Renner', ids: [], chaves: ['renner', 'realize'], dica: '' },
  { nome: 'Pernambucanas', ids: [], chaves: ['pernambucanas'], dica: '' },
  { nome: 'Amazon', ids: [], chaves: ['amazon'], dica: '' },
  { nome: 'Atacadão', ids: [], chaves: ['atacadao', 'atacadão'], dica: '' },
  { nome: 'Extra', ids: [], chaves: ['extra'], dica: '' },
];

// Identifica o banco por: BANKID do OFX, ORG/FID, nome do arquivo e as primeiras linhas do texto.
function identificarBanco({ bancoId, org, nomeArquivo, texto } = {}) {
  if (bancoId) {
    const id = String(bancoId).replace(/^0+/, '').padStart(3, '0');
    const b = BANCOS.find((x) => x.ids.includes(id));
    if (b) return b;
  }
  const alvos = [org, nomeArquivo, String(texto || '').slice(0, 2500)].map((t) => ` ${normalizar(t)} `);
  for (const alvo of alvos) {
    for (const b of BANCOS) {
      if (b.chaves.some((k) => alvo.includes(` ${normalizar(k).trim()} `))) {
        if (b.nome === 'Extra' && !alvo.includes(' extra ')) continue;
        return b;
      }
    }
  }
  return null;
}

// Sugere destino entre contas e cartões do usuário cujo nome lembra o banco; devolve na ordem de melhor casamento.
function sugerirDestino(banco, tipo, contas, cartoes) {
  if (!banco) return [];
  const chaves = [banco.nome, ...banco.chaves].map(normalizar).filter(Boolean);
  const casa = (nome) => {
    const n = normalizar(nome);
    return chaves.some((k) => n.includes(k.trim()) || k.trim().includes(n));
  };
  const lista = [];
  if (tipo !== 'fatura') contas.filter((c) => casa(c.nome)).forEach((c) => lista.push({ tipo: 'conta', id: c.id, nome: c.nome }));
  if (tipo !== 'conta') cartoes.filter((c) => casa(c.nome)).forEach((c) => lista.push({ tipo: 'fatura', id: c.id, nome: c.nome }));
  return lista;
}

module.exports = { BANCOS, identificarBanco, sugerirDestino };
