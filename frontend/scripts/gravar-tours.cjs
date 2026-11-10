// Grava a animação de cada tour (Versão 1.0): abre a página na demonstração, e para cada passo destaca a parte da tela
// (anel + escurecimento em volta) e mostra o gesto (arrastar, abrir o bloco, tocar). Junta os quadros num WebP animado
// (public-pwa/tours/<chave>.webp, em loop) e grava os tempos de cada passo em public-pwa/tours/tempos.json, para o
// tour destacar o passo certo enquanto a animação corre.
// Uso: npx vite build -c vite.demo.config.js && NODE_PATH=$(npm root -g) node scripts/gravar-tours.cjs [chave...]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEMO = process.env.DAGDA_TOUR_URL || 'file://' + path.resolve(__dirname, '../dist-demo/index.html');
if (process.env.DAGDA_TOUR_URL) {
  const url = new URL(DEMO);
  if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.searchParams.get('modo') !== 'demo') throw Error('Gravação exige prévia local com ?modo=demo; não usar ambiente de produção.');
}
const SAIDA = path.resolve(__dirname, '../public-pwa/tours');
const TMP = '/tmp/gravar-tours';
const FPS = 8;
const L = 390; const A = 760; // tela gravada (celular)

// passo: { sel: seletor a destacar (o primeiro que existir), gesto?: 'arrastar-esq'|'tocar'|'segurar'|'rolar', antes?: js }
const ROTEIRO = {
  geral: { rota: '/', passos: [
    { sel: 'nav.barra' },
    { sel: 'nav.barra .item.centro', gesto: 'tocar' },
    { sel: '[data-foto-perfil]' },
  ] },
  inicio: { rota: '/', passos: [
    { sel: '.palco-textos' },
    { sel: '.mes-fileira', rolar: true },
    { sel: '[data-seus-saldos]', rolar: true },
  ] },
  patrimonio: { rota: '/patrimonio', passos: [
    { sel: '.topo-valor' },
    { sel: '.abas, [role=tablist]' },
    { sel: '[data-bloco-metas] .cab-bloco', gesto: 'tocar', rolar: true },
  ] },
  transacoes: { rota: '/transacoes', passos: [
    { sel: '[data-bloco-ultimas] .linha-tx', gesto: 'arrastar-esq', rolar: true },
    { sel: '[data-bloco-grafico]', rolar: true },
    { sel: '[data-bloco-ultimas] .ver-todas, [data-bloco-ultimas] [data-lupa]', rolar: true, gesto: 'tocar' },
  ] },
  'transacoes-cat': { rota: '/transacoes?cat=s-0', passos: [
    { sel: '.chips, .chips-cat, [data-detalhe-categoria] .chips' },
    { sel: '[data-detalhe-categoria]', rolar: true },
    { sel: '.chips-sub, [data-detalhe-categoria] .chip', rolar: true },
  ] },
  revisar: { rota: '/revisar', preparar: prepararExemplos, passos: [
    { sel: '[data-revisar-transferencias] .item-transferencia:first-of-type', rolar: true },
    { sel: '[data-revisar-categorias] .item[data-tour-mercado]', rolar: true, antes: marcarExemplos },
    { sel: '[data-revisar-categorias] .item[data-tour-parcela]', rolar: true, antes: marcarExemplos },
    { sel: '[data-reservas-auto] .item:first-child', rolar: true },
  ] },
  compromissos: { rota: '/compromissos', passos: [
    { sel: '.topo-valor' },
    { sel: '[data-bloco-credito]', rolar: true },
    { sel: '[data-bloco-futuros], [data-bloco-dividas]', rolar: true },
  ] },
  contas: { rota: '/contas', passos: [
    { sel: '.carrossel, .carrossel-trilho, [data-carrossel]' },
    { sel: '.topo-valor', rolar: true },
    { sel: '.area-extrato .linha-tx', gesto: 'arrastar-esq', rolar: true },
  ] },
  objetivos: { rota: '/objetivos', passos: [
    { sel: '.orbe, .palco-orbe, [data-objetivos]' },
    { sel: '.bloco-saldo-obj, .acao', rolar: true },
    { sel: '[data-meta], .card-meta, .metas', rolar: true },
  ] },
  cartoes: { rota: '/cartoes', passos: [
    { sel: '.carrossel, [data-carrossel]' },
    { sel: '.c-fatura', rolar: true },
    { sel: '.lista-transacoes .linha-tx, .linha-tx', rolar: true },
  ] },
  dividas: { rota: '/dividas', passos: [{ sel: '.topo-valor' }, { sel: '.card-divida, .divida, .lista-dividas', rolar: true }, { sel: '.topo-valor .acao', gesto: 'tocar' }] },
  importar: { rota: '/importar', passos: [{ sel: '.escolha' }, { sel: '.escolha', gesto: 'tocar' }, { sel: '.historico, .lista-historico, .pagina .card-padrao:last-of-type', rolar: true }] },
  'importar-conferir': { rota: '/importar', preparar: async (p) => {
    require('fs').writeFileSync('/tmp/tour-imp.csv', 'Data;Descrição;Valor\n03/11/2026;PADARIA DO ZE;-23,50\n04/11/2026;PIX RECEBIDO FULANO;150,00\n05/11/2026;MERCADO ABC;-88,90\n06/11/2026;FARMACIA CENTRAL;-41,20\n');
    await p.click('.escolha >> nth=0'); await p.waitForTimeout(600);
    await p.selectOption('select', { index: 1 }); await p.waitForTimeout(300);
    await (await p.$('input[type=file]')).setInputFiles('/tmp/tour-imp.csv'); await p.waitForTimeout(600);
    await p.click('button:has-text("Ver pré-visualização")'); await p.waitForTimeout(2200);
  }, passos: [
    { sel: '[data-importando-para]' },
    { sel: '[data-resumo-importacao]' },
    { sel: '[data-lancamentos-importacao] .linha .icone', gesto: 'tocar', rolar: true },
  ] },
  relatorios: { rota: '/relatorios', passos: [{ sel: '[data-alterna], .alterna' }, { sel: '[data-relacao]', gesto: 'tocar' }, { sel: '[data-resumo]', rolar: true }] },
  regras: { rota: '/regras', preparar: prepararExemplos, passos: [
    { sel: '[data-bloco-regras="saida"]', rolar: true },
    { sel: '[role="dialog"]', antes: async p => { await p.locator('[data-bloco-regras="saida"] .mais-regra').click(); await p.getByPlaceholder('Ex: Padaria do José').fill('Padaria do Bairro'); await p.locator('[data-categoria-escolhida]').click(); await p.getByRole('radio', {name:'Alimentação',exact:true}).click(); }, depois: fecharModal },
    { sel: '[role="dialog"]', antes: async p => { await p.locator('[data-bloco-regras="saida"]').getByRole('button', { name: /Ver todas as regras/ }).click(); }, depois: fecharModal },
    { sel: '[data-bloco-regras="saida"] .regra-item:first-child', gesto: 'arrastar-esq', rolar: true },
  ] },
  'custos-fixos': { rota: '/custos-fixos', passos: [{ sel: '.topo-valor' }, { sel: '[data-essenciais], .lista-fixos', rolar: true }, { sel: '[data-sugestoes], .quanto-guardar', rolar: true }] },
  backup: { rota: '/mais/dados-backup', passos: [{ sel: '[data-backup]' }, { sel: '[data-origem-backup], [data-prov]', rolar: true }, { sel: '.chave-recuperacao, [data-chave]', rolar: true }] },
  'o-que-mudou': { rota: '/', passos: [
    { sel: 'nav.barra' },
    { rota: '/patrimonio', sel: '.topo-valor' },
    { rota: '/compromissos', sel: '[data-bloco-credito]' },
    { rota: '/manual', sel: '[data-rever-tour]' },
  ] },
};

// As rotas e os componentes são reais. Os exemplos existem somente neste contexto descartável.
async function prepararExemplos(p) {
  await p.evaluate(async () => {
    const api = async (metodo, url, corpo) => {
      const r = await fetch(url, { method: metodo, headers: {'Content-Type':'application/json'}, body: corpo ? JSON.stringify(corpo) : undefined });
      const j = await r.json(); if (!r.ok) throw Error(JSON.stringify(j)); return j;
    };
    const contas = await api('GET','/api/contas');
    const cats = await api('GET','/api/categorias');
    const reserva = await api('GET','/api/reserva');
    const categoria = cats.find(c => /Alimenta/.test(c.nome)) || cats[0];
    for (const padrao of ['Padaria do Bairro','Mercado da Esquina','Restaurante','Lanchonete']) await api('POST','/api/regras',{tipo:'saida',padrao,categoriaId:categoria.id});
    await api('POST','/api/regras',{tipo:'entrada',padrao:'Salário',categoriaReceita:'Salário'});
    const regras = await api('GET','/api/regras');
    if (!(regras.regras || regras).some(r => r.tipo === 'transferencia' && r.padrao === 'ANA SILVA')) await api('POST','/api/regras',{tipo:'transferencia',padrao:'ANA SILVA'});
    if (reserva.metas?.length) await api('POST','/api/regras',{tipo:'reserva',padrao:'Caixinha de viagem',destino:'guardar',metaId:reserva.metas[0].id});
    const data = new Date().toISOString().slice(0,10);
    for (const [tipo,descricao,valor] of [['saida','Mercado do Bairro',85],['saida','Pagamento de empréstimo',250],['saida','Aplicação Caixinha',100],['entrada','Resgate Caixinha',110]]) await api('POST','/api/transacoes',{contaId:contas[0].id,tipo,descricao,valor,data});
    // O par PIX precisa de contas distintas; a prévia já tem um par, a demo antiga não.
    const pendentes = await api('GET','/api/transacoes/transferencias-pendentes');
    if (!pendentes.itens.length) for (const [i,tipo] of [[0,'saida'],[1,'entrada']]) await api('POST','/api/transacoes',{contaId:contas[i].id,tipo,descricao:'PIX ANA SILVA',valor:73.42,data});
  });
  // Força remount dos blocos após semear: não grava no banco de nenhum usuário.
  await navegar(p, '/'); await navegar(p, '/revisar');
}
async function marcarExemplos(p) {
  await p.evaluate(() => {
    for (const el of document.querySelectorAll('[data-revisar-categorias] .item')) {
      if (el.textContent.includes('Mercado do Bairro')) el.setAttribute('data-tour-mercado','');
      if (el.textContent.includes('Pagamento de empréstimo')) el.setAttribute('data-tour-parcela','');
    }
  });
}
async function fecharModal(p) { await p.getByRole('dialog').getByRole('button', {name:'Fechar',exact:true}).click(); await p.waitForTimeout(700); }
async function navegar(p, rota) {
  await p.evaluate(x => { if (window.__router) return window.__router.push(x); location.hash = '#' + x; }, rota);
  await p.waitForTimeout(1200);
}

const CSS = `
#tour-anel { position: fixed; z-index: 99999; pointer-events: none; border-radius: 16px; border: 3px solid #8E9CF5;
  box-shadow: 0 0 0 9999px rgba(5, 6, 12, .58), 0 0 24px 4px rgba(142, 156, 245, .55); transition: none; }
#tour-dedo { position: fixed; z-index: 100000; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; pointer-events: none;
  background: rgba(255, 255, 255, .88); box-shadow: 0 0 0 6px rgba(255, 255, 255, .25), 0 6px 16px rgba(0, 0, 0, .45); }
.faixa-demo, #faixa-previa { display: none !important; }
`;

async function quadro(p, dir, n) { const f = path.join(dir, String(n).padStart(4, '0') + '.png'); await p.screenshot({ path: f }); return n + 1; }

(async () => {
  const pedidos = process.argv.slice(2);
  const chaves = pedidos.length ? pedidos : Object.keys(ROTEIRO);
  fs.mkdirSync(SAIDA, { recursive: true });
  const tempos = fs.existsSync(path.join(SAIDA, 'tempos.json')) ? JSON.parse(fs.readFileSync(path.join(SAIDA, 'tempos.json'), 'utf8')) : {};
  const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}), args: ['--no-sandbox'] });
  for (const chave of chaves) {
    const r = ROTEIRO[chave];
    const ctx = await b.newContext({ viewport: { width: L, height: A }, colorScheme: 'dark', deviceScaleFactor: 1 });
    // tours já vistos: não abrem por cima durante a gravação
    await ctx.addInitScript(() => { try { localStorage.setItem('dagda-previa-demo-79-81:sf:tours', JSON.stringify({ vistos: ['importar-conferir', 'geral', 'inicio', 'patrimonio', 'transacoes', 'transacoes-cat', 'revisar', 'compromissos', 'contas', 'objetivos', 'cartoes', 'dividas', 'importar', 'relatorios', 'regras', 'custos-fixos', 'backup', 'o-que-mudou'], ligado: false })); } catch (e) { /* */ } });
    const p = await ctx.newPage();
    await p.goto(DEMO); await p.waitForTimeout(2500);
    await p.evaluate(() => localStorage.setItem('sf:tours', JSON.stringify({ligado:false,vistos:['geral','o-que-mudou']})));
    if (await p.locator('[data-tour-pular]').isVisible()) await p.locator('[data-tour-pular]').click();
    await p.addStyleTag({ content: CSS });
    const dir = path.join(TMP, chave);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    let n = 0; const inicios = [];
    let rotaAtual = null;
    for (const passo of r.passos) {
      const rota = passo.rota || r.rota;
      if (rota !== rotaAtual) {
        await navegar(p, rota);
        await p.addStyleTag({ content: CSS }).catch(() => {});
        if (r.preparar && rotaAtual === null) { await r.preparar(p); await navegar(p, rota); }
        rotaAtual = rota;
      }
      if (passo.antes) await passo.antes(p);
      await p.waitForTimeout(500);
      inicios.push(n / FPS);
      const caixa = await p.evaluate(({ sel, rolar }) => {
        const el = sel.split(',').map((s) => document.querySelector(s.trim())).find(Boolean);
        if (!el) return null;
        if (rolar) el.scrollIntoView({ block: 'center' }); else el.scrollIntoView({ block: 'nearest' });
        return true;
      }, { sel: passo.sel, rolar: !!passo.rolar });
      await p.waitForTimeout(500);
      if (!caixa && ['regras','revisar'].includes(chave)) throw Error(`Tour ${chave} sem exemplo visível: ${passo.sel}`);
      const box = caixa ? await p.evaluate((sel) => { const el = sel.split(',').map((s) => document.querySelector(s.trim())).find(Boolean); const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, passo.sel) : null;
      // 1) página parada
      for (let i = 0; i < 4; i++) n = await quadro(p, dir, n);
      if (box) {
        // 2) o anel aparece e "respira"
        const pad = 6;
        for (let i = 0; i < 6; i++) {
          const e = pad + Math.round(10 * (1 - i / 5));
          await p.evaluate(({ b, e }) => { let a = document.getElementById('tour-anel'); if (!a) { a = document.createElement('div'); a.id = 'tour-anel'; document.body.appendChild(a); } Object.assign(a.style, { left: (b.x - e) + 'px', top: (b.y - e) + 'px', width: (b.w + 2 * e) + 'px', height: (b.h + 2 * e) + 'px' }); }, { b: box, e });
          n = await quadro(p, dir, n);
        }
        // 3) gesto
        const cx = box.x + Math.min(box.w - 40, box.w * 0.72); const cy = box.y + Math.min(box.h / 2, 30);
        const dedo = async (x, y, s = 1) => p.evaluate(({ x, y, s }) => { let d = document.getElementById('tour-dedo'); if (!d) { d = document.createElement('div'); d.id = 'tour-dedo'; document.body.appendChild(d); } Object.assign(d.style, { left: x + 'px', top: y + 'px', transform: `scale(${s})`, display: 'block' }); }, { x, y, s });
        if (passo.gesto === 'arrastar-esq') {
          await p.mouse.move(cx, cy); await p.mouse.down();
          for (let i = 0; i <= 8; i++) { const x = cx - i * 18; await p.mouse.move(x, cy); await dedo(x, cy); n = await quadro(p, dir, n); }
          await p.mouse.up(); await p.waitForTimeout(350);
          for (let i = 0; i < 8; i++) n = await quadro(p, dir, n);
          await p.evaluate(() => { const d = document.getElementById('tour-dedo'); if (d) d.style.display = 'none'; });
          // fecha as ações de novo
          await p.mouse.click(box.x + 60, cy).catch(() => {}); await p.waitForTimeout(350);
        } else if (passo.gesto === 'tocar') {
          for (let i = 0; i < 3; i++) { await dedo(cx, cy, 1.25 - i * 0.12); n = await quadro(p, dir, n); }
          await p.evaluate(() => { const a = document.getElementById('tour-anel'); if (a) a.style.display = 'none'; });
          await p.mouse.click(cx, cy).catch(() => {}); await p.waitForTimeout(900);
          await p.evaluate(() => { const d = document.getElementById('tour-dedo'); if (d) d.style.display = 'none'; const a = document.getElementById('tour-anel'); if (a) a.style.display = ''; });
          for (let i = 0; i < 9; i++) n = await quadro(p, dir, n);
          // volta à página do passo, se o toque navegou ou abriu janela
          await p.keyboard.press('Escape').catch(() => {});
          const agora = await p.evaluate(() => window.__router.currentRoute.value.fullPath);
          if (agora !== rota) { await p.evaluate((x) => window.__router.push(x), rota); await p.waitForTimeout(1200); }
        } else {
          for (let i = 0; i < 14; i++) n = await quadro(p, dir, n);
        }
        await p.evaluate(() => { const a = document.getElementById('tour-anel'); if (a) a.remove(); });
      } else {
        for (let i = 0; i < 12; i++) n = await quadro(p, dir, n);
      }
      if (passo.depois) await passo.depois(p);
    }
    const total = n / FPS;
    await ctx.close();
    const destino = path.join(SAIDA, chave + '.webp');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%04d.png'), '-vf', 'scale=300:-1:flags=lanczos', '-c:v', 'libwebp_anim', '-loop', '0', '-q:v', '62', '-compression_level', '6', destino + '.tmp.webp']);
    fs.renameSync(destino + '.tmp.webp', destino);
    tempos[chave] = { passos: inicios.map((t) => Math.round(t * 100) / 100), total: Math.round(total * 100) / 100 };
    console.log(chave, '→', (fs.statSync(destino).size / 1024).toFixed(0) + ' KB', tempos[chave]);
  }
  fs.writeFileSync(path.join(SAIDA, 'tempos.json'), JSON.stringify(tempos, null, 1) + '\n');
  await b.close();
})();
