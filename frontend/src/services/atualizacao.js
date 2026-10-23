// Estado do aviso de nova versão (o service worker novo espera até a pessoa aceitar). A tela de acesso chama
// reavisar() sempre que aparece, para o convite voltar até a pessoa atualizar. O desenho do modal fica em demo/pwa/atualizacao.js.
export const aviso = { worker: null, mostrar: null };
export function reavisar() { if (aviso.worker && aviso.mostrar) aviso.mostrar(aviso.worker); }
