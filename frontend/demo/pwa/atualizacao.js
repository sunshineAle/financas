// Registro do service worker + aviso "Nova versão disponível — atualizar" (skipWaiting controlado).
// Fora de views: o aviso é um modal central simples, com as cores por tokens do app.
import { aviso } from '../../src/services/atualizacao.js';
// Modal central pequeno. "Agora não" fecha, mas o convite volta sempre que a tela de acesso reaparece (reavisar), até atualizar.
const FUNDO = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.55)';
const CAIXA = 'width:100%;max-width:320px;display:flex;flex-direction:column;gap:8px;padding:20px 18px 16px;border-radius:16px;background:var(--cor-fundo-elevado,#fff);color:var(--cor-texto,#1a1a1a);border:1px solid var(--cor-borda,#ddd);box-shadow:0 16px 48px rgba(0,0,0,.35);font:400 14px/1.45 var(--fonte-texto,system-ui,sans-serif);text-align:center';
const BOTAO = 'min-height:44px;padding:0 16px;border:none;border-radius:10px;background:var(--cor-primaria,#3446c4);color:#fff;font:600 15px var(--fonte-texto,system-ui,sans-serif);cursor:pointer';
const BOTAO_SEC = 'min-height:40px;padding:0 16px;border:none;border-radius:10px;background:transparent;color:var(--cor-texto-suave,#666);font:500 14px var(--fonte-texto,system-ui,sans-serif);cursor:pointer';

function mostrarAviso(worker) {
  if (document.getElementById('sf-aviso-versao')) return;
  const fundo = document.createElement('div');
  fundo.id = 'sf-aviso-versao';
  fundo.style.cssText = FUNDO;
  const caixa = document.createElement('div');
  caixa.setAttribute('role', 'dialog');
  caixa.setAttribute('aria-modal', 'true');
  caixa.style.cssText = CAIXA;
  const titulo = document.createElement('strong');
  titulo.textContent = 'Nova versão disponível';
  titulo.style.cssText = 'font:700 17px var(--fonte-display,system-ui,sans-serif)';
  const texto = document.createElement('span');
  texto.textContent = 'Atualize para ter as melhorias mais recentes. Seus dados continuam no aparelho.';
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.textContent = 'Atualizar agora';
  botao.style.cssText = BOTAO + ';margin-top:6px';
  botao.addEventListener('click', () => { botao.disabled = true; botao.textContent = 'Atualizando…'; worker.postMessage({ tipo: 'sf:pular-espera' }); });
  const depois = document.createElement('button');
  depois.type = 'button';
  depois.textContent = 'Agora não';
  depois.style.cssText = BOTAO_SEC;
  depois.addEventListener('click', () => fundo.remove());
  caixa.append(titulo, texto, botao, depois);
  fundo.appendChild(caixa);
  document.body.appendChild(fundo);
}
aviso.mostrar = mostrarAviso;
const guardar = (w) => { aviso.worker = w; mostrarAviso(w); };

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let recarregando = false;
  const tinhaControle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControle || recarregando) return; // primeira instalação não recarrega
    recarregando = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) guardar(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const novo = reg.installing;
      if (!novo) return;
      novo.addEventListener('statechange', () => {
        if (novo.state === 'installed' && navigator.serviceWorker.controller) guardar(novo);
      });
    });
    // Procura versão nova ao abrir e ao voltar para o app.
    const procurar = () => { reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') procurar(); });
    setInterval(procurar, 60 * 60 * 1000);
  }).catch(() => { /* sem service worker: segue online */ });
}
