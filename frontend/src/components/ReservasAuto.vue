<script setup>
// Sugestões de reserva automática: "Aplicação Caixinha", "Meu Porquinho", "Resgate CDB" encontrados no extrato.
// Guardar: vincular a uma meta, ou não vincular (fica separado do orçamento).
// Resgate (anotação 38, regra do Contador): dinheiro que já era do usuário mudando de lugar NÃO é entrada; só o rendimento é.
//   - Vincular a uma meta → Resgatar (sai das Entradas); o rendimento dentro do valor vira linha própria, em verde;
//   - É dinheiro de fora do app (FGTS, PIS/PASEP, previdência, consórcio...) → entrada em "Resgates e saques";
//   - Deixar como entrada comum (o usuário decide; o app não insiste).
// Aparece em Objetivos e no topo de Transações (a revisar). Sem `metas`, busca sozinho.
import { ref, computed, onMounted, watch } from 'vue';
import CardPadrao from './CardPadrao.vue';
import LinhaTransacao from './LinhaTransacao.vue';
import { api, comCdi } from '../services/investimentos.js';
import { avisar } from '../services/avisos.js';

const props = defineProps({ metas: { type: Array, default: null }, versao: { type: Number, default: 0 } });
const emit = defineEmits(['decidido', 'quantidade']);
const pendentes = ref([]);
const guardado = ref({});
const metasProprias = ref([]);
const listaMetas = computed(() => (props.metas && props.metas.length ? props.metas : metasProprias.value));
const escolha = ref({});
const rend = ref({});
const regra = ref({}); // anotação 56: escolha manual da caixinha vira regra (apelido da caixinha na meta)
const opcoesDe = (p) => (p.opcoes && p.opcoes.length ? p.opcoes.map((m) => ({ id: m.id, rotulo: m.nome })) : opcoes.value);
const erro = ref('');
const ocupado = ref(false);

const sugestaoRend = (p) => {
  const g = guardado.value[escolha.value[p.transacao.id]] || 0;
  const v = Math.abs(p.transacao.valor);
  return g > 0 && v > g ? Math.round((v - g) * 100) / 100 : 0;
};
function preencher() {
  pendentes.value.forEach((p) => {
    if (!escolha.value[p.transacao.id]) escolha.value[p.transacao.id] = (p.opcoes && p.opcoes[0] ? p.opcoes[0].id : listaMetas.value[0]?.id) || '';
    if (rend.value[p.transacao.id] === undefined) rend.value[p.transacao.id] = sugestaoRend(p);
  });
}
async function carregar() {
  const r = await api('GET', '/api/reserva/auto/pendentes');
  pendentes.value = r.ok ? r.json.pendentes : [];
  emit('quantidade', pendentes.value.length);
  guardado.value = (r.ok && r.json.guardado) || {};
  if (!props.metas && pendentes.value.length && !metasProprias.value.length) {
    const m = await api('GET', comCdi('/api/reserva'));
    metasProprias.value = (m.ok && m.json && m.json.metas) || [];
  }
  preencher();
}
onMounted(carregar);
watch(() => props.versao, carregar);
watch(() => listaMetas.value.length, preencher);
function trocouMeta(p) { rend.value[p.transacao.id] = sugestaoRend(p); }

const opcoes = computed(() => listaMetas.value.map((m) => ({ id: m.id, rotulo: m.nome })));

async function decidir(p, acao) {
  erro.value = '';
  ocupado.value = true;
  try {
    const corpo = { transacaoId: p.transacao.id, acao, metaId: escolha.value[p.transacao.id] || null };
    if (acao === 'vincular' && p.deteccao.sentido === 'resgatar') corpo.rendimento = Number(rend.value[p.transacao.id]) || 0;
    if (acao === 'vincular' && p.deteccao.caixinha && regra.value[p.transacao.id]) corpo.regra = true;
    const r = await api('POST', comCdi('/api/reserva/auto/decidir'), corpo);
    if (!r.ok) { erro.value = r.json?.erro || 'Não foi possível salvar.'; return; }
    if (r.json && r.json.regra) avisar(`Regra criada: “${r.json.regra}” vai sempre para esta meta.`, { tipo: 'ok', grupo: 'sugestao-regra' });
    emit('decidido', r.json);
    await carregar();
  } finally { ocupado.value = false; }
}
</script>

<template>
  <!-- 1.2 (05/11): página própria /revisar; cada item enxuto — linha, meta + valor lado a lado, botões -->
  <CardPadrao v-if="pendentes.length" tema="meta" class="auto tema-meta" titulo="Guardar e resgatar" data-reservas-auto>
    <ul class="lista">
      <li v-for="p in pendentes" :key="p.transacao.id" class="item">
        <LinhaTransacao class="linha-revisar" :t="{ ...p.transacao, a_revisar: true }" :info="{ nome: p.deteccao.rotulo, neutra: true, tipoNeutro: 'reserva' }" :clicavel="false" />
        <div class="campos" :class="{ dois: p.deteccao.sentido === 'resgatar' }">
          <label class="campo">
            <span>{{ p.deteccao.sentido === 'guardar' ? 'Guardar em' : 'Resgatar de' }}</span>
            <select v-model="escolha[p.transacao.id]" class="sf-entrada" :aria-label="'Meta para ' + p.transacao.descricao" @change="trocouMeta(p)">
              <option v-for="o in opcoesDe(p)" :key="o.id" :value="o.id">{{ o.rotulo }}</option>
            </select>
          </label>
          <label v-if="p.deteccao.sentido === 'resgatar'" class="campo valor" title="O rendimento entra como Rendimentos, em linha separada">
            <span>Rendimento</span>
            <input v-model.number="rend[p.transacao.id]" type="number" min="0" step="0.01" class="sf-entrada" inputmode="decimal" placeholder="0,00" />
          </label>
        </div>
        <label v-if="p.deteccao.caixinha && p.trecho" class="regra"><input v-model="regra[p.transacao.id]" type="checkbox" /> Sempre usar esta meta</label>
        <div class="botoes" :class="{ tres: p.deteccao.sentido === 'resgatar' }">
          <button type="button" class="sf-botao primario" :disabled="ocupado || !escolha[p.transacao.id]" @click="decidir(p, 'vincular')">Vincular</button>
          <button v-if="p.deteccao.sentido === 'guardar'" type="button" class="sf-botao secundario" :disabled="ocupado" title="Fica separado do orçamento (não conta como gasto)" @click="decidir(p, 'recusar')">Não vincular</button>
          <template v-else>
            <button type="button" class="sf-botao secundario" :disabled="ocupado" title="FGTS, PIS/PASEP, previdência, consórcio: entra em Resgates e saques" @click="decidir(p, 'externo')">De fora</button>
            <button type="button" class="sf-botao secundario" :disabled="ocupado" title="Conta como entrada comum" @click="decidir(p, 'comum')">Entrada</button>
          </template>
        </div>
      </li>
    </ul>
    <p v-if="erro" class="sf-erro" role="alert">{{ erro }}</p>
  </CardPadrao>
</template>

<style scoped>
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.item { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; border-top: 1px solid var(--cor-borda); }
.item:first-child { border-top: none; padding-top: 2px; }
.linha-revisar { margin: 0 -6px; }
.campos { display: grid; grid-template-columns: 1fr; gap: 8px; }
.campos.dois { grid-template-columns: minmax(0, 1fr) minmax(0, 0.7fr); }
.campo { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: 12px; color: var(--cor-texto-suave); }
.campo select, .campo input { min-height: 44px; width: 100%; min-width: 0; }
.regra { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--cor-texto-suave); }
.regra input { width: 18px; height: 18px; accent-color: var(--cor-meta); }
.botoes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.botoes.tres { grid-template-columns: 1.2fr 1fr 1fr; }
.botoes .sf-botao { min-height: 42px; width: 100%; padding: 0 8px; }
</style>
