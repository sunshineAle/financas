// Smoke 1.4.3.1 (anotação 108): começar do zero sem senha nem código. Google SIMULADO, perfil fictício, build local.
// Uso: servir docs/ em http://127.0.0.1:PORTA/financas/ e rodar: node tests/comecar-do-zero-108.cjs <pasta-prints>
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const URL = process.env.DAGDA_TEST_URL || 'http://127.0.0.1:8017/financas/';
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL)) throw new Error('Somente build local descartável');
const SHOTS = process.argv[2] || '.';
const SDK = "window.google={accounts:{oauth2:{initTokenClient(o){return{requestAccessToken(){o.callback({access_token:'token-ficticio-108',expires_in:3600,scope:o.scope})}}},revoke(t,cb){cb()}}}};";
const ok = (m) => console.log('PASS', m);

async function contexto(b, existentes = []) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await c.addInitScript("if(!localStorage.getItem('sf:tours'))localStorage.setItem('sf:tours',JSON.stringify({ligado:false}));localStorage.setItem('sf:novidades-vista','1.4.3.1')");
  const enviados = [];
  await c.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK }));
  await c.route('https://www.googleapis.com/**', async (r) => {
    const req = r.request(); const u = req.url();
    if (req.method() === 'POST' && u.includes('/upload/')) {
      const corpo = req.postData() || ''; const nome = (corpo.match(/"name":"([^"]+)"/) || [])[1];
      enviados.push({ nome, corpo }); return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'f' + enviados.length, name: nome }) });
    }
    const baixa = u.match(/\/files\/([^?/]+)\?alt=media/);
    if (req.method() === 'GET' && baixa) {
      const e = enviados[Number(baixa[1].slice(1)) - 1]; const partes = e ? e.corpo.split(/\r\n\r\n/) : [];
      return r.fulfill({ contentType: 'application/octet-stream', body: e ? partes.slice(2).join('\r\n\r\n').replace(/\r\n--[^\r\n]+--\s*$/, '') : '' });
    }
    if (req.method() === 'GET' && u.includes('/files')) {
      const files = [...existentes, ...enviados.map((e, i) => ({ id: 'f' + (i + 1), name: e.nome, createdTime: new Date().toISOString(), size: String(e.corpo.length) }))];
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ files }) });
    }
    return r.fulfill({ contentType: 'application/json', body: '{}' });
  });
  const p = await c.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(String(e)));
  return { c, p, enviados, erros };
}
async function cadastrar(p) {
  await p.getByLabel('Apelido', { exact: true }).fill('Pessoa fictícia');
  await p.getByLabel('Senha ou PIN', { exact: true }).fill('123456');
  await p.getByLabel('Repita a senha ou PIN', { exact: true }).fill('123456');
  await p.getByRole('button', { name: 'Salvar senha e entrar', exact: true }).click();
  await p.getByRole('checkbox', { name: 'Guardei a chave em local seguro', exact: true }).check({ timeout: 20000 });
  await p.getByRole('button', { name: 'Entrar no app', exact: true }).click();
  await p.locator('main').waitFor({ timeout: 30000 });
}

(async () => {
  const b = await chromium.launch();

  // 1) Aparelho com acesso criado: Esqueci a senha › Começar do zero
  {
    const { c, p, erros } = await contexto(b);
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Criar acesso novo', exact: true }).click();
    await cadastrar(p);
    await p.evaluate(async () => { await fetch('/api/contas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Conta fictícia', tipo: 'corrente', saldo: 100 }) }); });
    await p.reload({ waitUntil: 'networkidle' });
    await p.getByRole('button', { name: /Esqueci a senha/ }).click();
    await p.locator('[data-comecar-zero]').click();
    const m = p.locator('[data-comecar-do-zero]'); await m.waitFor();
    await m.getByText('Você vai perder todos os seus dados.').waitFor();
    await m.getByText('só neste aparelho').waitFor();
    const apagar = p.locator('[data-zerar-agora]');
    assert.ok(await apagar.isDisabled(), 'botão travado sem digitar APAGAR');
    await p.locator('[data-confirmar-zerar]').fill('apaga');
    assert.ok(await apagar.isDisabled(), 'palavra incompleta não libera');
    const borda = await p.evaluate(() => getComputedStyle(document.querySelector('.fundo-modal .modal')).borderTopWidth);
    assert.equal(borda, '2px', 'janela com borda de alerta');
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${SHOTS}/108-comecar-do-zero.png` });
    // Cancelar não apaga nada
    await p.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.ok(await p.evaluate(() => !!localStorage.getItem('sf:acesso')), 'cancelar mantém o acesso');
    await p.locator('[data-comecar-zero]').click();
    await p.locator('[data-confirmar-zerar]').fill('APAGAR');
    await apagar.click();
    await p.getByRole('button', { name: 'Criar acesso novo', exact: true }).waitFor({ timeout: 30000 });
    assert.equal(await p.evaluate(() => localStorage.getItem('sf:acesso')), null, 'acesso apagado');
    // Recomeça e confere que o banco veio vazio
    await p.getByRole('button', { name: 'Criar acesso novo', exact: true }).click();
    await cadastrar(p);
    const contas = await p.evaluate(async () => (await (await fetch('/api/contas')).json()).length);
    assert.equal(contas, 0, 'dados antigos não voltam');
    assert.deepEqual(erros, []);
    ok('Esqueci a senha › Começar do zero: alerta, APAGAR obrigatório, cancelar preserva, apagar zera e permite recomeçar');
    await c.close();
  }

  // 2) Aparelho novo, conta Google com backup antigo: "Não lembro a senha deste backup"
  {
    const { c, p, enviados, erros } = await contexto(b, [{ id: 'x1', name: 'sistema-financeiro-2026-10-01-1200.sfin', createdTime: '2026-10-01T12:00:00Z', size: '100' }]);
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Entrar com Google', exact: true }).click();
    await p.locator('[data-nao-lembro]').click({ timeout: 15000 });
    const m = p.locator('[data-comecar-do-zero]'); await m.waitFor();
    await m.getByText('backups desta conta Google não abrem mais').waitFor();
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${SHOTS}/108-google.png` });
    await p.locator('[data-confirmar-zerar]').fill('APAGAR');
    await p.locator('[data-zerar-agora]').click();
    await p.getByText('Crie seu acesso novo: o primeiro backup vai para esta conta Google.').waitFor({ timeout: 15000 });
    await cadastrar(p);
    assert.equal(enviados.length, 1, 'primeiro backup novo enviado');
    assert.ok(/"criptografia":\s*\{[^}]*"alg":\s*"AES/.test(enviados[0].corpo), 'cifrado');
    assert.deepEqual(erros, []);
    ok('Google com backup antigo: Não lembro a senha → alerta → cadastro novo → 1 backup cifrado');
    await c.close();
  }
  await b.close();
})().catch((e) => { console.error('FALHA', e); process.exit(1); });
