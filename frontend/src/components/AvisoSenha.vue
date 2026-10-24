<script setup>
// Aviso fixo dos campos de senha (anotação 31): cadastro, Perfil › Segurança › Alterar senha e tela de backup.
</script>

<template>
  <p class="aviso-senha" role="note">⚠️ Esta senha também é usada para restaurar seus backups. Se você esquecê-la, não será possível recuperar os dados — nem nós conseguimos. Guarde-a em um lugar seguro.</p>
</template>

<style scoped>
.aviso-senha { margin: 0; padding: 10px 12px; border-radius: 12px; font-size: 12.5px; line-height: 1.45; color: var(--cor-texto); background: color-mix(in srgb, var(--saida-ambar-medio, #d98a1c) 12%, transparent); border: 1px solid color-mix(in srgb, var(--saida-ambar-medio, #d98a1c) 30%, transparent); }
</style>
