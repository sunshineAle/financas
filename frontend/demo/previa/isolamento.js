// A prévia compartilha a origem GitHub Pages com o app oficial: toda persistência usa outro prefixo.
window.__SF_MODO_DEMO = new URLSearchParams(location.search).get('modo') === 'demo';
const PREFIXO = window.__SF_MODO_DEMO ? 'dagda-previa-demo-79-81:' : 'dagda-previa-79-81:';
const proto = Storage.prototype;
const get = proto.getItem, set = proto.setItem, del = proto.removeItem, key = proto.key;
const chaves = s => Array.from({ length: s.length }, (_, i) => key.call(s, i)).filter(k => k?.startsWith(PREFIXO));
proto.getItem = function(k) { return get.call(this, PREFIXO + k); };
proto.setItem = function(k, v) { return set.call(this, PREFIXO + k, v); };
proto.removeItem = function(k) { return del.call(this, PREFIXO + k); };
proto.key = function(i) { const k = chaves(this)[i]; return k ? k.slice(PREFIXO.length) : null; };
proto.clear = function() { chaves(this).forEach(k => del.call(this, k)); };
const abrir = indexedDB.open.bind(indexedDB), apagar = indexedDB.deleteDatabase.bind(indexedDB);
indexedDB.open = (n, ...args) => abrir(PREFIXO + n, ...args);
indexedDB.deleteDatabase = n => apagar(PREFIXO + n);
window.__SF_REINICIAR_PREVIA = async () => {
  localStorage.clear(); sessionStorage.clear();
  // Fecha conexões deste documento recarregando antes de limpar o banco no próximo carregamento.
  set.call(sessionStorage, PREFIXO + 'reiniciar', '1'); location.reload();
};
if (get.call(sessionStorage, PREFIXO + 'reiniciar')) {
  del.call(sessionStorage, PREFIXO + 'reiniciar');
  await new Promise((resolve, reject) => { const r = apagar(PREFIXO + 'sf-pwa'); r.onsuccess = resolve; r.onerror = () => reject(r.error); });
}
