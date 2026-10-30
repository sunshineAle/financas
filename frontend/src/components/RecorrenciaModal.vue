<script setup>
// "Criar recorrência" (homologação 1.0, seção 12 — regra do Contador): um gasto que se repete todo mês, COM prazo
// (ex.: 5 meses, a partir deste mês) ou SEM prazo. Entra no Custo de vida como item fixo (POST /api/custos-fixos) e,
// por isso, na previsão do Saldo do mês. Não lança transações: o que de fato sair continua vindo do extrato.
import { ref, watch, computed } from 'vue';
import FormularioModal from './FormularioModal.vue';
import CampoTexto from './CampoTexto.vue';
import CampoValor from './CampoValor.vue';
import CampoSelecao from './CampoSelecao.vue';
import CampoCategoria from './CampoCategoria.vue';
import CampoTipo from './CampoTipo.vue';
import { recorrenciaAberta, acaoRapidaFoiSalva } from '../services/acoesRapidas.js';
import { avisar } from '../services/avisos.js';

const DIAS = Array.from({ length: 31 }, (_, i) => ({ valor: i + 1, rotulo: `Dia ${i + 1}` }));
const hoje = new Date();
const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
const vazio = () => ({ nome: '', valor: 0, dia: Math.min(28, hoje.getDate()), categoriaId: '', prazo: 'sem', meses: 5 });
const f = ref(vazio());
const erros = ref({});
const erro = ref('');
const salvando = ref(false);
watch(recorrenciaAberta, (v) => { if (v) { f.value = vazio(); erros.value = {}; erro.value = ''; } });

const NOMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const resumo = computed(() => {
  const x = f.value;
  if (x.prazo === 'sem') return 'Todo mês, sem data para acabar. Entra no Custo de vida e na previsão.';
  const n = Number(x.meses) || 0;
  if (n < 1) return '';
  const t = hoje.getFullYear() * 12 + hoje.getMonth() + n - 1;
  return `${n} ${n === 1 ? 'mês' : 'meses'}: de ${NOMES[hoje.getMonth()]} até ${NOMES[t % 12]} de ${Math.floor(t / 12)}. Depois sai do Custo de vida sozinho.`;
});

async function salvar() {
  const x = f.value;
  erros.value = {};
  if (!x.nome.trim()) erros.value.nome = 'Dê um nome. Ex.: Academia.';
  if (!(Number(x.valor) > 0)) erros.value.valor = 'Informe o valor de cada mês.';
  if (x.prazo === 'com' && !(Number(x.meses) >= 1)) erros.value.meses = 'Informe por quantos meses.';
  if (Object.keys(erros.value).length) return;
  salvando.value = true; erro.value = '';
  try {
    const r = await fetch('/api/custos-fixos', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: x.nome.trim(), valor: Number(x.valor), dia: Number(x.dia), categoriaId: x.categoriaId || null, meses: x.prazo === 'com' ? Number(x.meses) : null, inicioMes: mesAtual }),
    });
    const d = await r.json();
    if (!r.ok) { erro.value = d.erro || 'Não foi possível criar a recorrência.'; return; }
    recorrenciaAberta.value = false;
    acaoRapidaFoiSalva();
    avisar(`Recorrência "${d.nome}" criada no Custo de vida.`, { rota: '/custos-fixos' });
  } catch { erro.value = 'Não foi possível criar a recorrência.'; } finally { salvando.value = false; }
}
</script>

<template>
  <FormularioModal :aberto="recorrenciaAberta" titulo="Criar recorrência" ajuda="recorrencia" tema="saida" rotulo-salvar="Criar recorrência" :carregando="salvando" :erro="erro" @salvar="salvar" @fechar="recorrenciaAberta = false">
    <CampoValor v-model="f.valor" tipo="saida" rotulo="Valor de cada mês" :erro="erros.valor" autofocus />
    <CampoTexto v-model="f.nome" rotulo="Nome" placeholder="Ex.: Academia, Curso, Aluguel" maxlength="80" :erro="erros.nome" />
    <CampoSelecao v-model="f.dia" rotulo="Dia do mês" :opcoes="DIAS" />
    <CampoTipo v-model="f.prazo" rotulo="Prazo" :opcoes="[{ id: 'sem', rotulo: 'Sem prazo', tema: 'saida' }, { id: 'com', rotulo: 'Com prazo', tema: 'saida' }]" />
    <CampoTexto v-if="f.prazo === 'com'" v-model="f.meses" rotulo="Por quantos meses" type="number" min="1" max="120" inputmode="numeric" :erro="erros.meses" />
    <p v-if="resumo" class="resumo">{{ resumo }}</p>
    <CampoCategoria v-model="f.categoriaId" tipo="saida" tema="saida" rotulo="Categoria (opcional)" automatica="Sem categoria" />
  </FormularioModal>
</template>

<style scoped>
.resumo { margin: 0; font-size: 13px; color: var(--cor-texto-suave); border: 1px dashed var(--cor-borda); border-radius: 10px; padding: 10px 12px; }
</style>
