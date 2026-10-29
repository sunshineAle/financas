<script setup>
// Mostra o código de recuperação recém-gerado (anotação 31): anotar, copiar, baixar ou imprimir e confirmar que foi guardado.
//   <ChaveRecuperacao :codigo="codigo" @guardado="..." />
import { ref } from 'vue';
import { Copy, Download, Printer, KeyRound } from 'lucide-vue-next';

const props = defineProps({ codigo: { type: String, required: true }, rotuloContinuar: { type: String, default: 'Continuar' }, somenteVer: { type: Boolean, default: false } });
const emit = defineEmits(['guardado']);
const confirmou = ref(false);
const copiado = ref(false);
const texto = () => `Dagda Capital — código de recuperação\n\n${props.codigo}\n\nEste código substitui a senha: abre o app e os backups e permite criar uma senha nova.\nSem a senha e sem este código, ninguém consegue recuperar os dados.\nGerado em ${new Date().toLocaleString('pt-BR')}.\n`;
async function copiar() {
  try { await navigator.clipboard.writeText(props.codigo); copiado.value = true; setTimeout(() => { copiado.value = false; }, 2000); } catch { /* sem área de transferência */ }
}
function baixar() {
  const url = URL.createObjectURL(new Blob([texto()], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'dagda-capital-codigo-de-recuperacao.txt';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 20000);
}
function imprimir() {
  const w = window.open('', '_blank', 'width=520,height=420');
  if (!w) return;
  w.document.write(`<pre style="font:16px/1.6 ui-monospace,monospace;padding:24px;white-space:pre-wrap">${texto().replace(/</g, '&lt;')}</pre>`);
  w.document.close(); w.focus(); w.print();
}
</script>

<template>
  <div class="chave-rec" data-chave-recuperacao>
    <p class="explica"><KeyRound :size="16" :stroke-width="2" /> Anote este <b>código de recuperação</b>. Ele substitui a senha: abre o app e os backups e permite criar uma senha nova.</p>
    <output class="codigo" :aria-label="'Código de recuperação: ' + codigo"><span v-for="(g, i) in codigo.split('-')" :key="i">{{ g }}<i v-if="i < 5" aria-hidden="true">-</i></span></output>
    <div class="acoes">
      <button type="button" @click="copiar"><Copy :size="16" :stroke-width="2" /> {{ copiado ? 'Copiado' : 'Copiar' }}</button>
      <button type="button" @click="baixar"><Download :size="16" :stroke-width="2" /> Baixar</button>
      <button type="button" @click="imprimir"><Printer :size="16" :stroke-width="2" /> Imprimir</button>
    </div>
    <p class="alerta">Sem a senha e sem a chave de recuperação, ninguém consegue recuperar os dados.</p>
    <template v-if="!somenteVer">
      <label class="confirma"><input v-model="confirmou" type="checkbox" /> Guardei a chave em local seguro</label>
      <button type="button" class="continuar" :disabled="!confirmou" @click="emit('guardado')">{{ rotuloContinuar }}</button>
    </template>
  </div>
</template>

<style scoped>
/* "chave-rec" (não "chave"): o Perfil tem um .chave (interruptor) com escopo que vazava para a raiz deste componente (anotação 49). */
.chave-rec { display: flex; flex-direction: column; gap: 12px; width: 100%; min-width: 0; }
.explica { margin: 0; font-size: 13.5px; line-height: 1.45; color: var(--cor-texto-suave); }
.explica svg { vertical-align: -3px; color: var(--cor-primaria); }
.codigo { display: grid; grid-template-columns: repeat(3, auto); justify-content: center; gap: 6px 16px; text-align: center; font: 600 clamp(17px, 5vw, 21px)/1.4 ui-monospace, 'Cascadia Mono', Consolas, monospace; letter-spacing: 0.08em; padding: 14px 10px; border-radius: 12px; border: 1px dashed var(--cor-borda); background: var(--cor-fundo-elevado); color: var(--cor-texto); user-select: all; }
.codigo span { white-space: nowrap; }
.codigo i { display: none; } /* em blocos de 4, 3 por linha (anotação 49); copiar leva com os hífens */
.acoes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.acoes button { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 10px; border: 1px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); font: 600 13.5px var(--fonte-texto); cursor: pointer; padding: 0 6px; }
.acoes button:hover { background: var(--cor-realce); }
.alerta { margin: 0; font-size: 12.5px; color: var(--cor-texto-suave); }
.confirma { display: flex; align-items: center; gap: 10px; font-size: 14px; cursor: pointer; }
.confirma input { width: 20px; height: 20px; accent-color: var(--cor-primaria); }
.continuar { min-height: 46px; border-radius: 10px; border: none; color: #fff; font: 600 15px var(--fonte-texto); cursor: pointer; background: linear-gradient(135deg, #5e18d8, #1597a8); }
.continuar:disabled { opacity: 0.5; cursor: default; }
</style>
