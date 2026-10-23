<script setup>
// Linha "Desbloqueio por biometria" (Perfil > Segurança, só no PWA). Ativa/desativa o desbloqueio por digital, rosto ou
// PIN do celular (WebAuthn). A senha do app continua sendo a alternativa. Sem suporte no aparelho, não mostra nada.
//   <DesbloqueioBiometrico />
import { ref, computed, onMounted } from 'vue';
import { Fingerprint } from 'lucide-vue-next';
import { biometriaSuportada, biometriaAtiva, ativarBiometria, desativarBiometria, carregarBiometria, modoPWA } from '../services/acesso.js';
import { avisar } from '../services/avisos.js';

const suportada = ref(false);
const ligada = ref(false);
const ocupado = ref(false);
const erro = ref('');
const visivel = computed(() => modoPWA && suportada.value);

onMounted(async () => {
  if (!modoPWA) return;
  suportada.value = await biometriaSuportada();
  if (suportada.value) { await carregarBiometria(); ligada.value = biometriaAtiva(); }
});

async function alternar() {
  erro.value = ''; ocupado.value = true;
  try {
    if (ligada.value) { await desativarBiometria(); ligada.value = false; avisar('Desbloqueio por biometria desligado.', { tipo: 'ok' }); }
    else { await ativarBiometria(); ligada.value = true; avisar('Desbloqueio por biometria ativado. A senha continua valendo.', { tipo: 'ok' }); }
  } catch (e) { erro.value = e.message; } finally { ocupado.value = false; }
}
</script>

<template>
  <div v-if="visivel" class="bio">
    <label class="linha">
      <span class="quadro"><Fingerprint :size="20" :stroke-width="1.8" /></span>
      <span class="texto"><b>Desbloqueio por biometria</b><small>digital, rosto ou PIN do celular; a senha continua como alternativa</small></span>
      <input type="checkbox" role="switch" :checked="ligada" :disabled="ocupado" aria-label="Desbloqueio por biometria" @change="alternar" />
    </label>
    <p v-if="erro" class="erro" role="alert">{{ erro }}</p>
  </div>
</template>

<style scoped>
.linha { display: flex; align-items: center; gap: 14px; min-height: 56px; cursor: pointer; }
.quadro { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--cor-entrada-fundo); color: var(--cor-primaria); flex-shrink: 0; }
.texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.texto b { font-size: 15px; font-weight: 600; }
.texto small { font-size: 12.5px; color: var(--cor-texto-suave); }
input[type=checkbox] { appearance: none; width: 44px; height: 26px; border-radius: 13px; background: var(--cor-borda); position: relative; cursor: pointer; flex: none; transition: background 0.15s; }
input[type=checkbox]::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform 0.15s; }
input[type=checkbox]:checked { background: var(--cor-primaria); }
input[type=checkbox]:checked::after { transform: translateX(18px); }
input[type=checkbox]:focus-visible { outline: 2px solid var(--cor-primaria); outline-offset: 2px; }
input[type=checkbox]:disabled { opacity: 0.6; }
.erro { margin: 6px 0 0; font-size: 13px; color: var(--cor-alerta); }
</style>
