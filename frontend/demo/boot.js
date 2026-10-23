// Backend de verdade dentro do navegador: as rotas de backend/src/routes são as
// mesmas do servidor; só o Express, o banco (SQLite via sql.js) e o login foram
// trocados por versões locais (ver demo/shims e demo/stubs).
import express from 'express';
import db from '../../backend/src/db.js';
import dashboard from '../../backend/src/routes/dashboard.js';
import contas from '../../backend/src/routes/contas.js';
import dividas from '../../backend/src/routes/dividas.js';
import categorias from '../../backend/src/routes/categorias.js';
import transacoes from '../../backend/src/routes/transacoes.js';
import reserva from '../../backend/src/routes/reserva.js';
import investimentos from '../../backend/src/routes/investimentos.js';
import relatorios from '../../backend/src/routes/relatorios.js';
import configuracoes from '../../backend/src/routes/configuracoes.js';
import cartoes from '../../backend/src/routes/cartoes.js';
import importacao from '../../backend/src/routes/importacao.js';
import custosFixos from '../../backend/src/routes/custosFixos.js';
import regras from '../../backend/src/routes/regras.js';
import auth from './stubs/auth-routes.cjs';
import openFinance from './stubs/open-finance.cjs';
import { semearDados } from './seed.js';

const montagem = [
  ['/api/auth', auth],
  ['/api/dashboard', dashboard],
  ['/api/contas', contas],
  ['/api/dividas', dividas],
  ['/api/categorias', categorias],
  ['/api/open-finance', openFinance],
  ['/api/transacoes', transacoes],
  ['/api/reserva', reserva],
  ['/api/investimentos', investimentos],
  ['/api/relatorios', relatorios],
  ['/api/configuracoes', configuracoes],
  ['/api/cartoes', cartoes],
  ['/api/importacao', importacao],
  ['/api/custos-fixos', custosFixos],
  ['/api/regras', regras],
];

export async function chamar(metodo, url, corpo) {
  const u = new URL(url, 'http://demo.local');
  const alvo = montagem.find(([prefixo]) => u.pathname === prefixo || u.pathname.startsWith(prefixo + '/'));
  if (!alvo) return { status: 404, corpo: JSON.stringify({ erro: 'Rota não existe.' }), ehJson: true, headers: {} };
  const req = { query: Object.fromEntries(u.searchParams), body: corpo || {}, cookies: {}, headers: {} };
  const r = await express.despachar(alvo[1], metodo, u.pathname.slice(alvo[0].length), req);
  if (metodo !== 'GET' && r.status < 400) globalThis.__BANCO_DEMO.salvar();
  return r;
}

// Sessão: a pessoa já entra logada como o usuário de demonstração.
let usuario = db.prepare('SELECT id, email, nome FROM usuarios ORDER BY id LIMIT 1').get();
if (!usuario) {
  db.prepare('INSERT INTO usuarios (email, senha_hash, nome) VALUES (?, ?, ?)').run('demo@exemplo.com', 'demo', 'Demonstração');
  usuario = db.prepare('SELECT id, email, nome FROM usuarios ORDER BY id LIMIT 1').get();
}
globalThis.__SESSAO_DEMO.usuario = { id: usuario.id, email: usuario.email, nome: usuario.nome };

if (!db.prepare('SELECT id FROM contas LIMIT 1').get()) {
  await semearDados(chamar, db);
  globalThis.__BANCO_DEMO.salvar();
}

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

// Botão "Reiniciar demonstração" (usado pela faixa no topo)
window.__reiniciarDemo = () => {
  globalThis.__BANCO_DEMO.apagarSalvo();
  location.reload();
};


// Aviso discreto no canto: deixa claro que é demonstração e permite recomeçar.
function montarAviso() {
  const faixa = document.createElement('div');
  faixa.className = 'faixa-demo';
  const est = document.createElement('style');
  est.textContent = '@media (max-width:768px){.faixa-demo{bottom:calc(88px + env(safe-area-inset-bottom,0px)) !important;right:8px !important;max-width:calc(100% - 16px);font-size:11px !important;z-index:25 !important}}';
  document.head.appendChild(est);
  faixa.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:50;display:flex;gap:8px;align-items:center;padding:6px 10px;border-radius:999px;background:#f5b942;color:#241a00;font:600 12px Inter,system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.35)';
  faixa.innerHTML = '<span>Demonstração · dados só neste navegador</span>';
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = 'Reiniciar';
  b.style.cssText = 'background:#241a00;color:#fff;border:0;border-radius:999px;padding:4px 10px;font:600 12px Inter,system-ui,sans-serif;cursor:pointer';
  let armado = false;
  b.onclick = () => {
    if (!armado) {
      armado = true;
      b.textContent = 'Apagar tudo?';
      setTimeout(() => { armado = false; b.textContent = 'Reiniciar'; }, 4000);
      return;
    }
    window.__reiniciarDemo();
  };
  faixa.appendChild(b);
  document.body.appendChild(faixa);
}
if (document.body) montarAviso(); else document.addEventListener('DOMContentLoaded', montarAviso);

// Dentro de um artefato/iframe o navegador bloqueia confirm() e alert() (o
// confirm sempre responde "não"). Aqui o confirm responde "sim" e o alert vira
// um aviso na tela, para as telas continuarem funcionando na demonstração.
window.confirm = () => true;
window.alert = (mensagem) => {
  const aviso = document.createElement('div');
  aviso.textContent = String(mensagem);
  aviso.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:60;max-width:90vw;padding:10px 14px;border-radius:10px;background:#f0523b;color:#fff;font:500 13px Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4)';
  document.body.appendChild(aviso);
  setTimeout(() => aviso.remove(), 4500);
};
