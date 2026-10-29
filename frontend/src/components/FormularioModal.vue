<script setup>
// <FormularioModal> — janela de cadastro/edição moderna, pronta para uso. Celular = folha que sobe da base;
// PC = janela centralizada (comportamento herdado de <Modal>). Rodapé fixo com Cancelar + Salvar em degradê do tema.
// Dentro dele use os <Campo*> (CampoTexto, CampoValor, CampoData, CampoSelecao, CampoConta, CampoCategoria, CampoTipo).
//
// Props
//   aberto, titulo
//   tema            'entrada'|'saida'|'meta'|'investimento'|'neutro' — cor de foco/botão (padrão neutro). Pode ser reativo (ex.: :tema="tipo").
//   rotuloSalvar    padrão 'Salvar'      rotuloCancelar  padrão 'Cancelar'
//   carregando      boolean: desabilita e mostra "Salvando..."
//   erro            string: erro GERAL do envio (ex.: falha do servidor), mostrado acima dos botões
//   semCancelar     boolean
//   largura         px máx. no PC (padrão 520)
// Eventos: @salvar (submit do <form>, também com Enter), @fechar (Cancelar, X, Esc, fora)
// Slots: default (campos), #extra (rodapé, ao lado dos botões, ex.: botão "Excluir"), #salvar (conteúdo do botão primário)
// Exemplo:
//   <FormularioModal :aberto="aberto" titulo="Nova entrada" :tema="tipo" :carregando="salvando" :erro="erroGeral" @salvar="salvar" @fechar="aberto=false">
//     <CampoTipo v-model="tipo" />
//     <CampoValor v-model="valor" :tipo="tipo" :erro="erros.valor" />
//     <CampoTexto v-model="descricao" rotulo="Descrição" />
//     <CampoData v-model="data" atalhos />
//   </FormularioModal>
import '../styles/formularios.css';
import Modal from './Modal.vue';
import { AlertCircle } from 'lucide-vue-next';

defineProps({
  aberto: Boolean,
  titulo: { type: String, default: '' },
  tema: { type: String, default: 'neutro' },
  rotuloSalvar: { type: String, default: 'Salvar' },
  rotuloCancelar: { type: String, default: 'Cancelar' },
  carregando: Boolean,
  erro: { type: String, default: '' },
  semCancelar: Boolean,
  largura: { type: Number, default: 520 },
  ajuda: { type: String, default: '' }, // id em config/ajudaSecoes.js: "?" ao lado do título (anotação 64)
});
defineEmits(['salvar', 'fechar']);
</script>

<template>
  <Modal :aberto="aberto" :titulo="titulo" :tema="tema" :largura="largura" :ajuda="ajuda" @fechar="$emit('fechar')">
    <form :id="'form-' + titulo.replace(/\W+/g, '-')" class="form-corpo" novalidate @submit.prevent="$emit('salvar')">
      <slot />
      <button type="submit" class="submit-oculto" tabindex="-1" aria-hidden="true"></button>
    </form>
    <template #rodape>
      <p v-if="erro" class="sf-erro geral" role="alert"><AlertCircle :size="15" />{{ erro }}</p>
      <div :class="['botoes', 'tema-' + tema]">
        <slot name="extra" />
        <button v-if="!semCancelar" type="button" class="sf-botao secundario" :disabled="carregando" @click="$emit('fechar')">{{ rotuloCancelar }}</button>
        <button type="button" class="sf-botao primario" :disabled="carregando" @click="$emit('salvar')"><slot name="salvar">{{ carregando ? 'Salvando...' : rotuloSalvar }}</slot></button>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.form-corpo { display: flex; flex-direction: column; gap: 16px; }
.submit-oculto { position: absolute; width: 0; height: 0; opacity: 0; padding: 0; border: 0; }
.geral { margin: 0 0 10px; }
.botoes { display: flex; gap: 10px; justify-content: flex-end; }
.botoes .sf-botao { flex: 1; }
@media (min-width: 769px) { .botoes .sf-botao { flex: 0 0 auto; min-width: 130px; } }
</style>
