'use strict';
// src/utils/designTokens.js
// Bloco de CSS compartilhado pra equalizar tipografia em todas as paginas.
// Fonte de exibicao (titulos, menus, botoes, numeros/dados) = Oswald, condensada
// e esportiva, casa com o wordmark "GREYHOUND FACTORY". Fonte de corpo = Inter,
// limpa e legivel em tamanhos pequenos (a UI e bem densa em dado).
//
// Uso: interpolar designTokensCSS() dentro do <style> de cada pagina, ANTES
// das regras especificas da pagina (assim elas continuam podendo sobrescrever
// pontualmente se precisar).

function designTokensCSS() {
  return `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
:root{
  --font-display:'Oswald',sans-serif;
  --font-body:'Inter',system-ui,-apple-system,sans-serif;
}
body{font-family:var(--font-body)}
.nl,.robot-menu-item,.tabbtn{font-family:var(--font-body);font-weight:600}
h1,h2,h3,h4{font-family:var(--font-display);letter-spacing:.3px;font-weight:600}
button,.btn,.btn-save,.btn-reset,.btn-red,input[type=submit]{font-family:var(--font-display);letter-spacing:.5px;font-weight:600}
.card-title,.sec-title{font-family:var(--font-display);letter-spacing:.7px;font-weight:600}
.trap-badge,.badge,.top3-tag{font-family:var(--font-display);letter-spacing:.3px}

/* Zoom global da aplicacao (so desktop). A UI e' densa em dado e a 100% fica
   apertada em tela pequena de notebook; 0.9 devolve respiro sem mexer em
   nenhum tamanho individual.
   - So vale acima de 800px: no mobile o layout ja se reorganiza pelos
     breakpoints e encolher tudo atrapalharia a leitura.
   - A landing e o /conheca NAO passam por aqui (sao HTML estatico servido
     pelo landing.js), entao continuam em 100%.
   - Telas que nao devem encolher sobrescrevem com "body{zoom:1}" no proprio
     <style> da pagina, que vem depois deste bloco (ver login em auth.js).
   Pra desligar tudo, basta trocar o .9 por 1 aqui. */
@media (min-width:801px){
  body{zoom:.9}
}
`;
}

module.exports = { designTokensCSS };