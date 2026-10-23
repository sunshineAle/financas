// Única porta de saída para a API. Todas as telas chamam fetch('/api/...'); aqui o endereço
// é completado conforme o destino (ex.: Android fala com o backend embutido em 127.0.0.1).
// Instalado uma vez, em main.js, por cima do fetch que já existir (inclusive o da demonstração).
import { destino } from '../config/destino.js';

let instalado = false;

export function instalarHttp() {
  if (instalado) return;
  instalado = true;
  const original = window.fetch.bind(window);
  window.fetch = (entrada, opcoes) => {
    if (destino.apiBase && typeof entrada === 'string' && entrada.startsWith('/api/')) {
      return original(destino.apiBase + entrada, { credentials: 'include', ...opcoes });
    }
    return original(entrada, opcoes);
  };
}
