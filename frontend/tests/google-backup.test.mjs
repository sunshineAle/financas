import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
const BASE = 'https://www.googleapis.com/auth/drive.appdata';
const ARQUIVOS = 'https://www.googleapis.com/auth/drive.file';
const VINCULO = 'sf:google:vinculo';
const original = { fetch: globalThis.fetch, window: globalThis.window, localStorage: globalThis.localStorage, now: Date.now };
let n = 0, pedidos, responder, revogados, dados;
const importar = async () => (await import(`../src/services/nuvem/google.js?teste=${++n}`)).google;
const normal = op => ({ access_token: 'token-falso-de-teste', expires_in: 3600, scope: op.scope });
beforeEach(() => {
  pedidos = []; revogados = []; dados = new Map(); responder = (op) => op.callback(normal(op));
  globalThis.localStorage = { getItem: k => dados.get(k) || null, setItem: (k,v) => dados.set(k,String(v)), removeItem: k => dados.delete(k) };
  globalThis.window = { __SF_CONFIG__: { nuvem: { googleClientId: 'client-publico-teste' } }, google: { accounts: { oauth2: {
    initTokenClient: op => ({ requestAccessToken: req => { pedidos.push({ scope: op.scope, prompt: req.prompt }); responder(op,req); } }),
    revoke: (t,callback) => { revogados.push(t); callback(); },
  } } } };
  globalThis.fetch = async () => Response.json({ files: [] });
});
afterEach(() => {
  globalThis.fetch = original.fetch; Date.now = original.now;
  for (const k of ['window','localStorage']) {
    if (original[k] === undefined) delete globalThis[k]; else globalThis[k] = original[k];
  }
});
test('primeira conexão pede só drive.appdata e lista todas as páginas da área oculta', async () => {
  const google = await importar(), urls=[];
  globalThis.fetch = async url => {
    urls.push(new URL(url));
    return Response.json(urls.length === 1 ? { nextPageToken: 'segunda', files: [{id:'1',name:'sistema-financeiro-a.sfin',size:'42',createdTime:'2026-11-08T10:00:00Z'}] } : { files: [{id:'2',name:'sistema-financeiro-b.sfin',size:'84',createdTime:'2026-11-09T10:00:00Z'},{id:'3',name:'previa-sistema-financeiro-teste.sfin'}] });
  };
  await google.conectar(); const itens=await google.listar();
  assert.deepEqual(pedidos,[{ scope:BASE,prompt:'consent' }]);
  assert.equal(itens.length,2); assert.equal(itens[0].tamanho,42);
  assert.ok(urls.every(u=>u.searchParams.get('spaces')==='appDataFolder'));
  assert.equal(urls[1].searchParams.get('pageToken'),'segunda');
  const restauracao=await google.listar({restaurar:true});
  assert.ok(restauracao.length>0);
  assert.ok(restauracao.every(i=>!i.nome.startsWith('previa-')), 'Restaurar no app oficial não oferece dados fictícios da prévia');
});
test('token válido é reutilizado; consentimento adicional só para um escopo novo', async () => {
  const google=await importar();
  await google.conectar(); await google.conectar(); await google.token();
  assert.equal(pedidos.length,1);
  await google.conectarParaRestaurar(); await google.conectarParaRestaurar(); await google.conectar();
  assert.equal(pedidos.length,2);assert.equal(pedidos[1].prompt,'consent');
  assert.ok(pedidos[1].scope.includes(ARQUIVOS));
});
test('recarga lembra vínculo, nunca token, e tenta renovar sem forçar consentimento', async () => {
  const primeiro=await importar(); await primeiro.conectarParaRestaurar();
  const persistido=JSON.parse(dados.get(VINCULO));
  assert.deepEqual(persistido,{clientId:'client-publico-teste',escopos:[BASE,ARQUIVOS]});
  assert.ok(!dados.get(VINCULO).includes('token-falso'));assert.ok(!dados.get(VINCULO).includes('access_token'));
  const recarregado=await importar();assert.equal(recarregado.temToken(),false);
  await recarregado.conectarParaRestaurar();assert.equal(pedidos.at(-1).prompt,'');
  assert.equal(recarregado.temToken(),true);
});
test('token vencido e resposta HTTP401 renovam sem consentimento forçado', async () => {
  const google=await importar();await google.conectar();
  const agora=Date.now();Date.now=()=>agora+61*60*1000;
  await google.conectar();assert.equal(pedidos.at(-1).prompt,'');
  let chamadas=0;globalThis.fetch=async()=>++chamadas===1?new Response('',{status:401}):Response.json({files:[]});
  await google.listar();assert.equal(pedidos.at(-1).prompt,'');assert.equal(chamadas,2);
});
test('marca local não substitui escopos efetivos do token recebido', async () => {
  dados.set(VINCULO,JSON.stringify({clientId:'client-publico-teste',escopos:[BASE,ARQUIVOS]}));
  responder=op=>op.callback({...normal(op),scope:ARQUIVOS});
  const google=await importar();
  await assert.rejects(()=>google.conectar(),e=>e.codigo==='permissao');
  assert.equal(pedidos[0].prompt,'');assert.equal(google.temToken(),false);
  assert.deepEqual(JSON.parse(dados.get(VINCULO)).escopos,[ARQUIVOS]);
});
test('resposta sem escopos/validade não habilita sessão nem grava vínculo', async () => {
  responder=op=>op.callback({access_token:'token-falso-de-teste',expires_in:3600});
  const google=await importar();await assert.rejects(()=>google.conectar(),e=>e.codigo==='auth');
  assert.equal(google.temToken(),false);assert.equal(dados.has(VINCULO),false);
});
test('permissão adicional recusada não revoga o acesso já autorizado ao backup', async () => {
  const google=await importar();await google.conectar();const marca=dados.get(VINCULO);
  responder=op=>op.callback({error:'access_denied'});
  await assert.rejects(()=>google.conectarParaRestaurar(),e=>e.codigo==='cancelado');
  assert.equal(google.temToken(),true);assert.equal(dados.get(VINCULO),marca);
  await google.conectar();assert.equal(pedidos.length,2);
});
test('concessão parcial mantém escopo menor mas bloqueia a restauração solicitada', async () => {
  const google=await importar();await google.conectar();
  responder=op=>op.callback({...normal(op),scope:BASE});
  await assert.rejects(()=>google.conectarParaRestaurar(),e=>e.codigo==='permissao');
  assert.equal(google.temToken(),true);
  await google.conectar();assert.equal(pedidos.length,2);
  responder=op=>op.callback(normal(op));await google.conectarParaRestaurar();
  assert.equal(pedidos.at(-1).prompt,'consent');
});
test('login exigido pelo Google é informado; interação vem no próximo clique explícito', async () => {
  const google=await importar();await google.conectar();
  const agora=Date.now();Date.now=()=>agora+61*60*1000;
  responder=op=>op.callback({error:'login_required'});
  await assert.rejects(()=>google.conectar(),e=>e.codigo==='auth');
  assert.equal(pedidos.at(-1).prompt,'');
  responder=op=>op.callback(normal(op));await google.conectar();
  assert.equal(pedidos.at(-1).prompt,'select_account');
});
test('Client ID diferente não reutiliza token nem marca de outro app', async () => {
  const google=await importar();await google.conectar();
  window.__SF_CONFIG__.nuvem.googleClientId='outro-client-publico';
  assert.equal(google.temToken(),false);await google.conectar();
  assert.equal(pedidos.at(-1).prompt,'consent');
  assert.equal(JSON.parse(dados.get(VINCULO)).clientId,'outro-client-publico');
});
test('conexões concorrentes compartilham o mesmo pedido de autorização', async () => {
  const google=await importar();
  responder=op=>queueMicrotask(()=>op.callback(normal(op)));
  await Promise.all([google.conectar(),google.conectar(),google.conectar()]);
  assert.equal(pedidos.length,1);
});
test('desconectar apaga vínculo e impede callback atrasado de reabrir a sessão', async () => {
  const google=await importar();let pendente;
  responder=op=>{pendente=op;};
  const tentativa=google.conectar();const rejeicao=assert.rejects(()=>tentativa,e=>e.codigo==='cancelado');
  await new Promise(resolve=>setTimeout(resolve,0));
  await google.desconectar();pendente.callback(normal(pendente));await rejeicao;
  assert.equal(google.temToken(),false);assert.equal(dados.has(VINCULO),false);
  responder=op=>op.callback(normal(op));await google.conectar();await google.desconectar();
  assert.equal(revogados.length,1);assert.equal(dados.has(VINCULO),false);
});
test('upload usa appDataFolder sem criar pasta visível; conteúdo permanece cifrado', async () => {
  const google=await importar();await google.conectar();let chamada;
  globalThis.fetch=async(url,op)=>{chamada={url,op};return Response.json({id:'novo'});};
  await google.enviar('sistema-financeiro-teste.sfin','{"sfin":1,"dados":"CIFRADO"}');
  assert.ok(chamada.url.startsWith('https://www.googleapis.com/upload/drive/'));
  assert.ok(chamada.op.body.includes('"parents":["appDataFolder"]'));assert.ok(chamada.op.body.includes('CIFRADO'));
});
test('permissão API recusada e arquivo removido retornam erros úteis', async () => {
  const google=await importar();await google.conectar();
  globalThis.fetch=async()=>new Response('insufficientPermissions',{status:403});
  await assert.rejects(()=>google.listar(),e=>e.codigo==='permissao');
  globalThis.fetch=async()=>new Response('',{status:404});
  await assert.rejects(()=>google.baixar({id:'sumiu'}),/Arquivo não encontrado/);
});
test('restauração consulta pasta antiga somente com GET e preserva todos os originais', async () => {
  const google=await importar(),chamadas=[];
  globalThis.fetch=async(url,op={})=>{
    const u=new URL(url);chamadas.push({u,method:op.method||'GET'});
    return Response.json(u.searchParams.get('q').includes("name = 'Dagda Capital'")?{files:[{id:'pasta-antiga',name:'Dagda Capital'}]}:{files:[{id:'backup-antigo',name:'sistema-financeiro-2026-10-29.sfin',size:'900',createdTime:'2026-10-29T12:00:00Z'}]});
  };
  await google.conectarParaRestaurar();const itens=await google.listarAntigos();
  assert.ok(pedidos[0].scope.includes(BASE)&&pedidos[0].scope.includes(ARQUIVOS));
  assert.equal(itens.length,1);assert.equal(itens[0].legado,true);assert.equal(itens[0].id,'backup-antigo');
  assert.ok(chamadas.every(c=>c.method==='GET'&&c.u.searchParams.get('spaces')==='drive'));
  assert.ok(chamadas[1].u.searchParams.get('q').includes("'pasta-antiga' in parents"));
});
