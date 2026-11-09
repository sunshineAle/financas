import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { ehAppleMovel, orientacaoInstalacao } from '../src/services/instalacaoOrientacoes.js';

test('iPhone recebe passos visíveis de Compartilhar e Adicionar à Tela de Início', () => {
  const a = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' };
  const orientacao = orientacaoInstalacao(a);
  assert.equal(ehAppleMovel(a), true);
  assert.match(orientacao.titulo, /iPhone ou iPad/);
  assert.ok(orientacao.passos.some(p => p.includes('Compartilhar')));
  assert.ok(orientacao.passos.some(p => p.includes('Adicionar à Tela de Início')));
});
test('iPad com identificação de desktop continua recebendo instruções móveis', () => {
  const a = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1', platform: 'MacIntel', maxTouchPoints: 5 };
  assert.equal(ehAppleMovel(a), true);
  assert.match(orientacaoInstalacao(a).titulo, /iPad/);
});
test('navegador interno ou Chrome iOS orienta abrir o mesmo endereço no Safari', () => {
  const a = { userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit CriOS/130 Mobile Safari/604.1', platform: 'iPhone' };
  assert.match(orientacaoInstalacao(a).passos[0], /Abra este endereço no Safari/);
});
test('Mac sem toque usa Dock, e Android recebe o menu do navegador', () => {
  const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 0 };
  assert.equal(ehAppleMovel(mac), false);
  assert.match(orientacaoInstalacao(mac).passos.join(' '), /Adicionar ao Dock/);
  assert.match(orientacaoInstalacao({ userAgent: 'Android Chrome', platform: 'Linux' }).passos[0], /menu do navegador/);
});

const originalWindow = globalThis.window;
globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
const { instalarApp } = await import('../src/services/instalacao.js');
after(() => { if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; });
test('sem convite nativo, o clique pede a janela de instruções', async () => {
  window.__sfInstalar = null;
  assert.equal(await instalarApp(), 'instrucoes');
});
test('prompt vencido/rejeitado não gera falha silenciosa', async () => {
  window.__sfInstalar = { prompt: () => Promise.reject(new Error('convite vencido')) };
  assert.equal(await instalarApp(), 'instrucoes');
  assert.equal(window.__sfInstalar, null);
});
test('prévia nunca dispara o convite nativo de instalação', async () => {
  let abriu = false;
  window.__sfInstalar = { prompt: () => { abriu = true; }, userChoice: Promise.resolve({ outcome: 'accepted' }) };
  assert.equal(await instalarApp({ previa: true }), 'instrucoes');
  assert.equal(abriu, false);
});
test('convite nativo aceito e dispensado são diferenciados', async () => {
  for (const [outcome, esperado] of [['accepted', 'aceito'], ['dismissed', 'recusado']]) {
    window.__sfInstalar = { prompt: () => Promise.resolve(), userChoice: Promise.resolve({ outcome }) };
    assert.equal(await instalarApp(), esperado);
    assert.equal(window.__sfInstalar, null);
  }
});
