<script setup>
// <CampoDataPilula v-model="data" /> — data COMPACTA (homologação 1.0, seção 14): pílula com ícone de calendário e "26/10",
// para ir ao lado do valor (slot #lado do CampoValor). Toque abre um balão com Hoje · Ontem no topo e o calendário.
// Props: modelValue ('AAAA-MM-DD'), min, max, rotulo (leitor de tela). Fecha com Esc ou tocando fora.
import { ref, computed, nextTick, onBeforeUnmount } from 'vue';
import { Calendar } from 'lucide-vue-next';

const props = defineProps({ modelValue: { type: String, default: '' }, min: String, max: String, rotulo: { type: String, default: 'Data' } });
const emit = defineEmits(['update:modelValue']);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoje = () => iso(new Date());
const ontem = () => { const d = new Date(); d.setDate(d.getDate() - 1); return iso(d); };
const curta = computed(() => {
  const v = props.modelValue;
  if (!v) return 'Data';
  if (v === hoje()) return 'Hoje';
  if (v === ontem()) return 'Ontem';
  const [a, m, d] = v.split('-');
  return a === String(new Date().getFullYear()) ? `${d}/${m}` : `${d}/${m}/${a.slice(2)}`;
});
const botao = ref(null);
const balao = ref(null);
const entrada = ref(null);
const aberto = ref(false);
const pos = ref({ left: 0, top: 0 });
function posicionar() {
  const b = botao.value?.getBoundingClientRect();
  if (!b) return;
  const vw = document.documentElement.clientWidth;
  const larg = 248;
  const left = Math.max(12, Math.min(b.right - larg, vw - larg - 12));
  let top = b.bottom + 8;
  const alt = balao.value?.offsetHeight || 150;
  if (top + alt > window.innerHeight - 12) top = Math.max(12, b.top - 8 - alt);
  pos.value = { left, top };
}
function fora(e) { if (!balao.value?.contains(e.target) && !botao.value?.contains(e.target)) fechar(); }
function tecla(e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); fechar(); botao.value?.focus(); } }
async function abrir() {
  aberto.value = true;
  await nextTick(); posicionar();
  document.addEventListener('pointerdown', fora, true);
  window.addEventListener('keydown', tecla, true);
  try { entrada.value?.focus({ preventScroll: true }); entrada.value?.showPicker?.(); } catch { /* sem showPicker: o campo fica visível */ }
}
function fechar() {
  aberto.value = false;
  document.removeEventListener('pointerdown', fora, true);
  window.removeEventListener('keydown', tecla, true);
}
function escolher(v) { emit('update:modelValue', v); fechar(); }
onBeforeUnmount(fechar);
</script>

<template>
  <button ref="botao" type="button" class="pilula-data" :aria-label="`${rotulo}: ${curta}. Tocar para mudar`" :aria-expanded="aberto" data-data-pilula @click.stop="aberto ? fechar() : abrir()">
    <Calendar :size="15" :stroke-width="2" aria-hidden="true" /><span class="numero-tabular">{{ curta }}</span>
  </button>
  <Teleport to="body">
    <div v-if="aberto" ref="balao" class="balao-data" role="dialog" :aria-label="rotulo" :style="{ left: pos.left + 'px', top: pos.top + 'px' }">
      <div class="atalhos-data">
        <button type="button" :class="{ on: modelValue === hoje() }" @click="escolher(hoje())">Hoje</button>
        <button type="button" :class="{ on: modelValue === ontem() }" @click="escolher(ontem())">Ontem</button>
      </div>
      <input ref="entrada" class="sf-entrada" type="date" :value="modelValue" :min="min" :max="max" :aria-label="rotulo" @change="escolher($event.target.value)" />
    </div>
  </Teleport>
</template>

<style scoped>
.pilula-data { display: inline-flex; align-items: center; gap: 5px; min-height: 34px; padding: 0 11px; border-radius: 999px; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado, var(--cor-card)); color: var(--cor-texto); font: 600 13px var(--fonte-texto); cursor: pointer; white-space: nowrap; }
.pilula-data:hover { border-color: color-mix(in srgb, var(--tema-cor, var(--cor-primaria)) 45%, var(--cor-borda)); }
.pilula-data:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--tema-cor, var(--cor-primaria)) 35%, transparent); }
.pilula-data svg { color: var(--tema-cor, var(--cor-texto-suave)); }
.balao-data { position: fixed; z-index: 90; width: 248px; box-sizing: border-box; padding: 10px; display: flex; flex-direction: column; gap: 8px; border-radius: 14px; background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); box-shadow: 0 16px 36px -14px rgb(0 0 0 / 0.5); }
.atalhos-data { display: flex; gap: 6px; }
.atalhos-data button { flex: 1; min-height: 40px; border-radius: 10px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); font: 600 13px var(--fonte-texto); cursor: pointer; }
.atalhos-data button.on { border-color: var(--cor-primaria); color: var(--cor-primaria); background: color-mix(in srgb, var(--cor-primaria) 10%, transparent); }
</style>
