<script setup>
import { useRouter } from 'vue-router';
import { Info, TriangleAlert, Check } from 'lucide-vue-next';
import { avisos, dispensar } from '../services/avisos.js';
import { ehCelular } from '../services/layout.js';

const router = useRouter();
const icones = { info: Info, alerta: TriangleAlert, ok: Check };
function abrir(a) { if (a.rota) router.push(a.rota); dispensar(a.id); }
</script>

<template>
  <div class="avisos" :class="{ celular: ehCelular }" aria-live="polite">
    <transition-group name="aviso">
      <button v-for="a in avisos" :key="a.id" type="button" class="aviso" :class="a.tipo" @click="abrir(a)">
        <component :is="icones[a.tipo] || Info" :size="18" :stroke-width="2" />
        <span>{{ a.texto }}</span>
      </button>
    </transition-group>
  </div>
</template>

<style scoped>
.avisos { position: fixed; z-index: 45; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; }
.avisos.celular { left: 12px; right: 12px; bottom: calc(92px + env(safe-area-inset-bottom, 0px)); align-items: stretch; }
.aviso { pointer-events: auto; display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 14px; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado); color: var(--cor-texto); font-family: var(--fonte-texto); font-size: 14px; font-weight: 600; text-align: left; cursor: pointer; box-shadow: var(--sombra-suave); }
.aviso.alerta { border-color: var(--cor-alerta); }
.aviso.ok { border-color: var(--cor-investimento); }
.aviso-enter-active, .aviso-leave-active { transition: opacity var(--anim-padrao) ease, transform var(--anim-padrao) var(--anim-curva); }
.aviso-enter-from, .aviso-leave-to { opacity: 0; transform: translateY(10px); }
</style>
