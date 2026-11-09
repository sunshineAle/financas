// Detecção sem dependências do navegador: a ausência de prompt nativo no iOS exige orientação visível.
const ambienteAtual = () => typeof navigator === 'undefined' ? {} : navigator;
export function ehAppleMovel(ambiente = ambienteAtual()) {
  return /iPhone|iPad|iPod/.test(ambiente.userAgent || '') || (ambiente.platform === 'MacIntel' && ambiente.maxTouchPoints > 1);
}
export function orientacaoInstalacao(ambiente = ambienteAtual()) {
  const ua = ambiente.userAgent || '';
  if (ehAppleMovel(ambiente)) {
    const outroNavegador = /CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV/.test(ua) || !/Safari/.test(ua);
    return {
      titulo: 'Instalar no iPhone ou iPad',
      passos: [
        ...(outroNavegador ? ['Abra este endereço no Safari. Se estiver dentro de outro aplicativo, copie o endereço e cole no Safari.'] : []),
        'No Safari, toque em Compartilhar (quadrado com uma seta para cima).',
        'Role as opções e toque em Adicionar à Tela de Início. Se necessário, toque em Editar Ações para encontrar essa opção.',
        'Confirme em Adicionar. Depois, abra o Dagda pelo ícone na Tela de Início.',
      ],
    };
  }
  if (/Macintosh|Mac OS X/.test(ua) || ambiente.platform === 'MacIntel') {
    return {
      titulo: 'Instalar no Mac',
      passos: ['No Safari, abra o menu Arquivo e escolha Adicionar ao Dock.', 'Confirme o nome Dagda Capital e clique em Adicionar.', 'Se essa opção não aparecer, confira a atualização do Safari ou abra no Chrome ou Edge e procure Instalar no menu do navegador.'],
    };
  }
  return {
    titulo: 'Instalar o Dagda Capital',
    passos: ['Abra o menu do navegador (três pontos ou três linhas).', 'Procure Instalar app ou Adicionar à Tela de Início e confirme.', 'Se a opção não aparecer, abra este endereço no Chrome, Edge ou, no iPhone e iPad, no Safari.'],
  };
}
