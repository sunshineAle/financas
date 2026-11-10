// Dados fictícios: procedência histórica, nome bancário separado do apelido e migração aditiva.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'dagda-titular-'));
process.env.DATA_DIR = pasta;
process.env.JWT_SECRET = 'apenas-testes-locais-descartaveis';
const db = require('../src/db');
const dados = require('../src/dados');
const esquema = require('../src/dados/esquema');
const Database = require('../src/utils/bancoSqlite');
const RG = require('../src/utils/regras');
const { categorizarDetalhado, categorizarTransacao } = require('../src/utils/categorizacao');
const { exportarEstado, importarEstado } = require('../src/dados/exportacao');
const express = require('express'), jwt = require('jsonwebtoken');
const app = express();
app.use(express.json()); app.use(require('cookie-parser')());
app.use('/api/configuracoes', require('../src/routes/configuracoes'));
let u, conta, moradia, lazer, server, base;
before(async () => {
 await new Promise(resolve => { server = app.listen(0,'127.0.0.1',resolve); });
 base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
 for (const t of esquema.ORDEM.slice().reverse()) db.exec(`DELETE FROM ${t}`);
 db.exec('DELETE FROM diario_alteracoes');
 u = dados.inserir('usuarios',{nome:'Apelido fictício',email:'ficticio@local',senha_hash:'teste'});
 conta = dados.inserir('contas',{usuario_id:u.id,nome:'Conta de exemplo',origem:'manual',saldo:500});
 moradia = dados.inserir('categorias_orcamento',{usuario_id:u.id,nome:'Moradia',teto_mensal:1000,gasto_atual:0});
 lazer = dados.inserir('categorias_orcamento',{usuario_id:u.id,nome:'Lazer',teto_mensal:500,gasto_atual:0});
});
after(async () => { await new Promise(resolve=>server.close(resolve)); db.close();fs.rmSync(pasta,{recursive:true,force:true}); });
async function config(corpo) {
 const token=jwt.sign({sub:u.id,email:u.email,nome:u.nome,sessaoVersao:u.sessao_versao},process.env.JWT_SECRET);
 const r=await fetch(base+'/api/configuracoes',{method:corpo===undefined?'GET':'PUT',headers:{Cookie:`sessao=${token}`,'Content-Type':'application/json'},...(corpo===undefined?{}:{body:JSON.stringify(corpo)})});
 return {status:r.status,body:await r.json()};
}
const criarRegra=()=>dados.inserir('regras_categorias',{usuario_id:u.id,tipo:'saida',padrao:'ALUGUEL',categoria_id:moradia.id,ativa:1});
const novaTx=(extra={})=>dados.inserir('transacoes',{usuario_id:u.id,conta_id:conta.id,descricao:'PIX ALUGUEL',valor:-100,data:'2026-11-10',origem:'manual',...extra});
test('nome titular é opcional e independente do apelido; validação não altera configuração existente',async()=>{
 const inicial=await config();assert.equal(inicial.status,200);assert.equal(inicial.body.nomeTitular,'');assert.equal(inicial.body.nome_titular,null);
 let r=await config({nomeTitular:'  José   Pereira da Silva  ',notificarCategoriaEstourada:false});
 assert.equal(r.status,200);assert.equal(r.body.nomeTitular,'José Pereira da Silva');assert.equal(r.body.notificar_categoria_estourada,0);
 assert.equal(db.prepare('SELECT nome FROM usuarios WHERE id=?').get(u.id).nome,'Apelido fictício');
 r=await config({nomeTitular:'X'.repeat(151)});assert.equal(r.status,400);
 assert.equal((await config()).body.nomeTitular,'José Pereira da Silva');
 assert.equal((await config({nomeTitular:{nome:'Objeto'}})).status,400);
 assert.equal((await config({nomeTitular:null})).body.nome_titular,null);
 assert.equal((await config()).body.notificar_categoria_estourada,0);
});
test('configuração e procedência vão e voltam no backup, sem inventar titular em arquivo antigo',async()=>{
 await config({nomeTitular:'Pessoa Fictícia da Silva'});const regra=criarRegra();
 const prova=RG.provenienciaRegra(regra);const tx=novaTx({categoria_id:moradia.id,...prova});
 const arquivo=exportarEstado();
 dados.atualizar('configuracoes',arquivo.tabelas.configuracoes[0].id,{nome_titular:null});
 importarEstado(arquivo,{modo:'substituir',usuarioId:u.id});
 assert.equal((await config()).body.nomeTitular,'Pessoa Fictícia da Silva');
 assert.equal(db.prepare('SELECT regra_snapshot FROM transacoes WHERE id=?').get(tx.id).regra_snapshot,prova.regra_snapshot);
 const antigo=structuredClone(arquivo);
 delete antigo.tabelas.configuracoes[0].nome_titular;
 for(const t of antigo.tabelas.transacoes)for(const c of ['classificacao_origem','regra_id','regra_snapshot','classificacao_anterior'])delete t[c];
 importarEstado(antigo,{modo:'substituir',usuarioId:u.id});
 assert.equal((await config()).body.nomeTitular,'');
 assert.equal(db.prepare('SELECT regra_id FROM transacoes WHERE id=?').get(tx.id).regra_id,null);
});
test('migração aditiva conserva linha antiga e não preenche nome ou procedência por suposição',()=>{
 const memoria=new Database(':memory:');
 try{
  memoria.exec("CREATE TABLE configuracoes(id TEXT PRIMARY KEY,usuario_id TEXT,inicio_mes TEXT);INSERT INTO configuracoes VALUES ('config-antiga','pessoa','{\"tipo\":\"dia\",\"dia\":10}')");
  esquema.completarColunas(memoria,'configuracoes');
  const cfg=memoria.prepare('SELECT * FROM configuracoes').get();assert.equal(cfg.id,'config-antiga');assert.equal(cfg.nome_titular,null);assert.equal(JSON.parse(cfg.inicio_mes).dia,10);
  memoria.exec("CREATE TABLE transacoes(id TEXT PRIMARY KEY,conta_id TEXT,usuario_id TEXT,descricao TEXT,valor REAL,data TEXT);INSERT INTO transacoes VALUES ('tx-antiga','conta','pessoa','PIX aluguel',-100,'2026-11-10')");
  esquema.completarColunas(memoria,'transacoes');
  const tx=memoria.prepare('SELECT * FROM transacoes').get();assert.equal(tx.valor,-100);assert.equal(tx.regra_id,null);assert.equal(tx.classificacao_origem,null);
 }finally{memoria.close();}
});
test('categoria detalhada distingue regra, palavra-chave e padrão sem duplicar contador',()=>{
 const regra=criarRegra(),ctx={usuarioId:u.id,valor:-100,contaId:conta.id},cats=[moradia,lazer];
 const resultado=categorizarDetalhado('PIX ALUGUEL',cats,ctx);
 assert.equal(resultado.categoriaId,moradia.id);assert.equal(resultado.origem,'regra');assert.equal(resultado.regraId,regra.id);
 assert.equal(JSON.parse(resultado.regraSnapshot).categoriaNome,'Moradia');
 assert.equal(db.prepare('SELECT aplicacoes FROM regras_categorias WHERE id=?').get(regra.id).aplicacoes,1);
 assert.equal(categorizarTransacao('PIX ALUGUEL',cats,ctx),moradia.id);
 assert.equal(db.prepare('SELECT aplicacoes FROM regras_categorias WHERE id=?').get(regra.id).aplicacoes,2);
 const palavra=categorizarDetalhado('COMPRA LAZER',cats,ctx);assert.equal(palavra.origem,'palavra_chave');assert.equal(palavra.regraId,null);
 const padrao=categorizarDetalhado('PIX TERCEIRO',cats,ctx);assert.equal(padrao.origem,'padrao');assert.equal(padrao.categoriaId,null);
});
test('aplicar regra nas antigas guarda retrato real que não muda ao editar ou excluir regra',()=>{
 const regra=criarRegra();const tx=novaTx();
 assert.equal(RG.aplicarNasAntigas(u.id,regra),1);
 const aplicada=db.prepare('SELECT * FROM transacoes WHERE id=?').get(tx.id),snapshot=JSON.parse(aplicada.regra_snapshot);
 assert.equal(aplicada.classificacao_origem,'regra');assert.equal(aplicada.regra_id,regra.id);assert.equal(snapshot.padrao,'ALUGUEL');assert.equal(snapshot.categoriaNome,'Moradia');
 assert.equal(db.prepare('SELECT gasto_atual FROM categorias_orcamento WHERE id=?').get(moradia.id).gasto_atual,100);
 dados.atualizar('regras_categorias',regra.id,{padrao:'OUTRO',categoria_id:lazer.id,ativa:0});dados.excluir('regras_categorias',regra.id);
 assert.equal(db.prepare('SELECT regra_snapshot FROM transacoes WHERE id=?').get(tx.id).regra_snapshot,aplicada.regra_snapshot);
 assert.equal(db.prepare('SELECT saldo FROM contas WHERE id=?').get(conta.id).saldo,500);
});
