// Anotação 56 — Meta ligada à caixinha do banco. JS puro (servidor e navegador).
//
// A meta guarda a conta (metas_reserva.caixinha_conta_id) e o nome como aparece no extrato (caixinha_nome; apelidos
// separados por ';'). No extrato dessa conta:
//   - saída com o nome da caixinha (ex.: "Aplicação Viagem")  -> Guardar na meta (fora das Saídas);
//   - entrada com o nome (ex.: "Resgate Meu Porquinho")        -> Resgatar da meta (fora das Entradas); o que passar do
//     que estava guardado é rendimento e vira linha própria em Rendimentos (regra da anotação 38, mesma de /reserva/auto);
//   - sem o nome (ex.: "Aplicação RDB"): uma meta ligada à conta -> vai para ela; mais de uma -> fica "A revisar"
//     (fora dos totais, tipo_mov 'reserva_pendente') com as metas da conta como opções.
const db = require('../db');
const dados = require('../dados');
const { arredondar } = require('./faturas');
const carteira = require('./carteiraDb');
const { detectarReservaAutomatica } = require('./reservasAuto');
const { garantirCategoriaReceita } = require('./categoriasReceita');
const { TIPOS_LIQUIDEZ_RAPIDA } = require('./carteira');

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const RE_RESGATE = /\b(resgate|resgates|resgatou|resgatado|resgatada|retirada|retirou|saque|sacou)\b/;
const RE_APLICACAO = /\b(aplicacao|aplicacoes|aplicado|aplicada|aplicou|aplic|deposito|depositado|guardar|guardado|guardou|investimento|investido)\b/;
const RE_PRODUTO = /\b(caixinha|caixinhas|porquinho|cofrinho|cofre|cdb|rdb|lci|lca|poupanca|reserva|objetivo|meta)\b/;
const RE_PALAVRAS_MOV = /\b(resgate|resgates|resgatou|resgatado|resgatada|retirada|retirou|saque|sacou|aplicacao|aplicacoes|aplicado|aplicada|aplicou|aplic|deposito|depositado|guardar|guardado|guardou|investimento|investido|pix|ted|doc|transf|transferencia|de|da|do|na|no|em|para|automatica|automatico|aut)\b/g;

// Apelidos da meta (nome como aparece no extrato), já normalizados. Sem caixinha_nome, usa o nome da meta.
function apelidos(meta) {
  const lista = String(meta.caixinha_nome || '').split(';').map(norm).filter((a) => a.length >= 2);
  return lista.length ? lista : [norm(meta.nome)].filter((a) => a.length >= 2);
}
const contem = (texto, trecho) => (` ${texto} `).includes(` ${trecho} `);

// Metas ligadas a uma conta (do usuário).
function metasDaConta(usuarioId, contaId) {
  if (!contaId) return [];
  return db
    .prepare(
      `SELECT m.* FROM metas_reserva m JOIN reserva_liberdade r ON r.id = m.reserva_id
       WHERE r.usuario_id = ? AND m.caixinha_conta_id = ? AND m.excluido_em IS NULL AND r.excluido_em IS NULL ORDER BY m.rowid ASC`
    )
    .all(usuarioId, String(contaId));
}

// Trecho da descrição sem as palavras de movimento ("Aplicação RDB" -> "RDB"): vira apelido quando a escolha manual vira regra.
function trechoDaDescricao(descricao) {
  const limpo = String(descricao || '').trim();
  const t = norm(limpo).replace(RE_PALAVRAS_MOV, ' ').replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 2) return limpo.slice(0, 40);
  // devolve com a grafia original quando possível
  const palavras = limpo.split(/\s+/).filter((p) => t.split(' ').includes(norm(p)));
  return (palavras.join(' ') || t).slice(0, 40);
}

// Movimento de caixinha genérico (sem o nome da meta)? Usa a detecção da anotação 38 e, numa conta com caixinhas ligadas,
// também "Aplicação"/"Resgate" com produto (RDB, CDB, cofrinho...). Devolve { sentido } ou null.
function movimentoGenerico(descricao, valor) {
  const sentido = valor < 0 ? 'guardar' : 'resgatar';
  const det = detectarReservaAutomatica(descricao);
  if (det) return det.sentido === sentido ? { sentido, det } : null;
  const t = norm(descricao);
  const resg = RE_RESGATE.test(t);
  const apl = RE_APLICACAO.test(t);
  if (sentido === 'guardar' && apl && !resg) return { sentido, det: null };
  if (sentido === 'resgatar' && resg) return { sentido, det: null };
  return null;
}

// Casa uma linha do extrato com as metas ligadas à conta. Devolve null (não é caixinha) ou
// { sentido, meta | null, porNome, opcoes: [metas da conta] }.
function casarCaixinha(descricao, valor, metas) {
  if (!metas || !metas.length || !Number(valor)) return null;
  const t = norm(descricao);
  const sentido = valor < 0 ? 'guardar' : 'resgatar';
  const resg = RE_RESGATE.test(t);
  const apl = RE_APLICACAO.test(t);
  // sinal e palavra precisam combinar: "Resgate" saindo da conta ou "Aplicação" entrando não são caixinha
  const coerente = sentido === 'guardar' ? !resg : !(apl && !resg);
  let melhor = null;
  for (const m of metas) {
    for (const a of apelidos(m)) {
      if (contem(t, a) && (!melhor || a.length > melhor.tam)) melhor = { meta: m, tam: a.length, apelido: a };
    }
  }
  if (melhor && coerente) {
    // o nome sozinho não basta se a descrição tem muito mais coisa (ex.: "Pix recebido Viagem Fulano"): pede palavra de
    // movimento/produto, ou que o resto seja curto
    const resto = (` ${t} `).replace(` ${melhor.apelido} `, ' ').replace(RE_PALAVRAS_MOV, ' ').replace(/\s+/g, ' ').trim();
    if (resg || apl || RE_PRODUTO.test(t) || resto.length <= 3) return { sentido, meta: melhor.meta, porNome: true, opcoes: metas };
  }
  const g = movimentoGenerico(descricao, valor);
  if (!g) return null;
  return { sentido, meta: metas.length === 1 ? metas[0] : null, porNome: false, opcoes: metas };
}

// Quanto está guardado na meta agora (Guardar − Resgatar + saldo inicial da meta).
function guardadoNaMeta(reservaId, metaId) {
  const g = db.prepare('SELECT SUM(valor) AS s FROM historico_aportes WHERE reserva_id = ? AND meta_id = ? AND excluido_em IS NULL').get(reservaId, metaId);
  return arredondar(Math.max(0, (g && g.s) || 0));
}

// Liga uma transação do extrato a uma meta (Guardar ou Resgatar). A transação sai dos totais (ignorada = 2) e o saldo da conta
// não muda (o extrato já trouxe o dinheiro). No resgate, o que passa do guardado (ou `rendimento`, se informado) vira a linha
// "Rendimento · meta" em Rendimentos. Devolve { movimento, rendimento, principal }.
function vincularTransacao(usuarioId, reserva, t, meta, { sentido, rendimento, tipoInvestimento, ativo, rotulo } = {}) {
  const tipo = tipoInvestimento || meta.tipo_investimento || 'cdb';
  if (!TIPOS_LIQUIDEZ_RAPIDA.includes(tipo)) throw Object.assign(new Error('Metas aceitam só investimentos de liquidez rápida.'), { status: 400 });
  if (meta.tipo_investimento && meta.tipo_investimento !== tipo) {
    throw Object.assign(new Error(`Essa meta é só de outro tipo de investimento (${meta.tipo_investimento}).`), { status: 400 });
  }
  const total = Math.abs(t.valor);
  let rend = 0;
  if (sentido === 'resgatar') {
    const guardado = guardadoNaMeta(reserva.id, meta.id);
    rend = rendimento === undefined || rendimento === null || rendimento === '' ? (guardado > 0 ? Math.max(0, total - guardado) : 0) : Number(rendimento);
    if (!(rend >= 0) || rend >= total) throw Object.assign(new Error('O rendimento precisa ser menor que o valor do resgate.'), { status: 400 });
    rend = arredondar(rend);
  }
  const principal = arredondar(total - rend);
  const mov = sentido === 'guardar' ? total : -principal;
  dados.transacao(() => {
    carteira.tirarDosTotais(t.id, 'reserva_vinculada');
    dados.atualizar('transacoes', t.id, { revisao: 'vinculado', rotulo_mov: `${sentido === 'guardar' ? 'Guardar' : 'Resgate'} · ${meta.nome}` });
    carteira.lancarAporte(usuarioId, reserva, {
      movimento: mov, tipo, operacao: mov < 0 ? 'resgate' : 'aporte', ativoNome: ativo || 'Caixinha', rotuloTipo: ativo || 'Caixinha',
      descricao: (rotulo || `${sentido === 'guardar' ? 'Aplicação' : 'Resgate'} ${t.descricao ? '· ' + String(t.descricao).slice(0, 60) : ''}`) + ' (extrato)',
      dia: String(t.data).slice(0, 10), contaId: null, metaId: meta.id, transacaoId: t.id, semChecagem: true,
    });
    if (rend > 0) {
      // Linha separada, em verde: "Rendimento · meta". Não mexe no saldo da conta (o extrato já trouxe o valor inteiro).
      const nomeRend = garantirCategoriaReceita(usuarioId, 'Rendimentos', 'cat-entrada-rendimentos');
      dados.inserir('transacoes', {
        conta_id: t.conta_id, usuario_id: t.usuario_id, descricao: `Rendimento · ${meta.nome}`, valor: rend, data: t.data,
        origem: 'derivada', categoria_receita: nomeRend, vinculo: t.id, revisao: 'vinculado', icone: 'cat-entrada-rendimentos',
      });
    }
  });
  return { movimento: mov, rendimento: rend, principal };
}

// Desfaz o vínculo de uma transação com a meta: tira o lançamento da meta, apaga a linha de rendimento derivada e devolve a
// transação para "A revisar" (fora dos totais, tipo_mov 'reserva_pendente') — ou, com { comum: true }, para lançamento comum.
// O saldo da conta não muda (a transação continua lá). Devolve true se havia vínculo.
function desvincularTransacao(t, { comum = false, manterTransacao = true } = {}) {
  const ops = db.prepare('SELECT * FROM operacoes WHERE transacao_id = ? AND aporte_id IS NOT NULL AND excluido_em IS NULL').all(t.id);
  const derivadas = db.prepare("SELECT id FROM transacoes WHERE vinculo = ? AND origem = 'derivada' AND excluido_em IS NULL").all(t.id);
  if (!ops.length && !derivadas.length) return false;
  dados.transacao(() => {
    ops.forEach((op) => {
      const ap = dados.buscar('historico_aportes', op.aporte_id);
      if (ap && !ap.excluido_em) {
        const r = dados.buscar('reserva_liberdade', ap.reserva_id);
        if (r) dados.atualizar('reserva_liberdade', r.id, { valor_atual: arredondar(r.valor_atual - ap.valor) });
        dados.excluir('historico_aportes', ap.id);
      }
      dados.excluir('operacoes', op.id);
    });
    derivadas.forEach((d) => dados.excluir('transacoes', d.id));
    if (manterTransacao) {
      dados.atualizar('transacoes', t.id, comum
        ? { ignorada: 0, tipo_mov: null, rotulo_mov: null, revisao: 'comum' }
        : { ignorada: 2, tipo_mov: 'reserva_pendente', rotulo_mov: null, revisao: null });
    }
  });
  return true;
}

// Escolha manual que vira regra: acrescenta o trecho como apelido da caixinha da meta (e liga a meta à conta, se ainda não estava).
function acrescentarApelido(meta, contaId, trecho) {
  const novo = String(trecho || '').replace(/;/g, ' ').trim().slice(0, 40);
  if (novo.length < 2) throw Object.assign(new Error('Trecho muito curto para virar regra.'), { status: 400 });
  const atuais = String(meta.caixinha_nome || '').split(';').map((a) => a.trim()).filter(Boolean);
  if (!atuais.length) atuais.push(meta.nome);
  if (!atuais.some((a) => norm(a) === norm(novo))) atuais.push(novo);
  return dados.atualizar('metas_reserva', meta.id, { caixinha_nome: atuais.join('; ').slice(0, 300), caixinha_conta_id: meta.caixinha_conta_id || contaId || null });
}

module.exports = { metasDaConta, casarCaixinha, movimentoGenerico, guardadoNaMeta, vincularTransacao, desvincularTransacao, acrescentarApelido, trechoDaDescricao, apelidos, norm };
