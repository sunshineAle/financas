<script setup>
// Backup em nuvem (Google Drive e OneDrive): conectar, enviar agora, último envio/erros e restaurar da nuvem.
// Sem Client ID configurado, mostra "Configurar" (instrução curta) e nada quebra; o arquivo local segue valendo.
import { ref } from 'vue';
import { Cloud, CloudUpload, CloudDownload, Link2, Unlink, TriangleAlert, Settings } from 'lucide-vue-next';
import CardPadrao from './CardPadrao.vue';
import { PROVEDORES, estadoNuvem, configBackup, salvarConfig, enviarNuvem, listarBackupsNuvem, abrirBackupNuvem } from '../services/backup.js';
import { conectarNuvem, desconectarNuvem } from '../services/nuvem/index.js';
import { avisar } from '../services/avisos.js';

const emit = defineEmits(['escolhido']);
const lista = ref([]); const listaDe = ref(''); const erro = ref(''); const ajuda = ref('');
const fmt = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

async function rodar(fn) { erro.value = ''; try { return await fn(); } catch (e) { if (e && e.codigo === 'cancelado') return; erro.value = (e && e.message) || 'Não foi possível concluir.'; } }
const conectar = (id) => rodar(async () => { await conectarNuvem(id); configBackup.ultimoDestino = id; salvarConfig(); avisar(`${PROVEDORES[id].nome} conectado.`, { tipo: 'ok' }); });
const enviar = (id) => rodar(async () => { const n = await enviarNuvem(id); avisar(`Backup enviado ao ${PROVEDORES[id].nome} (${n}).`, { tipo: 'ok' }); });
const desconectar = async (id) => { await desconectarNuvem(id); lista.value = []; if (configBackup.ultimoDestino === id) { configBackup.ultimoDestino = null; salvarConfig(); } };
const ver = (id) => rodar(async () => { lista.value = await listarBackupsNuvem(id); listaDe.value = id; if (!lista.value.length) erro.value = `Não há backups na pasta do app no ${PROVEDORES[id].nome}.`; });
const escolher = (item) => rodar(async () => { const lido = await abrirBackupNuvem(listaDe.value, item); lista.value = []; emit('escolhido', lido); });
const aviso = (id) => estadoNuvem[id].ultimoErro;
</script>

<template>
  <CardPadrao titulo="Nuvem" subtitulo="Google Drive, OneDrive e Dropbox, só com o arquivo cifrado">
    <p class="dica">O app envia o backup <b>.sfin</b> (cifrado com a sua senha) para uma pasta do app na sua conta ({{ Object.values(PROVEDORES).map((p) => p.pasta).join('; ') }}). Quando passa o prazo do lembrete, o envio acontece ao abrir o app.</p>
    <p v-if="erro" class="erro-n" role="alert"><TriangleAlert :size="16" /><span>{{ erro }}</span></p>

    <div v-for="p in Object.values(PROVEDORES)" :key="p.id" class="prov" :data-prov="p.id">
      <div class="topo">
        <span class="nome"><Cloud :size="18" /> <b>{{ p.nome }}</b></span>
        <span class="selo" :class="{ on: estadoNuvem[p.id].conectado && p.configurado() }">
          {{ !p.configurado() ? 'Não configurado' : estadoNuvem[p.id].conectado ? 'Conectado' : 'Desconectado' }}
        </span>
      </div>

      <template v-if="!p.configurado()">
        <div class="linha-botoes"><button type="button" class="b-sec" data-acao="configurar" @click="ajuda = ajuda === p.id ? '' : p.id"><Settings :size="16" /> Configurar</button></div>
        <p v-if="ajuda === p.id" class="dica" data-ajuda>Para ligar o {{ p.nome }}, crie {{ p.id === 'dropbox' ? 'uma App key gratuita (Dropbox App Console)' : 'um Client ID gratuito (' + (p.id === 'google' ? 'Google Cloud' : 'Azure') + ')' }} e cole em <code>config.js</code>, no campo <code>nuvem.{{ p.id === 'dropbox' ? 'dropboxAppKey' : p.id + 'ClientId' }}</code>. O passo a passo está no arquivo <b>docs-nuvem.md</b>. Enquanto isso, use "Baixar arquivo" ou a pasta da nuvem.</p>
      </template>
      <template v-else>
        <p v-if="estadoNuvem[p.id].ultimoEnvio" class="dica">Último envio: {{ fmt(estadoNuvem[p.id].ultimoEnvio) }}</p>
        <p v-if="aviso(p.id)" class="erro-n" data-erro-envio><TriangleAlert :size="16" /><span>Último erro ({{ fmt(aviso(p.id).em) }}): {{ aviso(p.id).mensagem }}</span></p>
        <div class="linha-botoes">
          <button v-if="!estadoNuvem[p.id].conectado || estadoNuvem[p.id].precisaReconectar" type="button" class="b-prim" data-acao="conectar" :disabled="!!estadoNuvem.ocupado" @click="conectar(p.id)"><Link2 :size="16" /> {{ estadoNuvem[p.id].conectado ? 'Reconectar' : 'Conectar' }}</button>
          <template v-if="estadoNuvem[p.id].conectado">
            <button type="button" class="b-prim" data-acao="enviar" :disabled="!!estadoNuvem.ocupado" @click="enviar(p.id)"><CloudUpload :size="16" /> {{ estadoNuvem.ocupado === p.id ? 'Aguarde…' : 'Enviar agora' }}</button>
            <button type="button" class="b-sec" data-acao="restaurar" :disabled="!!estadoNuvem.ocupado" @click="ver(p.id)"><CloudDownload :size="16" /> Restaurar da nuvem</button>
            <button type="button" class="b-sec" data-acao="desconectar" @click="desconectar(p.id)"><Unlink :size="16" /> Desconectar</button>
          </template>
        </div>
        <ul v-if="lista.length && listaDe === p.id" class="lista-n">
          <li v-for="i in lista" :key="i.id"><button type="button" data-backup-item @click="escolher(i)"><span>{{ i.nome }}</span><small>{{ kb(i.tamanho) }}</small></button></li>
        </ul>
      </template>
    </div>
    <details class="como" data-como-salvar>
      <summary>Prefere outra nuvem (Proton, Mega, iCloud...)?</summary>
      <p class="dica"><b>No celular:</b> toque em "Compartilhar" (ou "Baixar arquivo") e escolha "Salvar em" Google Drive, OneDrive, Dropbox, Proton, Mega ou iCloud.</p>
      <p class="dica"><b>No computador:</b> use "Escolher pasta" e aponte para a pasta sincronizada da nuvem ("Meu Drive", "OneDrive", "Dropbox", "Proton Drive"); o app salva lá sozinho.</p>
      <p class="dica forte">Guarde a senha do backup: sem ela o arquivo não restaura.</p>
    </details>
    <label v-if="Object.values(PROVEDORES).some((p) => p.configurado())" class="campo-linha"><span>Enviar sozinho ao abrir o app quando passar o prazo</span>
      <input v-model="configBackup.automatico" type="checkbox" @change="salvarConfig" />
    </label>
  </CardPadrao>
</template>

<style scoped>
.dica { margin: 0 0 8px; font-size: 13.5px; line-height: 1.5; color: var(--cor-texto-suave); }
.como { margin: 4px 0 8px; font-size: 13.5px; }
.como summary { cursor: pointer; min-height: 32px; color: var(--cor-texto); font-weight: 600; }
.dica.forte { color: var(--cor-texto); font-weight: 600; }
.prov { border: 1px solid var(--cor-borda); border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; }
.topo { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.nome { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; }
.selo { font-size: 12px; padding: 2px 10px; border-radius: 999px; background: var(--cor-realce); color: var(--cor-texto-suave); }
.selo.on { background: color-mix(in srgb, var(--cor-investimento) 18%, transparent); color: var(--cor-investimento); }
.linha-botoes { display: flex; gap: 8px; flex-wrap: wrap; }
.b-sec, .b-prim { min-height: 44px; padding: 0 14px; border-radius: 12px; font-family: var(--fonte-texto); font-size: 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
.b-sec { background: none; border: 1px solid var(--cor-borda); color: var(--cor-texto); }
.b-prim { border: none; background: var(--cor-primaria); color: var(--cor-sobre-cor); }
.b-sec:disabled, .b-prim:disabled { opacity: 0.5; cursor: default; }
.erro-n { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 8px; font-size: 13.5px; line-height: 1.4; color: var(--cor-grave, var(--cor-saida)); }
.lista-n { list-style: none; padding: 0; margin: 10px 0 0; display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow: auto; }
.lista-n button { width: 100%; display: flex; justify-content: space-between; gap: 8px; text-align: left; min-height: 40px; align-items: center; padding: 0 10px; border-radius: 10px; border: 1px solid var(--cor-borda); background: none; color: var(--cor-texto); font-size: 13.5px; cursor: pointer; }
.lista-n small { color: var(--cor-texto-suave); }
.campo-linha { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; font-size: 14.5px; }
.campo-linha input[type='checkbox'] { width: 22px; height: 22px; accent-color: var(--cor-primaria); }
code { font-size: 12.5px; background: var(--cor-realce); padding: 1px 5px; border-radius: 6px; }
</style>
