// Decide, pela largura da tela, se o app mostra o rodapé (celular) ou o menu lateral (PC/web).
// O ponto de corte fica aqui, num lugar só.
import { ref } from 'vue';

export const LARGURA_CELULAR = 768;
const consulta = window.matchMedia(`(max-width: ${LARGURA_CELULAR}px)`);
export const ehCelular = ref(consulta.matches);
consulta.addEventListener('change', (e) => { ehCelular.value = e.matches; });
