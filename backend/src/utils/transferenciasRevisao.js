// Anotação 81: sugestões não mudam saldos ou classificação; só uma decisão explícita cria o vínculo.
const db = require('../db');
const dados = require('../dados');
const R = require('./regras');
const L = require('./lancamentos');
const normalizar = t => R.normalizar(t).replace(/[^a-z0-9]+/g, ' ').trim();
const contemNome = (descricao, nome) => (` ${normalizar(descricao)} `).includes(` ${nome} `);
const centavos = (v) => Math.round(Number(v) * 100);
const valido = (t) => !t.tipo_mov && !t.vinculo && !t.ignorada && t.valor !== 0;

function contexto(usuarioId) {
  const regras = db.prepare("SELECT * FROM regras_categorias WHERE usuario_id = ? AND tipo = 'transferencia' AND ativa = 1 AND excluido_em IS NULL").all(usuarioId);
  const contas = db.prepare('SELECT id, nome FROM contas WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId);
  const usuario = db.prepare('SELECT nome FROM usuarios WHERE id = ?').get(usuarioId);
  // O nome completo registrado na regra pode ser diferente do apelido de acesso.
  const nomes = [...new Set([usuario?.nome, ...regras.map((r) => r.padrao)].map(normalizar).filter((n) => n && !/^(pix|ted|transferencia)$/.test(n) && (n.includes(' ') || n.length >= 5)))];
  const linhas = db.prepare('SELECT * FROM transacoes WHERE usuario_id = ? AND excluido_em IS NULL').all(usuarioId).filter(t => valido(t) && t.revisao !== 'transferencia_recusada' && contas.some(c => c.id === t.conta_id));
  return { regras, nomes, contas, linhas };
}
function temTitular(t, nomes) { const d = normalizar(t.descricao); return nomes.some((n) => contemNome(d, n)); }
function sugerir(t, ctx) {
  if (!ctx.regras.length || !valido(t) || t.revisao === 'transferencia_recusada') return null;
  if (!/\bpix\b/.test(normalizar(t.descricao)) && !temTitular(t, ctx.nomes)) return null;
  const outras = ctx.linhas.filter((p) => p.id !== t.id && p.conta_id !== t.conta_id && centavos(p.valor) === -centavos(t.valor));
  const confirmadas = outras.filter((p) => ctx.nomes.some(n => contemNome(t.descricao, n) && contemNome(p.descricao, n)));
  // Uma sugestão só quando há uma única ponta de mesmo valor, e o titular está nas duas.
  const sugestao = outras.length === 1 && confirmadas.length === 1 ? confirmadas[0] : null;
  const proximas = ctx.linhas.filter((p) => p.conta_id !== t.conta_id && Math.sign(p.valor) !== Math.sign(t.valor) && ctx.nomes.some(n => contemNome(t.descricao, n) && contemNome(p.descricao, n)) && Math.abs(centavos(p.valor) + centavos(t.valor)) === 1);
  const motivo = outras.length > 1 ? 'Há mais de uma ponta com o mesmo valor. Escolha qual corresponde.' : outras.length && !sugestao ? 'O nome do titular não aparece nas duas pontas. Confirme a conta e o lançamento.' : proximas.length && !outras.length ? 'Há uma diferença de centavos. Esses lançamentos não formam um par.' : 'Isto parece ser uma transferência entre as suas contas. Quer tratar como transferência?';
  return { id: t.id, descricao: t.descricao, valor: t.valor, data: t.data, contaId: t.conta_id, motivo,
    sugestaoId: sugestao?.id || null, sugestaoContaId: sugestao?.conta_id || null,
    candidatas: outras.map((p) => ({ id: p.id, contaId: p.conta_id, contaNome: ctx.contas.find((c) => c.id === p.conta_id)?.nome || '', descricao: p.descricao, data: p.data })),
    contas: ctx.contas.filter((c) => c.id !== t.conta_id), diferencaCentavos: proximas.length > 0 && !outras.length };
}
function listar(usuarioId) { const ctx = contexto(usuarioId); return ctx.linhas.map((t) => sugerir(t, ctx)).filter(Boolean); }
function decidir(usuarioId, id, corpo) {
  const item = listar(usuarioId).find((t) => t.id === id);
  if (!item) throw new L.ErroLancamento('A sugestão não está mais disponível. Atualize a revisão.', 409);
  if (corpo.acao === 'recusar') { dados.atualizar('transacoes', id, { revisao: 'transferencia_recusada' }); return { ok: true }; }
  if (corpo.acao !== 'vincular') throw new L.ErroLancamento('Escolha Vincular ou Não é transferência.');
  const contaId = String(corpo.contaId || '');
  if (!item.contas.some((c) => c.id === contaId)) throw new L.ErroLancamento('Escolha a outra conta.');
  const parceiraId = corpo.parceiraId ? String(corpo.parceiraId) : null;
  if (parceiraId && !item.candidatas.some((p) => p.id === parceiraId && p.contaId === contaId)) throw new L.ErroLancamento('A outra ponta precisa ter o mesmo valor exato, em sentido oposto.');
  if (!parceiraId && item.candidatas.some((p) => p.contaId === contaId)) throw new L.ErroLancamento('Escolha qual lançamento da outra conta corresponde.');
  if (!parceiraId && item.diferencaCentavos) throw new L.ErroLancamento('Os valores são diferentes. Confira a tarifa ou corrija o lançamento antes de vincular.');
  return L.converterEmTransferencia(usuarioId, id, contaId, { parceiraId, buscarParceira: false });
}
module.exports = { contexto, sugerir, listar, decidir, centavos };
