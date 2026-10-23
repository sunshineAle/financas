<script setup>
// Marca Dagda Capital: esfera de vidro Violeta #5E18D8 → Petróleo #1597A8 com TRANSIÇÃO DE COR contínua (o degradê
// desliza devagar entre as duas cores) e aro fino em degradê. completa = "Dagda / CAPITAL"; senão só o "D".
// Respeita movimento reduzido (--anim-lenta: 0). Uso: <MarcaDagda :tamanho="220" completa />
defineProps({ tamanho: { type: Number, default: 40 }, completa: { type: Boolean, default: false } });
</script>

<template>
  <span class="marca" :class="{ completa }" :style="{ '--t': tamanho + 'px' }" role="img" aria-label="Dagda Capital">
    <span class="aro" aria-hidden="true"></span>
    <span class="esfera" aria-hidden="true">
      <span class="brilho"></span>
      <span class="nome" v-if="completa"><b>Dagda</b><i>CAPITAL</i></span>
      <span class="nome so-d" v-else><b>D</b></span>
    </span>
  </span>
</template>

<style scoped>
@property --marca-ang { syntax: '<angle>'; inherits: false; initial-value: 135deg; }
.marca { position: relative; display: inline-grid; place-items: center; width: var(--t); height: var(--t); flex: none; container-type: inline-size; }
.aro { position: absolute; inset: 0; border-radius: 50%; padding: calc(var(--t) * 0.012 + 1px); background: linear-gradient(var(--marca-ang), #9b6bff, #22c5dd); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; animation: marca-gira 14s linear infinite; }
.completa .aro { inset: 0; }
.esfera { position: relative; width: 93%; height: 93%; border-radius: 50%; display: grid; place-items: center; overflow: hidden;
  background: linear-gradient(var(--marca-ang), #7a3cf0 0%, #4a12b0 30%, #1f4a90 62%, #0f6275 100%);
  animation: marca-gira 14s linear infinite;
  box-shadow: inset 0 calc(var(--t) * -0.05) calc(var(--t) * 0.12) rgba(255, 255, 255, 0.14), 0 calc(var(--t) * 0.06) calc(var(--t) * 0.16) rgba(40, 10, 110, 0.35); }
.brilho { position: absolute; inset: 3% 18% auto 18%; height: 26%; border-radius: 50%; background: linear-gradient(rgba(255, 255, 255, 0.1), transparent); pointer-events: none; }
.nome { position: relative; display: grid; justify-items: center; color: #fff; font-family: Optima, Candara, 'Segoe UI', 'Palatino Linotype', Georgia, serif; line-height: 1; }
.nome b { font-weight: 500; font-size: calc(var(--t) * 0.2); letter-spacing: 0.01em; }
.nome i { font-style: normal; font-size: calc(var(--t) * 0.058); letter-spacing: 0.32em; margin-top: calc(var(--t) * 0.035); margin-right: -0.32em; color: rgba(255, 255, 255, 0.88); }
.nome.so-d b { font-size: calc(var(--t) * 0.52); }
@keyframes marca-gira { 0% { --marca-ang: 135deg; } 100% { --marca-ang: 495deg; } }
@media (prefers-reduced-motion: reduce) { .aro, .esfera { animation: none; } }
</style>
