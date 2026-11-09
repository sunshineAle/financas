// Testa a importação real em um banco SQLite descartável, sem trocar o banco ativo.
export function testarRecuperacaoIsolada(dados) {
  return new Promise((resolve, reject) => {
    let worker;
    const concluir = (erro, resultado) => { clearTimeout(limite); worker?.terminate(); erro ? reject(new Error(erro)) : resolve(resultado); };
    const limite = setTimeout(() => concluir('O teste de recuperação não terminou. Nenhuma cópia será descartada.'), 60000);
    try {
      worker = new Worker(new URL('../workers/validarBackup.js', import.meta.url), { type: 'module' });
      worker.onmessage = e => concluir(e.data.ok ? null : e.data.erro, e.data);
      worker.onerror = () => concluir('Não foi possível executar a recuperação isolada neste navegador. Nenhuma cópia será descartada.');
      worker.postMessage(JSON.parse(JSON.stringify(dados)));
    } catch { concluir('Este navegador não permite testar a recuperação isolada. Nenhuma cópia será descartada.'); }
  });
}
