<script setup>
// Marca Dagda Capital (anotação 32): esfera de vidro Violeta→Petróleo com ARCOS finos que não se fecham (mesma técnica do orbe do
// Início: conic-gradient com pontas transparentes, recortado em anel). Os arcos giram no sentido horário; a transição de cores dentro
// da esfera gira no anti-horário; o texto fica parado, com um reflexo de luz suave passando pelas letras. Escala pelo contêiner (cqw):
// ocupa 100% da largura do pai e mantém 1:1. Movimento reduzido = tudo parado.
//   <MarcaDagda completa />  (o pai define a largura, ex.: min(72vw, 42vh, 360px))   |   <MarcaDagda :tamanho="36" />  só o "D"
const arcoGrad = (ini, comp, c1, c2) => `conic-gradient(from ${ini}deg, color-mix(in srgb, ${c1} 0%, transparent) 0deg, ${c1} ${comp * 0.3}deg, ${c2} ${comp * 0.7}deg, color-mix(in srgb, ${c2} 0%, transparent) ${comp}deg, transparent ${comp}deg 360deg)`;
const ARCOS = [arcoGrad(-30, 135, '#9b6bff', '#6f8cf2'), arcoGrad(150, 135, '#3fb4e6', '#22c5dd')];
defineProps({ completa: { type: Boolean, default: false }, tamanho: { type: Number, default: 0 } });
</script>

<template>
  <span class="marca" :class="{ completa }" :style="tamanho ? { width: tamanho + 'px' } : null" role="img" aria-label="Dagda Capital">
    <div class="giro-arcos" aria-hidden="true"><span v-for="(g, i) in ARCOS" :key="i" class="arco" :style="{ backgroundImage: g }"></span></div>
    <span class="esfera" aria-hidden="true">
      <span class="cores"></span>
      <span class="vidro"></span>
      <span class="nome" :class="{ 'so-d': !completa }"><b>{{ completa ? 'Dagda' : 'D' }}</b><i v-if="completa">CAPITAL</i></span>
    </span>
  </span>
</template>

<style scoped>
@property --marca-ang { syntax: '<angle>'; inherits: false; initial-value: 135deg; }
.marca { position: relative; display: block; width: 100%; aspect-ratio: 1; max-width: 100%; flex: none; container-type: inline-size; margin-inline: auto; }
.giro-arcos { position: absolute; inset: 0; transform-origin: 50% 50%; animation: marca-horario 36s linear infinite; }
.arco { position: absolute; inset: 0; border-radius: 50%; -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - max(1.5px, 0.8cqw)), #000 calc(100% - max(1.5px, 0.8cqw) + 0.5px)); mask: radial-gradient(farthest-side, transparent calc(100% - max(1.5px, 0.8cqw)), #000 calc(100% - max(1.5px, 0.8cqw) + 0.5px)); }
.esfera { position: absolute; inset: 6.2%; border-radius: 50%; display: grid; place-items: center; overflow: hidden;
  box-shadow: 0 6cqw 9cqw -3cqw rgba(48, 14, 120, 0.38), 0 1.2cqw 3cqw rgba(48, 14, 120, 0.22); animation: marca-forma 1.6s cubic-bezier(.2, .7, .2, 1) both; }
.cores { position: absolute; inset: 0; background: linear-gradient(var(--marca-ang), #7a3cf0 0%, #4a12b0 30%, #1f4a90 62%, #0f6275 100%); animation: marca-anti 22s linear infinite; }
/* vidro: brilho especular sutil (alto-esquerda), reflexo menor (baixo-direita), sombra interna embaixo e clareamento na base */
.vidro { position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
  background:
    radial-gradient(ellipse 34% 22% at 30% 15%, rgba(255, 255, 255, 0.2), transparent 70%),
    radial-gradient(ellipse 16% 10% at 76% 86%, rgba(255, 255, 255, 0.13), transparent 70%),
    radial-gradient(ellipse 80% 40% at 50% 112%, rgba(170, 235, 245, 0.22), transparent 70%);
  box-shadow: inset 0 -3cqw 6cqw rgba(255, 255, 255, 0.1), inset 0 1.2cqw 3cqw rgba(255, 255, 255, 0.08); }
.vidro::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: linear-gradient(115deg, transparent 38%, rgba(255, 255, 255, 0.12) 50%, transparent 62%); background-size: 260% 100%; background-position: 130% 0; animation: marca-desliza 2.4s ease-out 0.9s 1 forwards; }
.nome { position: relative; display: grid; justify-items: center; line-height: 1; font-family: Optima, Candara, 'Segoe UI', 'Palatino Linotype', Georgia, serif; }
.nome b, .nome i { color: transparent; background-image: linear-gradient(105deg, rgba(255, 255, 255, 0.9) 35%, #fff 46%, #e3f8ff 50%, #fff 54%, rgba(255, 255, 255, 0.9) 65%); background-size: 320% 100%; -webkit-background-clip: text; background-clip: text; animation: marca-reflexo 9s ease-in-out infinite; }
.nome b { font-weight: 500; font-size: 20cqw; letter-spacing: 0.01em; }
.nome i { font-style: normal; font-size: 5.8cqw; letter-spacing: 0.32em; margin: 3cqw -0.32em 0 0; }
.nome.so-d b { font-size: 50cqw; }
@keyframes marca-horario { to { transform: rotate(360deg); } }
@keyframes marca-anti { 0% { --marca-ang: 495deg; } 100% { --marca-ang: 135deg; } }
@keyframes marca-reflexo { 0%, 12% { background-position: 100% 0; } 55%, 100% { background-position: 0 0; } }
@keyframes marca-forma { from { opacity: 0; transform: scale(0.82); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes marca-desliza { to { background-position: -30% 0; } }
@media (prefers-reduced-motion: reduce) { .giro-arcos, .cores, .nome b, .nome i, .esfera, .vidro::after { animation: none !important; } .nome b, .nome i { background-position: 50% 0; } }
:global(html[data-reduzir-movimento='1']) .giro-arcos, :global(html[data-reduzir-movimento='1']) .cores, :global(html[data-reduzir-movimento='1']) .nome b, :global(html[data-reduzir-movimento='1']) .nome i, :global(html[data-reduzir-movimento='1']) .esfera, :global(html[data-reduzir-movimento='1']) .vidro::after { animation: none !important; }
</style>
