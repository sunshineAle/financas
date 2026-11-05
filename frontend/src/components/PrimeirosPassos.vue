<script setup>
// "Primeiros passos" (Versão 1.0, plano seção 2.2): card no topo do Início para conta nova, no lugar da janela
// "Vamos começar?". Não é janela e não bloqueia nada. Cada item abre o seu formulário/página e fica marcado quando feito;
// "Ocultar" esconde; some sozinho quando tudo estiver feito.
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Check, ChevronRight, Landmark, CreditCard, FileUp, CalendarDays, Shield } from 'lucide-vue-next';
import { configBackup } from '../services/backup.js';
import { ehContaNova } from '../services/tour.js';

const router = useRouter();
const flag = (k) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const marcar = (k) => { try { localStorage.setItem(k, '1'); } catch { /* ignora */ } };
const visivel = ref(ehContaNova() && !flag('sf:pp-oculto'));
const n = ref({ contas: 0, cartoes: 0, importacoes: 0 });
const pegar = (u) => fetch(u, { credentials: 'include' }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
onMounted(async () => {
  if (!visivel.value) return;
  const [c, k, i] = await Promise.all([pegar('/api/contas'), pegar('/api/cartoes'), pegar('/api/importacao/historico')]);
  n.value = { contas: c.length || 0, cartoes: k.length || 0, importacoes: (Array.isArray(i) ? i : []).filter((x) => !x.desfeitaEm).length };
  if (feitos.value === itens.value.length) concluir();
});
const itens = computed(() => [
  { id: 'conta', icone: Landmark, titulo: 'Adicione sua conta', sub: 'com o saldo de hoje', feito: n.value.contas > 0, ir: () => router.push('/contas?novo=1') },
  { id: 'cartao', icone: CreditCard, titulo: 'Adicione cartão ou crediário', sub: 'ou toque em "Não tenho"', feito: n.value.cartoes > 0 || flag('sf:pp-sem-cartao'), ir: () => router.push('/cartoes?novo=1'), alt: { rotulo: 'Não tenho', acao: () => { marcar('sf:pp-sem-cartao'); n.value = { ...n.value }; } } },
  { id: 'importar', icone: FileUp, titulo: 'Importe um extrato ou fatura', sub: 'opcional', feito: n.value.importacoes > 0 || flag('sf:pp-sem-importar'), ir: () => router.push('/importar'), alt: { rotulo: 'Depois', acao: () => { marcar('sf:pp-sem-importar'); n.value = { ...n.value }; } } },
  { id: 'mes', icone: CalendarDays, titulo: 'Escolha quando seu mês começa', sub: 'dia 1, dia fixo ou 5º dia útil', feito: flag('sf:pp-mes'), ir: () => { marcar('sf:pp-mes'); router.push('/mais'); } },
  { id: 'backup', icone: Shield, titulo: 'Ative o backup', sub: 'no aparelho ou na nuvem', feito: !!configBackup.ultimo, ir: () => router.push('/mais/dados-backup') },
]);
const feitos = computed(() => itens.value.filter((i) => i.feito).length);
const pct = computed(() => Math.round((feitos.value / itens.value.length) * 100));
function ocultar() { marcar('sf:pp-oculto'); visivel.value = false; }
function concluir() { marcar('sf:pp-oculto'); try { localStorage.setItem('sf:primeiro-cadastro', 'feito'); } catch { /* ignora */ } visivel.value = false; }
</script>

<template>
  <section v-if="visivel" class="primeiros" aria-labelledby="t-pp" data-primeiros-passos>
    <div class="cab">
      <h2 id="t-pp">Primeiros passos <small>{{ feitos }} de {{ itens.length }}</small></h2>
      <button type="button" class="ocultar" @click="ocultar">Ocultar</button>
    </div>
    <div class="barra" aria-hidden="true"><i :style="{ width: pct + '%' }"></i></div>
    <ul>
      <li v-for="i in itens" :key="i.id" :class="{ feito: i.feito }">
        <button type="button" class="item" :disabled="i.feito" @click="i.ir()">
          <span class="ic"><Check v-if="i.feito" :size="17" :stroke-width="2.6" /><component :is="i.icone" v-else :size="18" :stroke-width="1.9" /></span>
          <span class="txt"><b>{{ i.titulo }}</b><small>{{ i.feito ? 'feito' : i.sub }}</small></span>
          <ChevronRight v-if="!i.feito" :size="17" :stroke-width="2" class="seta" />
        </button>
        <button v-if="i.alt && !i.feito" type="button" class="alt" @click="i.alt.acao()">{{ i.alt.rotulo }}</button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.primeiros { background: var(--cor-card); border: 1px solid var(--cor-card-borda, var(--cor-borda)); border-radius: var(--raio-card, 16px); padding: 14px 14px 8px; display: flex; flex-direction: column; gap: 10px; }
.cab { display: flex; align-items: center; justify-content: space-between; }
.cab h2 { margin: 0; font: 600 16px var(--fonte-display); display: flex; align-items: baseline; gap: 8px; }
.cab small { font: 500 12px var(--fonte-texto); color: var(--cor-texto-suave); }
.ocultar { border: 0; background: none; color: var(--cor-texto-suave); font: 500 13px var(--fonte-texto); cursor: pointer; padding: 6px; }
.barra { height: 6px; border-radius: 999px; background: var(--cor-trilho, var(--cor-realce)); overflow: hidden; }
.barra i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #5e18d8, #1597a8); transition: width .4s ease; }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
li { display: flex; align-items: center; gap: 6px; }
.item { flex: 1; min-width: 0; display: grid; grid-template-columns: 36px minmax(0, 1fr) 18px; gap: 10px; align-items: center; min-height: 52px; padding: 6px; border: 0; border-radius: 12px; background: none; color: var(--cor-texto); text-align: left; font: inherit; cursor: pointer; }
.item:hover:not(:disabled) { background: var(--cor-realce); }
.item:disabled { cursor: default; }
.ic { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--cor-primaria) 14%, transparent); color: var(--cor-primaria); }
.feito .ic { background: var(--cor-entrada); color: #fff; }
.txt { display: flex; flex-direction: column; min-width: 0; }
.txt b { font-size: 14.5px; font-weight: 600; }
.feito .txt b { color: var(--cor-texto-suave); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--cor-texto-suave) 50%, transparent); }
.txt small { font-size: 12.5px; color: var(--cor-texto-suave); }
.seta { color: var(--cor-texto-suave); }
.alt { flex: none; min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto-suave); font: 500 12.5px var(--fonte-texto); cursor: pointer; }
</style>
