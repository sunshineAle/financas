// Confirmação curta: usa só o último destino que recebeu um backup com sucesso.
import { ref } from 'vue';
import { configBackup, ocupado, suporte, baixar, compartilhar, carregarPasta, salvarNaPasta, enviarNuvem, PROVEDORES, estadoNuvem } from './backup.js';
import { conectarNuvem } from './nuvem/index.js';
import { avisar } from './avisos.js';

export const pedidoBackup = ref(null);
export function abrirBackupRapido() {
  if (pedidoBackup.value) return;
  pedidoBackup.value = { destino: configBackup.ultimoDestino, executando: false, erro: '' };
}
export function fecharBackupRapido() {
  if (!pedidoBackup.value?.executando) pedidoBackup.value = null;
}
export function nomeDestinoBackup(destino) {
  if (PROVEDORES[destino]) return PROVEDORES[destino].nome;
  return { arquivo: 'arquivo neste aparelho', compartilhado: 'compartilhamento do aparelho', pasta: 'pasta escolhida neste aparelho' }[destino] || '';
}
export async function executarBackupRapido() {
  const pedido = pedidoBackup.value;
  if (!pedido || pedido.executando || ocupado.value) return false;
  pedido.erro = '';
  if (estadoNuvem.ocupado) { pedido.erro = 'Há uma operação de nuvem em andamento. Aguarde para tentar novamente.'; return false; }
  const destino = pedido.destino;
  if (!nomeDestinoBackup(destino)) { pedido.erro = 'Escolha um destino e faça o primeiro backup em Dados e backup.'; return false; }
  // O snapshot mostrado na confirmação é o único destino autorizado por este clique.
  if (configBackup.ultimoDestino !== destino) { pedido.erro = 'O destino mudou. Feche e confirme novamente.'; return false; }
  pedido.executando = true;
  ocupado.value = true;
  try {
    if (PROVEDORES[destino]) {
      if (!PROVEDORES[destino].configurado()) throw new Error('Este destino não está configurado. Escolha um destino disponível em Dados e backup.');
      if (navigator.onLine === false) throw new Error('Sem internet. O backup não foi enviado. Tente novamente quando a conexão voltar.');
      if (!estadoNuvem[destino].conectado || estadoNuvem[destino].precisaReconectar) await conectarNuvem(destino);
      await enviarNuvem(destino);
    } else if (destino === 'pasta') {
      const pasta = await carregarPasta();
      if (!pasta.nome) throw new Error('A pasta escolhida não está disponível neste aparelho. Escolha a pasta em Dados e backup.');
      await salvarNaPasta({ pedirPermissao: true });
    } else if (destino === 'compartilhado') {
      if (!suporte.compartilhar()) throw new Error('Este navegador não oferece o compartilhamento de arquivos. Escolha outro destino em Dados e backup.');
      await compartilhar();
    } else {
      await baixar();
    }
    // As rotinas de backup só atualizam data/destino depois de terminarem sem erro.
    pedidoBackup.value = null;
    const mensagem = PROVEDORES[destino] ? `Backup enviado ao ${nomeDestinoBackup(destino)}.`
      : destino === 'arquivo' ? 'Arquivo de backup gerado. Confira os downloads do navegador.'
      : destino === 'compartilhado' ? 'Backup entregue ao compartilhamento do aparelho. Confira o destino escolhido.' : 'Backup salvo na pasta escolhida.';
    avisar(mensagem, { tipo: 'ok', grupo: 'backup-rapido', duracao: 8000 });
    return true;
  } catch (e) {
    pedido.erro = e?.name === 'AbortError' || e?.codigo === 'cancelado' ? 'Operação cancelada. Nenhum backup foi confirmado.' : (e?.message || 'Não foi possível concluir o backup. Tente novamente.');
    return false;
  } finally { pedido.executando = false; ocupado.value = false; }
}
