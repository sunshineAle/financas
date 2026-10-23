// Importação de extratos e faturas (setor H). A leitura dos arquivos binários (XLSX, PDF) é feita no frontend
// (services/leitorArquivo.js), que manda aqui texto, matriz ou linhas; o restante é JS puro e roda igual no navegador.
const express = require('express');
const db = require('../db');
const dados = require('../dados');
const { exigirAutenticacao } = require('../middleware/auth');
const { analisar, identificar, ErroImportacao } = require('../importacao/motor');
const { confirmar, desfazer } = require('../importacao/confirmar');

const router = express.Router();
router.use(exigirAutenticacao);

function tratar(fn) {
  return (req, res) => {
    try {
      const r = fn(req, res);
      if (r !== undefined) res.json(r);
    } catch (e) {
      if (e instanceof ErroImportacao || e.status) return res.status(e.status || 400).json({ erro: e.message });
      console.error(e);
      res.status(500).json({ erro: 'Não consegui processar o arquivo: ' + e.message });
    }
  };
}

// Etapa 2 da central: identifica o banco do arquivo e sugere conta/cartão.
router.post('/identificar', tratar((req) => identificar(req.usuario.id, req.body || {})));

// Pré-visualização: lê, detecta período, confere duplicidade, parcelas, estornos... Não grava nada.
router.post('/analisar', tratar((req) => analisar(req.usuario.id, req.body || {})));

// Grava as linhas confirmadas (com as correções/descartes da pessoa).
router.post('/confirmar', tratar((req, res) => {
  const r = confirmar(req.usuario.id, req.body || {});
  res.status(201).json(r);
}));

// Histórico das importações (mais recentes primeiro).
router.get('/historico', tratar((req) => {
  const linhas = db
    .prepare(
      `SELECT i.*, c.nome AS conta_nome, k.nome AS cartao_nome FROM importacoes i
       LEFT JOIN contas c ON c.id = i.conta_id LEFT JOIN cartoes k ON k.id = i.cartao_id
       WHERE i.usuario_id = ? AND i.excluido_em IS NULL ORDER BY i.criado_em DESC, i.rowid DESC LIMIT 100`
    )
    .all(req.usuario.id);
  return linhas.map((i) => ({
    id: i.id, tipo: i.tipo, destino: i.tipo === 'conta' ? i.conta_nome : i.cartao_nome, formato: i.formato, arquivo: i.arquivo_nome, banco: i.banco,
    periodoInicio: i.periodo_inicio, periodoFim: i.periodo_fim, fatura: i.fatura, total: i.qtd_total, novas: i.qtd_novas, atualizadas: i.qtd_atualizadas,
    ignoradas: i.qtd_ignoradas, em: i.criado_em, desfeitaEm: i.desfeita_em || null,
  }));
}));

// Desfazer uma importação (exclusão suave de tudo que ela criou; reverte o que atualizou).
router.delete('/:id', tratar((req) => desfazer(req.usuario.id, req.params.id)));

// Origem (ofx/csv/xlsx/pdf) de registros importados: ?ids=a,b,c
router.get('/origem', tratar((req) => {
  const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 300);
  const mapa = {};
  ids.forEach((id) => {
    const it = db.prepare("SELECT i.formato, i.importacao_id FROM importacao_itens i JOIN importacoes m ON m.id = i.importacao_id AND m.desfeita_em IS NULL WHERE i.registro_id = ? AND i.acao = 'inserido' AND i.excluido_em IS NULL LIMIT 1").get(id);
    if (it) mapa[id] = it.formato;
  });
  return mapa;
}));

// Perfis de CSV/planilha salvos por banco
router.get('/perfis', tratar((req) => db.prepare('SELECT id, nome, formato, assinatura FROM perfis_importacao WHERE usuario_id = ? AND excluido_em IS NULL ORDER BY nome').all(req.usuario.id)));
router.delete('/perfis/:id', tratar((req) => {
  const p = db.prepare('SELECT id FROM perfis_importacao WHERE id = ? AND usuario_id = ? AND excluido_em IS NULL').get(req.params.id, req.usuario.id);
  if (!p) throw new ErroImportacao('Perfil não encontrado.', 404);
  dados.excluir('perfis_importacao', p.id);
  return { ok: true };
}));

module.exports = router;
