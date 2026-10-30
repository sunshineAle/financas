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
const app = createApp(App);
if (import.meta.env.VITE_DEMO) app.config.errorHandler = (e, _i, info) => console.error('VUE', info, e && e.stack || e);
router.onError((e) => console.error('ROUTER', e && e.stack || e));
app.use(router).directive('deslizar-mes', diretivaDeslizarMes).mount('#app');
