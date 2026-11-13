// Service worker do Dagda Capital (PWA): guarda o app para funcionar offline.
// A lista de arquivos e a versão (hash do conteúdo do build) são preenchidas no build (vite.pwa.config.js).
// Caminhos relativos ao sw.js: funcionam na raiz e em subcaminhos (ex.: /financas/).
const VERSAO = 'c0baad73e6';
const ARQUIVOS = ["./","./index.html","./manifest.webmanifest","./assets/icone-CaGpKugs.svg","./assets/icone-fundo-DhnfmhqG.svg","./assets/icone-fundo-RAqefblp.svg","./assets/icone-COxbkEuE.svg","./assets/icone-fundo-ByPrcen9.svg","./assets/icone-LzPLBE44.svg","./assets/icone-fundo-CKewohm3.svg","./assets/icone-BSJeuUX-.svg","./assets/icone-fundo-DF7iJT4U.svg","./assets/icone-fundo-CdqAZkpK.svg","./assets/icone-Bx13Hb_w.svg","./assets/logo-C2q0lYt4.svg","./assets/logo-nZjLMEzg.svg","./assets/icone-fundo-3oVuSJI9.svg","./assets/icone-D7KoPird.svg","./assets/logo-CWIrTzDU.svg","./assets/icone-fundo-DxYtipJT.svg","./assets/icone-DVvzzDI4.svg","./assets/icone-DZ-8bvuj.svg","./assets/gate-Cc92Ru_n.css","./assets/main-BR5JAKHy.css","./assets/tokens-Br80UFu9.css","./assets/Revisar-BSaL1_Er.css","./assets/Patrimonio-C4GZko55.css","./assets/Compromissos-BTn34lM6.css","./assets/index-C-v2z5OA.js","./assets/desfoque-CLSuyJE4.js","./assets/atualizacao-BYWS4KdV.js","./assets/boot-pwa-hsvnA7bu.js","./assets/_commonjsHelpers-IkB594pC.js","./assets/gate-CUUDhfR6.js","./assets/atualizacao-Dm373JX_.js","./assets/main-gZT3T5cZ.js","./assets/novidades-BuJtkx_g.js","./assets/tokens-2QLCrEZ5.js","./assets/armazenamento-di55WAE1.js","./assets/backup-DTpxHOZc.js","./assets/acesso-igrEpXu9.js","./assets/avisos-BEbVrKFB.js","./assets/bacen-dPvGXVZN.js","./assets/feedback-Cz_9xhxD.js","./assets/idb-qiV6c4F-.js","./assets/notificacoes-DJXnvbVG.js","./assets/preload-helper-B1tnf050.js","./assets/runtime-core.esm-bundler-CQ-vrNWi.js","./assets/reactivity.esm-bundler-CMoWRJod.js","./assets/backupRapido-BF7dtIX4.js","./assets/protecaoBackups-0nYWQPH8.js","./assets/Revisar-GTvXeSqR.js","./assets/Patrimonio-CC9a_wKr.js","./assets/Compromissos-B2lmt-Fl.js","./assets/xlsx-DaTX-4ds.js","./assets/pdf-CEBtTkzr.js","./assets/pdf.worker-D6E8MGF_.js","./assets/exportacao-DPi2SLw8.js","./assets/db-D3B-kKXn.js","./assets/esquema-Bg2nDc4v.js","./assets/validarBackup-Dc5RnRzy.js","./icons/apple-touch-icon.png","./icons/favicon-48.png","./icons/icon-192.png","./icons/icon-512-maskable.png","./icons/icon-512.png","./icons/logo-dagda.svg","./tours/backup.webp","./tours/cartoes.webp","./tours/compromissos.webp","./tours/contas.webp","./tours/custos-fixos.webp","./tours/dividas.webp","./tours/geral.webp","./tours/importar-conferir.webp","./tours/importar.webp","./tours/inicio.webp","./tours/o-que-mudou.webp","./tours/objetivos.webp","./tours/patrimonio.webp","./tours/regras.webp","./tours/relatorios.webp","./tours/revisar.webp","./tours/tempos.json","./tours/transacoes-cat.webp","./tours/transacoes.webp"];
const CACHE = 'sf-app-' + VERSAO;
const CACHE_EXTERNO = 'sf-externo';

self.addEventListener('install', (e) => {
  // Sem skipWaiting automático: a versão nova espera até a pessoa tocar em "Atualizar" (mensagem 'sf:pular-espera').
  // Na primeira instalação não há versão anterior, então ela assume sozinha.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((a) => new Request(a, { cache: 'reload' })))));
});
self.addEventListener('message', (e) => {
  if (e.data && e.data.tipo === 'sf:pular-espera') self.skipWaiting();
  if (e.data && e.data.tipo === 'sf:versao' && e.source) e.source.postMessage({ tipo: 'sf:versao', versao: VERSAO });
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('sf-app-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // API do Bacen: sempre rede (o app cuida do cache dela em IndexedDB).
  if (url.hostname === 'api.bcb.gov.br') return;
  // Fontes do Google: cache primeiro com atualização em segundo plano.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE_EXTERNO).then(async (c) => {
      const guardado = await c.match(req);
      const rede = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => guardado);
      return guardado || rede;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Versão e novidades: rede primeiro (o aviso de versão mostra o resumo da versão NOVA); offline, o que estiver guardado.
  if (/\/(version|changelog)\.json$/.test(url.pathname)) {
    e.respondWith(fetch(req).then((r) => { if (r && r.ok) { const c2 = r.clone(); caches.open(CACHE).then((c) => c.put(req, c2)); } return r; }).catch(() => caches.match(req)));
    return;
  }
  // Tours são imagens demonstrativas locais; a versão na query não muda o arquivo precacheado.
  if (url.pathname.startsWith(new URL('tours/', self.registration.scope).pathname)) {
    e.respondWith(caches.open(CACHE).then(async c => (await c.match(req, { ignoreSearch: true })) || fetch(req)));
    return;
  }
  // Navegação: devolve a página do app (funciona offline).
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then((resp) => {
    if (resp && resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
    return resp;
  })));
});

// Toque numa notificação local (vencimentos, orçamento, backup): foca o app e abre a tela do aviso.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const rota = (e.notification.data && e.notification.data.rota) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
    for (const j of janelas.filter(j => j.url.startsWith(self.registration.scope))) {
      if ('focus' in j) { j.postMessage({ tipo: 'sf:abrir-rota', rota }); return j.focus(); }
    }
    return self.clients.openWindow('./#' + rota);
  }));
});
