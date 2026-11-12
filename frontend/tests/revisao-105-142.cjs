// Smoke 1.4.2 (anotação 105). Somente perfil e contas fictícios, build local descartável.
// Uso: servir docs/ em http://127.0.0.1:PORTA/financas/ e rodar: node tests/revisao-105-142.cjs <pasta-prints>
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const URL = process.env.DAGDA_TEST_URL || 'http://127.0.0.1:8017/financas/';
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL)) throw new Error('Somente build local descartável');
const SHOTS = process.argv[2] || '.';
const hoje = new Date(); const DIA = hoje.toLocaleDateString('sv-SE');
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 360, height: 780 }, colorScheme: 'dark' });
  await c.addInitScript("localStorage.setItem('sf:tours',JSON.stringify({ligado:false}));localStorage.setItem('sf:novidades-vista','1.4.3');localStorage.setItem('sf:tema','escuro')");
  const p = await c.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(String(e)));
  const api = (url, body, metodo) => p.evaluate(async ([u, b, m]) => { const r = await fetch(u, { method: m || (b ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, ...(b ? { body: JSON.stringify(b) } : {}) }); const j = await r.json(); if (!r.ok) throw Error(JSON.stringify(j)); return j; }, [url, body, metodo]);
  const tx = (conta, tipo, descricao, valor, extra = {}) => api('/api/transacoes', { contaId: conta.id, tipo, descricao, valor, data: DIA, ...extra });
  const linha = async (id) => (await api('/api/backup/exportar')).tabelas.transacoes.find((t) => t.id === id);
  const ok = (m) => console.log('PASS', m);

  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Criar acesso novo', exact: true }).click();
  await p.getByLabel('Apelido', { exact: true }).fill('Pessoa fictícia');
  await p.getByLabel('Senha ou PIN', { exact: true }).fill('1234');
  await p.getByLabel('Repita a senha ou PIN', { exact: true }).fill('1234');
  await p.getByRole('button', { name: 'Salvar senha e entrar', exact: true }).click();
  await p.getByRole('checkbox', { name: 'Guardei a chave em local seguro', exact: true }).check({ timeout: 20000 });
  await p.getByRole('button', { name: 'Entrar no app', exact: true }).click();
  await p.locator('main').waitFor({ timeout: 25000 });
  await api('/api/configuracoes', { nomeTitular: 'Titular Ficticio Teste' }, 'PUT').catch(() => {});

  const a = await api('/api/contas', { nome: 'Conta A fictícia', tipo: 'corrente', saldo: 2000 });
  const bb = await api('/api/contas', { nome: 'Conta B fictícia', tipo: 'corrente', saldo: 100 });

  // O resumo anual do extrato (gruposPorMes) não é alcançável pela tela desde a anotação 47: sem teste de navegador.
  // ---- Extrato da outra conta chegando depois ----
  const saida = await tx(a, 'saida', 'PIX TITULAR FICTICIO TESTE', 250);
  await api(`/api/transacoes/${saida.id}/revisar-transferencia`, { acao: 'externa', manual: true });
  const entrada = await tx(bb, 'entrada', 'PIX RECEBIDO', 250);
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(400);
  await p.evaluate(() => { location.hash = '#/revisar'; });
  const aviso = p.locator('[data-duplicidade-propria]'); await aviso.waitFor({ timeout: 15000 });
  assert.match(await aviso.innerText(), /mesmo dinheiro da movimentação própria/);
  await p.screenshot({ path: `${SHOTS}/142-duplicidade-360-escuro.png` });
  await p.getByRole('button', { name: 'É o mesmo dinheiro', exact: true }).click();
  await aviso.waitFor({ state: 'detached', timeout: 15000 });
  assert.equal((await linha(saida.id)).tipo_mov, 'transferencia_vinculada');
  assert.equal((await linha(entrada.id)).tipo_mov, 'transferencia_vinculada');
  ok('aviso de duplicidade e confirmação viram transferência, sem lançamento extra');

  // ---- Estorno de movimentação própria ----
  const s2 = await tx(a, 'saida', 'TED TITULAR FICTICIO TESTE', 80);
  await api(`/api/transacoes/${s2.id}/revisar-transferencia`, { acao: 'externa', manual: true });
  const antes = (await api('/api/contas')).find((x) => x.id === a.id).saldo;
  await api(`/api/transacoes/${s2.id}/estorno`, { data: DIA });
  assert.equal((await linha(s2.id)).tipo_mov, 'estornada');
  assert.equal((await api('/api/contas')).find((x) => x.id === a.id).saldo, antes + 80);
  ok('estorno de movimentação própria: original estornada e saldo de volta');

  // 360 px sem rolagem lateral
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sem rolagem lateral em 360 px');
  ok('360 px e tema escuro sem rolagem lateral');
  assert.deepEqual(erros, [], 'sem erros JavaScript');
  ok('zero erros JavaScript');
  await b.close();
})().catch((e) => { console.error('FALHA', e); process.exit(1); });
