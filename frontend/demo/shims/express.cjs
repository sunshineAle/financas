// Mini "express" para rodar as rotas REAIS do backend dentro do navegador.
// Só implementa o que as rotas usam: Router(), use/get/post/put/patch/delete,
// req.params/query/body/usuario e res.status/json/send/setHeader/cookie.
function compilar(caminho) {
  const chaves = [];
  const fonte = caminho
    .replace(/\/+$/, '')
    .replace(/:([A-Za-z_]+)/g, (_, nome) => {
      chaves.push(nome);
      return '([^/]+)';
    });
  return { re: new RegExp('^' + fonte + '/?$'), chaves };
}

function Router() {
  const camadas = [];
  const globais = [];
  const router = {
    use(...args) {
      args.filter((a) => typeof a === 'function').forEach((f) => globais.push(f));
      return router;
    },
    _camadas: camadas,
    _globais: globais,
  };
  ['get', 'post', 'put', 'patch', 'delete'].forEach((metodo) => {
    router[metodo] = (caminho, ...handlers) => {
      camadas.push({ metodo: metodo.toUpperCase(), ...compilar(caminho === '/' ? '' : caminho), handlers });
      return router;
    };
  });
  return router;
}

// Executa o router para uma requisição; devolve { status, corpo, headers }.
async function despachar(router, metodo, caminho, req) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {} };
    let terminou = false;
    const fim = (corpo, ehJson) => {
      if (terminou) return;
      terminou = true;
      resolve({ status: res.statusCode, corpo, ehJson, headers: res.headers });
    };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => fim(JSON.stringify(o), true);
    res.send = (t) => fim(typeof t === 'string' ? t : JSON.stringify(t), false);
    res.end = () => fim('', false);
    res.setHeader = (k, v) => { res.headers[k] = v; return res; };
    res.cookie = () => res;
    res.clearCookie = () => res;

    const camada = router._camadas.find((c) => c.metodo === metodo && c.re.test(caminho));
    if (!camada) return res.status(404).json({ erro: 'Rota não encontrada.' });
    const m = caminho.match(camada.re);
    req.params = {};
    camada.chaves.forEach((k, i) => { req.params[k] = decodeURIComponent(m[i + 1]); });

    const fila = [...router._globais, ...camada.handlers];
    let i = 0;
    const proximo = async () => {
      const f = fila[i++];
      if (!f) return;
      try {
        await f(req, res, proximo);
      } catch (e) {
        console.error(e);
        res.status(500).json({ erro: String((e && e.message) || e) });
      }
    };
    proximo();
  });
}

function express() { throw new Error('express() não é usado nas rotas'); }
express.Router = Router;
express.json = () => (req, res, next) => next();
module.exports = express;
module.exports.despachar = despachar;
