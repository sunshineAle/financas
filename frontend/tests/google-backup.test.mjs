import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { google } from '../src/services/nuvem/google.js';
const originalFetch = globalThis.fetch;
let escopo;
globalThis.window = { __SF_CONFIG__: { nuvem: { googleClientId: 'client-publico-teste' } }, google: { accounts: { oauth2: {
  initTokenClient: options => { escopo = options.scope; return { requestAccessToken: () => options.callback({ access_token: 'token-falso-de-teste', expires_in: 3600 }) }; },
  revoke: (_t, callback) => callback(),
} } } };
after(() => { globalThis.fetch = originalFetch; delete globalThis.window; });
test('Google pede somente drive.appdata e lista todas as páginas da área oculta', async () => {
 const urls = [];
 globalThis.fetch = async url => {
  urls.push(new URL(url));
  return Response.json(urls.length === 1 ? { nextPageToken: 'segunda', files: [{ id: '1', name: 'sistema-financeiro-a.sfin', size: '42', createdTime: '2026-11-08T10:00:00Z' }] } : { files: [{ id: '2', name: 'sistema-financeiro-b.sfin', size: '84', createdTime: '2026-11-09T10:00:00Z' }, { id: '3', name: 'previa-sistema-financeiro-teste.sfin' }] });
 };
 await google.conectar();const itens=await google.listar();
 assert.equal(escopo,'https://www.googleapis.com/auth/drive.appdata');
 assert.equal(itens.length,2);assert.equal(itens[0].tamanho,42);
 assert.ok(urls.every(u=>u.searchParams.get('spaces')==='appDataFolder'));
 assert.equal(urls[1].searchParams.get('pageToken'),'segunda');
});
test('upload usa appDataFolder sem criar pasta visível; conteúdo permanece cifrado', async () => {
 let chamada;
 globalThis.fetch = async (url, options) => { chamada={url,options};return Response.json({ id:'novo' }); };
 await google.enviar('sistema-financeiro-teste.sfin', '{"sfin":1,"dados":"CIFRADO"}');
 assert.ok(chamada.url.startsWith('https://www.googleapis.com/upload/drive/'));
 assert.ok(chamada.options.body.includes('"parents":["appDataFolder"]'));
 assert.ok(chamada.options.body.includes('CIFRADO'));
});
test('permissão recusada e arquivo removido retornam erros úteis', async () => {
 globalThis.fetch = async () => new Response('insufficientPermissions',{status:403});
 await assert.rejects(()=>google.listar(),e=>e.codigo==='permissao');
 globalThis.fetch = async () => new Response('',{status:404});
 await assert.rejects(()=>google.baixar({id:'sumiu'}),/Arquivo não encontrado/);
});
test('restauração consulta pasta antiga somente com GET e preserva todos os originais', async () => {
 const chamadas=[];
 globalThis.fetch = async (url, options={}) => {
  const u=new URL(url);chamadas.push({u,method:options.method || 'GET'});
  return Response.json(u.searchParams.get('q').includes("name = 'Dagda Capital'") ? {files:[{id:'pasta-antiga',name:'Dagda Capital'}]} : {files:[{id:'backup-antigo',name:'sistema-financeiro-2026-10-29.sfin',size:'900',createdTime:'2026-10-29T12:00:00Z'}]});
 };
 await google.conectarParaRestaurar();
 assert.ok(escopo.includes('drive.appdata'));assert.ok(escopo.includes('drive.file'));
 const itens=await google.listarAntigos();
 assert.equal(itens.length,1);assert.equal(itens[0].legado,true);
 assert.equal(itens[0].id,'backup-antigo');
 assert.ok(chamadas.every(c=>c.method==='GET' && c.u.searchParams.get('spaces')==='drive'));
 assert.ok(chamadas[1].u.searchParams.get('q').includes("'pasta-antiga' in parents"));
});
