<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import Orbe from '../components/Orbe.vue';

const router = useRouter();
// Orbe de abertura: quatro cores da paleta se fundindo
const partesOrbe = [
  { nome: 'Entradas', valor: 1, cor: 'var(--entrada-royal-medio)' },
  { nome: 'Metas', valor: 1, cor: 'var(--meta-violeta-medio)' },
  { nome: 'Saídas', valor: 1, cor: 'var(--saida-carmim-medio)' },
  { nome: 'Alerta', valor: 1, cor: 'var(--saida-ambar-medio)' },
  { nome: 'Investimentos', valor: 1, cor: 'var(--investimento-esmeralda-medio)' },
];

const email = ref('');
const senha = ref('');
const lembrarDispositivo = ref(false);
const carregando = ref(false);
const erro = ref('');

async function entrar() {
  erro.value = '';
  carregando.value = true;
  try {
    const resposta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: email.value,
        senha: senha.value,
        lembrarDispositivo: lembrarDispositivo.value,
      }),
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      erro.value = dados.erro || 'Não foi possível entrar.';
      return;
    }

    router.push('/');
  } catch (e) {
    erro.value = 'Não foi possível falar com o servidor. Verifique sua conexão.';
  } finally {
    carregando.value = false;
  }
}
</script>

<template>
  <div class="tela-login">
    <section class="painel-hero">
      <!-- Orbe de abertura: uma só esfera onde azul, vermelho-âmbar, roxo e verde se misturam, girando suave -->
      <div class="orbe-entrada" aria-hidden="true">
        <Orbe :partes="partesOrbe" :tamanho="340" :arcos="false" girar />
      </div>
      <span class="titulo-hero">Dagda Capital</span>
      <p class="frase-hero">Organização e controle das suas finanças, num só lugar.</p>
    </section>

    <section class="painel-form">
      <form class="formulario" @submit.prevent="entrar">
        <h1>Entrar</h1>
        <p class="subtitulo">Acesso restrito — este sistema é de uso pessoal.</p>

        <label class="campo">
          <span>E-mail</span>
          <input
            v-model="email"
            type="email"
            autocomplete="username"
            required
            placeholder="voce@exemplo.com"
          />
        </label>

        <label class="campo">
          <span>Senha</span>
          <input
            v-model="senha"
            type="password"
            autocomplete="current-password"
            required
            placeholder="••••••••"
          />
        </label>

        <label class="campo-checkbox">
          <input v-model="lembrarDispositivo" type="checkbox" />
          <span>Lembrar este dispositivo</span>
        </label>

        <p v-if="erro" class="mensagem-erro">{{ erro }}</p>

        <button type="submit" :disabled="carregando">
          {{ carregando ? 'Entrando…' : 'Entrar' }}
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.tela-login {
  min-height: 100%;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
}

@media (max-width: 860px) {
  .tela-login {
    grid-template-columns: 1fr;
  }
  .painel-hero {
    min-height: 240px;
    border-right: none;
    border-bottom: 1px solid var(--cor-borda);
    padding: 32px 24px;
  }
}

.painel-hero {
  background: var(--cor-fundo-sidebar);
  border-right: 1px solid var(--cor-borda);
  color: var(--cor-texto);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 48px 32px;
  gap: 20px;
  overflow: hidden;
}

@media (max-width: 860px) {
  .painel-hero { border-right: none; border-bottom: 1px solid var(--cor-borda); padding: 32px 24px; }
}

/* Orbe de abertura (componente compartilhado Orbe) */
.orbe-entrada { width: min(340px, 62vw); flex: none; }

.titulo-hero {
  font-family: var(--fonte-display);
  font-weight: 700;
  font-size: clamp(24px, 3vw, 32px);
}

.frase-hero {
  max-width: 34ch;
  font-size: 17px;
  line-height: 1.5;
  opacity: 0.9;
}

.painel-form {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.formulario {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.formulario h1 {
  font-family: var(--fonte-display);
  font-size: 28px;
  margin: 0;
}

.subtitulo {
  margin: -8px 0 8px;
  color: var(--cor-texto-suave);
  font-size: 14px;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
}

.campo input {
  font-family: var(--fonte-texto);
  font-size: 15px;
  padding: 11px 14px;
  border-radius: 10px;
  border: 1px solid var(--cor-borda);
  background: var(--cor-fundo-elevado);
  color: var(--cor-texto);
}

.campo input:focus-visible {
  outline: 2px solid var(--cor-primaria);
  outline-offset: 1px;
}

.campo-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--cor-texto-suave);
}

.mensagem-erro {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--cor-alerta) 12%, transparent);
  color: var(--cor-alerta);
  font-size: 14px;
}

button {
  margin-top: 4px;
  font-family: var(--fonte-texto);
  font-weight: 600;
  font-size: 15px;
  padding: 12px 16px;
  border-radius: 10px;
  border: none;
  background: var(--cor-primaria);
  color: #ffffff;
  cursor: pointer;
  transition: background 0.15s ease;
}

button:hover:not(:disabled) {
  background: var(--cor-primaria-hover);
}

button:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
