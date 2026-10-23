// Ponto de entrada do PWA: banco local -> tela de acesso -> app.
import '../sqlinit.js';
import { prepararPersistencia } from './persistencia.js';

await prepararPersistencia();

// Service worker já na tela de acesso: o app passa a funcionar offline desde o primeiro acesso.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  import('./atualizacao.js').then((m) => m.registrarServiceWorker());
}
await import('./boot-pwa.js');
const { carregarAcesso } = await import('../../src/services/acesso.js');
await carregarAcesso();
const { mostrarAcesso } = await import('./gate.js');
await mostrarAcesso();

await import('../../src/main.js');
const [{ iniciarArmazenamento }, { iniciarLembrete }, { iniciarBacen }, { iniciarAutoBloqueio }] = await Promise.all([
  import('../../src/services/armazenamento.js'),
  import('../../src/services/backup.js'),
  import('../../src/services/bacen.js'),
  import('../../src/services/acesso.js'),
]);
iniciarAutoBloqueio();
iniciarArmazenamento();
iniciarLembrete();
iniciarBacen();

// Alertas locais (vencimentos, orçamento, backup): alimentam o sino e, se permitido, as notificações do sistema.
import('../../src/services/notificacoes.js').then((m) => m.carregarAvisos()).catch(() => { /* ainda sem dados */ });
// Toque numa notificação com o app aberto: o service worker pede para abrir a rota do aviso.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.tipo === 'sf:abrir-rota' && e.data.rota) location.hash = '#' + e.data.rota;
  });
}

