// Tela de acesso antes do app: o app de verdade só é carregado depois de desbloquear.
import { createApp } from 'vue';
import Acesso from '../../src/views/Acesso.vue';
import '../../src/styles/tokens.css';

export function mostrarAcesso() {
  return new Promise((resolve) => {
    const app = createApp(Acesso, {
      onLiberado: () => { app.unmount(); resolve(); },
    });
    app.mount('#app');
  });
}
