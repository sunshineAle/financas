// Dados da tela "Apoie o desenvolvedor". O desenvolvedor preenche a chave Pix e os links ANTES de publicar
// (ou, sem recompilar, em public/config.js: window.__SF_CONFIG__ = { apoio: { pix: { chave: '...' }, kofi: '...' } }).
// Enquanto um valor estiver vazio, a tela mostra "a preencher pelo desenvolvedor". Nada aqui é secreto.
const extra = (typeof window !== 'undefined' && window.__SF_CONFIG__ && window.__SF_CONFIG__.apoio) || {};

export const APOIO = {
  pix: { chave: '', tipo: '', nome: '', cidade: '', ...(extra.pix || {}) }, // ex.: { chave: 'email@exemplo.com', tipo: 'e-mail', nome: 'Nome do recebedor', cidade: 'Sao Paulo' }
  apoiase: extra.apoiase || '', // ex.: 'https://apoia.se/seu-projeto'
  kofi: extra.kofi || '', // ex.: 'https://ko-fi.com/seu-usuario'
  buyMeACoffee: extra.buyMeACoffee || '', // ex.: 'https://www.buymeacoffee.com/seu-usuario'
};

// Texto institucional da página Apoie (parágrafos separados por linha em branco). TROCAR aqui pelo texto completo
// da seção 13 da especificação quando o desenvolvedor o fornecer — a tela só exibe o que estiver nesta constante.
export const TEXTO_INSTITUCIONAL = `Este sistema é um projeto independente e gratuito, feito por uma pessoa só, para ajudar quem quer organizar o dinheiro sem abrir mão da privacidade. Seus dados ficam com você.

Se ele te ajuda, você pode contribuir com qualquer valor. É totalmente opcional e nada muda no app se você não apoiar. Obrigado por considerar!`;
