import { validarBackupDaSessao } from './backup.js';
const previa = !!import.meta.env.VITE_PREVIA;
const gerenciavel = i => !i.legado && (previa ? i.nome.startsWith('previa-') : !i.nome.startsWith('previa-'));
export const copiaGerenciavel = i => !!i && gerenciavel(i);
export async function excluirCopiaSegura(provedor, item) {
  // A lista real da área oculta é a autoridade: nunca aceitar um ID da pasta legada.
  const itens = (await provedor.listar({ restaurar: true })).filter(gerenciavel);
  const alvo = itens.find(i => i.id === item.id);
  if (!alvo) throw new Error('Esta cópia é somente leitura aqui. Apenas as cópias gerenciáveis da área oculta podem ser excluídas.');
  let outraValida = false;
  for (const outra of itens.filter(i => i.id !== alvo.id).sort((a,b) => b.data - a.data)) {
    try { await validarBackupDaSessao(await provedor.baixar(outra)); outraValida = true; break; } catch { /* não é prova de recuperação */ }
  }
  if (!outraValida) throw new Error('Exclusão bloqueada: não foi possível recuperar outra cópia com segurança. A última cópia recuperável precisa ser preservada.');
  await provedor.apagar(alvo);
}
export async function conferirEnvio(provedor, enviado, texto) {
  if (!enviado?.id) throw new Error('A nuvem não confirmou o arquivo. As cópias anteriores foram preservadas.');
  const recebido = await provedor.baixar({ id: enviado.id });
  if (recebido !== texto) throw new Error('O arquivo recebido da nuvem é diferente do enviado. Nenhuma cópia anterior foi descartada.');
  await validarBackupDaSessao(recebido);
}
export async function manterQuatroCopias(provedor) {
  const itens = (await provedor.listar()).filter(gerenciavel).sort((a,b) => b.data - a.data || b.nome.localeCompare(a.nome));
  for (const antiga of itens.slice(4)) await excluirCopiaSegura(provedor, antiga);
}
