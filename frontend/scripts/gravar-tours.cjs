// Grava a animação de cada tour (Versão 1.0): abre a página na demonstração, e para cada passo destaca a parte da tela
// (anel + escurecimento em volta) e mostra o gesto (arrastar, abrir o bloco, tocar). Junta os quadros num WebP animado
// (public-pwa/tours/<chave>.webp, em loop) e grava os tempos de cada passo em public-pwa/tours/tempos.json, para o
// tour destacar o passo certo enquanto a animação corre.
// Uso: npx vite build -c vite.demo.config.js && NODE_PATH=$(npm root -g) node scripts/gravar-tours.cjs [chave...]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEMO = 'file://' + path.resolve(__dirname, '../dist-demo/index.html');
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
  revisar: { rota: '/transacoes?revisar=1', passos: [{ sel: '.topo-valor' }, { sel: '.linha-tx', rolar: true }, { sel: '.linha-tx', gesto: 'tocar', rolar: true }] },
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
  relatorios: { rota: '/relatorios', passos: [{ sel: '[data-alterna], .alterna' }, { sel: '[data-relacao]', gesto: 'tocar' }, { sel: '[data-resumo]', rolar: true }] },
  regras: { rota: '/regras', passos: [{ sel: '.pagina > section.card-padrao:nth-of-type(1)' }, { sel: '.pagina > section.card-padrao:nth-of-type(1) .regra-item, .pagina > section.card-padrao:nth-of-type(2)', gesto: 'arrastar-esq', rolar: true }, { sel: '.pagina > section.card-padrao:nth-of-type(3)', rolar: true }] },
  'custos-fixos': { rota: '/custos-fixos', passos: [{ sel: '.topo-valor' }, { sel: '[data-essenciais], .lista-fixos', rolar: true }, { sel: '[data-sugestoes], .quanto-guardar', rolar: true }] },
  backup: { rota: '/mais/dados-backup', passos: [{ sel: '[data-backup]' }, { sel: '[data-origem-backup], [data-prov]', rolar: true }, { sel: '.chave-recuperacao, [data-chave]', rolar: true }] },
  'o-que-mudou': { rota: '/', passos: [
    { sel: 'nav.barra' },
    { rota: '/patrimonio', sel: '.topo-valor' },
    { rota: '/compromissos', sel: '[data-bloco-credito]' },
    { rota: '/manual', sel: '[data-rever-tour]' },
  ] },
};

const CSS = `
#tour-anel { position: fixed; z-index: 99999; pointer-events: none; border-radius: 16px; border: 3px solid #8E9CF5;
  box-shadow: 0 0 0 9999px rgba(5, 6, 12, .58), 0 0 24px 4px rgba(142, 156, 245, .55); transition: none; }
#tour-dedo { position: fixed; z-index: 100000; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; pointer-events: none;
  background: rgba(255, 255, 255, .88); box-shadow: 0 0 0 6px rgba(255, 255, 255, .25), 0 6px 16px rgba(0, 0, 0, .45); }
.faixa-demo { display: none !important; }
`;

async function quadro(p, dir, n) { const f = path.join(dir, String(n).padStart(4, '0') + '.png'); await p.screenshot({ path: f }); return n + 1; }

(async () => {
  const pedidos = process.argv.slice(2);
  const chaves = pedidos.length ? pedidos : Object.keys(ROTEIRO);
  fs.mkdirSync(SAIDA, { recursive: true });
  const tempos = fs.existsSync(path.join(SAIDA, 'tempos.json')) ? JSON.parse(fs.readFileSync(path.join(SAIDA, 'tempos.json'), 'utf8')) : {};
  const b = await chromium.launch();
  for (const chave of chaves) {
    const r = ROTEIRO[chave];
    const ctx = await b.newContext({ viewport: { width: L, height: A }, colorScheme: 'dark', deviceScaleFactor: 1 });
    // tours já vistos: não abrem por cima durante a gravação
    await ctx.addInitScript(() => { try { localStorage.setItem('sf:tours', JSON.stringify({ vistos: ['geral', 'inicio', 'patrimonio', 'transacoes', 'transacoes-cat', 'revisar', 'compromissos', 'contas', 'objetivos', 'cartoes', 'dividas', 'importar', 'relatorios', 'regras', 'custos-fixos', 'backup', 'o-que-mudou'], ligado: true })); } catch (e) { /* */ } });
    const p = await ctx.newPage();
    await p.goto(DEMO); await p.waitForTimeout(2500);
    await p.addStyleTag({ content: CSS });
    const dir = path.join(TMP, chave);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    let n = 0; const inicios = [];
    let rotaAtual = null;
    for (const passo of r.passos) {
      const rota = passo.rota || r.rota;
      if (rota !== rotaAtual) {
        await p.evaluate((x) => window.__router.push(x), rota); await p.waitForTimeout(1800);
        await p.addStyleTag({ content: CSS }).catch(() => {});
        rotaAtual = rota;
      }
      inicios.push(n / FPS);
      const caixa = await p.evaluate(({ sel, rolar }) => {
        const el = sel.split(',').map((s) => document.querySelector(s.trim())).find(Boolean);
        if (!el) return null;
        if (rolar) el.scrollIntoView({ block: 'center' }); else el.scrollIntoView({ block: 'nearest' });
        return true;
      }, { sel: passo.sel, rolar: !!passo.rolar });
      await p.waitForTimeout(500);
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
    }
    const total = n / FPS;
    await ctx.close();
    const destino = path.join(SAIDA, chave + '.webp');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%04d.png'), '-vf', 'scale=300:-1:flags=lanczos', '-c:v', 'libwebp_anim', '-loop', '0', '-q:v', '62', '-compression_level', '6', destino]);
    tempos[chave] = { passos: inicios.map((t) => Math.round(t * 100) / 100), total: Math.round(total * 100) / 100 };
    console.log(chave, '→', (fs.statSync(destino).size / 1024).toFixed(0) + ' KB', tempos[chave]);
  }
  fs.writeFileSync(path.join(SAIDA, 'tempos.json'), JSON.stringify(tempos, null, 1) + '\n');
  await b.close();
})();
