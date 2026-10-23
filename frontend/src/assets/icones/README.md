# Ícones do designer (SVG próprio)

Solte aqui os SVGs entregues pelo designer. **Eles têm prioridade sobre os ícones lucide**: o nome do arquivo é a
chave do catálogo (`src/utils/icones.js`), e nenhuma tela precisa mudar. A lista de chaves está em `ICONES.md`
(na raiz do trabalho) e na grade de teste do projeto.

## Nomes dos arquivos
- `mercado.svg`: versão outline (traço) — usada normalmente.
- `mercado-preenchido.svg`: versão preenchida — usada quando `<Icone preenchido />` (estado ativo).
  Se faltar, o sistema usa a outline (e simula o preenchimento no lucide, não no SVG do designer).
- Nome = chave exata, minúsculo, sem acento, com hífen (`fatura-aberta.svg`, `inv-cri_cra.svg`).

## Formato obrigatório
- `viewBox="0 0 24 24"` (o tamanho real vem do componente; width/height do arquivo são ignorados).
- Traço de **1,5**, `stroke="currentColor"`, `fill="none"` na versão outline; `fill="currentColor"` na preenchida.
  Nada de cores fixas: o ícone herda a cor do texto/tema (claro e escuro).
- `stroke-linecap="round"` e `stroke-linejoin="round"` (o componente já aplica; pode repetir no arquivo).
- Sem `<script>`, sem eventos `onclick`, sem `<foreignObject>`, sem imagens embutidas, sem `<style>` global.
  O `<svg>` precisa ser a raiz e ter só formas (`path`, `circle`, `rect`, `line`, `polyline`, `g`...).

## Exemplo (`mercado.svg`)
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 4h2l2.4 11h10.2L20 8H6.2"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>
</svg>
```

## Como conferir
Com os arquivos na pasta, rode o build (`npm run build:servidor`). Para ver todos os ícones numa grade, use
a página de teste descrita em `ICONES.md`. Chaves sem arquivo continuam usando o lucide, então a troca pode ser
gradual (um ícone por vez).

## Pilotos recebidos (15)
Arquivos do designer (nav-inicio, acao-entrada...) foram copiados com o nome da CHAVE do catálogo:
nav-inicio→inicio, nav-contas→contas, nav-cartoes→cartoes, nav-transacoes→transacoes, nav-mais→mais,
acao-adicionar→adicionar, acao-entrada→receber, acao-saida→pagar, acao-transferencia→transferir,
cat-saida-mercado→mercado, cat-entrada-salario→salario, inv-acoes→inv-acoes, inv-tesouro-direto→inv-tesouro,
meta-reserva-liberdade→meta-reserva (e reserva), status-fatura-aberta→fatura-aberta. Filled = `-preenchido.svg`.
