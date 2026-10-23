<script setup>
// Primeiro acesso: convida a cadastrar a primeira conta e o primeiro cartão, em sequência, abrindo os formulários
// que já existem (Contas e Cartoes montados só para isso, sem trocar de página). Só uma vez.
import { ref, onMounted } from 'vue';
import { Wallet } from 'lucide-vue-next';
import Contas from '../views/Contas.vue';
import Cartoes from '../views/Cartoes.vue';
import { primeiroCadastroPendente, concluirPrimeiroCadastro } from '../services/primeiroCadastro.js';

const convite = ref(false);
const etapa = ref(''); // '' | 'conta' | 'cartao'
let salvou = false;
onMounted(() => { convite.value = primeiroCadastroPendente(); });
function depois() { concluirPrimeiroCadastro(); convite.value = false; }
function comecar() { concluirPrimeiroCadastro(); convite.value = false; etapa.value = 'conta'; }
function fim(salvo) {
  salvou = salvou || !!salvo;
  if (etapa.value === 'conta') { etapa.value = ''; setTimeout(() => { etapa.value = 'cartao'; }, 50); return; }
  etapa.value = '';
  if (salvou) location.reload(); // as telas já abertas passam a mostrar o que foi cadastrado
}
</script>

<template>
  <Teleport to="body">
    <div v-if="convite" class="pc-fundo" @click.self="depois">
      <div class="pc-caixa" role="dialog" aria-modal="true" aria-labelledby="pc-titulo">
        <span class="pc-icone"><Wallet :size="24" :stroke-width="1.9" /></span>
        <h2 id="pc-titulo">Vamos começar?</h2>
        <p>Quer cadastrar sua primeira conta e cartão para começar os lançamentos?</p>
        <div class="pc-acoes">
          <button type="button" class="pc-principal" @click="comecar">Cadastrar agora</button>
          <button type="button" class="pc-sec" @click="depois">Depois</button>
        </div>
      </div>
    </div>
  </Teleport>
  <div v-if="etapa" style="display:none" aria-hidden="true">
    <Contas v-if="etapa === 'conta'" embutido fluxo @fluxo-fim="fim" />
    <Cartoes v-else-if="etapa === 'cartao'" fluxo @fluxo-fim="fim" />
  </div>
</template>

<style scoped>
.pc-fundo { position: fixed; inset: 0; z-index: 2000; background: rgba(0, 0, 0, 0.55); display: flex; align-items: center; justify-content: center; padding: 16px; }
.pc-caixa { width: 100%; max-width: 340px; background: var(--cor-fundo-elevado); color: var(--cor-texto); border: 1px solid var(--cor-borda); border-radius: 18px; padding: 22px 20px 18px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35); }
.pc-icone { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--cor-primaria) 14%, transparent); color: var(--cor-primaria); }
.pc-caixa h2 { margin: 0; font-family: var(--fonte-display); font-size: 20px; }
.pc-caixa p { margin: 0; font-size: 14.5px; line-height: 1.45; color: var(--cor-texto-suave); }
.pc-acoes { display: flex; flex-direction: column; gap: 8px; width: 100%; margin-top: 8px; }
.pc-acoes button { font-family: var(--fonte-texto); font-weight: 600; font-size: 15px; min-height: 46px; border-radius: 10px; border: none; cursor: pointer; }
.pc-principal { background: var(--cor-primaria); color: #fff; }
.pc-principal:hover { background: var(--cor-primaria-hover); }
.pc-sec { background: transparent; color: var(--cor-texto-suave); }
.pc-sec:hover { background: var(--cor-realce); color: var(--cor-texto); }
</style>
