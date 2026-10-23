<script setup>
// Comparação esta semana × semana passada (REF-06, tela 5): colunas lado a lado por dia, degradê quente (saídas).
//   <RelSemana :dias="[{ rotulo: 'SEG', atual: 120, anterior: 80 }, ...]" />
import { ref, computed, onMounted } from 'vue';

const props = defineProps({ dias: { type: Array, default: () => [] } });
const pronto = ref(false);
onMounted(() => requestAnimationFrame(() => { pronto.value = true; }));
const maior = computed(() => Math.max(1, ...props.dias.flatMap((d) => [d.atual, d.anterior])));
const alt = (v) => (pronto.value ? Math.max(v > 0 ? 4 : 0, (v / maior.value) * 100) : 0) + '%';
</script>

<template>
  <div class="rel-semana">
    <div class="legenda">
      <span><i class="pt atual"></i> Esta semana</span>
      <span><i class="pt anterior"></i> Semana passada</span>
    </div>
    <div class="colunas">
      <div v-for="d in dias" :key="d.rotulo + d.dataAtual" class="col">
        <div class="par">
          <span class="barra anterior" :style="{ height: alt(d.anterior) }" :title="`Semana passada: ${d.anterior}`"></span>
          <span class="barra atual" :style="{ height: alt(d.atual) }" :title="`Esta semana: ${d.atual}`"></span>
        </div>
        <small>{{ d.rotulo }}</small>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rel-semana { display: flex; flex-direction: column; gap: 12px; }
.legenda { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; color: var(--cor-texto-suave); }
.pt { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.pt.atual { background: linear-gradient(180deg, var(--saida-ambar-medio), var(--saida-carmim-medio)); }
.pt.anterior { background: linear-gradient(180deg, var(--saida-ambar-claro), var(--saida-carmim-claro)); }
.colunas { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; align-items: end; }
.col { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.par { height: 120px; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 3px; }
.barra { width: min(14px, 38%); border-radius: 6px 6px 3px 3px; transition: height var(--anim-lenta) var(--anim-curva-suave); }
.barra.atual { background: linear-gradient(180deg, var(--saida-ambar-medio), var(--saida-carmim-medio)); }
.barra.anterior { background: linear-gradient(180deg, var(--saida-ambar-claro), var(--saida-carmim-claro)); opacity: 0.75; }
small { font-size: 10.5px; font-weight: 600; letter-spacing: 0.03em; color: var(--cor-texto-suave); }
</style>
