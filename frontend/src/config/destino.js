// "Destino de instalação" do frontend. O mesmo código das telas serve para todos; o que muda
// de um destino para outro (endereço da API, recursos disponíveis, modo de navegação) fica SÓ aqui.
//
// Como o destino é escolhido:
//   - em tempo de build:   vite build --mode servidor | pc | android   (arquivos .env.<modo>)
//   - na demonstração:     build:demo (tudo no navegador, sem servidor)
//   - sem recompilar:      public/config.js pode definir window.__SF_CONFIG__ = { apiBase: 'https://...' }
//
// Para criar um destino novo, acrescente uma entrada em DESTINOS e um .env.<nome>.
const DESTINOS = {
  servidor: {
    nome: 'servidor',
    rotulo: 'Servidor (ZimaOS)',
    apiBase: '', // mesma origem: o backend entrega as telas e a API
    recursos: { openFinance: true, multiusuario: true, backupNuvem: true, sincronizacao: false },
  },
  pc: {
    nome: 'pc',
    rotulo: 'Instalado no PC',
    apiBase: '', // o backend local entrega as telas em http://localhost:4000
    recursos: { openFinance: true, multiusuario: false, backupNuvem: true, sincronizacao: false },
  },
  android: {
    nome: 'android',
    rotulo: 'Android',
    apiBase: 'http://127.0.0.1:4000', // backend embutido no app; o app carrega as telas de arquivo
    recursos: { openFinance: true, multiusuario: false, backupNuvem: true, sincronizacao: false },
  },
  // PWA local: banco no aparelho (IndexedDB), offline, instalável, senha de acesso e backup .sfin. Sem Open Finance por enquanto.
  pwa: {
    nome: 'pwa',
    rotulo: 'App local (PWA)',
    apiBase: '',
    recursos: { openFinance: false, multiusuario: false, backupNuvem: true, sincronizacao: false },
  },
  demo: {
    nome: 'demo',
    rotulo: 'Demonstração',
    apiBase: '',
    recursos: { openFinance: false, multiusuario: false, backupNuvem: false, sincronizacao: false },
  },
};

const escolhido = import.meta.env.VITE_PWA ? 'pwa' : import.meta.env.VITE_DEMO ? 'demo' : (import.meta.env.VITE_DESTINO || 'servidor');
const base = DESTINOS[escolhido] || DESTINOS.servidor;
const extra = (typeof window !== 'undefined' && window.__SF_CONFIG__) || {};

export const destino = {
  ...base,
  ...(extra.apiBase !== undefined ? { apiBase: String(extra.apiBase).replace(/\/$/, '') } : {}),
  recursos: { ...base.recursos, ...(extra.recursos || {}) },
};

export const temRecurso = (nome) => !!destino.recursos[nome];
