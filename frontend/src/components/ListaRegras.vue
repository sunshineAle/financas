<script setup>
// Mesma linha e mesmos gestos na prévia de três itens e na lista completa.
import { ref } from 'vue';
import { Trash2, Pause, Play } from 'lucide-vue-next';
import IconeCategoria from './IconeCategoria.vue';
import IconeCat from './IconeCat.vue';
defineProps({ regras: { type: Array, default: () => [] } });
const emit = defineEmits(['editar', 'alternar', 'excluir']);
const moeda = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const detalhe = r => [r.subcategoria ? `sub: ${r.subcategoria}` : '', r.contaNome ? `só na conta ${r.contaNome}` : '', r.valorMin != null || r.valorMax != null ? `valor ${r.valorMin != null ? 'de ' + moeda(r.valorMin) : ''}${r.valorMax != null ? ' até ' + moeda(r.valorMax) : ''}` : '', `usada ${r.aplicacoes}x`].filter(Boolean).join(' · ');
// ---------- gesto de arrastar ----------
const arraste = ref({ id: null, dx: 0, largura: 1, solto: false, saindo: false });
let g = null; // { id, x0, y0, largura, modo: null|'h'|'v', pid, el }
let ignorarClique = false;
const LIMIAR = 10;

function inicio(e, r) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (arraste.value.saindo) return;
  g = { r, x0: e.clientX, y0: e.clientY, largura: e.currentTarget.offsetWidth || 1, modo: null, pid: e.pointerId, el: e.currentTarget };
  ignorarClique = false;
}
function mover(e) {
  if (!g || e.pointerId !== g.pid) return;
  const dx = e.clientX - g.x0;
  const dy = e.clientY - g.y0;
  if (!g.modo) {
    if (Math.abs(dx) < LIMIAR && Math.abs(dy) < LIMIAR) return;
    if (Math.abs(dx) > Math.abs(dy) * 1.3) {
      g.modo = 'h';
      if (e.pointerType !== 'touch') { try { g.el.setPointerCapture(g.pid); } catch { /* sem captura, segue */ } } // toque já tem captura implícita
    } else { g = null; return; } // vertical: deixa a página rolar
  }
  e.preventDefault();
  ignorarClique = true;
  // um pouco de resistência depois da metade
  const meio = g.largura / 2;
  const d = Math.abs(dx) > meio ? Math.sign(dx) * (meio + (Math.abs(dx) - meio) * 0.6) : dx;
  arraste.value = { id: g.r.id, dx: d, largura: g.largura, solto: false, saindo: false };
}
function fim(e) {
  if (!g || e.pointerId !== g.pid) return;
  const { r, largura, modo } = g;
  g = null;
  if (modo !== 'h') return;
  const dx = arraste.value.dx;
  const passou = Math.abs(dx) >= largura / 2;
  if (passou && dx > 0) {
    // direita = excluir: a linha sai pela direita e some
    arraste.value = { id: r.id, dx: largura * 1.1, largura, solto: true, saindo: true };
    setTimeout(() => { arraste.value = { id: null, dx: 0, largura: 1, solto: false, saindo: false }; emit('excluir', r); }, 220);
    return;
  }
  arraste.value = { id: r.id, dx: 0, largura, solto: true, saindo: false };
  if (passou && dx < 0) emit('alternar', r);
  setTimeout(() => { if (arraste.value.id === r.id && arraste.value.solto) arraste.value = { id: null, dx: 0, largura: 1, solto: false, saindo: false }; }, 260);
}
function cancelar() {
  if (!g) return;
  const id = g.r.id;
  g = null;
  arraste.value = { id, dx: 0, largura: 1, solto: true, saindo: false };
}
function tocar(r) {
  if (ignorarClique) { ignorarClique = false; return; }
  emit('editar', r);
}
const dxDe = (r) => (arraste.value.id === r.id ? arraste.value.dx : 0);
const passouMeio = (r) => arraste.value.id === r.id && Math.abs(arraste.value.dx) >= arraste.value.largura / 2;

</script>
<template>
      <transition-group tag="ul" name="regra" class="lista">
        <li v-for="r in regras" :key="r.id" class="regra-item" :class="{ off: !r.ativa, arrastando: dxDe(r) !== 0 }">
          <div class="fundo excluir" :class="{ pronto: passouMeio(r) && dxDe(r) > 0 }" aria-hidden="true" :style="{ opacity: dxDe(r) > 0 ? 1 : 0 }">
            <Trash2 :size="20" :stroke-width="2.2" /><span>Excluir</span>
          </div>
          <div class="fundo pausa" :class="[r.ativa ? 'p-pausar' : 'p-ativar', { pronto: passouMeio(r) && dxDe(r) < 0 }]" aria-hidden="true" :style="{ opacity: dxDe(r) < 0 ? 1 : 0 }">
            <span>{{ r.ativa ? 'Pausar' : 'Ativar' }}</span><component :is="r.ativa ? Pause : Play" :size="20" :stroke-width="2.2" />
          </div>
          <button type="button" class="frente"
            :class="{ solto: arraste.id === r.id && arraste.solto, saindo: arraste.id === r.id && arraste.saindo }"
            :style="{ transform: dxDe(r) ? `translateX(${dxDe(r)}px)` : null }"
            :aria-label="`Editar regra ${r.padrao} para ${r.categoriaNome}${r.ativa ? '' : ', pausada'}`"
            @pointerdown="inicio($event, r)" @pointermove="mover" @pointerup="fim" @pointercancel="cancelar" @click="tocar(r)" @dragstart.prevent>
            <span class="ic">
              <span v-if="r.icone" class="item-ic"><IconeCat :chave="r.icone" :tamanho="22" /></span>
              <IconeCategoria v-else :valor="r.tipo === 'reserva' ? (r.metaId ? '🎯' : 'acoes') : r.categoriaIcone" :tipo="r.tipo === 'reserva' ? (r.metaId ? 'meta' : 'investimento') : r.tipo" :tamanho="40" />
            </span>
            <span class="txt">
              <b>“{{ r.padrao }}” → {{ r.categoriaNome }}</b>
              <small><span v-if="!r.ativa" class="selo">Pausada</span>{{ detalhe(r) }}</small>
            </span>
          </button>
        </li>
      </transition-group>
</template>
<style scoped>
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; position: relative; }
.regra-item { position: relative; border-radius: 14px; overflow: hidden; }
.fundo { position: absolute; inset: 0; display: flex; align-items: center; gap: 8px; padding: 0 20px; font: 700 14px var(--fonte-texto); color: #fff; border-radius: 14px; transition: filter var(--anim-rapida, .15s); }
.fundo.excluir { justify-content: flex-start; background: var(--cor-saida); }
.fundo.pausa { justify-content: flex-end; }
.fundo.p-pausar { background: var(--cor-interface, var(--cor-primaria)); }
.fundo.p-ativar { background: var(--cor-entrada); }
.fundo.pronto svg { transform: scale(1.18); }
.fundo svg { transition: transform var(--anim-rapida, .15s) var(--anim-curva, ease); }
.frente { position: relative; z-index: 1; width: 100%; display: flex; align-items: center; gap: 12px; padding: 8px 6px; min-height: 64px; border: none; border-radius: 14px; background: var(--cor-fundo-elevado, var(--cor-fundo)); color: var(--cor-texto); font: inherit; text-align: left; cursor: pointer; touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
.frente:hover { background: color-mix(in srgb, var(--cor-realce) 60%, var(--cor-fundo-elevado, var(--cor-fundo))); }
.frente:focus-visible { outline: 2px solid var(--cor-interface, var(--cor-primaria)); outline-offset: -2px; }
.regra-item.arrastando .frente { box-shadow: var(--sombra-suave); cursor: grabbing; }
.frente.solto { transition: transform var(--anim-padrao, .25s) var(--anim-curva, ease); }
.frente.saindo { transition: transform .2s ease-in, opacity .2s ease-in; opacity: 0; }
.ic { flex: none; width: 40px; height: 40px; display: grid; place-items: center; }
.item-ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: var(--cor-realce); color: var(--cor-texto); }
.txt { flex: 1 1 180px; min-width: 0; display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }
.txt small { color: var(--cor-texto-suave); font-size: 12px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.regra-item.off .ic, .regra-item.off .txt b { opacity: .5; }
.selo { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--cor-interface, var(--cor-primaria)) 14%, transparent); color: var(--cor-interface, var(--cor-primaria)); font-weight: 700; font-size: 11px; letter-spacing: .02em; }
.regra-leave-active { transition: opacity .2s ease, max-height .25s ease; max-height: 80px; }
.regra-leave-to { opacity: 0; max-height: 0; }
.regra-enter-active { transition: opacity var(--anim-padrao, .25s) ease, transform var(--anim-padrao, .25s) var(--anim-curva, ease); }
.regra-enter-from { opacity: 0; transform: translateY(-6px); }

@media (prefers-reduced-motion: reduce) { .frente.solto, .frente.saindo, .regra-leave-active, .regra-enter-active { transition: none; } }

</style>
