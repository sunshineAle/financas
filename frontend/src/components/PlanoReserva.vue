<script setup>
// "Quanto guardar" (antes "Plano da Reserva de Liberdade", anotações 41 e 43): meta = Custo de vida (fixos + essenciais)
// × meses de proteção (3, 6 ou 12). Mostra quanto guardar por mês (e % das entradas), o prazo e o progresso atual;
// "Criar/atualizar meta" grava a meta "Reserva de Liberdade" em Objetivos. Entradas = média dos 3 últimos meses (editável).
// Parcelas e gastos não essenciais NÃO entram. Se o custo de vida mudar mais de 10% em relação à meta salva, avisa.
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
const fixos = ref(0); // custo de vida (fixos + essenciais)
const soFixos = ref(0);
const essenciais = ref(0);
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
// Meta salva × custo de vida atual: mudou mais de 10%? (anotação 41)
// O plano salvo (meses, prazo e o custo de vida da época) fica neste aparelho, para comparar depois.
const CHAVE_PLANO = 'sf:plano-reserva';
const planoSalvo = ref((() => { try { return JSON.parse(localStorage.getItem(CHAVE_PLANO) || 'null'); } catch { return null; } })());
if (planoSalvo.value) { meses.value = String(planoSalvo.value.meses || '6'); prazo.value = Number(planoSalvo.value.prazo) || 12; }
const mudouCusto = computed(() => {
  const antes = Number(planoSalvo.value?.custo || 0);
  if (!principal.value || !antes || !(fixos.value > 0)) return false;
  return Math.abs(fixos.value - antes) / antes > 0.1;
});

async function carregar() {
  const [cf, rs, pv] = await Promise.all([
    api('GET', '/api/custos-fixos'),
    api('GET', '/api/reserva'),
    api('GET', '/api/custos-fixos/previsao?meses=2'),
  ]);
  soFixos.value = cf.ok ? Number(cf.json?.totalAtivos) || 0 : 0;
  essenciais.value = cf.ok ? Number(cf.json?.totalEssenciais) || 0 : 0;
  fixos.value = cf.ok ? Number(cf.json?.custoDeVida ?? cf.json?.totalAtivos) || 0 : 0;
  reserva.value = rs.ok ? rs.json : null;
  salarioMedio.value = pv.ok ? Number(pv.json?.entradasMedia) || 0 : 0;
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
    planoSalvo.value = { meses: meses.value, prazo: prazo.value, custo: fixos.value };
    try { localStorage.setItem(CHAVE_PLANO, JSON.stringify(planoSalvo.value)); } catch { /* só nesta sessão */ }
    avisar('Meta da Reserva de Liberdade salva em Objetivos.', { tipo: 'ok' });
  } finally { salvando.value = false; }
}
</script>

<template>
  <CardPadrao titulo="Quanto guardar" subtitulo="para a sua Reserva de Liberdade" tema="meta" class="plano" data-plano-reserva>
    <p v-if="!carregado" class="suave">Calculando…</p>
    <p v-else-if="semFixos" class="suave">Cadastre o seu <RouterLink to="/custos-fixos">Custo de vida</RouterLink> (fixos e essenciais) para calcular a meta da Reserva de Liberdade.</p>
    <template v-else>
      <div v-if="mudouCusto" class="aviso-custo" role="status" data-aviso-custo>
        <span>Seu custo de vida {{ fixos > Number(planoSalvo.custo) ? 'subiu' : 'caiu' }} para <b><Valor :valor="fixos" /></b> por mês. Atualizar a meta?</span>
        <button type="button" class="mini" :disabled="salvando" @click="gravar">Atualizar meta</button>
      </div>
      <div class="bloco">
        <span class="rotulo">Meses de proteção</span>
        <AbasSeletor v-model="meses" :abas="MESES_PROTECAO" tema="meta" bloco />
      </div>
      <div class="meta-linha">
        <span class="icone"><ShieldCheck :size="22" :stroke-width="1.8" /></span>
        <span class="texto"><small>Meta sugerida · custo de vida {{ moeda(fixos) }} × {{ meses }}</small><b class="numero-tabular" data-meta><Valor :valor="meta" /></b></span>
      </div>
      <p class="composicao">Custo de vida = fixos {{ moeda(soFixos) }} + essenciais {{ moeda(essenciais) }}. Parcelas e gastos não essenciais não entram.</p>
      <div class="bloco">
        <BarraDegrade :pct="progresso" de="var(--cor-meta)" ate="var(--cor-investimento)" />
        <small class="suave">Você já tem <Valor :valor="atual" /> ({{ progresso }}%)<template v-if="falta > 0"> · faltam <Valor :valor="falta" /></template><template v-else> · meta atingida</template></small>
      </div>
      <CampoSelecao v-model="prazo" rotulo="Prazo para atingir" :opcoes="PRAZOS" tema="meta" />
      <CampoValor v-model="salario" rotulo="Suas entradas por mês" tema="meta" :dica="salarioMedio > 0 ? `Média dos últimos 3 meses: ${moeda(salarioMedio)}. Pode ajustar.` : 'Sem entradas nos últimos meses. Informe para ver o percentual.'" />
      <div v-if="falta > 0" class="guardar" data-guardar>
        <span>Guarde por mês</span>
        <b class="numero-tabular"><Valor :valor="porMes" /></b>
        <small v-if="pctSalario > 0">{{ String(pctSalario).replace('.', ',') }}% das suas entradas · em {{ prazo }} meses</small>
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
.composicao { margin: -4px 0 12px; font-size: 12.5px; line-height: 1.45; color: var(--cor-texto-suave); }
.aviso-custo { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 12px; margin-bottom: 14px; border-radius: 12px; background: color-mix(in srgb, var(--cor-meta) 10%, transparent); border: 1px solid color-mix(in srgb, var(--cor-meta) 30%, transparent); font-size: 13.5px; line-height: 1.45; }
.aviso-custo span { flex: 1; min-width: 180px; }
.mini { min-height: 36px; padding: 0 12px; border-radius: 10px; border: none; color: var(--cor-sobre-cor); background: linear-gradient(135deg, var(--cor-meta), var(--cor-investimento)); font: 600 13px var(--fonte-texto); cursor: pointer; }
.botao { width: 100%; min-height: 44px; border: none; border-radius: 12px; color: var(--cor-sobre-cor); background: linear-gradient(135deg, var(--cor-meta), var(--cor-investimento)); font-family: var(--fonte-texto); font-size: 15px; font-weight: 600; cursor: pointer; }
.botao:disabled { opacity: 0.5; cursor: default; }
</style>
