// Banco descartável em outro contexto JS: nunca abre o IndexedDB/localStorage do app ativo.
import initSqlJs from 'sql.js/dist/sql-asm.js';
self.onmessage = async ({ data }) => {
  try {
    self.__SQL = await initSqlJs();
    self.process = { env: {} };
    self.__PERSISTENCIA_BANCO = { bytes: null, agendar() {} };
    if (data.formato === 'sqlite-bruto') self.__PERSISTENCIA_BANCO.bytes = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
    const { default: db } = await import('../../../backend/src/db.js');
    const { default: E } = await import('../../../backend/src/dados/exportacao.js');
    const { default: esquema } = await import('../../../backend/src/dados/esquema.js');
    if (data.formato !== 'sqlite-bruto') {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO usuarios (id,email,senha_hash,nome) VALUES (?,?,?,?)').run(id,'validacao@local','isolado','Validação');
      E.importarEstado(data, { modo: 'substituir', usuarioId: id });
    }
    const integridade = db.prepare('PRAGMA integrity_check').all();
    if (integridade.length !== 1 || Object.values(integridade[0])[0] !== 'ok') throw new Error('O banco restaurado contém erros de integridade.');
    for (const [nome, t] of Object.entries(esquema.TABELAS)) {
      if (!t.exporta) continue;
      for (const [coluna, pai] of Object.entries(t.fk)) {
        if (pai === 'usuarios') continue;
        const r = db.prepare(`SELECT COUNT(*) AS n FROM ${nome} f LEFT JOIN ${pai} p ON p.id=f.${coluna} WHERE f.excluido_em IS NULL AND f.${coluna} IS NOT NULL AND f.${coluna}<>'' AND p.id IS NULL`).get();
        if (r.n) throw new Error(`Há referências incompletas em ${nome}. O descarte de cópias permanece bloqueado.`);
      }
    }
    const exportado = E.exportarEstado();
    if (data.tabelas) for (const [t, linhas] of Object.entries(exportado.tabelas)) {
      if (t === 'diario_alteracoes') continue;
      if (linhas.length !== (data.tabelas[t]?.length || 0)) throw new Error(`A contagem de ${t} não foi preservada na recuperação isolada.`);
    }
    self.postMessage({ ok: true, contagens: exportado.contagens });
  } catch (e) {
    const mensagem = String(e.message || '');
    const erro = /constraint|SQLITE|no such|syntax|malformed|not a database|datatype/i.test(mensagem) ? 'O arquivo não pôde ser recuperado no banco de teste. As cópias existentes foram preservadas.' : (mensagem || 'O teste de recuperação falhou.');
    self.postMessage({ ok: false, erro });
  }
};
