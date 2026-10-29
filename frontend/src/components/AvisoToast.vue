<script setup>
import { useRouter } from 'vue-router';
import { Info, TriangleAlert, Check, Sparkles, Trash2 } from 'lucide-vue-next';
import { avisos, dispensar, pausar, retomar } from '../services/avisos.js';
import { ehCelular } from '../services/layout.js';

const router = useRouter();
const icones = { info: Info, alerta: TriangleAlert, ok: Check, regra: Sparkles, excluido: Trash2 };
function abrir(a) {
  dispensar(a.id);
  if (a.aoTocar) a.aoTocar();
  else if (a.rota) router.push(a.rota);
}
function acionar(a, b) { dispensar(a.id); if (b.acao) b.acao(); }
</script>

<template>
  <div class="avisos" :class="{ celular: ehCelular }" aria-live="polite">
    <transition-group name="aviso">
      <div v-for="a in avisos" :key="a.id" class="aviso" :class="[a.tipo, { 'com-acoes': a.acoes && a.acoes.length }]" role="status"
        @mouseenter="pausar(a.id)" @mouseleave="retomar(a.id)" @focusin="pausar(a.id)" @focusout="retomar(a.id)">
        <button type="button" class="corpo" @click="abrir(a)">
          <component :is="icones[a.tipo] || Info" :size="18" :stroke-width="2" aria-hidden="true" />
          <span class="txt">{{ a.texto }}<small v-if="a.detalhe">{{ a.detalhe }}</small></span>
        </button>
        <span v-if="a.acoes && a.acoes.length" class="acoes">
          <button v-for="b in a.acoes" :key="b.rotulo" type="button" :class="['acao', { primaria: b.primaria }]" @click="acionar(a, b)">{{ b.rotulo }}</button>
        </span>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.avisos { position: fixed; z-index: 45; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; max-width: min(520px, calc(100vw - 32px)); }
.avisos.celular { left: 12px; right: 12px; max-width: none; bottom: calc(92px + env(safe-area-inset-bottom, 0px)); align-items: stretch; }
.aviso { pointer-events: auto; display: flex; flex-wrap: wrap; align-items: center; gap: 0 4px; border-radius: 14px; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado); color: var(--cor-texto); box-shadow: var(--sombra-suave); }
.corpo { flex: 1 1 200px; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px 16px; min-height: 48px; border: none; background: none; color: inherit; font-family: var(--fonte-texto); font-size: 14px; font-weight: 600; text-align: left; cursor: pointer; border-radius: 14px; }
.com-acoes .corpo { padding-right: 6px; }
.txt { display: flex; flex-direction: column; gap: 1px; min-width: 0; overflow-wrap: anywhere; }
.txt small { font-size: 12px; font-weight: 500; color: var(--cor-texto-suave); }
.acoes { display: flex; align-items: center; gap: 2px; padding: 4px 6px 4px 0; margin-left: auto; flex: none; }
.acao { min-height: 40px; padding: 0 10px; border: none; border-radius: 10px; background: none; color: var(--cor-texto-suave); font: 700 13px var(--fonte-texto); cursor: pointer; white-space: nowrap; }
.acao.primaria { color: var(--cor-interface, var(--cor-primaria)); }
.acao:hover, .acao:focus-visible { background: var(--cor-realce); }
.aviso.alerta { border-color: var(--cor-alerta); }
.aviso.ok { border-color: var(--cor-investimento); }
.aviso.regra { border-color: var(--cor-interface, var(--cor-primaria)); }
.aviso.regra .corpo > svg { color: var(--cor-interface, var(--cor-primaria)); }
.aviso.excluido .corpo > svg { color: var(--cor-saida); }
.aviso-enter-active, .aviso-leave-active { transition: opacity var(--anim-padrao) ease, transform var(--anim-padrao) var(--anim-curva); }
.aviso-enter-from, .aviso-leave-to { opacity: 0; transform: translateY(10px); }
@media (prefers-reduced-motion: reduce) { .aviso-enter-active, .aviso-leave-active { transition: opacity .1s; } .aviso-enter-from, .aviso-leave-to { transform: none; } }
</style>
