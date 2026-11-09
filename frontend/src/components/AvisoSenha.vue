<script setup>
defineProps({ compacto: Boolean });
// Aviso fixo dos campos de senha (anotação 31): cadastro, Perfil › Segurança › Alterar senha e tela de backup.
</script>

<template>
  <p class="aviso-senha" :class="{ compacto }" role="note">Guarde a senha e o código de recuperação em um cofre. Se perder os dois, não será possível recuperar os dados.</p>
</template>

<style scoped>
.aviso-senha { margin: 0; padding: 10px 12px; border-radius: 12px; font-size: 12.5px; line-height: 1.45; color: var(--cor-texto); background: color-mix(in srgb, var(--saida-ambar-medio, #d98a1c) 12%, transparent); border: 1px solid color-mix(in srgb, var(--saida-ambar-medio, #d98a1c) 30%, transparent); }
.compacto{padding:0;border:0;background:none;color:var(--cor-texto-suave);font-size:12px}
</style>
