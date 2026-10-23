<script setup>
// Sugestões de reserva automática: "Aplicação Caixinha", "Meu Porquinho", "Resgate CDB" encontrados no extrato.
// Confirmar = vincula a uma meta (a meta e o rendimento pelo CDI são atualizados). Recusar = o valor fica separado do orçamento.
import { ref, computed, onMounted, watch } from 'vue';
import CardPadrao from './CardPadrao.vue';
import { PiggyBank } from 'lucide-vue-next';
import { api, comCdi, moeda, dataBR } from '../services/investimentos.js';

const props = defineProps({ metas: { type: Array, default: () => [] }, versao: { type: Number, default: 0 } });
const emit = defineEmits(['decidido']);
const pendentes = ref([]);
const escolha = ref({});
const erro = ref('');
const ocupado = ref(false);

async function carregar() {
  const r = await api('GET', '/api/reserva/auto/pendentes');
  pendentes.value = r.ok ? r.json.pendentes : [];
  pendentes.value.forEach((p) => {
    if (!escolha.value[p.transacao.id]) escolha.value[p.transacao.id] = props.metas[0]?.id || '';
  });
}
onMounted(carregar);
watch(() => props.versao, carregar);
watch(() => props.metas.length, () => pendentes.value.forEach((p) => { if (!escolha.value[p.transacao.id]) escolha.value[p.transacao.id] = props.metas[0]?.id || ''; }));

const opcoes = computed(() => props.metas.map((m) => ({ id: m.id, rotulo: m.nome })));

async function decidir(p, acao) {
  erro.value = '';
  ocupado.value = true;
  try {
    const r = await api('POST', comCdi('/api/reserva/auto/decidir'), { transacaoId: p.transacao.id, acao, metaId: escolha.value[p.transacao.id] || null });
    if (!r.ok) { erro.value = r.json?.erro || 'Não foi possível salvar.'; return; }
    emit('decidido', r.json);
    await carregar();
  } finally { ocupado.value = false; }
}
</script>

<template>
  <CardPadrao v-if="pendentes.length" tema="meta" class="auto" titulo="Vincular a uma meta?" subtitulo="Encontramos no extrato movimentos que parecem reserva guardada, não gasto.">
    <ul class="lista">
      <li v-for="p in pendentes" :key="p.transacao.id">
        <span class="icone" aria-hidden="true"><PiggyBank :size="20" /></span>
        <div class="corpo">
          <strong>{{ p.transacao.descricao }}</strong>
          <small>{{ dataBR(p.transacao.data) }} · {{ p.transacao.conta_nome }} · {{ moeda(Math.abs(p.transacao.valor)) }}</small>
          <p class="pergunta">{{ p.deteccao.sentido === 'guardar' ? 'Guardar' : 'Resgatar' }} {{ p.deteccao.ativo }} {{ p.deteccao.sentido === 'guardar' ? 'em' : 'de' }} qual meta?</p>
          <div class="acoes">
            <select v-model="escolha[p.transacao.id]" class="sf-entrada" :aria-label="'Meta para ' + p.transacao.descricao">
              <option v-for="o in opcoes" :key="o.id" :value="o.id">{{ o.rotulo }}</option>
            </select>
            <button type="button" class="sf-botao primario" :disabled="ocupado || !escolha[p.transacao.id]" @click="decidir(p, 'vincular')">Vincular</button>
            <button type="button" class="sf-botao secundario" :disabled="ocupado" @click="decidir(p, 'recusar')">Não vincular</button>
          </div>
        </div>
      </li>
    </ul>
    <p v-if="erro" class="sf-erro" role="alert">{{ erro }}</p>
    <p class="nota">Se você não vincular, o valor fica separado do orçamento (não conta como gasto).</p>
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
.acoes .sf-botao { min-height: 44px; }
</style>
