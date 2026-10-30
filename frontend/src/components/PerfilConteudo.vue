<script setup>
// Conteúdo do painel do perfil (homologação 1.0, seções 13 e 21), o MESMO no painel flutuante do PC, na folha do celular
// e na tela Mais. Setores separados por linhas:
//   1. atalhos em blocos: Custo de vida · Quanto guardar · Regras de categorização · Categorias
//      + retângulo na largura dos 4: Início do mês financeiro, com Dia 1 · Dia fixo · 5º dia útil direto ali;
//   2. Configurações ali mesmo (botões menores): Tema (claro · escuro · automático) e Animações (normais · reduzidas);
//   3. lista: Dados e backup (com Importar) · Avisos e notificações · Segurança · Sobre o app · Apoie o desenvolvedor.
// \"Minhas finanças\" e a página \"Aparência e avisos\" deixam de existir. Emite `ir(rota)` (atalhos) e `abrir(id)` (lista).
// Props: extras = itens a mais no início da lista (ex.: Relatórios na tela Mais do celular).
import { ref, computed } from 'vue';
import { CalendarClock, PiggyBank, Wand2, Tags, CalendarDays, DatabaseBackup, Bell, ShieldCheck, Info, Heart, ChevronRight, Sun, Moon, SunMoon, Zap, ZapOff, Gauge } from 'lucide-vue-next';
import AjudaSecao from './AjudaSecao.vue';
import { modoTema, definirTema, movimento, definirMovimento } from '../services/tema.js';
import { lerInicio, gravarInicio, descreverInicio, intervaloDoMes } from '../utils/mesFinanceiro.js';
import { avisar } from '../services/avisos.js';

const props = defineProps({ extras: { type: Array, default: () => [] } });
const emit = defineEmits(['ir', 'abrir']);

const ATALHOS = [
  { rotulo: 'Custo de vida', rota: '/custos-fixos', icone: CalendarClock },
  { rotulo: 'Quanto guardar', rota: '/mais/reserva', icone: PiggyBank },
  { rotulo: 'Regras de categorização', rota: '/regras', icone: Wand2 },
  { rotulo: 'Categorias', rota: '/orcamento', icone: Tags },
];
const LISTA = computed(() => [
  ...props.extras,
  { id: 'dados-backup', rotulo: 'Dados e backup', sub: 'importar extrato ou fatura e backup', icone: DatabaseBackup },
  { id: 'notificacoes', rotulo: 'Avisos e notificações', icone: Bell },
  { id: 'seguranca', rotulo: 'Segurança', icone: ShieldCheck },
  { id: 'sobre', rotulo: 'Sobre o app', icone: Info },
  { id: 'apoie', rotulo: 'Apoie o desenvolvedor', icone: Heart },
]);
const TEMAS = [{ id: 'claro', rotulo: 'Claro', icone: Sun }, { id: 'escuro', rotulo: 'Escuro', icone: Moon }, { id: 'auto', rotulo: 'Automático', icone: SunMoon }];
// 30/10: Animações com as três opções (do aparelho · normais · reduzidas)
const ANIM = [{ id: 'auto', rotulo: 'Do aparelho', icone: Gauge }, { id: 'normal', rotulo: 'Normais', icone: Zap }, { id: 'reduzido', rotulo: 'Reduzidas', icone: ZapOff }];
const animAtual = computed(() => movimento.value || 'auto');

// ---- Início do mês financeiro (mesma regra da anotação 51) ----
const ini = lerInicio();
const tipoIni = ref(ini.tipo === 'util' ? 'util' : (Number(ini.dia) === 1 ? 'padrao' : 'dia'));
const diaIni = ref(ini.tipo === 'dia' && Number(ini.dia) !== 1 ? String(ini.dia) : '5');
const INICIOS = [{ id: 'padrao', rotulo: 'Dia 1' }, { id: 'dia', rotulo: 'Dia fixo' }, { id: 'util', rotulo: '5º dia útil' }];
const cfg = computed(() => (tipoIni.value === 'util' ? { tipo: 'util', n: 5 } : tipoIni.value === 'dia' ? { tipo: 'dia', dia: diaIni.value === 'ultimo' ? 'ultimo' : Number(diaIni.value) } : { tipo: 'dia', dia: 1 }));
const atualCfg = () => { const c = lerInicio(); return c.tipo === 'dia' && Number(c.dia) === 1 ? { tipo: 'dia', dia: 1 } : c; };
const mudou = computed(() => JSON.stringify(cfg.value) !== JSON.stringify(atualCfg()));
const exemplo = computed(() => {
  const h = new Date();
  const { de, ate } = intervaloDoMes(h.getFullYear(), h.getMonth() + 1, cfg.value);
  return `${de.slice(8, 10)}/${de.slice(5, 7)} a ${ate.slice(8, 10)}/${ate.slice(5, 7)}`;
});
async function salvarInicio() {
  gravarInicio(cfg.value);
  try { await fetch('/api/configuracoes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ inicioMes: cfg.value }) }); } catch { /* fica no aparelho */ }
  avisar(`Mês financeiro começa no ${descreverInicio(cfg.value)}.`, { tipo: 'ok' });
  setTimeout(() => location.reload(), 700); // todas as telas passam a usar o novo período
}
</script>

<template>
  <div class="perfil-conteudo">
    <!-- 1. Atalhos -->
    <div class="setor">
      <div class="blocos">
        <button v-for="a in ATALHOS" :key="a.rotulo" type="button" class="quadrado" @click="emit('ir', a.rota)">
          <span class="ic"><component :is="a.icone" :size="18" :stroke-width="1.9" /></span><b>{{ a.rotulo }}</b>
        </button>
      </div>
      <div class="retangulo" data-inicio-mes-painel>
        <div class="ret-cab"><span class="ic"><CalendarDays :size="18" :stroke-width="1.9" /></span><b>Início do mês financeiro<AjudaSecao secao="perfil.inicio-mes" /></b><small>{{ exemplo }}</small></div>
        <div class="segmentos" role="radiogroup" aria-label="Início do mês financeiro">
          <button v-for="o in INICIOS" :key="o.id" type="button" role="radio" :aria-checked="tipoIni === o.id" :class="{ on: tipoIni === o.id }" @click="tipoIni = o.id">{{ o.rotulo }}</button>
        </div>
        <div v-if="tipoIni === 'dia' || mudou" class="ret-acoes">
          <select v-if="tipoIni === 'dia'" v-model="diaIni" aria-label="Dia em que o mês começa">
            <option v-for="d in 27" :key="d" :value="String(d + 1)">Dia {{ d + 1 }}</option>
            <option value="ultimo">Último dia</option>
          </select>
          <button v-if="mudou" type="button" class="aplicar" data-salvar-inicio @click="salvarInicio">Aplicar</button>
        </div>
      </div>
    </div>

    <!-- 2. Configurações ali mesmo -->
    <div class="setor config">
      <div class="conf-linha">
        <span class="conf-nome">Tema</span>
        <div class="segmentos peq" role="radiogroup" aria-label="Tema">
          <button v-for="t in TEMAS" :key="t.id" type="button" role="radio" :aria-checked="modoTema === t.id" :class="{ on: modoTema === t.id }" @click="definirTema(t.id)"><component :is="t.icone" :size="14" :stroke-width="2" aria-hidden="true" />{{ t.rotulo }}</button>
        </div>
      </div>
      <div class="conf-linha">
        <span class="conf-nome">Animações</span>
        <div class="segmentos peq" role="radiogroup" aria-label="Animações">
          <button v-for="t in ANIM" :key="t.id" type="button" role="radio" :aria-checked="animAtual === t.id" :class="{ on: animAtual === t.id }" @click="definirMovimento(t.id)"><component :is="t.icone" :size="14" :stroke-width="2" aria-hidden="true" />{{ t.rotulo }}</button>
        </div>
      </div>
    </div>

    <!-- 3. Lista -->
    <div class="setor lista">
      <button v-for="i in LISTA" :key="i.id" type="button" class="linha" :data-item-painel="i.id" @click="emit('abrir', i.id)">
        <span class="ic"><component :is="i.icone" :size="18" :stroke-width="1.9" /></span>
        <span class="tx"><b>{{ i.rotulo }}</b><small v-if="i.sub">{{ i.sub }}</small></span>
        <ChevronRight :size="18" :stroke-width="1.8" class="seta" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.perfil-conteudo { display: flex; flex-direction: column; font-family: var(--fonte-texto); color: var(--cor-texto); }
.setor { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; border-top: 1px solid var(--cor-borda); }
.setor:first-child { border-top: 0; padding-top: 0; }
.blocos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; } /* 30/10: dois e dois */
.quadrado { min-height: 76px; display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between; gap: 6px; padding: 10px; border-radius: 14px; border: 1px solid var(--cor-card-borda, var(--cor-borda)); background: var(--cor-card, var(--cor-fundo-elevado)); color: var(--cor-texto); font: 600 12px/1.2 var(--fonte-texto); text-align: left; cursor: pointer; }
.quadrado:hover { background: var(--cor-realce); }
.ic { width: 32px; height: 32px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: color-mix(in srgb, var(--cor-primaria) 12%, transparent); color: var(--cor-primaria); }
.retangulo { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 14px; border: 1px solid var(--cor-card-borda, var(--cor-borda)); background: var(--cor-card, var(--cor-fundo-elevado)); }
.ret-cab { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 10px; align-items: center; }
.ret-cab .ic { grid-row: 1 / 3; }
.ret-cab b { display: inline-flex; align-items: center; font-size: 13.5px; }
.ret-cab small { font-size: 12px; color: var(--cor-texto-suave); }
.segmentos { display: flex; gap: 4px; padding: 3px; border-radius: 12px; background: var(--cor-fundo); border: 1px solid var(--cor-borda); }
.segmentos button { flex: 1; min-height: 32px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 0; border-radius: 9px; background: none; color: var(--cor-texto-suave); font: 600 12.5px var(--fonte-texto); cursor: pointer; white-space: nowrap; }
.segmentos button.on { background: var(--cor-interface, var(--cor-primaria)); color: #fff; }
.segmentos.peq button { min-height: 28px; font-size: 11.5px; padding: 0 6px; gap: 4px; }
.ret-acoes { display: flex; gap: 8px; }
.ret-acoes select { flex: 1; min-height: 38px; border-radius: 10px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); font: 500 13px var(--fonte-texto); padding: 0 8px; }
.aplicar { min-height: 38px; padding: 0 16px; border-radius: 10px; border: 0; background: var(--cor-interface, var(--cor-primaria)); color: #fff; font: 600 13px var(--fonte-texto); cursor: pointer; }
.config { gap: 10px; }
.conf-linha { display: flex; flex-direction: column; align-items: stretch; gap: 5px; }
.conf-nome { font-size: 12.5px; font-weight: 600; color: var(--cor-texto-suave); }
.lista { gap: 2px; }
.linha { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 6px 6px; border: none; border-radius: 12px; background: none; color: var(--cor-texto); font: 600 14px var(--fonte-texto); cursor: pointer; text-align: left; }
.linha:hover { background: var(--cor-realce); }
.tx { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.tx small { font-size: 11.5px; font-weight: 400; color: var(--cor-texto-suave); }
.seta { color: var(--cor-texto-suave); }
:is(button, select):focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
</style>
