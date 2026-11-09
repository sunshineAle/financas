const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'dagda-81-'));
process.env.DATA_DIR = pasta;
const db = require('../src/db');
const dados = require('../src/dados');
const TR = require('../src/utils/transferenciasRevisao');
const { classificarConta } = require('../src/importacao/classificar');
const { confirmar } = require('../src/importacao/confirmar');
let u, a, b, c;
const linha = (conta, valor, descricao = 'PIX ANA SILVA', extra = {}) => dados.inserir('transacoes', { usuario_id: u.id, conta_id: conta.id, valor, descricao, data: '2026-11-08', origem: 'manual', ...extra });
const regra = () => dados.inserir('regras_categorias', { usuario_id: u.id, tipo: 'transferencia', padrao: 'ANA SILVA', ativa: 1 });
const importar = (linhas) => confirmar(u.id, { destino: { tipo: 'conta', id: a.id }, formato: 'csv', linhas, periodo: { inicio: '2026-11-01', fim: '2026-11-30' } });
const analisar = (linhas) => classificarConta(u.id, a, linhas, { inicio: '2026-11-01', fim: '2026-11-30' }).linhas;
beforeEach(() => {
 for (const t of require('../src/dados/esquema').ORDEM.slice().reverse()) db.exec(`DELETE FROM ${t}`);
 u = dados.inserir('usuarios', { nome: 'Ana Silva', email: 'teste@local', senha_hash: 'teste' });
 [a,b,c] = ['Origem','Destino','Terceira'].map(nome => dados.inserir('contas', { usuario_id: u.id, nome, origem: 'manual', saldo: 1000 }));
});
after(() => { db.close(); fs.rmSync(pasta, { recursive: true, force: true }); });
test('PIX fora da regra exata gera aviso sem alterar totais ou saldos', () => {
 regra(); const t = linha(a,-50,'PIX OUTRO BANCO');
 assert.equal(TR.listar(u.id).length,1);
 assert.equal(db.prepare('SELECT ignorada FROM transacoes WHERE id = ?').get(t.id).ignorada,0);
 assert.equal(db.prepare('SELECT saldo FROM contas WHERE id = ?').get(a.id).saldo,1000);
});
test('duas pontas de valor igual sugerem vínculo; confirmar não duplica nem altera saldos', () => {
 regra(); const t=linha(a,-120),p=linha(b,120);
 const it=TR.listar(u.id).find(i=>i.id===t.id);assert.equal(it.sugestaoId,p.id);
 TR.decidir(u.id,t.id,{acao:'vincular',contaId:b.id,parceiraId:p.id});
 assert.equal(TR.listar(u.id).length,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM transacoes').get().n,2);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM transacoes WHERE ignorada = 2').get().n,2);
 assert.equal(db.prepare('SELECT SUM(saldo) AS s FROM contas').get().s,3000);
});
test('múltiplas pontas não escolhem uma ao acaso', () => {
 regra(); const t=linha(a,-70);linha(b,70);linha(c,70);
 const it=TR.listar(u.id).find(i=>i.id===t.id);assert.equal(it.sugestaoId,null);assert.equal(it.candidatas.length,2);
 assert.throws(()=>TR.decidir(u.id,t.id,{acao:'vincular',contaId:b.id}),/Escolha qual/);
});
test('diferença de um centavo não forma par nem cria contrapartida', () => {
 regra();const t=linha(a,-80),p=linha(b,80.01);const it=TR.listar(u.id).find(i=>i.id===t.id);
 assert.equal(it.candidatas.length,0);assert.equal(it.diferencaCentavos,true);
 assert.throws(()=>TR.decidir(u.id,t.id,{acao:'vincular',contaId:b.id,parceiraId:p.id}),/valor exato/);
 assert.throws(()=>TR.decidir(u.id,t.id,{acao:'vincular',contaId:b.id}),/valores são diferentes/);
});
test('sem PIX nem nome não há aviso; sem regra também não', () => {
 linha(a,-13); assert.equal(TR.listar(u.id).length,0);regra();linha(a,-20,'Compra mercado');assert.equal(TR.listar(u.id).length,1);
});
test('sem titular nas duas pontas não sugere; decisão explícita pode confirmar', () => {
 regra();const t=linha(a,-30),p=linha(b,30,'PIX recebido');
 const it=TR.listar(u.id).find(i=>i.id===t.id);assert.equal(it.sugestaoId,null);
 TR.decidir(u.id,t.id,{acao:'vincular',contaId:b.id,parceiraId:p.id});assert.equal(TR.listar(u.id).length,0);
});
test('outra conta não importada: só confirmação cria a outra ponta', () => {
 regra();const t=linha(a,-60);assert.equal(TR.listar(u.id).length,1);
 TR.decidir(u.id,t.id,{acao:'vincular',contaId:b.id});
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM transacoes').get().n,2);
 assert.equal(db.prepare('SELECT saldo FROM contas WHERE id = ?').get(b.id).saldo,1060);
});
test('recusar persiste a decisão, sem alterar transação ou saldo', () => {
 regra();const t=linha(a,-15);TR.decidir(u.id,t.id,{acao:'recusar'});
 assert.equal(TR.listar(u.id).length,0);assert.equal(db.prepare('SELECT ignorada FROM transacoes WHERE id = ?').get(t.id).ignorada,0);
});
test('importação avisa e aguarda confirmação, inclusive com nome do banco no PIX', () => {
 regra();const ls=analisar([{idx:0,data:'2026-11-08',descricao:'PIX ANA SILVA Destino',valor:-99}]);
 assert.ok(ls[0].suspeitaTransferencia);assert.equal(ls[0].acao,'importar');
 importar(ls);assert.equal(TR.listar(u.id).length,1);
});
test('estorno no mesmo arquivo anula as duas linhas, sem sugestão solta', () => {
 regra();const ls=analisar([{idx:0,data:'2026-11-07',descricao:'PIX ANA SILVA',valor:-99},{idx:1,data:'2026-11-08',descricao:'ESTORNO PIX ANA SILVA',valor:99}]);
 importar(ls);assert.equal(TR.listar(u.id).length,0);
 assert.equal(db.prepare('SELECT SUM(valor) AS total FROM transacoes').get().total,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM transacoes WHERE ignorada = 0').get().n,0);
});
test('regressão: reconhecimento anterior sem regra nova continua funcionando', () => {
 const ls=analisar([{idx:0,data:'2026-11-08',descricao:'PIX para Destino',valor:-99}]);
 assert.equal(ls[0].acao,'transferencia');assert.equal(ls[0].transferencia.contaId,b.id);
});
test('nome de outra pessoa não confirma titular por trecho de palavra', () => {
 regra(); const t=linha(a,-30,'PIX MARIANA SILVA'),p=linha(b,30,'PIX ANA SILVA');
 const it=TR.listar(u.id).find(i=>i.id===t.id); assert.equal(it.sugestaoId,null);
});
test('recusa de uma ponta impede que ela seja sugerida pela outra', () => {
 regra();const t=linha(a,-33),p=linha(b,33);TR.decidir(u.id,t.id,{acao:'recusar'});
 const it=TR.listar(u.id).find(i=>i.id===p.id);assert.equal(it.candidatas.length,0);
});
test('confirmação na importação usa uma única ponta existente e não duplica', () => {
 regra();const p=linha(b,17);const ls=analisar([{idx:0,data:'2026-11-08',descricao:'PIX ANA SILVA',valor:-17}]);
 ls[0].decisaoTransferencia={acao:'vincular',contaId:b.id,parceiraId:p.id};importar(ls);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM transacoes').get().n,2);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM transacoes WHERE ignorada=2').get().n,2);
});
test('IDs de outro usuário e parceiros de valor errado não podem ser usados', () => {
 regra();const t=linha(a,-15);const u2=dados.inserir('usuarios',{nome:'Outro',email:'outro@local',senha_hash:'teste'});
 const outra=dados.inserir('contas',{usuario_id:u2.id,nome:'Privada',origem:'manual'});
 assert.throws(()=>TR.decidir(u.id,t.id,{acao:'vincular',contaId:outra.id}),/outra conta/);
 const p=linha(b,150);assert.throws(()=>TR.decidir(u.id,t.id,{acao:'vincular',contaId:b.id,parceiraId:p.id}),/valor exato/);
});
