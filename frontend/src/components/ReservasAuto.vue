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
import IconeCat from './IconeCat.vue';
import { api, comCdi, moeda, dataBR } from '../services/investimentos.js';

const props = defineProps({ metas: { type: Array, default: null }, versao: { type: Number, default: 0 } });
const emit = defineEmits(['decidido']);
const pendentes = ref([]);
const guardado = ref({});
const metasProprias = ref([]);
const listaMetas = computed(() => (props.metas && props.metas.length ? props.metas : metasProprias.value));
const escolha = ref({});
const rend = ref({});
const erro = ref('');
const ocupado = ref(false);

const sugestaoRend = (p) => {
  const g = guardado.value[escolha.value[p.transacao.id]] || 0;
  const v = Math.abs(p.transacao.valor);
  return g > 0 && v > g ? Math.round((v - g) * 100) / 100 : 0;
};
function preencher() {
  pendentes.value.forEach((p) => {
    if (!escolha.value[p.transacao.id]) escolha.value[p.transacao.id] = listaMetas.value[0]?.id || '';
    if (rend.value[p.transacao.id] === undefined) rend.value[p.transacao.id] = sugestaoRend(p);
  });
}
async function carregar() {
  const r = await api('GET', '/api/reserva/auto/pendentes');
  pendentes.value = r.ok ? r.json.pendentes : [];
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
    const r = await api('POST', comCdi('/api/reserva/auto/decidir'), corpo);
    if (!r.ok) { erro.value = r.json?.erro || 'Não foi possível salvar.'; return; }
    emit('decidido', r.json);
    await carregar();
  } finally { ocupado.value = false; }
}
</script>

<template>
  <CardPadrao v-if="pendentes.length" tema="meta" class="auto tema-meta" titulo="A revisar: guardar e resgatar" subtitulo="Movimentos do extrato que parecem dinheiro guardado, não gasto nem entrada." data-reservas-auto>
    <ul class="lista">
      <li v-for="p in pendentes" :key="p.transacao.id">
        <span class="icone" aria-hidden="true"><IconeCat :chave="p.deteccao.sentido === 'resgatar' ? 'cat-entrada-resgate' : 'cat-grupo-financas'" :tamanho="20" /></span>
        <div class="corpo">
          <strong>{{ p.transacao.descricao }}</strong>
          <small>{{ dataBR(p.transacao.data) }} · {{ p.transacao.conta_nome }} · {{ moeda(Math.abs(p.transacao.valor)) }}</small>
          <p v-if="p.deteccao.sentido === 'resgatar'" class="explica">Isto parece um resgate da sua {{ p.deteccao.ativo }}. É dinheiro que você já tinha guardado, então não conta como entrada.</p>
          <p class="pergunta">{{ p.deteccao.sentido === 'guardar' ? 'Guardar' : 'Resgatar' }} {{ p.deteccao.ativo }} {{ p.deteccao.sentido === 'guardar' ? 'em' : 'de' }} qual meta?</p>
          <div class="acoes">
            <select v-model="escolha[p.transacao.id]" class="sf-entrada" :aria-label="'Meta para ' + p.transacao.descricao" @change="trocouMeta(p)">
              <option v-for="o in opcoes" :key="o.id" :value="o.id">{{ o.rotulo }}</option>
            </select>
            <label v-if="p.deteccao.sentido === 'resgatar'" class="rend">
              <span>Quanto disso foi rendimento?</span>
              <input v-model.number="rend[p.transacao.id]" type="number" min="0" step="0.01" class="sf-entrada" inputmode="decimal" />
              <small>{{ guardado[escolha[p.transacao.id]] ? 'Calculado pelo que você guardou nesta meta.' : 'Sem histórico na meta: informe ou deixe 0.' }} O rendimento entra como Rendimentos, em linha separada.</small>
            </label>
            <div class="par-botoes">
              <button type="button" class="sf-botao primario" :disabled="ocupado || !escolha[p.transacao.id]" @click="decidir(p, 'vincular')">Vincular</button>
              <button v-if="p.deteccao.sentido === 'guardar'" type="button" class="sf-botao secundario" :disabled="ocupado" @click="decidir(p, 'recusar')">Não vincular</button>
              <button v-else type="button" class="sf-botao secundario" :disabled="ocupado" title="FGTS, PIS/PASEP, previdência, consórcio, investimento antigo" @click="decidir(p, 'externo')">É dinheiro de fora do app</button>
            </div>
            <button v-if="p.deteccao.sentido === 'resgatar'" type="button" class="link" :disabled="ocupado" @click="decidir(p, 'comum')">Deixar como entrada comum</button>
          </div>
        </div>
      </li>
    </ul>
    <p v-if="erro" class="sf-erro" role="alert">{{ erro }}</p>
    <p class="nota">Guardar sem vincular fica separado do orçamento (não conta como gasto). Dinheiro de fora do app entra na categoria “Resgates e saques”.</p>
  </CardPadrao>
</template>

<style scoped>
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.lista li { display: flex; gap: 12px; align-items: flex-start; }
.icone { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: var(--cor-meta-fundo); color: var(--cor-meta); }
.corpo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
.corpo small, .nota { color: var(--cor-texto-suave); font-size: 12px; }
.nota { margin: 10px 0 0; }
.pergunta { margin: 6px 0 4px; font-size: 13px; }
.acoes { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.acoes select { flex: 1 1 140px; min-width: 0; min-height: 44px; }
.acoes .sf-botao { min-height: 44px; width: 100%; padding: 0 10px; }
.par-botoes { flex: 1 1 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.explica { margin: 6px 0 0; font-size: 13px; line-height: 1.45; color: var(--cor-texto); }
.rend { flex: 1 1 100%; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.rend input { min-height: 44px; }
.rend small { font-size: 11.5px; color: var(--cor-texto-suave); }
.link { background: none; border: none; padding: 6px 2px; color: var(--cor-texto-suave); font: 600 13px var(--fonte-texto); text-decoration: underline; cursor: pointer; }
</style>
