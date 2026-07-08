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
`;
}

module.exports = { designTokensCSS };