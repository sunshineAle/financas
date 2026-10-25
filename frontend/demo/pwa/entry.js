// Ponto de entrada do PWA: banco local -> tela de acesso -> app.
import '../sqlinit.js';
import { prepararPersistencia } from './persistencia.js';
import { tratarRetornoOAuth } from '../../src/services/nuvem/retorno.js';

// Janela de login da Microsoft voltando para o app: repassa o código à janela principal e para por aqui.
if (tratarRetornoOAuth()) await new Promise(() => {});

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
// Todo acesso começa pela página Início, seja qual for a última rota (o router lê o hash ao iniciar).
// Exceção: "Ver detalhes" do aviso de versão, tocado na tela de entrada, abre Sobre o app.
let rotaInicial = '#/';
try { const r = sessionStorage.getItem('sf:abrir-rota'); if (r) { rotaInicial = '#' + r; sessionStorage.removeItem('sf:abrir-rota'); } } catch { /* ignora */ }
location.hash = rotaInicial;

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
import('../../src/services/feedback.js').then((m) => m.iniciarFilaFeedback()).catch(() => {});

// Alertas locais (vencimentos, orçamento, backup): alimentam o sino e, se permitido, as notificações do sistema.
import('../../src/services/notificacoes.js').then((m) => m.carregarAvisos()).catch(() => { /* ainda sem dados */ });
// Toque numa notificação com o app aberto: o service worker pede para abrir a rota do aviso.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.tipo === 'sf:abrir-rota' && e.data.rota) location.hash = '#' + e.data.rota;
  });
}

