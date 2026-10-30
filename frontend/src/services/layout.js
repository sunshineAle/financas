// Decide, pela largura da tela, se o app mostra o rodapé (celular) ou o menu lateral (PC/web).
// O ponto de corte fica aqui, num lugar só.
import { ref } from 'vue';

export const LARGURA_CELULAR = 768;
const consulta = window.matchMedia(`(max-width: ${LARGURA_CELULAR}px)`);
export const ehCelular = ref(consulta.matches);
consulta.addEventListener('change', (e) => { ehCelular.value = e.matches; });

// Tela grande (homologação 1.0, 29/10 22h35): páginas com abas mostram as partes LADO A LADO, como blocos grandes,
// em vez de uma aba centralizada com o resto da tela vazio. Abaixo disso, voltam as abas.
export const LARGURA_LADO_A_LADO = 1100;
const consultaLarga = window.matchMedia(`(min-width: ${LARGURA_LADO_A_LADO}px)`);
export const ehTelaLarga = ref(consultaLarga.matches);
consultaLarga.addEventListener('change', (e) => { ehTelaLarga.value = e.matches; });
