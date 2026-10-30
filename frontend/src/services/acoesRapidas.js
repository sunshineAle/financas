// Ações do "+" (homologação 1.0, seção 12) que abrem janelas globais, montadas no AppLayout, sobre a página atual:
//   abrirRecorrencia()  → "Criar recorrência" (vira um item do Custo de vida, com ou sem prazo)
//   abrirNovaRegra()    → "Regra de transação" (cria uma regra de categorização à mão)
import { ref } from 'vue';

export const recorrenciaAberta = ref(false);
export const novaRegraAberta = ref(false);
export const acaoRapidaSalva = ref(0); // sobe a cada recorrência/regra salva (as páginas podem recarregar)
export function abrirRecorrencia() { recorrenciaAberta.value = true; }
export function abrirNovaRegra() { novaRegraAberta.value = true; }
export function acaoRapidaFoiSalva() { acaoRapidaSalva.value += 1; }
