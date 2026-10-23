import { createApp } from 'vue';
import App from './App.vue';
import router from './router.js';
import { instalarHttp } from './services/http.js';
import { iniciarTema } from './services/tema.js';
import { iniciarMes, diretivaDeslizarMes } from './services/mes.js';
import './styles/tokens.css';

instalarHttp();
iniciarTema();
iniciarMes(router);
createApp(App).use(router).directive('deslizar-mes', diretivaDeslizarMes).mount('#app');
