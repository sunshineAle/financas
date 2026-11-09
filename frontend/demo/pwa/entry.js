// Ponto de entrada do PWA: banco local -> tela de acesso -> app.
import '../sqlinit.js';
import { prepararPersistencia } from './persistencia.js';
import { tratarRetornoOAuth } from '../../src/services/nuvem/retorno.js';

// Janela de login da Microsoft voltando para o app: repassa o código à janela principal e para por aqui.
if (tratarRetornoOAuth()) await new Promise(() => {});

// Guarda a ação da notificação mesmo se o app ainda estiver bloqueado na tela de acesso.
let appAberto = false;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.tipo !== 'sf:abrir-rota' || typeof e.data.rota !== 'string' || !e.data.rota.startsWith('/')) return;
    if (appAberto) location.hash = '#' + e.data.rota;
    else { try { sessionStorage.setItem('sf:abrir-rota', e.data.rota); } catch { /* sem sessão */ } }
  });
}


await prepararPersistencia();
// Desfoque ao sair do app (anotação 46): vale desde a tela de acesso.
import('../../src/services/desfoque.js').then((m) => m.iniciarDesfoque()).catch(() => {});

// Service worker já na tela de acesso: o app passa a funcionar offline desde o primeiro acesso.
if (import.meta.env.PROD && !import.meta.env.VITE_PREVIA && 'serviceWorker' in navigator) {
  import('./atualizacao.js').then((m) => m.registrarServiceWorker());
}
await import('./boot-pwa.js');
const acesso = await import('../../src/services/acesso.js');
await acesso.carregarAcesso();
let demoAberta = false;
if (import.meta.env.VITE_PREVIA && globalThis.__SF_MODO_DEMO) {
  if (!acesso.configurada()) {
    const { carregarExemplo } = await import('./boot-pwa.js');
    await carregarExemplo();
    await acesso.criarSenha('demonstracao', 'Demonstração');
    await acesso.gerarNovoCodigo(); await acesso.confirmarCodigoGuardado();
    const { perfil } = await import('../../src/services/perfil.js');
    perfil.nome = 'Demonstração';
    const contas = await (await fetch('/api/contas')).json();
    const postar = async (url, corpo) => {
      const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      if (!resp.ok) throw new Error((await resp.json()).erro || 'Não foi possível preparar os dados fictícios.');
    };
    await postar('/api/regras', { tipo: 'transferencia', padrao: 'ANA SILVA' });
    if (contas.length >= 2) {
      const data = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
      for (const [c, tipo] of [[contas[0], 'saida'], [contas[1], 'entrada']]) {
        await postar('/api/transacoes', { contaId: c.id, descricao: 'PIX ANA SILVA · teste de transferência', tipo, valor: 73.42, data });
      }
    }
  }
  demoAberta = await acesso.verificarSenha('demonstracao');
}
if (!demoAberta) {
  const { mostrarAcesso } = await import('./gate.js');
  await mostrarAcesso();
}
// Todo acesso começa pela página Início, seja qual for a última rota (o router lê o hash ao iniciar).
// Exceção: "Ver detalhes" do aviso de versão, tocado na tela de entrada, abre Sobre o app.
let rotaInicial = location.hash === '#/?confirmarBackup=1' ? location.hash : '#/';
try { const r = sessionStorage.getItem('sf:abrir-rota'); if (r) { rotaInicial = '#' + r; sessionStorage.removeItem('sf:abrir-rota'); } } catch { /* ignora */ }
location.hash = rotaInicial;

await import('../../src/main.js');
appAberto = true;
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
