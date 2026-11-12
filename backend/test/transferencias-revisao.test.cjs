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
test('PIX sem nome não gera aviso genérico nem altera totais ou saldos', () => {
 regra(); const t = linha(a,-50,'PIX OUTRO BANCO');
 assert.equal(TR.listar(u.id).length,0);
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
test('titular reconhecido dispensa regra manual; sem PIX nem nome não há aviso', () => {
 linha(a,-13); assert.equal(TR.listar(u.id).length,1);regra();linha(a,-20,'Compra mercado');assert.equal(TR.listar(u.id).length,1);
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
 assert.equal(ls[0].acao,'importar');assert.equal(ls[0].transferencia,null);
});
test('nome de outra pessoa não confirma titular por trecho de palavra', () => {
 regra(); const t=linha(a,-30,'PIX MARIANA SILVA'),p=linha(b,30,'PIX ANA SILVA');
 const it=TR.listar(u.id).find(i=>i.id===t.id); assert.equal(it,undefined);
});
test('recusa de uma ponta impede que ela seja sugerida pela outra', () => {
 regra();const t=linha(a,-33),p=linha(b,33);TR.decidir(u.id,t.id,{acao:'recusar'});
 const it=TR.listar(u.id).find(i=>i.id===p.id);assert.equal(it,undefined);
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

test('nome truncado e primeiro nome são evidências por tokens',()=>{
 assert.equal(TR.reconhecer('PIX PGT KCR ANA SIL','Ana Silva Pereira'),2);
 assert.equal(TR.reconhecer('PIX TRANS ANA','Ana Silva Pereira'),1);
 assert.equal(TR.reconhecer('PIX TRANS ANA','Ana'),1);
 assert.equal(TR.reconhecer('PIX MARIANA SILVA','Ana Silva'),0);
 assert.equal(TR.reconhecer('PIX ANA SANTOS','Ana Silva'),0);
 assert.equal(TR.reconhecer('PIX ANA CAR SILVA','Ana Carolina Ferreira'),0);
});
test('primeiro nome requer par coerente e não contesta aluguel',()=>{
 dados.inserir('configuracoes',{usuario_id:u.id,nome_titular:'Ana Silva Pereira'});
 const t=linha(a,-70,'PIX PGT ANA');assert.equal(TR.listar(u.id).length,0);
 linha(b,70,'PIX KCR ANA');assert.equal(TR.listar(u.id).length,2);
 const cat=dados.inserir('categorias_orcamento',{usuario_id:u.id,nome:'Moradia',teto_mensal:1000});
 dados.atualizar('transacoes',t.id,{categoria_id:cat.id,classificacao_origem:'regra'});
 assert.ok(!TR.listar(u.id).find(x=>x.id===t.id));
});
test('datas distantes não são pré-selecionadas',()=>{
 const t=linha(a,-44);linha(b,44,'PIX ANA SILVA',{data:'2025-01-01'});
 assert.equal(TR.listar(u.id).find(x=>x.id===t.id).sugestaoId,null);
});
test('saldo externo mantém crédito e restaura classificação sem duplicação',()=>{
 const t=linha(a,100,'PIX ANA SILVA',{categoria_receita:'Salário'});
 const saldo=db.prepare('SELECT saldo FROM contas WHERE id=?').get(a.id).saldo;
 TR.decidir(u.id,t.id,{acao:'externa',manual:true});
 TR.decidir(u.id,t.id,{acao:'externa',manual:true});
 const atual=db.prepare('SELECT * FROM transacoes WHERE id=?').get(t.id);
 assert.equal(atual.tipo_mov,'saldo_proprio_externo');assert.equal(atual.ignorada,2);assert.equal(atual.categoria_receita,null);
 assert.equal(db.prepare('SELECT saldo FROM contas WHERE id=?').get(a.id).saldo,saldo);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM transacoes').get().n,1);
 TR.decidir(u.id,t.id,{acao:'receita',manual:true});
 assert.equal(db.prepare('SELECT categoria_receita FROM transacoes WHERE id=?').get(t.id).categoria_receita,'Salário');
 assert.equal(db.prepare('SELECT saldo FROM contas WHERE id=?').get(a.id).saldo,saldo);
});
test('externa bloqueia acesso de outro usuário',()=>{
 const t=linha(a,-30);
 assert.throws(()=>TR.obter('outro',t.id),/não pode/);
});
// Anotação 103 (1.4.1): movimentação própria também para saídas.
const L = require('../src/utils/lancamentos');
const fluxo = () => db.prepare(`SELECT COALESCE(SUM(CASE WHEN valor>0 THEN valor END),0) e, COALESCE(SUM(CASE WHEN valor<0 THEN -valor END),0) s FROM transacoes WHERE usuario_id=? AND excluido_em IS NULL AND ${L.noFluxo()}`).get(u.id);
const despesas = () => db.prepare('SELECT COALESCE(SUM(-valor),0) s FROM transacoes WHERE usuario_id=? AND excluido_em IS NULL AND ignorada=0 AND valor<0 AND categoria_id IS NOT NULL').get(u.id).s;
test('103: saída para conta fora do Dagda sai do orçamento, fica no fluxo e não muda o saldo',()=>{
 const cat=dados.inserir('categorias_orcamento',{usuario_id:u.id,nome:'Outros',teto_mensal:0,gasto_atual:500});
 const t=linha(a,-500,'PIX ANA SILVA',{categoria_id:cat.id});
 const saldo=db.prepare('SELECT saldo FROM contas WHERE id=?').get(a.id).saldo;
 assert.equal(fluxo().s,500); assert.equal(despesas(),500);
 TR.decidir(u.id,t.id,{acao:'externa',manual:true});
 TR.decidir(u.id,t.id,{acao:'externa',manual:true}); // repetir não duplica
 const atual=db.prepare('SELECT * FROM transacoes WHERE id=?').get(t.id);
 assert.equal(atual.tipo_mov,'saldo_proprio_externo'); assert.equal(atual.categoria_id,null);
 assert.equal(db.prepare('SELECT gasto_atual g FROM categorias_orcamento WHERE id=?').get(cat.id).g,0);
 assert.equal(fluxo().s,500,'continua nas saídas do fluxo'); assert.equal(despesas(),0,'fora das despesas');
 assert.equal(db.prepare('SELECT saldo FROM contas WHERE id=?').get(a.id).saldo,saldo);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM transacoes').get().n,1,'nenhuma conta ou contraparte criada');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM contas').get().n,3);
 // Reverter: volta a ser despesa com a categoria e o orçamento de antes
 TR.decidir(u.id,t.id,{acao:'manter',manual:true});
 const volta=db.prepare('SELECT * FROM transacoes WHERE id=?').get(t.id);
 assert.equal(volta.tipo_mov,null); assert.equal(volta.categoria_id,cat.id); assert.equal(volta.ignorada,0);
 assert.equal(db.prepare('SELECT gasto_atual g FROM categorias_orcamento WHERE id=?').get(cat.id).g,500);
 assert.equal(despesas(),500); assert.equal(db.prepare('SELECT saldo FROM contas WHERE id=?').get(a.id).saldo,saldo);
});
test('103: entrada de fora conta no fluxo, mas não nas receitas',()=>{
 const t=linha(a,200,'TED ANA SILVA',{categoria_receita:'Salário'});
 TR.decidir(u.id,t.id,{acao:'externa',manual:true});
 assert.equal(fluxo().e,200);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM transacoes WHERE ignorada=0 AND valor>0").get().n,0);
});
test('103: movimentação própria pode virar transferência sem contar o orçamento duas vezes',()=>{
 const cat=dados.inserir('categorias_orcamento',{usuario_id:u.id,nome:'Outros',teto_mensal:0,gasto_atual:80});
 const t=linha(a,-80,'PIX ANA SILVA',{categoria_id:cat.id});
 TR.decidir(u.id,t.id,{acao:'externa',manual:true});
 TR.decidir(u.id,t.id,{acao:'vincular',manual:true,contaId:b.id});
 assert.equal(db.prepare('SELECT gasto_atual g FROM categorias_orcamento WHERE id=?').get(cat.id).g,0);
 assert.equal(db.prepare('SELECT tipo_mov FROM transacoes WHERE id=?').get(t.id).tipo_mov,'transferencia_vinculada');
 assert.equal(db.prepare('SELECT saldo FROM contas WHERE id=?').get(b.id).saldo,1080);
});
test('103: boleto com o nome do titular entra na conferência; PIX sem nome continua fora',()=>{
 const t=linha(a,-300,'PAGTO BOLETO ANA SILVA'), o=linha(a,-40,'PIX PADARIA');
 regra(); const p=linha(b,300,'BOLETO ANA SILVA');
 const ids=TR.listar(u.id).map(i=>i.id);
 assert.ok(ids.includes(t.id)); assert.ok(!ids.includes(o.id));
});
test('103: pagamento de fatura não vira movimentação própria',()=>{
 const t=linha(a,-150,'PIX ANA SILVA');
 const cartao=dados.inserir('cartoes',{usuario_id:u.id,nome:'Cartão',limite:1000,dia_fechamento:1,dia_vencimento:10});
 dados.inserir('faturas_pagas',{cartao_id:cartao.id,fatura:'2026-11',conta_id:a.id,transacao_id:t.id,valor:150,data:'2026-11-08'});
 assert.throws(()=>TR.decidir(u.id,t.id,{acao:'externa',manual:true}),/fatura/);
});
test('103: saída que pagou dívida não vira movimentação própria',()=>{
 const t=linha(a,-200,'PIX ANA SILVA');
 const d=dados.inserir('dividas',{usuario_id:u.id,nome:'Dívida fictícia',saldo:800,saldo_original:1000});
 dados.inserir('historico_pagamentos',{divida_id:d.id,valor:200,transacao_id:t.id});
 assert.throws(()=>TR.decidir(u.id,t.id,{acao:'externa',manual:true}),/dívida/);
 assert.equal(db.prepare('SELECT tipo_mov FROM transacoes WHERE id=?').get(t.id).tipo_mov,null);
});
test('103: em boleto, o nome depois de "pagador" não é indício de movimentação própria',()=>{
 const conta=linha(a,-150,'PAGTO BOLETO ENERGIA PAGADOR ANA SILVA');
 const propria=linha(a,-300,'PAGTO BOLETO ANA SILVA');
 const ids=TR.listar(u.id).map(i=>i.id);
 assert.ok(!ids.includes(conta.id)); assert.ok(ids.includes(propria.id));
});
// Anotação 105 (1.4.2)
test('105: estornar uma movimentação própria anula as duas pontas, sem virar receita',()=>{
 const cat=dados.inserir('categorias_orcamento',{usuario_id:u.id,nome:'Outros',teto_mensal:0,gasto_atual:300});
 const t=linha(a,-300,'PIX ANA SILVA',{categoria_id:cat.id});
 dados.atualizar('contas',a.id,{saldo:700});
 TR.decidir(u.id,t.id,{acao:'externa',manual:true});
 const L=require('../src/utils/lancamentos');
 const r=L.estornarTransacao(u.id,t.id,{data:'2026-11-09'});
 const ori=db.prepare('SELECT * FROM transacoes WHERE id=?').get(t.id), est=db.prepare('SELECT * FROM transacoes WHERE id=?').get(r.estornoId);
 assert.equal(ori.tipo_mov,'estornada'); assert.equal(est.tipo_mov,'estorno'); assert.equal(ori.ignorada,2); assert.equal(est.ignorada,2);
 assert.equal(db.prepare('SELECT saldo FROM contas WHERE id=?').get(a.id).saldo,1000,'saldo volta');
 assert.equal(db.prepare('SELECT gasto_atual g FROM categorias_orcamento WHERE id=?').get(cat.id).g,0,'orçamento sem a despesa');
 assert.equal(db.prepare(`SELECT COUNT(*) n FROM transacoes WHERE ${L.noFluxo()} AND usuario_id=?`).get(u.id).n,0,'nada solto no fluxo');
});
test('105: devolução importada liga à movimentação própria original',()=>{
 const t=linha(a,-120,'PIX ANA SILVA');
 TR.decidir(u.id,t.id,{acao:'externa',manual:true});
 const L=require('../src/utils/lancamentos');
 const ori=L.procurarOriginalDoEstorno(u.id,{contaId:a.id,valor:120,descricao:'ESTORNO PIX ANA SILVA',data:'2026-11-08'});
 assert.equal(ori&&ori.id,t.id);
});
test('105: extrato da outra conta chegando depois avisa da movimentação própria já marcada',()=>{
 const t=linha(a,-250,'PIX ANA SILVA');
 TR.decidir(u.id,t.id,{acao:'externa',manual:true});
 const novo=linha(b,250,'PIX RECEBIDO');
 const it=TR.listar(u.id).find(i=>i.id===novo.id);
 assert.ok(it,'aparece em A revisar'); assert.ok(it.duplicidadePropria); assert.equal(it.sugestaoId,t.id); assert.match(it.motivo,/movimentação própria/);
 const sa=db.prepare('SELECT saldo FROM contas WHERE id=?').get(a.id).saldo, sb=db.prepare('SELECT saldo FROM contas WHERE id=?').get(b.id).saldo;
 TR.decidir(u.id,novo.id,{acao:'vincular',contaId:a.id,parceiraId:t.id});
 assert.equal(db.prepare('SELECT tipo_mov FROM transacoes WHERE id=?').get(t.id).tipo_mov,'transferencia_vinculada');
 assert.equal(db.prepare('SELECT tipo_mov FROM transacoes WHERE id=?').get(novo.id).tipo_mov,'transferencia_vinculada');
 assert.equal(db.prepare('SELECT saldo FROM contas WHERE id=?').get(a.id).saldo,sa); assert.equal(db.prepare('SELECT saldo FROM contas WHERE id=?').get(b.id).saldo,sb);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM transacoes').get().n,2,'sem lançamento criado');
});
test('105: "não é o mesmo dinheiro" mantém a movimentação própria como estava',()=>{
 const t=linha(a,-90,'PIX ANA SILVA');
 TR.decidir(u.id,t.id,{acao:'externa',manual:true});
 const novo=linha(b,90,'PIX RECEBIDO');
 TR.decidir(u.id,novo.id,{acao:'recusar'});
 const p=db.prepare('SELECT * FROM transacoes WHERE id=?').get(t.id);
 assert.equal(p.tipo_mov,'saldo_proprio_externo'); assert.equal(p.revisao,'origem_confirmada');
 assert.ok(!TR.listar(u.id).some(i=>i.id===novo.id));
});
test('105: valor diferente não forma aviso de duplicidade',()=>{
 const t=linha(a,-90,'PIX ANA SILVA');
 TR.decidir(u.id,t.id,{acao:'externa',manual:true});
 const novo=linha(b,89.99,'PIX RECEBIDO');
 assert.ok(!TR.listar(u.id).some(i=>i.id===novo.id));
});
test('105: movimentação própria volta igual do backup e continua reversível',()=>{
 const { exportarEstado, importarEstado } = require('../src/dados/exportacao');
 const cat=dados.inserir('categorias_orcamento',{usuario_id:u.id,nome:'Outros',teto_mensal:0,gasto_atual:60});
 const t=linha(a,-60,'PIX ANA SILVA',{categoria_id:cat.id});
 TR.decidir(u.id,t.id,{acao:'externa',manual:true});
 const arquivo=exportarEstado();
 db.prepare('DELETE FROM transacoes').run();
 importarEstado(arquivo,{modo:'substituir',usuarioId:u.id});
 const r=db.prepare('SELECT * FROM transacoes WHERE id=?').get(t.id);
 assert.equal(r.tipo_mov,'saldo_proprio_externo'); assert.equal(r.ignorada,2); assert.ok(r.classificacao_anterior);
 TR.decidir(u.id,t.id,{acao:'manter',manual:true});
 assert.equal(db.prepare('SELECT categoria_id FROM transacoes WHERE id=?').get(t.id).categoria_id,cat.id);
});
test('105: desfazer o estorno devolve a movimentação própria, sem voltar ao orçamento',()=>{
 const L=require('../src/utils/lancamentos');
 const cat=dados.inserir('categorias_orcamento',{usuario_id:u.id,nome:'Outros',teto_mensal:0,gasto_atual:80});
 const t=linha(a,-80,'PIX ANA SILVA',{categoria_id:cat.id});
 TR.decidir(u.id,t.id,{acao:'externa',manual:true});
 const s0=db.prepare('SELECT saldo FROM contas WHERE id=?').get(a.id).saldo;
 const r=L.estornarTransacao(u.id,t.id,{data:'2026-11-09'});
 L.desfazerPar(u.id,r.vinculo);
 const v=db.prepare('SELECT * FROM transacoes WHERE id=?').get(t.id);
 assert.equal(v.tipo_mov,'saldo_proprio_externo'); assert.equal(v.ignorada,2); assert.equal(v.categoria_id,null);
 assert.equal(db.prepare('SELECT gasto_atual g FROM categorias_orcamento WHERE id=?').get(cat.id).g,0);
 assert.equal(db.prepare('SELECT saldo FROM contas WHERE id=?').get(a.id).saldo,s0,'saldo como antes do estorno');
 // e ainda dá para voltar à categoria de antes
 TR.decidir(u.id,t.id,{acao:'manter',manual:true});
 assert.equal(db.prepare('SELECT categoria_id FROM transacoes WHERE id=?').get(t.id).categoria_id,cat.id);
 assert.equal(db.prepare('SELECT gasto_atual g FROM categorias_orcamento WHERE id=?').get(cat.id).g,80);
});
test('105: desfazer a transferência criada pela duplicidade devolve a movimentação própria',()=>{
 const L=require('../src/utils/lancamentos');
 const cat=dados.inserir('categorias_orcamento',{usuario_id:u.id,nome:'Outros',teto_mensal:0,gasto_atual:250});
 const t=linha(a,-250,'PIX ANA SILVA',{categoria_id:cat.id});
 TR.decidir(u.id,t.id,{acao:'externa',manual:true});
 const novo=linha(b,250,'PIX RECEBIDO');
 const r=TR.decidir(u.id,novo.id,{acao:'vincular',contaId:a.id,parceiraId:t.id});
 L.desfazerPar(u.id,r.vinculo);
 const v=db.prepare('SELECT * FROM transacoes WHERE id=?').get(t.id);
 assert.equal(v.tipo_mov,'saldo_proprio_externo'); assert.equal(v.ignorada,2);
 assert.equal(db.prepare('SELECT gasto_atual g FROM categorias_orcamento WHERE id=?').get(cat.id).g,0);
 TR.decidir(u.id,t.id,{acao:'manter',manual:true});
 assert.equal(db.prepare('SELECT categoria_id FROM transacoes WHERE id=?').get(t.id).categoria_id,cat.id,'categoria original preservada');
});
test('105: própria de muitos dias antes não gera aviso automático; na conferência manual aparece',()=>{
 const t=linha(a,-100,'PIX ANA SILVA',{data:'2026-09-01'});
 TR.decidir(u.id,t.id,{acao:'externa',manual:true});
 const novo=linha(b,100,'PIX RECEBIDO');
 assert.ok(!TR.listar(u.id).some(i=>i.id===novo.id));
 assert.ok(TR.obter(u.id,novo.id).candidatas.some(c=>c.id===t.id&&c.propria));
});
test('105: duas próprias de mesmo valor não sugerem uma ao acaso',()=>{
 for(const c of [a,c3()]){const t=linha(c,-70,'PIX ANA SILVA');TR.decidir(u.id,t.id,{acao:'externa',manual:true});}
 const novo=linha(b,70,'PIX RECEBIDO');
 const it=TR.listar(u.id).find(i=>i.id===novo.id);
 assert.ok(it); assert.equal(it.sugestaoId,null);
});
function c3(){return c;}
