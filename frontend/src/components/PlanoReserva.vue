<script setup>
// Plano da Reserva de Liberdade (Perfil > Minhas finanças): meta sugerida = custos fixos mensais × meses de proteção (3, 6 ou 12).
// Mostra quanto guardar por mês (e % do salário), o prazo e o progresso atual; "Criar/atualizar meta" grava a meta
// "Reserva de Liberdade" (liquidez rápida) em Objetivos. Salário = média das entradas de Salário dos últimos meses (editável).
import { ref, computed, onMounted } from 'vue';
import { ShieldCheck } from 'lucide-vue-next';
import CardPadrao from './CardPadrao.vue';
import AbasSeletor from './AbasSeletor.vue';
import CampoValor from './CampoValor.vue';
import CampoSelecao from './CampoSelecao.vue';
import BarraDegrade from './BarraDegrade.vue';
import Valor from './Valor.vue';
import { api, moeda } from '../services/investimentos.js';
import { avisar } from '../services/avisos.js';

const MESES_PROTECAO = [{ id: '3', rotulo: '3 meses' }, { id: '6', rotulo: '6 meses' }, { id: '12', rotulo: '12 meses' }];
const PRAZOS = [6, 12, 18, 24, 36].map((m) => ({ valor: m, rotulo: `${m} meses` }));
const arred = (v) => Math.round((Number(v) || 0) * 100) / 100;

const carregado = ref(false);
const meses = ref('6');
const prazo = ref(12);
const fixos = ref(0);
const salarioMedio = ref(0);
const salario = ref(0); // editável; começa na média
const reserva = ref(null);
const salvando = ref(false);

const meta = computed(() => arred(fixos.value * Number(meses.value)));
const atual = computed(() => arred(reserva.value?.valor_atual || 0));
const falta = computed(() => arred(Math.max(0, meta.value - atual.value)));
const porMes = computed(() => (falta.value > 0 ? arred(falta.value / prazo.value) : 0));
const pctSalario = computed(() => (salario.value > 0 && porMes.value > 0 ? Math.round((porMes.value / salario.value) * 1000) / 10 : 0));
const progresso = computed(() => (meta.value > 0 ? Math.min(100, Math.round((atual.value / meta.value) * 100)) : 0));
const principal = computed(() => reserva.value?.metas?.[0] || null);
const semFixos = computed(() => carregado.value && !(fixos.value > 0));

function mesesAtras(n) {
  const d = new Date();
  const x = new Date(d.getFullYear(), d.getMonth() - n, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

async function carregar() {
  const [cf, rs, ...receitas] = await Promise.all([
    api('GET', '/api/custos-fixos'),
    api('GET', '/api/reserva'),
    ...[1, 2, 3].map((n) => api('GET', `/api/transacoes/resumo-receitas?mes=${mesesAtras(n)}`)),
  ]);
  fixos.value = cf.ok ? Number(cf.json?.totalAtivos) || 0 : 0;
  reserva.value = rs.ok ? rs.json : null;
  const valores = receitas
    .map((r) => (r.ok && Array.isArray(r.json) ? r.json.find((c) => /^sal[aá]rio$/i.test(c.nome)) : null))
    .map((c) => Number(c?.valor) || 0)
    .filter((v) => v > 0);
  salarioMedio.value = valores.length ? arred(valores.reduce((s, v) => s + v, 0) / valores.length) : 0;
  salario.value = salarioMedio.value;
  carregado.value = true;
}
onMounted(carregar);

function prazoData(m) {
  const d = new Date();
  const x = new Date(d.getFullYear(), d.getMonth() + m, Math.min(d.getDate(), 28));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

async function gravar() {
  if (meta.value <= 0 || salvando.value) return;
  salvando.value = true;
  try {
    const corpo = { nome: 'Reserva de Liberdade', valorMeta: meta.value, prazo: prazoData(prazo.value), icone: '🛡️' };
    if (principal.value && !principal.value.tipo_investimento) corpo.tipoInvestimento = 'cdb';
    let r;
    if (principal.value) r = await api('PUT', `/api/reserva/metas/${principal.value.id}`, corpo);
    else r = await api('POST', '/api/reserva/metas', { ...corpo, tipoInvestimento: 'cdb' });
    if (!r.ok) { avisar(r.json?.erro || 'Não foi possível salvar a meta.', { tipo: 'erro' }); return; }
    reserva.value = r.json;
    avisar('Meta da Reserva de Liberdade salva em Objetivos.');
  } finally { salvando.value = false; }
}
</script>

<template>
  <CardPadrao titulo="Plano da Reserva de Liberdade" subtitulo="quanto guardar para ter tranquilidade" tema="meta" class="plano" data-plano-reserva>
    <p v-if="!carregado" class="suave">Calculando…</p>
    <p v-else-if="semFixos" class="suave">Cadastre seus custos fixos para calcular a meta da Reserva de Liberdade.</p>
    <template v-else>
      <div class="bloco">
        <span class="rotulo">Meses de proteção</span>
        <AbasSeletor v-model="meses" :abas="MESES_PROTECAO" tema="meta" bloco />
      </div>
      <div class="meta-linha">
        <span class="icone"><ShieldCheck :size="22" :stroke-width="1.8" /></span>
        <span class="texto"><small>Meta sugerida · custos fixos {{ moeda(fixos) }} × {{ meses }}</small><b class="numero-tabular" data-meta><Valor :valor="meta" /></b></span>
      </div>
      <div class="bloco">
        <BarraDegrade :pct="progresso" de="var(--cor-meta)" ate="var(--cor-investimento)" />
        <small class="suave">Você já tem <Valor :valor="atual" /> ({{ progresso }}%)<template v-if="falta > 0"> · faltam <Valor :valor="falta" /></template><template v-else> · meta atingida</template></small>
      </div>
      <CampoSelecao v-model="prazo" rotulo="Prazo para atingir" :opcoes="PRAZOS" tema="meta" />
      <CampoValor v-model="salario" rotulo="Seu salário mensal" tema="meta" :dica="salarioMedio > 0 ? `Média dos últimos meses: ${moeda(salarioMedio)}. Pode ajustar.` : 'Sem entradas de Salário nos últimos meses. Informe para ver o percentual.'" />
      <div v-if="falta > 0" class="guardar" data-guardar>
        <span>Guarde por mês</span>
        <b class="numero-tabular"><Valor :valor="porMes" /></b>
        <small v-if="pctSalario > 0">{{ String(pctSalario).replace('.', ',') }}% do seu salário</small>
      </div>
    </template>
    <template v-if="carregado && !semFixos" #rodape>
      <button type="button" class="botao" :disabled="salvando || meta <= 0" @click="gravar">{{ principal ? 'Atualizar meta em Objetivos' : 'Criar meta em Objetivos' }}</button>
    </template>
  </CardPadrao>
</template>

<style scoped>
.plano { margin-top: 12px; }
.bloco { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.rotulo { font-size: 13px; font-weight: 600; color: var(--cor-texto-suave); }
.suave { margin: 0; font-size: 13px; color: var(--cor-texto-suave); }
.meta-linha { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.icone { width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: var(--cor-sobre-cor); background: linear-gradient(135deg, var(--cor-meta), var(--cor-investimento)); flex-shrink: 0; }
.texto { display: flex; flex-direction: column; min-width: 0; }
.texto small { font-size: 12.5px; color: var(--cor-texto-suave); }
.texto b { font-family: var(--fonte-display); font-size: 24px; }
.guardar { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 14px; background: var(--cor-realce); margin-top: 6px; }
.guardar span { font-size: 13px; color: var(--cor-texto-suave); }
.guardar b { font-family: var(--fonte-display); font-size: 22px; }
.guardar small { font-size: 13px; color: var(--cor-texto-suave); }
.botao { width: 100%; min-height: 44px; border: none; border-radius: 12px; color: var(--cor-sobre-cor); background: linear-gradient(135deg, var(--cor-meta), var(--cor-investimento)); font-family: var(--fonte-texto); font-size: 15px; font-weight: 600; cursor: pointer; }
.botao:disabled { opacity: 0.5; cursor: default; }
</style>
