<script setup>
// "+ Adicionar" do modo web/PC (pedido de 30/10): o mesmo "+" de dois níveis do celular, no topo do menu lateral
// (proposta do time: fica junto da navegação, sempre visível; com o menu recolhido aparece só o "+").
// 1º nível: Transação ▸ · Criar recorrência · Regra de transação. "Transação" abre Entrada · Saída · Transferência.
import { ref, nextTick, onBeforeUnmount } from 'vue';
import { Plus, ChevronRight, ChevronLeft } from 'lucide-vue-next';
import { ACOES_MAIS, ACOES_LANCAR } from '../config/menu.js';
import { abrirLancamento } from '../services/lancamento.js';
import { abrirRecorrencia, abrirNovaRegra } from '../services/acoesRapidas.js';

defineProps({ expandido: { type: Boolean, default: false } });
const aberto = ref(false);
const nivel = ref('mais'); // 'mais' | 'transacao'
const botao = ref(null);
const caixa = ref(null);
const pos = ref({ top: 0, left: 0 });
function fora(e) { if (!caixa.value?.contains(e.target) && !botao.value?.contains(e.target)) fechar(); }
function tecla(e) { if (e.key === 'Escape') { e.stopPropagation(); if (nivel.value === 'transacao') nivel.value = 'mais'; else { fechar(); botao.value?.focus(); } } }
async function abrir() {
  const r = botao.value.getBoundingClientRect();
  pos.value = { top: r.bottom + 6, left: r.left };
  nivel.value = 'mais'; aberto.value = true;
  document.addEventListener('pointerdown', fora, true); window.addEventListener('keydown', tecla, true);
  await nextTick(); caixa.value?.querySelector('button')?.focus();
}
function fechar() { aberto.value = false; document.removeEventListener('pointerdown', fora, true); window.removeEventListener('keydown', tecla, true); }
onBeforeUnmount(fechar);
async function escolher(id) {
  if (nivel.value === 'mais') {
    if (id === 'transacao') { nivel.value = 'transacao'; await nextTick(); caixa.value?.querySelector('button')?.focus(); return; }
    fechar();
    if (id === 'recorrencia') abrirRecorrencia(); else abrirNovaRegra();
    return;
  }
  fechar();
  abrirLancamento({ tipo: id });
}
</script>

<template>
  <button ref="botao" type="button" class="adicionar-web" :class="{ expandido }" :aria-expanded="aberto" aria-haspopup="menu" aria-label="Adicionar: transação, recorrência ou regra" title="Adicionar" data-adicionar-web @click="aberto ? fechar() : abrir()">
    <span class="mais"><Plus :size="18" :stroke-width="2.4" /></span><span class="rot">Adicionar</span>
  </button>
  <Teleport to="body">
    <div v-if="aberto" ref="caixa" class="menu-adicionar" role="menu" :style="{ top: pos.top + 'px', left: pos.left + 'px' }">
      <template v-if="nivel === 'mais'">
        <button v-for="a in ACOES_MAIS" :key="a.id" type="button" role="menuitem" @click="escolher(a.id)">
          <component :is="a.icone" :size="18" :stroke-width="1.9" /><span>{{ a.rotulo }}</span><ChevronRight v-if="a.id === 'transacao'" :size="16" class="seta" />
        </button>
      </template>
      <template v-else>
        <button type="button" class="voltar" @click="nivel = 'mais'"><ChevronLeft :size="16" />Nova transação</button>
        <button v-for="a in ACOES_LANCAR" :key="a.id" type="button" role="menuitem" :class="a.tom" @click="escolher(a.id)">
          <component :is="a.icone" :size="18" :stroke-width="1.9" /><span>{{ a.rotulo }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.adicionar-web { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 44px; padding: 0 10px 0 8px; margin: 2px 0 6px; border: 0; border-radius: 12px; background: none; color: var(--cor-texto); font: 600 14px var(--fonte-texto); cursor: pointer; overflow: hidden; white-space: nowrap; }
.adicionar-web:hover .mais { filter: brightness(1.1); }
.mais { width: 34px; height: 34px; flex: none; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(135deg, var(--meta-violeta-medio, #5E18D8), var(--cor-investimento, #1597A8)); color: #fff; box-shadow: 0 6px 16px -8px rgb(0 0 0 / 0.6); }
.rot { opacity: 0; transition: opacity var(--anim-rapida) ease; }
.adicionar-web.expandido .rot { opacity: 1; }
.menu-adicionar { position: fixed; z-index: 950; min-width: 230px; padding: 6px; border-radius: 14px; background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); box-shadow: 0 18px 40px -16px rgb(0 0 0 / 0.55); display: flex; flex-direction: column; gap: 2px; }
.menu-adicionar button { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 0 10px; border: 0; border-radius: 10px; background: none; color: var(--cor-texto); font: 600 13.5px var(--fonte-texto); text-align: left; cursor: pointer; }
.menu-adicionar button span { flex: 1; }
.menu-adicionar button:hover, .menu-adicionar button:focus-visible { background: var(--cor-realce); outline: none; }
.menu-adicionar .entrada svg { color: var(--cor-entrada); }
.menu-adicionar .saida svg { color: var(--cor-saida); }
.menu-adicionar .voltar { min-height: 34px; color: var(--cor-texto-suave); font-size: 12.5px; }
.seta { color: var(--cor-texto-suave); }
</style>
