// Backend dentro do navegador, versão PWA: as MESMAS rotas de backend/src/routes, com o banco SQLite (sql.js)
// persistido em IndexedDB (ver persistencia.js). Diferenças em relação a demo/boot.js: sem dados de exemplo
// automáticos, sem faixa de demonstração e sem trocar confirm()/alert() do navegador.
import express from 'express';
import db from '../../../backend/src/db.js';
import dashboard from '../../../backend/src/routes/dashboard.js';
import contas from '../../../backend/src/routes/contas.js';
import dividas from '../../../backend/src/routes/dividas.js';
import categorias from '../../../backend/src/routes/categorias.js';
import transacoes from '../../../backend/src/routes/transacoes.js';
import reserva from '../../../backend/src/routes/reserva.js';
import relatorios from '../../../backend/src/routes/relatorios.js';
import configuracoes from '../../../backend/src/routes/configuracoes.js';
import cartoes from '../../../backend/src/routes/cartoes.js';
import importacao from '../../../backend/src/routes/importacao.js';
import custosFixos from '../../../backend/src/routes/custosFixos.js';
import auth from '../stubs/auth-routes.cjs';
import openFinance from '../stubs/open-finance.cjs';
import { semearDados } from '../seed.js';

// Rota de backup do Setor A (pode ainda não existir: o glob não quebra o build; o front tem plano B).
const achadas = import.meta.glob('../../../backend/src/routes/backup.js', { eager: true });
const modBackup = Object.values(achadas)[0];
const backup = modBackup ? (modBackup.default && modBackup.default.default ? modBackup.default.default : modBackup.default) : null;

const montagem = [
  ['/api/auth', auth],
  ['/api/dashboard', dashboard],
  ['/api/contas', contas],
  ['/api/dividas', dividas],
  ['/api/categorias', categorias],
  ['/api/open-finance', openFinance],
  ['/api/transacoes', transacoes],
  ['/api/reserva', reserva],
  ['/api/relatorios', relatorios],
  ['/api/configuracoes', configuracoes],
  ['/api/cartoes', cartoes],
  ['/api/importacao', importacao],
  ['/api/custos-fixos', custosFixos],
];
if (backup) montagem.push(['/api/backup', backup]);

export async function chamar(metodo, url, corpo) {
  const u = new URL(url, 'http://local.app');
  const alvo = montagem.find(([prefixo]) => u.pathname === prefixo || u.pathname.startsWith(prefixo + '/'));
  if (!alvo) return { status: 404, corpo: JSON.stringify({ erro: 'Rota não existe.' }), ehJson: true, headers: {} };
  const req = { query: Object.fromEntries(u.searchParams), body: corpo || {}, cookies: {}, headers: {} };
  const r = await express.despachar(alvo[1], metodo, u.pathname.slice(alvo[0].length), req);
  if (metodo !== 'GET' && r.status < 400) globalThis.__BANCO_DEMO.salvar();
  return r;
}

// Um único usuário local (a "senha de acesso" é só a trava do aparelho — ver services/acesso.js).
let usuario = db.prepare('SELECT id, email, nome FROM usuarios LIMIT 1').get();
if (!usuario) {
  db.prepare('INSERT INTO usuarios (email, senha_hash, nome) VALUES (?, ?, ?)').run('local@aparelho', 'local', 'Eu');
  usuario = db.prepare('SELECT id, email, nome FROM usuarios LIMIT 1').get();
  globalThis.__BANCO_DEMO.salvar();
}
globalThis.__SESSAO_DEMO.usuario = { id: usuario.id, email: usuario.email, nome: usuario.nome };

const fetchOriginal = window.fetch.bind(window);
window.fetch = async (url, opcoes = {}) => {
  const texto = String(url);
  if (!texto.startsWith('/api/')) return fetchOriginal(url, opcoes);
  let corpo = null;
  try { corpo = opcoes.body ? JSON.parse(opcoes.body) : null; } catch (e) { /* sem corpo */ }
  const r = await chamar((opcoes.method || 'GET').toUpperCase(), texto, corpo);
  return new Response(r.corpo, {
    status: r.status,
    headers: { 'Content-Type': r.ehJson ? 'application/json' : (r.headers['Content-Type'] || 'text/plain') },
  });
};

// Dados de exemplo sob demanda (tela Mais → "Carregar exemplo", ou evento 'sf:carregar-exemplo').
export async function carregarExemplo() {
  await semearDados(chamar, db);
  globalThis.__BANCO_DEMO.salvar();
  if (globalThis.__PERSISTENCIA_BANCO) await globalThis.__PERSISTENCIA_BANCO.flush();
}
window.__SF_CARREGAR_EXEMPLO = async () => { await carregarExemplo(); location.reload(); };
window.addEventListener('sf:carregar-exemplo', () => { window.__SF_CARREGAR_EXEMPLO(); });
