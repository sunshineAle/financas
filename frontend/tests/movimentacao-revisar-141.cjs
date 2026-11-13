// Smoke 1.4.1 (anotações 103 e 104). Somente perfil e contas fictícios, build local descartável.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const URL = process.env.DAGDA_TEST_URL || 'http://127.0.0.1:8017/financas/';
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL)) throw new Error('Somente build local descartável');
const SHOTS = process.argv[2] || '.';
const DIA = '2026-11-10';
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  await c.addInitScript("localStorage.setItem('sf:tours',JSON.stringify({ligado:false}));localStorage.setItem('sf:novidades-vista','1.4.4')");
  const p = await c.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(String(e)));
  const api = (url, body, metodo) => p.evaluate(async ([u, b, m]) => { const r = await fetch(u, { method: m || (b ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, ...(b ? { body: JSON.stringify(b) } : {}) }); const j = await r.json(); if (!r.ok) throw Error(JSON.stringify(j)); return j; }, [url, body, metodo]);
  const tx = (conta, tipo, descricao, valor) => api('/api/transacoes', { contaId: conta.id, tipo, descricao, valor, data: DIA });
  const saldo = async (id) => (await api('/api/contas')).find((x) => x.id === id).saldo;
  const resumo = async () => (await api('/api/transacoes?mes=2026-11')).resumo;
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
  await api('/api/configuracoes', { nome_titular: 'Titular Ficticio Teste' }, 'PUT').catch(() => {});

  // ---------- 103 ----------
  const a = await api('/api/contas', { nome: 'Conta A fictícia', tipo: 'corrente', saldo: 2000 });
  const lazer = await api('/api/categorias', { nome: 'Lazer fictício', tetoMensal: 1000 });
  const saida = await api('/api/transacoes', { contaId: a.id, tipo: 'saida', descricao: 'TED TITULAR FICTICIO TESTE', valor: 500, data: DIA, categoriaId: lazer.id });
  const s0 = await saldo(a.id), r0 = await resumo();
  const gasto = async () => ((await api('/api/dashboard?mes=2026-11')).categoriasMes || (await api('/api/dashboard?mes=2026-11')).categorias || []).find?.((x) => x.id === lazer.id)?.gasto_atual;
  const g0 = await gasto();
  // UI: Conferir origem oferece Movimentação própria para a saída
  await p.evaluate((id) => { location.hash = `#/transacoes?ver=extrato&editar=${id}`; }, saida.id);
  await p.getByRole('button', { name: /Conferir origem/ }).first().click({ timeout: 15000 });
  const modal = p.locator('[data-conferir-origem]');
  await modal.getByRole('radio', { name: 'Movimentação própria' }).click();
  await modal.locator('[data-consequencia-externa]').waitFor();
  const texto = await modal.locator('[data-consequencia-externa]').innerText();
  assert.match(texto, /nas saídas/); assert.match(texto, /orçamento/);
  await p.screenshot({ path: `${SHOTS}/103-conferir-origem.png` });
  await p.locator('[data-confirmar-origem]').click();
  await modal.waitFor({ state: 'hidden' });
  const t1 = await linha(saida.id);
  assert.equal(t1.tipo_mov, 'saldo_proprio_externo'); assert.equal(t1.categoria_id, null);
  assert.equal(await saldo(a.id), s0, 'saldo igual');
  const r1 = await resumo();
  assert.equal(Math.round(r1.saidas * 100), Math.round(r0.saidas * 100), 'continua nas saídas do mês');
  const g1 = await gasto();
  if (g0 !== undefined) { assert.equal(g0, 500); assert.equal(g1 || 0, 0, 'fora do orçamento'); }
  assert.equal((await api('/api/contas')).length, 1, 'nenhuma conta criada');
  ok(`103 saída como movimentação própria: saldo ${s0}, saídas do mês ${r1.saidas}, orçamento ${g0}→${g1 || 0}`);
  // reverter
  await api(`/api/transacoes/${saida.id}/revisar-transferencia`, { acao: 'receita', manual: true });
  const t2 = await linha(saida.id);
  assert.equal(t2.categoria_id, lazer.id); assert.equal(t2.tipo_mov, null); assert.equal(await saldo(a.id), s0);
  if (g0 !== undefined) assert.equal(await gasto(), 500);
  ok('103 reverter volta para a categoria e o orçamento de antes, sem mudar saldo');

  // ---------- 104 ----------
  const pad = await tx(a, 'saida', 'PADARIA DO ZE 0042', 18.5);
  const pad2 = await tx(a, 'saida', 'PADARIA DO ZE 0043', 22);
  await p.evaluate(() => { location.hash = '#/revisar'; });
  const bloco = p.locator('[data-revisar-categorias]');
  await bloco.waitFor({ timeout: 15000 });
  assert.equal(await bloco.locator('select').count(), 0, 'sem select nativo na lista');
  const item = bloco.locator('li', { hasText: 'PADARIA DO ZE 0042' });
  await item.getByRole('button', { name: 'Ignorar' }).waitFor();
  await item.locator('[data-editar-categoria]').click();
  const ed = p.locator('[data-edicao-revisar]'); await ed.waitFor();
  assert.equal(await ed.locator('select').count(), 0, 'sem select nativo na janela');
  const cr = ed.locator('[data-criar-regra] [role="checkbox"]'); await cr.waitFor();
  assert.equal(await cr.getAttribute('aria-checked'), 'false', 'Criar regra começa desmarcada');

  await ed.getByRole('radio', { name: /Lazer fictício/ }).first().click();
  await ed.getByText(/Também muda 1 transação parecida/).waitFor({ timeout: 10000 });
  assert.equal(await ed.getByRole('radio', { name: /^Geral/ }).count(), 0, 'Geral não aparece como escolha');
  // Ajustar só edita o rascunho: nada é gravado antes do Salvar
  const antesRegras = (await api('/api/regras')).length;
  await ed.getByRole('button', { name: 'Ajustar' }).click();
  const rm = p.getByRole('dialog').last(); await rm.getByRole('button', { name: 'Usar estes ajustes' }).last().click();
  await ed.waitFor();
  assert.equal((await api('/api/regras')).length, antesRegras, 'Ajustar não grava a regra');
  await ed.getByText('Regra ajustada. Ela é criada ao salvar.').waitFor();
  assert.equal(await cr.getAttribute('aria-checked'), 'true');
  await p.screenshot({ path: `${SHOTS}/104-editar.png` });
  await p.locator('[data-salvar-categoria]').click();
  await ed.waitFor({ state: 'hidden' });
  assert.equal((await linha(pad.id)).categoria_id, lazer.id);
  const regras = await api('/api/regras');
  assert.ok(regras.some((r) => /PADARIA DO ZE/i.test(r.padrao)), 'regra criada');
  assert.equal((await linha(pad2.id)).categoria_id, lazer.id, 'regra aplicada ao parecido');
  await p.waitForTimeout(600);
  assert.equal(await bloco.locator('li', { hasText: 'PADARIA DO ZE' }).count(), 0, 'itens saíram da lista');
  ok('104 Editar: botões, Criar regra no topo desmarcada, salvar categoria + regra e sair da lista');
  // Ignorar continua com confirmação
  const ign = await tx(a, 'saida', 'XYZ COMPRA AVULSA', 7);
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(500); await p.evaluate(() => { location.hash = '#/revisar'; }); await bloco.waitFor();
  await bloco.locator('li', { hasText: 'XYZ COMPRA AVULSA' }).getByRole('button', { name: 'Ignorar' }).click();
  await p.getByRole('button', { name: 'Ignorar', exact: true }).last().click();
  await p.waitForTimeout(600);
  assert.equal((await linha(ign.id)).ignorada, 1);
  ok('104 Ignorar mantém confirmação e comportamento');
  // Tela larga
  await p.setViewportSize({ width: 1366, height: 900 });
  const it2 = await tx(a, 'entrada', 'DEPOSITO FICTICIO 9', 50);
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(500); await p.evaluate(() => { location.hash = '#/revisar'; }); await bloco.waitFor();
  await bloco.locator('li', { hasText: 'DEPOSITO FICTICIO 9' }).locator('[data-editar-categoria]').click();
  await ed.waitFor();
  const larg = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  assert.ok(larg, 'sem rolagem lateral');
  await p.screenshot({ path: `${SHOTS}/104-pc-entrada.png` });
  ok('104 tela 1366 px com entrada, sem rolagem lateral');
  assert.deepEqual(erros, [], 'sem erros JavaScript');
  ok('zero erros JavaScript');
  await b.close();
})().catch((e) => { console.error('FALHA', e); process.exit(1); });
