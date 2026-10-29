const express = require('express');
const db = require('../db');
const dados = require('../dados');
const { exigirAutenticacao } = require('../middleware/auth');

const { dataValida, arredondar } = require('../utils/faturas');

const router = express.Router();

const { TIPOS_INVESTIMENTO, TIPOS_LIQUIDEZ_RAPIDA, MSG_SO_LIQUIDEZ_RAPIDA, liquidezPadrao, rendimentoCdi } = require('../utils/carteira');
const carteira = require('../utils/carteiraDb');
const { detectarReservaAutomatica } = require('../utils/reservasAuto');
const { NOME_RESGATES, garantirCategoriaReceita } = require('../utils/categoriasReceita');
const caixinhas = require('../utils/caixinhas');

// Anotação 55 — "Já guardado em" (saldo inicial da meta): um lançamento por meta em historico_aportes, operacao 'saldo_inicial'.
// NÃO é Guardar (não conta no ritmo nem nos aportes do mês) e não sai de nenhuma conta; entra no acumulado da meta.
function saldoInicialDaMeta(reservaId, metaId) {
  return db.prepare("SELECT * FROM historico_aportes WHERE reserva_id = ? AND meta_id = ? AND operacao = 'saldo_inicial' AND excluido_em IS NULL ORDER BY rowid DESC LIMIT 1").get(reservaId, metaId) || null;
}
function definirSaldoInicialMeta(reserva, meta, { data, valor }) {
  const v = arredondar(Number(valor) || 0);
  const atual = saldoInicialDaMeta(reserva.id, meta.id);
  const r = dados.buscar('reserva_liberdade', reserva.id);
  if (atual) {
    if (!v) {
      dados.excluir('historico_aportes', atual.id);
      dados.atualizar('reserva_liberdade', r.id, { valor_atual: arredondar(r.valor_atual - atual.valor) });
      return;
    }
    dados.atualizar('historico_aportes', atual.id, { valor: v, data });
    dados.atualizar('reserva_liberdade', r.id, { valor_atual: arredondar(r.valor_atual - atual.valor + v) });
  } else if (v) {
    dados.inserir('historico_aportes', {
      reserva_id: reserva.id, valor: v, tipo: meta.tipo_investimento || 'cdi', operacao: 'saldo_inicial', ativo: null,
      descricao: 'Saldo inicial da meta', conta_id: null, meta_id: meta.id, data,
    });
    dados.atualizar('reserva_liberdade', r.id, { valor_atual: arredondar(r.valor_atual + v) });
  }
}

// CDI diário (% ao dia útil, série 12 do Bacen) enviado pela tela (?cdiDiario=0.0545), que lê o cache do Bacen no aparelho.
function lerCdi(req) {
  const v = Number(String((req.query && req.query.cdiDiario) || '').replace(',', '.'));
  return v > 0 && v < 1 ? v : null;
}

// Biblioteca de ícones das metas (já embutida, sem precisar colar link).
const ICONES_META = ['🛡️', '🏖️', '✈️', '🚗', '🏠', '🎓', '💍', '🩺', '🎁', '💼', '📱', '🐷', '🌴', '🎯', '💰', '🌟'];

router.use(exigirAutenticacao);

function calcularMetaSugerida(usuarioId) {
  const { total } = db
    .prepare('SELECT COALESCE(SUM(teto_mensal), 0) AS total FROM categorias_orcamento WHERE usuario_id = ? AND excluido_em IS NULL')
    .get(usuarioId);
  return total * 6; // 6 meses de custo de vida (o ideal vai de 6 a 12)
}

function buscarOuCriarReserva(usuarioId) {
  let reserva = db.prepare('SELECT * FROM reserva_liberdade WHERE usuario_id = ? AND excluido_em IS NULL').get(usuarioId);
  if (!reserva) {
    const meta = calcularMetaSugerida(usuarioId) || 3000;
    reserva = dados.inserir('reserva_liberdade', { usuario_id: usuarioId, meta });
  }
  return reserva;
}

// Garante que existe a meta principal (a primeira), criada a partir da meta
// antiga da reserva.
function metaPrincipal(reserva) {
  let m = db.prepare('SELECT * FROM metas_reserva WHERE reserva_id = ? AND excluido_em IS NULL ORDER BY rowid ASC LIMIT 1').get(reserva.id);
  if (!m) {
    m = dados.inserir('metas_reserva', { reserva_id: reserva.id, nome: 'Reserva de Liberdade', icone: '🛡️', valor_meta: reserva.meta });
  }
  return m;
}


// A sugestão automática (6 meses de tetos) só faz sentido para a reserva de
// emergência; metas como "Viagem" não recebem sugestão.
function sugerirMeta(nome) {
  return /emerg|reserva|liberdade/i.test(String(nome || ''));
}

function diffMeses(deStr, ateStr) {
  const [a1, m1, d1] = deStr.split('-').map(Number);
  const [a2, m2, d2] = ateStr.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1) + (d2 > d1 ? 1 : 0);
}

// Ritmo necessário (para chegar no prazo) x ritmo real dos últimos 3 meses.
function infoPrazo(meta, atingido, reservaId, hojeStr) {
  if (!meta.prazo) return null;
  const falta = arredondar(Math.max(0, meta.valor_meta - atingido));
  if (falta === 0) return { status: 'concluida', falta: 0, meses_restantes: 0, necessario_mes: 0, ritmo_mes: 0 };
  const meses = Math.max(0, diffMeses(hojeStr, meta.prazo));
  const [ay, am] = hojeStr.split('-').map(Number);
  const ini = new Date(ay, am - 3, 1);
  const desde = `${ini.getFullYear()}-${String(ini.getMonth() + 1).padStart(2, '0')}-01`;
  const { total } = db
    .prepare("SELECT COALESCE(SUM(valor), 0) AS total FROM historico_aportes WHERE reserva_id = ? AND meta_id = ? AND data >= ? AND excluido_em IS NULL AND operacao <> 'saldo_inicial'")
    .get(reservaId, meta.id, desde);
  const ritmo = arredondar(Math.max(0, total) / 3);
  if (meses === 0) return { status: 'atrasado', falta, meses_restantes: 0, necessario_mes: falta, ritmo_mes: ritmo };
  const necessario = arredondar(falta / meses);
  let status = 'atrasado';
  if (ritmo >= necessario * 1.1) status = 'adiantado';
  else if (ritmo >= necessario * 0.9) status = 'no_ritmo';
  return { status, falta, meses_restantes: meses, necessario_mes: necessario, ritmo_mes: ritmo };
}

// Rendimento da meta: SIMULADO pelo CDI (100%) sobre o que foi guardado/resgatado nela + rendimentos registrados à mão.
// Sem a taxa do CDI (cdi = null) o simulado é 0 e `rendimento_origem` fica null.
function rendimentoDaMeta(meta, atingido, reservaId, cdi, hojeStr) {
  const registrado = arredondar(
    db.prepare("SELECT COALESCE(SUM(total), 0) AS t FROM operacoes WHERE meta_id = ? AND tipo = 'rendimento' AND excluido_em IS NULL").get(meta.id).t
  );
  let simulado = 0;
  if (cdi) {
    const movs = db.prepare('SELECT data, valor FROM historico_aportes WHERE reserva_id = ? AND meta_id = ? AND excluido_em IS NULL').all(reservaId, meta.id);
    simulado = rendimentoCdi(movs, cdi, hojeStr).rendimento;
  }
  const rendimento = arredondar(simulado + registrado);
  return {
    rendimento_simulado: simulado,
    rendimento_registrado: registrado,
    rendimento_estimado: rendimento,
    rendimento_origem: cdi ? 'cdi_bacen' : registrado ? 'registrado' : null,
    valor_acumulado: arredondar(atingido + rendimento),
  };
}

function montarResposta(reserva, usuarioId, cdi = null) {
  const historico = db
    .prepare('SELECT * FROM historico_aportes WHERE reserva_id = ? AND excluido_em IS NULL ORDER BY data DESC, criado_em DESC, rowid DESC')
    .all(reserva.id);
  const porTipo = db
    .prepare(
      `SELECT tipo, SUM(valor) AS total, COUNT(*) AS quantidade
       FROM historico_aportes WHERE reserva_id = ? AND excluido_em IS NULL GROUP BY tipo ORDER BY total DESC`
    )
    .all(reserva.id)
    .map((l) => ({ ...l, total: arredondar(l.total), rotulo: TIPOS_INVESTIMENTO[l.tipo] || l.tipo }));

  const porMes = db
    .prepare(
      `SELECT substr(data, 1, 7) AS mes, SUM(valor) AS movimento
       FROM historico_aportes WHERE reserva_id = ? AND excluido_em IS NULL GROUP BY mes ORDER BY mes ASC`
    )
    .all(reserva.id);
  let acumulado = 0;
  const evolucao = porMes.map((m) => {
    acumulado = arredondar(acumulado + m.movimento);
    return { mes: m.mes, movimento: arredondar(m.movimento), saldo: acumulado };
  });

  // Metas: cada aporte pode ter uma meta de destino; o progresso da meta é a
  // soma dos aportes dela.
  metaPrincipal(reserva);
  const porMeta = Object.fromEntries(
    db
      .prepare('SELECT meta_id, SUM(valor) AS total FROM historico_aportes WHERE reserva_id = ? AND excluido_em IS NULL AND meta_id IS NOT NULL GROUP BY meta_id')
      .all(reserva.id)
      .map((l) => [l.meta_id, l.total])
  );
  const sugerida = calcularMetaSugerida(usuarioId);
  const hojeStr = new Date().toLocaleDateString('sv-SE', { timeZone: process.env.APP_TIMEZONE || 'America/Sao_Paulo' });
  const metas = db
    .prepare('SELECT * FROM metas_reserva WHERE reserva_id = ? AND excluido_em IS NULL ORDER BY rowid ASC')
    .all(reserva.id)
    .map((m) => {
      const atingido = arredondar(porMeta[m.id] || 0);
      const si = saldoInicialDaMeta(reserva.id, m.id);
      return {
        ...m,
        saldo_inicial_valor: si ? si.valor : null,
        saldo_inicial_data: si ? String(si.data).slice(0, 10) : null,
        tipo_rotulo: m.tipo_investimento ? TIPOS_INVESTIMENTO[m.tipo_investimento] || m.tipo_investimento : null,
        valor_atingido: atingido,
        saldo_restante: arredondar(Math.max(0, m.valor_meta - atingido)),
        ...rendimentoDaMeta(m, atingido, reserva.id, cdi, hojeStr),
        sugestao: sugerirMeta(m.nome) && sugerida > 0 ? sugerida : null,
        prazo_info: infoPrazo(m, atingido, reserva.id, hojeStr),
      };
    });
  const meta = metas[0];
  const progressoMeta = meta.valor_atingido;

  return {
    ...reserva,
    meta: meta.valor_meta,
    meta_nome: meta.nome,
    meta_icone: meta.icone,
    meta_tipo_investimento: meta.tipo_investimento,
    valor_meta_atingido: progressoMeta,
    metas,
    evolucao,
    meta_sugerida: sugerida,
    historico_aportes: historico,
    resumo_por_tipo: porTipo,
    tipos_investimento: Object.entries(TIPOS_INVESTIMENTO).map(([valor, rotulo]) => ({ valor, rotulo, liquidez: liquidezPadrao(valor) })),
    tipos_liquidez_rapida: TIPOS_LIQUIDEZ_RAPIDA,
    aviso_liquidez: MSG_SO_LIQUIDEZ_RAPIDA,
    cdi_diario: cdi,
    icones_meta: ICONES_META,
  };
}

router.get('/', (req, res) => {
  const reserva = buscarOuCriarReserva(req.usuario.id);
  res.json(montarResposta(reserva, req.usuario.id, lerCdi(req)));
});

// Edita a meta principal: valor, nome, ícone e tipo de investimento.
router.put('/', (req, res) => {
  const reserva = buscarOuCriarReserva(req.usuario.id);
  const m = metaPrincipal(reserva);
  const corpo = req.body || {};

  const valor = corpo.meta === undefined ? m.valor_meta : Number(corpo.meta);
  if (!valor || valor <= 0) return res.status(400).json({ erro: 'Informe uma meta maior que zero.' });

  const nome = corpo.nome === undefined ? m.nome : String(corpo.nome).trim().slice(0, 60);
  if (!nome) return res.status(400).json({ erro: 'Dê um nome para a meta.' });

  let icone = m.icone;
  if (corpo.icone !== undefined) {
    if (corpo.icone && !ICONES_META.includes(corpo.icone)) return res.status(400).json({ erro: 'Ícone inválido.' });
    icone = corpo.icone || null;
  }

  let tipo = m.tipo_investimento;
  if (corpo.tipoInvestimento !== undefined) {
    if (corpo.tipoInvestimento && !TIPOS_INVESTIMENTO[corpo.tipoInvestimento]) {
      return res.status(400).json({ erro: 'Tipo de investimento inválido.' });
    }
    if (corpo.tipoInvestimento && !TIPOS_LIQUIDEZ_RAPIDA.includes(corpo.tipoInvestimento)) {
      return res.status(400).json({ erro: MSG_SO_LIQUIDEZ_RAPIDA });
    }
    tipo = corpo.tipoInvestimento || null;
  }

  dados.transacao(() => {
    dados.atualizar('metas_reserva', m.id, { valor_meta: valor, nome, icone, tipo_investimento: tipo });
    dados.atualizar('reserva_liberdade', reserva.id, { meta: valor });
  });
  res.json(montarResposta(dados.buscar('reserva_liberdade', reserva.id), req.usuario.id, lerCdi(req)));
});

// --- Várias metas ---------------------------------------------------------

function lerMeta(corpo, atual) {
  const valor = corpo.valorMeta === undefined && corpo.meta === undefined ? atual?.valor_meta : Number(corpo.valorMeta ?? corpo.meta);
  if (!valor || valor <= 0) return { erro: 'Informe uma meta maior que zero.' };

  const nome = corpo.nome === undefined ? atual?.nome : String(corpo.nome).trim().slice(0, 60);
  if (!nome) return { erro: 'Dê um nome para a meta.' };

  let icone = atual ? atual.icone : '🎯';
  if (corpo.icone !== undefined) {
    if (corpo.icone && !ICONES_META.includes(corpo.icone)) return { erro: 'Ícone inválido.' };
    icone = corpo.icone || null;
  }

  let tipo = atual ? atual.tipo_investimento : null;
  if (corpo.tipoInvestimento !== undefined) {
    if (corpo.tipoInvestimento && !TIPOS_INVESTIMENTO[corpo.tipoInvestimento]) return { erro: 'Tipo de investimento inválido.' };
    if (corpo.tipoInvestimento && !TIPOS_LIQUIDEZ_RAPIDA.includes(corpo.tipoInvestimento)) return { erro: MSG_SO_LIQUIDEZ_RAPIDA };
    tipo = corpo.tipoInvestimento || null;
  }

  let prazo = atual ? atual.prazo : null;
  if (corpo.prazo !== undefined) {
    if (corpo.prazo && !dataValida(corpo.prazo)) return { erro: 'Prazo inválido.' };
    prazo = corpo.prazo || null;
  }
  // Anotação 55: "Já guardado em" (data + valor). undefined = não mexe; valor 0 = apaga.
  let inicial;
  if (corpo.saldoInicial !== undefined && corpo.saldoInicial !== null) {
    const v = Number(corpo.saldoInicial.valor) || 0;
    const dia = String(corpo.saldoInicial.data || carteira.hojeStr()).slice(0, 10);
    if (v < 0) return { erro: 'O valor já guardado não pode ser negativo.' };
    if (!dataValida(dia)) return { erro: 'Data do valor já guardado inválida.' };
    if (dia > carteira.hojeStr()) return { erro: 'A data do valor já guardado não pode ser no futuro.' };
    inicial = { data: dia, valor: v };
  }
  // Anotação 56: meta ligada à caixinha do banco (conta + nome no extrato; apelidos separados por ';').
  let caixinha;
  if (corpo.caixinha !== undefined) {
    if (!corpo.caixinha || !corpo.caixinha.contaId) caixinha = { conta: null, nome: null };
    else {
      const nomeCx = String(corpo.caixinha.nome || '').split(';').map((a) => a.trim()).filter(Boolean).join('; ').slice(0, 300);
      caixinha = { conta: String(corpo.caixinha.contaId), nome: nomeCx || null };
    }
  }
  return { dados: { valor, nome, icone, tipo, prazo, inicial, caixinha } };
}

function sincronizarMetaPrincipal(reserva) {
  const m = metaPrincipal(reserva);
  dados.atualizar('reserva_liberdade', reserva.id, { meta: m.valor_meta });
}

router.post('/metas', (req, res) => {
  const reserva = buscarOuCriarReserva(req.usuario.id);
  metaPrincipal(reserva);
  const lida = lerMeta(req.body || {}, null);
  if (lida.erro) return res.status(400).json({ erro: lida.erro });
  const d = lida.dados;
  if (d.caixinha && d.caixinha.conta && !db.prepare('SELECT 1 AS x FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(d.caixinha.conta, req.usuario.id)) {
    return res.status(400).json({ erro: 'Conta da caixinha não encontrada.' });
  }
  dados.transacao(() => {
    const m = dados.inserir('metas_reserva', {
      reserva_id: reserva.id, nome: d.nome, icone: d.icone || '🎯', tipo_investimento: d.tipo, valor_meta: d.valor, prazo: d.prazo,
      caixinha_conta_id: d.caixinha ? d.caixinha.conta : null, caixinha_nome: d.caixinha ? d.caixinha.nome : null,
    });
    if (d.inicial && d.inicial.valor) definirSaldoInicialMeta(reserva, m, d.inicial);
  });
  res.status(201).json(montarResposta(reserva, req.usuario.id, lerCdi(req)));
});

router.put('/metas/:id', (req, res) => {
  const reserva = buscarOuCriarReserva(req.usuario.id);
  const atual = db.prepare('SELECT * FROM metas_reserva WHERE id = ? AND reserva_id = ? AND excluido_em IS NULL').get(req.params.id, reserva.id);
  if (!atual) return res.status(404).json({ erro: 'Meta não encontrada.' });
  const lida = lerMeta(req.body || {}, atual);
  if (lida.erro) return res.status(400).json({ erro: lida.erro });
  const d = lida.dados;
  // Trocar o tipo de uma meta com aportes de outro tipo deixaria a meta incoerente
  if (d.tipo && d.tipo !== atual.tipo_investimento) {
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM historico_aportes WHERE meta_id = ? AND tipo != ? AND excluido_em IS NULL AND operacao <> 'saldo_inicial'").get(atual.id, d.tipo);
    if (n > 0) return res.status(400).json({ erro: 'Esta meta já tem lançamentos de outro tipo de investimento.' });
  }
  if (d.caixinha && d.caixinha.conta && !db.prepare('SELECT 1 AS x FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(d.caixinha.conta, req.usuario.id)) {
    return res.status(400).json({ erro: 'Conta da caixinha não encontrada.' });
  }
  dados.transacao(() => {
    dados.atualizar('metas_reserva', atual.id, {
      nome: d.nome, icone: d.icone, tipo_investimento: d.tipo, valor_meta: d.valor, prazo: d.prazo,
      ...(d.caixinha ? { caixinha_conta_id: d.caixinha.conta, caixinha_nome: d.caixinha.nome } : {}),
    });
    const si = saldoInicialDaMeta(reserva.id, atual.id);
    if (si && d.tipo && si.tipo !== d.tipo) dados.atualizar('historico_aportes', si.id, { tipo: d.tipo });
    if (d.inicial) definirSaldoInicialMeta(reserva, dados.buscar('metas_reserva', atual.id), d.inicial);
  });
  sincronizarMetaPrincipal(reserva);
  res.json(montarResposta(dados.buscar('reserva_liberdade', reserva.id), req.usuario.id, lerCdi(req)));
});

router.delete('/metas/:id', (req, res) => {
  const reserva = buscarOuCriarReserva(req.usuario.id);
  const atual = db.prepare('SELECT * FROM metas_reserva WHERE id = ? AND reserva_id = ? AND excluido_em IS NULL').get(req.params.id, reserva.id);
  if (!atual) return res.status(404).json({ erro: 'Meta não encontrada.' });
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM metas_reserva WHERE reserva_id = ? AND excluido_em IS NULL').get(reserva.id);
  if (n <= 1) return res.status(400).json({ erro: 'Mantenha pelo menos uma meta.' });
  dados.excluir('metas_reserva', atual.id); // os lançamentos ficam, sem meta (anulação feita pela camada de dados)
  sincronizarMetaPrincipal(reserva);
  res.json(montarResposta(dados.buscar('reserva_liberdade', reserva.id), req.usuario.id, lerCdi(req)));
});

// Lê e valida um lançamento (aporte = compra de ativo, resgate = venda).
// Informe quantidade + preço unitário do dia (valor = quantidade x preço) ou
// só o valor total, para investimentos sem cotação (ex.: poupança).
function lerAporte(corpo, usuarioId) {
  const tipo = corpo?.tipo || 'cdi';
  if (!TIPOS_INVESTIMENTO[tipo]) return { erro: 'Tipo de investimento inválido.' };

  const operacao = corpo?.operacao === 'resgate' ? 'resgate' : 'aporte';

  const quantidade = corpo?.quantidade === undefined || corpo?.quantidade === null || corpo?.quantidade === '' ? null : Number(corpo.quantidade);
  const preco = corpo?.precoUnitario === undefined || corpo?.precoUnitario === null || corpo?.precoUnitario === '' ? null : Number(corpo.precoUnitario);

  let valor;
  if (quantidade !== null || preco !== null) {
    if (!(quantidade > 0) || !(preco > 0)) {
      return { erro: 'Informe quantidade e preço unitário maiores que zero (ou só o valor total).' };
    }
    valor = arredondar(quantidade * preco);
  } else {
    valor = Number(corpo?.valor);
  }
  if (!valor || valor <= 0) return { erro: 'Informe um valor maior que zero.' };

  const dia = corpo?.data || null;
  if (dia && !dataValida(dia)) return { erro: 'Data inválida.' };

  const descricao = String(corpo?.descricao || '').trim().slice(0, 200) || null;
  const ativo = String(corpo?.ativo || '').trim().slice(0, 60) || null;

  let contaId = null;
  if (corpo?.contaId !== undefined && corpo?.contaId !== null && corpo?.contaId !== '') {
    const conta = db.prepare('SELECT id FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(corpo.contaId), usuarioId);
    if (!conta) return { erro: 'Conta não encontrada.' };
    contaId = conta.id;
  }
  let metaId = null;
  if (corpo?.metaId !== undefined && corpo?.metaId !== null && corpo?.metaId !== '') {
    const meta = db
      .prepare(
        `SELECT m.* FROM metas_reserva m JOIN reserva_liberdade r ON r.id = m.reserva_id
         WHERE m.id = ? AND r.usuario_id = ? AND m.excluido_em IS NULL AND r.excluido_em IS NULL`
      )
      .get(String(corpo.metaId), usuarioId);
    if (!meta) return { erro: 'Meta não encontrada.' };
    if (!TIPOS_LIQUIDEZ_RAPIDA.includes(tipo)) return { erro: MSG_SO_LIQUIDEZ_RAPIDA };
    if (meta.tipo_investimento && meta.tipo_investimento !== tipo) {
      return { erro: `Essa meta é só de ${TIPOS_INVESTIMENTO[meta.tipo_investimento]}.` };
    }
    metaId = meta.id;
  }
  return {
    dados: {
      metaId, tipo, operacao, descricao, ativo, dia, contaId, quantidade, preco,
      movimento: arredondar(operacao === 'resgate' ? -valor : valor),
    },
  };
}

// A conta de origem (aporte) ou de destino (resgate) só tem o saldo mexido se
// for manual; em conta conectada o saldo vem do banco.
function ajustarConta(contaId, delta) {
  if (!contaId || !delta) return;
  const conta = dados.buscar('contas', contaId);
  if (conta && conta.origem === 'manual') dados.somar('contas', contaId, 'saldo', delta);
}

router.post('/aportes', (req, res) => {
  const reserva = buscarOuCriarReserva(req.usuario.id);
  const lida = lerAporte(req.body, req.usuario.id);
  if (lida.erro) return res.status(400).json({ erro: lida.erro });
  const a = lida.dados;
  // Sem data informada, vale o dia de hoje no fuso do usuário (não o do servidor, que é UTC)
  if (!a.dia) a.dia = new Date().toLocaleDateString('sv-SE', { timeZone: process.env.APP_TIMEZONE || 'America/Sao_Paulo' });

  try {
    carteira.lancarAporte(req.usuario.id, reserva, {
      movimento: a.movimento, tipo: a.tipo, operacao: a.operacao, ativoNome: a.ativo, rotuloTipo: TIPOS_INVESTIMENTO[a.tipo],
      quantidade: a.quantidade, preco: a.preco, descricao: a.descricao, dia: a.dia, contaId: a.contaId, metaId: a.metaId,
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ erro: e.message });
    throw e;
  }

  const atualizada = dados.buscar('reserva_liberdade', reserva.id);
  res.status(201).json(montarResposta(atualizada, req.usuario.id, lerCdi(req)));
});

function buscarAporte(req, reserva) {
  return db.prepare('SELECT * FROM historico_aportes WHERE id = ? AND reserva_id = ? AND excluido_em IS NULL').get(req.params.id, reserva.id);
}

// Editar = desfazer o lançamento antigo e aplicar o novo, numa transação.
router.put('/aportes/:id', (req, res) => {
  const reserva = buscarOuCriarReserva(req.usuario.id);
  const antigo = buscarAporte(req, reserva);
  if (!antigo) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  if (antigo.operacao === 'saldo_inicial') return res.status(400).json({ erro: 'Mude o valor já guardado em Editar meta.' });

  const lida = lerAporte(req.body, req.usuario.id);
  if (lida.erro) return res.status(400).json({ erro: lida.erro });
  const a = lida.dados;

  const novoValorAtual = arredondar(reserva.valor_atual - antigo.valor + a.movimento);
  if (novoValorAtual < 0) return res.status(400).json({ erro: 'Com essa alteração a reserva ficaria negativa.' });

  dados.transacao(() => {
    ajustarConta(antigo.conta_id, antigo.valor);
    ajustarConta(a.contaId, -a.movimento);
    dados.atualizar('reserva_liberdade', reserva.id, { valor_atual: novoValorAtual });
    const novo = dados.atualizar('historico_aportes', antigo.id, {
      valor: a.movimento, tipo: a.tipo, operacao: a.operacao, ativo: a.ativo, quantidade: a.quantidade, preco_unitario: a.preco,
      descricao: a.descricao, data: a.dia || antigo.data, conta_id: a.contaId, meta_id: a.metaId,
    });
    carteira.refazerOperacaoDoAporte(req.usuario.id, { ...novo, ativo: novo.ativo || TIPOS_INVESTIMENTO[novo.tipo] });
  });

  const atualizada = dados.buscar('reserva_liberdade', reserva.id);
  res.json(montarResposta(atualizada, req.usuario.id, lerCdi(req)));
});

router.delete('/aportes/:id', (req, res) => {
  const reserva = buscarOuCriarReserva(req.usuario.id);
  const antigo = buscarAporte(req, reserva);
  if (!antigo) return res.status(404).json({ erro: 'Lançamento não encontrado.' });

  const novoValorAtual = arredondar(reserva.valor_atual - antigo.valor);
  if (novoValorAtual < 0) {
    return res.status(400).json({ erro: 'Não dá para apagar: a reserva ficaria negativa (há resgates que dependem deste lançamento).' });
  }

  dados.transacao(() => {
    ajustarConta(antigo.conta_id, antigo.valor);
    dados.atualizar('reserva_liberdade', reserva.id, { valor_atual: novoValorAtual });
    carteira.removerOperacoesDoAporte(antigo.id);
    dados.excluir('historico_aportes', antigo.id);
  });

  const atualizada = dados.buscar('reserva_liberdade', reserva.id);
  res.json(montarResposta(atualizada, req.usuario.id, lerCdi(req)));
});

// --- Extrato da meta (lista limpa: Guardar, Resgatar, rendimentos) ---------------------------------------------------
// GET /api/reserva/metas/:id/extrato?cdiDiario=0.0545
router.get('/metas/:id/extrato', (req, res) => {
  const reserva = buscarOuCriarReserva(req.usuario.id);
  const meta = db.prepare('SELECT * FROM metas_reserva WHERE id = ? AND reserva_id = ? AND excluido_em IS NULL').get(req.params.id, reserva.id);
  if (!meta) return res.status(404).json({ erro: 'Meta não encontrada.' });
  const cdi = lerCdi(req);
  const hojeStr = carteira.hojeStr();
  const linhas = db
    .prepare('SELECT id, data, valor, operacao, ativo, tipo, descricao, quantidade, preco_unitario FROM historico_aportes WHERE reserva_id = ? AND meta_id = ? AND excluido_em IS NULL')
    .all(reserva.id, meta.id)
    .map((l) => ({
      id: l.id, data: String(l.data).slice(0, 10), tipo: l.operacao === 'saldo_inicial' ? 'saldo_inicial' : l.valor < 0 ? 'resgatar' : 'guardar', valor: l.valor,
      ativo: l.ativo || TIPOS_INVESTIMENTO[l.tipo] || l.tipo, descricao: l.descricao || null, simulado: false,
    }));
  db.prepare("SELECT id, data, total, descricao FROM operacoes WHERE meta_id = ? AND tipo = 'rendimento' AND excluido_em IS NULL").all(meta.id).forEach((o) =>
    linhas.push({ id: o.id, data: String(o.data).slice(0, 10), tipo: 'rendimento', valor: o.total, ativo: null, descricao: o.descricao || null, simulado: false })
  );
  const atingido = arredondar(linhas.filter((l) => l.tipo !== 'rendimento').reduce((t, l) => t + l.valor, 0));
  linhas.forEach((l) => { if (l.tipo === 'saldo_inicial') { l.ativo = null; l.descricao = 'Já estava guardado (não saiu de nenhuma conta)'; } });
  const rend = rendimentoDaMeta(meta, atingido, reserva.id, cdi, hojeStr);
  if (rend.rendimento_simulado > 0) {
    linhas.push({ id: null, data: hojeStr, tipo: 'rendimento', valor: rend.rendimento_simulado, ativo: null, descricao: 'Rendimento estimado pelo CDI (100%)', simulado: true });
  }
  linhas.sort((a, b) => b.data.localeCompare(a.data) || (a.simulado ? -1 : 1));
  res.json({
    meta: { id: meta.id, nome: meta.nome, icone: meta.icone, valor_meta: meta.valor_meta, tipo_investimento: meta.tipo_investimento, prazo: meta.prazo },
    valor_guardado: atingido,
    ...rend,
    saldo_restante: arredondar(Math.max(0, meta.valor_meta - rend.valor_acumulado)),
    prazo_info: infoPrazo(meta, atingido, reserva.id, hojeStr),
    pct: meta.valor_meta ? Math.min(100, Math.round((rend.valor_acumulado / meta.valor_meta) * 100)) : 0,
    cdi_diario: cdi,
    nota: 'Rendimentos simulados com dados públicos do Bacen',
    linhas,
  });
});

// --- Reservas automáticas: "Aplicação Caixinha", "Meu Porquinho", "Resgate CDB" ------------------------------------------
// Sugestões pendentes: transações do extrato (últimos 120 dias) reconhecidas por detectarReservaAutomatica e ainda sem decisão.
router.get('/auto/pendentes', (req, res) => {
  const desde = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const linhas = db
    .prepare(
      `SELECT t.id, t.descricao, t.valor, t.data, t.conta_id, c.nome AS conta_nome
       FROM transacoes t LEFT JOIN contas c ON c.id = t.conta_id
       WHERE t.usuario_id = ? AND t.excluido_em IS NULL AND t.data >= ? AND t.ignorada = 0 AND t.tipo_mov IS NULL AND t.revisao IS NULL
         AND t.id NOT IN (SELECT transacao_id FROM faturas_pagas WHERE transacao_id IS NOT NULL AND excluido_em IS NULL)
       ORDER BY t.data DESC, t.rowid DESC`
    )
    .all(req.usuario.id, desde);
  const pendentes = [];
  // Anotação 56: caixinhas sem o nome no extrato com mais de uma meta ligada à conta (já fora dos totais): opções = metas da conta
  db.prepare(
    `SELECT t.id, t.descricao, t.valor, t.data, t.conta_id, c.nome AS conta_nome FROM transacoes t LEFT JOIN contas c ON c.id = t.conta_id
     WHERE t.usuario_id = ? AND t.excluido_em IS NULL AND t.tipo_mov = 'reserva_pendente' ORDER BY t.data DESC, t.rowid DESC`
  ).all(req.usuario.id).forEach((t) => {
    const sentido = t.valor < 0 ? 'guardar' : 'resgatar';
    const opcoes = caixinhas.metasDaConta(req.usuario.id, t.conta_id).map((m) => ({ id: m.id, nome: m.nome }));
    pendentes.push({
      transacao: { ...t, data: String(t.data).slice(0, 10) },
      deteccao: { produto: 'Caixinha', sentido, tipoInvestimento: 'cdb', rotulo: `${sentido === 'guardar' ? 'Aplicação' : 'Resgate'} Caixinha`, ativo: 'Caixinha', caixinha: true },
      opcoes, trecho: caixinhas.trechoDaDescricao(t.descricao),
    });
  });
  for (const t of linhas) {
    const d = detectarReservaAutomatica(t.descricao);
    if (!d) continue;
    // aplicação sai da conta (valor < 0); resgate entra (valor > 0)
    if ((d.sentido === 'guardar' && t.valor >= 0) || (d.sentido === 'resgatar' && t.valor <= 0)) continue;
    pendentes.push({ transacao: { ...t, data: String(t.data).slice(0, 10) }, deteccao: d });
  }
  // Quanto já foi GUARDADO em cada meta (aportes − resgates registrados): serve para separar o rendimento dentro do resgate.
  const reserva = buscarOuCriarReserva(req.usuario.id);
  const guardado = {};
  db.prepare('SELECT meta_id, SUM(valor) AS total FROM historico_aportes WHERE reserva_id = ? AND excluido_em IS NULL AND meta_id IS NOT NULL GROUP BY meta_id')
    .all(reserva.id).forEach((r) => { guardado[r.meta_id] = Math.round((r.total || 0) * 100) / 100; });
  res.json({ pendentes, guardado });
});

// Decide uma sugestão. acao 'vincular' (metaId): atualiza a meta (e o rendimento, pelo CDI, na leitura); acao 'recusar':
// a transação fica separada do orçamento (operação 'reserva_recusada'), sem mexer em meta nem saldo.
router.post('/auto/decidir', (req, res) => {
  const reserva = buscarOuCriarReserva(req.usuario.id);
  const { transacaoId, acao, metaId } = req.body || {};
  const t = db.prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String(transacaoId || ''), req.usuario.id);
  if (!t) return res.status(404).json({ erro: 'Transação não encontrada.' });
  if (db.prepare('SELECT 1 AS x FROM operacoes WHERE transacao_id = ? AND excluido_em IS NULL').get(t.id)) {
    return res.status(409).json({ erro: 'Esta transação já foi tratada.' });
  }
  // Anotação 56: caixinha pendente (sem o nome no extrato): vincula pela regra da caixinha; `regra: true` guarda o trecho da
  // descrição como apelido da caixinha da meta (as próximas vão sozinhas).
  if (t.tipo_mov === 'reserva_pendente') {
    const sentido = t.valor < 0 ? 'guardar' : 'resgatar';
    try {
      if (acao === 'vincular') {
        const meta = db.prepare('SELECT * FROM metas_reserva WHERE id = ? AND reserva_id = ? AND excluido_em IS NULL').get(String(metaId || ''), reserva.id);
        if (!meta) return res.status(400).json({ erro: 'Escolha uma meta.' });
        let regra = null;
        dados.transacao(() => {
          caixinhas.vincularTransacao(req.usuario.id, reserva, t, meta, { sentido, rendimento: (req.body || {}).rendimento });
          if ((req.body || {}).regra) { const trecho = caixinhas.trechoDaDescricao(t.descricao); caixinhas.acrescentarApelido(meta, t.conta_id, trecho); regra = trecho; }
        });
        return res.status(201).json({ ...montarResposta(dados.buscar('reserva_liberdade', reserva.id), req.usuario.id, lerCdi(req)), regra });
      }
      if (acao === 'recusar') dados.atualizar('transacoes', t.id, { tipo_mov: 'reserva_recusada', revisao: 'recusado' });
      else if (acao === 'comum' || acao === 'externo') {
        const campos = { ignorada: 0, tipo_mov: null, revisao: acao };
        if (acao === 'externo' && t.valor > 0) campos.categoria_receita = garantirCategoriaReceita(req.usuario.id, NOME_RESGATES, 'cat-entrada-resgate');
        dados.atualizar('transacoes', t.id, campos);
      } else return res.status(400).json({ erro: 'Escolha uma opção.' });
      return res.status(201).json(montarResposta(dados.buscar('reserva_liberdade', reserva.id), req.usuario.id, lerCdi(req)));
    } catch (e) {
      if (e.status) return res.status(e.status).json({ erro: e.message });
      throw e;
    }
  }
  const det = detectarReservaAutomatica(t.descricao);
  if (!det) return res.status(400).json({ erro: 'Esta transação não parece uma reserva automática.' });
  if (!['vincular', 'recusar', 'externo', 'comum'].includes(acao)) return res.status(400).json({ erro: 'Escolha uma opção.' });
  if ((acao === 'externo' || acao === 'comum') && det.sentido !== 'resgatar') return res.status(400).json({ erro: 'Essa opção vale só para resgates.' });

  try {
    dados.transacao(() => {
      const dia = String(t.data).slice(0, 10);
      // Fora do orçamento nos dois casos (ignorada = 2: o saldo da conta continua valendo, os totais e categorias não contam)
      if (acao === 'recusar') {
        carteira.tirarDosTotais(t.id, 'reserva_recusada');
        dados.atualizar('transacoes', t.id, { revisao: 'recusado' });
        return;
      }
      // Resgate de dinheiro que veio de FORA do app (FGTS, PIS/PASEP, previdência...): é entrada, na categoria própria.
      if (acao === 'externo') {
        const nome = garantirCategoriaReceita(req.usuario.id, NOME_RESGATES, 'cat-entrada-resgate');
        dados.atualizar('transacoes', t.id, { categoria_receita: nome, revisao: 'externo' });
        return;
      }
      // O usuário decide deixar como entrada comum: o app não insiste.
      if (acao === 'comum') { dados.atualizar('transacoes', t.id, { revisao: 'comum' }); return; }
      const meta = db
        .prepare('SELECT * FROM metas_reserva WHERE id = ? AND reserva_id = ? AND excluido_em IS NULL')
        .get(String(metaId || ''), reserva.id);
      if (!meta) { const e = new Error('Escolha uma meta.'); e.status = 400; throw e; }
      if (!TIPOS_LIQUIDEZ_RAPIDA.includes(det.tipoInvestimento)) { const e = new Error(MSG_SO_LIQUIDEZ_RAPIDA); e.status = 400; throw e; }
      if (meta.tipo_investimento && meta.tipo_investimento !== det.tipoInvestimento) {
        const e = new Error(`Essa meta é só de ${TIPOS_INVESTIMENTO[meta.tipo_investimento]}.`);
        e.status = 400;
        throw e;
      }
      // Resgate = dinheiro que já era do usuário mudando de lugar (fora das Entradas). Só o RENDIMENTO dentro dele é entrada:
      // separa sozinho pelo que foi guardado na meta, ou usa o valor informado pelo usuário (`rendimento`).
      const total = Math.abs(t.valor);
      let rend = 0;
      if (det.sentido === 'resgatar') {
        const g = db.prepare('SELECT SUM(valor) AS s FROM historico_aportes WHERE reserva_id = ? AND meta_id = ? AND excluido_em IS NULL').get(reserva.id, meta.id);
        const guardadoMeta = Math.max(0, (g && g.s) || 0);
        const pedido = req.body && req.body.rendimento;
        rend = pedido === undefined || pedido === null || pedido === '' ? (guardadoMeta > 0 ? Math.max(0, total - guardadoMeta) : 0) : Number(pedido);
        if (!(rend >= 0) || rend >= total) { const e = new Error('O rendimento precisa ser menor que o valor do resgate.'); e.status = 400; throw e; }
        rend = Math.round(rend * 100) / 100;
      }
      const principal = Math.round((total - rend) * 100) / 100;
      const mov = det.sentido === 'guardar' ? total : -principal;
      carteira.tirarDosTotais(t.id, 'reserva_vinculada');
      dados.atualizar('transacoes', t.id, { revisao: 'vinculado', rotulo_mov: `${det.sentido === 'guardar' ? 'Guardar' : 'Resgate'} · ${meta.nome}` });
      carteira.lancarAporte(req.usuario.id, reserva, {
        movimento: mov, tipo: det.tipoInvestimento, operacao: mov < 0 ? 'resgate' : 'aporte', ativoNome: det.ativo, rotuloTipo: det.ativo,
        descricao: det.rotulo + ' (extrato)', dia, contaId: null, metaId: meta.id, transacaoId: t.id, semChecagem: true,
      });
      if (rend > 0) {
        // Linha separada, em verde: "Rendimento · meta". Não mexe no saldo da conta (o extrato já trouxe o valor inteiro).
        const nomeRend = garantirCategoriaReceita(req.usuario.id, 'Rendimentos', 'cat-entrada-rendimentos');
        dados.inserir('transacoes', {
          conta_id: t.conta_id, usuario_id: t.usuario_id, descricao: `Rendimento · ${meta.nome}`, valor: rend, data: t.data,
          origem: 'derivada', categoria_receita: nomeRend, vinculo: t.id, revisao: 'vinculado', icone: 'cat-entrada-rendimentos',
        });
      }
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ erro: e.message });
    throw e;
  }
  res.status(201).json(montarResposta(dados.buscar('reserva_liberdade', reserva.id), req.usuario.id, lerCdi(req)));
});

// Anotação 56 — escolha manual vira regra: { trecho, contaId } acrescenta o trecho como apelido da caixinha da meta.
router.post('/metas/:id/caixinha-apelido', (req, res) => {
  const reserva = buscarOuCriarReserva(req.usuario.id);
  const meta = db.prepare('SELECT * FROM metas_reserva WHERE id = ? AND reserva_id = ? AND excluido_em IS NULL').get(req.params.id, reserva.id);
  if (!meta) return res.status(404).json({ erro: 'Meta não encontrada.' });
  const contaId = (req.body || {}).contaId ? String(req.body.contaId) : null;
  if (contaId && !db.prepare('SELECT 1 AS x FROM contas WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(contaId, req.usuario.id)) return res.status(400).json({ erro: 'Conta não encontrada.' });
  try {
    const m = caixinhas.acrescentarApelido(meta, contaId, (req.body || {}).trecho);
    res.json({ ok: true, caixinha_nome: m.caixinha_nome });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ erro: e.message });
    throw e;
  }
});

// Anotação 56 — "Desfazer" do aviso "Vinculado à meta Viagem": tira o Guardar/Resgatar da meta (e a linha de rendimento) e
// devolve a transação para A revisar (fora dos totais). { transacaoId }
router.post('/auto/desfazer', (req, res) => {
  const t = db.prepare('SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(String((req.body || {}).transacaoId || ''), req.usuario.id);
  if (!t) return res.status(404).json({ erro: 'Transação não encontrada.' });
  if (!caixinhas.desvincularTransacao(t)) return res.status(400).json({ erro: 'Esta transação não está vinculada a uma meta.' });
  const reserva = buscarOuCriarReserva(req.usuario.id);
  res.json(montarResposta(dados.buscar('reserva_liberdade', reserva.id), req.usuario.id, lerCdi(req)));
});

module.exports = router;
