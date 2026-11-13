// Smoke 1.4.4 (anotação 107): primeiro acesso pelo Google sem backup. Google SIMULADO (nenhuma conta real), build local.
// Uso: servir docs/ em http://127.0.0.1:PORTA/financas/ e rodar: node tests/google-primeiro-acesso-107.cjs <pasta-prints>
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const URL = process.env.DAGDA_TEST_URL || 'http://127.0.0.1:8017/financas/';
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL)) throw new Error('Somente build local descartável');
const SHOTS = process.argv[2] || '.';
const SDK = "window.google={accounts:{oauth2:{initTokenClient(o){return{requestAccessToken(){o.callback({access_token:'token-ficticio-107',expires_in:3600,scope:o.scope})}}},revoke(t,cb){cb()}}}};";

async function abrir(b, { falharEnvio = false, existentes = [] } = {}) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  await c.addInitScript("localStorage.setItem('sf:tours',JSON.stringify({ligado:false}));localStorage.setItem('sf:novidades-vista','1.4.4')");
  const enviados = [];
  await c.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK }));
  await c.route('https://www.googleapis.com/**', async (r) => {
    const req = r.request(); const u = req.url();
    if (req.method() === 'POST' && u.includes('/upload/')) {
      if (falharEnvio) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"message":"falha simulada"}}' });
      const corpo = req.postData() || ''; const nome = (corpo.match(/"name":"([^"]+)"/) || [])[1];
      enviados.push({ nome, corpo }); return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'f' + enviados.length, name: nome }) });
    }
    const baixa = u.match(/\/files\/([^?/]+)\?alt=media/);
    if (req.method() === 'GET' && baixa) {
      const e = enviados[Number(baixa[1].slice(1)) - 1];
      // conteúdo do arquivo = última parte do multipart enviado
      const partes = e ? e.corpo.split(/\r\n\r\n/) : [];
      const texto = e ? partes.slice(2).join('\r\n\r\n').replace(/\r\n--[^\r\n]+--\s*$/, '') : '';
      return r.fulfill({ contentType: 'application/octet-stream', body: texto });
    }
    if (req.method() === 'GET' && u.includes('/files')) {
      const files = [...existentes, ...enviados.map((e, i) => ({ id: 'f' + (i + 1), name: e.nome, createdTime: new Date().toISOString(), size: String(e.corpo.length) }))];
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ files }) });
    }
    return r.fulfill({ contentType: 'application/json', body: '{}' });
  });
  const p = await c.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(URL, { waitUntil: 'networkidle' });
  return { c, p, enviados, erros };
}
const ok = (m) => console.log('PASS', m);

(async () => {
  const b = await chromium.launch();

  // 1) Conta Google sem backup: cadastro direto, sem alternativas, e primeiro backup enviado
  {
    const { c, p, enviados, erros } = await abrir(b);
    await p.getByRole('button', { name: 'Entrar com Google', exact: true }).click();
    await p.getByText('Sem backup nesta conta Google. Crie seu acesso: o primeiro backup vai para ela.').waitFor({ timeout: 15000 });
    assert.equal(await p.getByRole('button', { name: 'Voltar' }).count(), 1, 'com Voltar (clique por engano)');
    assert.equal(await p.getByRole('button', { name: /Restaurar/ }).count(), 0, 'sem restaurar por arquivo');
    assert.equal(await p.getByRole('button', { name: /Entrar com Google|Trocar/ }).count(), 0, 'sem trocar de conta');
    assert.equal(await p.locator('input[type=file]').count(), 0, 'sem campo de arquivo');
    await p.screenshot({ path: `${SHOTS}/107-cadastro.png` });
    await p.getByLabel('Apelido', { exact: true }).fill('Pessoa fictícia');
    await p.getByLabel('Senha ou PIN', { exact: true }).fill('1234');
    await p.getByLabel('Repita a senha ou PIN', { exact: true }).fill('1234');
    await p.getByRole('button', { name: 'Salvar senha e entrar', exact: true }).click();
    assert.equal(enviados.length, 0, 'nada enviado antes do código de recuperação');
    await p.getByRole('checkbox', { name: 'Guardei a chave em local seguro', exact: true }).check({ timeout: 20000 });
    await p.getByRole('button', { name: 'Entrar no app', exact: true }).dblclick();
    await p.locator('main').waitFor({ timeout: 30000 });
    assert.equal(enviados.length, 1, 'um backup enviado, mesmo com toque duplo');
    assert.match(enviados[0].nome, /\.sfin$/);
    assert.ok(enviados[0].corpo.includes('appDataFolder'), 'na área oculta do app');
    assert.ok(/"criptografia":\s*\{[^}]*"alg":\s*"AES/.test(enviados[0].corpo), 'backup cifrado (algoritmo presente, não nulo)');
    assert.ok(!/Pessoa fictícia/.test(enviados[0].corpo), 'apelido não vai em claro');
    const cfg = JSON.parse(await p.evaluate(() => localStorage.getItem('sf:backup') || localStorage.getItem('sf:backup-cfg') || '{}'));
    await p.getByText('Primeiro backup guardado na sua conta Google.').waitFor({ timeout: 10000 });
    await p.screenshot({ path: `${SHOTS}/107-entrou.png` });
    assert.deepEqual(erros, []);
    ok(`conta sem backup: cadastro sem alternativas e 1 backup cifrado enviado (${enviados[0].nome})` + (cfg.ultimoDestino ? `, destino ${cfg.ultimoDestino}` : ''));
    await c.close();
  }

  // 2) Envio falha: a entrada não trava e o aviso aparece
  {
    const { c, p, enviados, erros } = await abrir(b, { falharEnvio: true });
    await p.getByRole('button', { name: 'Entrar com Google', exact: true }).click();
    await p.getByLabel('Apelido', { exact: true }).fill('Pessoa fictícia');
    await p.getByLabel('Senha ou PIN', { exact: true }).fill('1234');
    await p.getByLabel('Repita a senha ou PIN', { exact: true }).fill('1234');
    await p.getByRole('button', { name: 'Salvar senha e entrar', exact: true }).click();
    await p.getByRole('checkbox', { name: 'Guardei a chave em local seguro', exact: true }).check({ timeout: 20000 });
    await p.getByRole('button', { name: 'Entrar no app', exact: true }).click();
    await p.locator('main').waitFor({ timeout: 30000 });
    await p.getByText('Não foi possível enviar o primeiro backup agora.').waitFor({ timeout: 10000 });
    assert.equal(enviados.length, 0);
    assert.deepEqual(erros, []);
    ok('envio falhou: entra no app e avisa');
    await c.close();
  }

  // 3) Conta Google COM backup: continua indo para a restauração (comportamento de antes)
  {
    const { c, p } = await abrir(b, { existentes: [{ id: 'x1', name: 'dagda-2026-11-01-1200.sfin', createdTime: '2026-11-01T12:00:00Z', size: '100' }] });
    await p.getByRole('button', { name: 'Entrar com Google', exact: true }).click();
    await p.getByRole('heading', { name: 'Restaurar backup' }).waitFor({ timeout: 15000 });
    assert.equal(await p.getByLabel('Apelido', { exact: true }).count(), 0);
    ok('conta com backup: segue para Restaurar backup, sem cadastro');
    await c.close();
  }

  // 3b) Voltar no cadastro vindo do Google: volta ao início e um cadastro comum depois não envia nada
  {
    const { c, p, enviados } = await abrir(b);
    await p.getByRole('button', { name: 'Entrar com Google', exact: true }).click();
    await p.getByText('Sem backup nesta conta Google').waitFor({ timeout: 15000 });
    await p.getByRole('button', { name: 'Voltar' }).click();
    await p.getByRole('button', { name: 'Entrar com Google', exact: true }).waitFor();
    await p.getByRole('button', { name: 'Criar acesso novo', exact: true }).click();
    assert.equal(await p.getByText('Sem backup nesta conta Google').count(), 0);
    await p.getByLabel('Apelido', { exact: true }).fill('Pessoa fictícia');
    await p.getByLabel('Senha ou PIN', { exact: true }).fill('1234');
    await p.getByLabel('Repita a senha ou PIN', { exact: true }).fill('1234');
    await p.getByRole('button', { name: 'Salvar senha e entrar', exact: true }).click();
    await p.getByRole('checkbox', { name: 'Guardei a chave em local seguro', exact: true }).check({ timeout: 20000 });
    await p.getByRole('button', { name: 'Entrar no app', exact: true }).click();
    await p.locator('main').waitFor({ timeout: 30000 });
    assert.equal(enviados.length, 0);
    ok('Voltar no fluxo Google: volta ao início e nada é enviado depois');
    await c.close();
  }

  // 4) Criar acesso novo sem Google: nenhum envio e o Voltar continua
  {
    const { c, p, enviados } = await abrir(b);
    await p.getByRole('button', { name: 'Criar acesso novo', exact: true }).click();
    assert.equal(await p.getByRole('button', { name: 'Voltar' }).count(), 1);
    await p.getByLabel('Apelido', { exact: true }).fill('Pessoa fictícia');
    await p.getByLabel('Senha ou PIN', { exact: true }).fill('1234');
    await p.getByLabel('Repita a senha ou PIN', { exact: true }).fill('1234');
    await p.getByRole('button', { name: 'Salvar senha e entrar', exact: true }).click();
    await p.getByRole('checkbox', { name: 'Guardei a chave em local seguro', exact: true }).check({ timeout: 20000 });
    await p.getByRole('button', { name: 'Entrar no app', exact: true }).click();
    await p.locator('main').waitFor({ timeout: 30000 });
    assert.equal(enviados.length, 0);
    ok('cadastro comum: nenhum backup enviado sozinho');
    await c.close();
  }
  await b.close();
})().catch((e) => { console.error('FALHA', e); process.exit(1); });
