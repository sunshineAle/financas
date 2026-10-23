// Mini armazenamento chave-valor em IndexedDB (aceita bytes, objetos e handles de pasta).
// Usado pelo banco local do PWA, pelo backup (handle da pasta, cópia de segurança) e pelo cache do Bacen.
// Nunca lança: se o IndexedDB não existir (janela privada, bloqueio), devolve null/false.
const NOME = 'sf-pwa';
const LOJA = 'kv';
let abertura = null;

function abrir() {
  if (abertura) return abertura;
  abertura = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(NOME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(LOJA)) req.result.createObjectStore(LOJA); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return abertura;
}

function pedido(modo, fn) {
  return abrir().then((db) => new Promise((resolve) => {
    if (!db) return resolve(undefined);
    try {
      const tx = db.transaction(LOJA, modo);
      const r = fn(tx.objectStore(LOJA));
      tx.oncomplete = () => resolve(r && 'result' in r ? r.result : true);
      tx.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

export const kvGet = async (chave) => { const r = await pedido('readonly', (s) => s.get(chave)); return r === undefined || r === true ? null : r; };
export const kvSet = async (chave, valor) => (await pedido('readwrite', (s) => { s.put(valor, chave); })) === true;
export const kvDel = async (chave) => (await pedido('readwrite', (s) => { s.delete(chave); })) === true;
export async function kvChaves(prefixo = '') {
  const r = await pedido('readonly', (s) => s.getAllKeys());
  return Array.isArray(r) ? r.filter((k) => String(k).startsWith(prefixo)) : [];
}
export async function kvLimparTudo() { return (await pedido('readwrite', (s) => { s.clear(); })) === true; }
