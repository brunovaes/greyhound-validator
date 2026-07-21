'use strict';
// src/utils/nomesPistas.js
// Fonte UNICA dos nomes completos das pistas (codigo do Racing Post -> nome).
// Usado no dashboard, no historico, no replay e onde mais precisar exibir o
// nome bonito. IMPORTANTE: isto e' so EXIBICAO — o codigo (ex: "DunPk")
// continua sendo o que fica salvo/agrupado/filtrado por baixo. NUNCA reescreva
// o campo `corrida` no banco pra nome completo: o motor e os filtros extraem a
// pista de corrida.split(' ')[0] e quebrariam.
//
// Ajuste/adicione aqui quando aparecer um codigo novo — vale pra todas as telas.
const NOMES_PISTAS = {
  CPark: 'Central Park', Clnml: 'Clonmel', Cork: 'Cork', Donc: 'Doncaster',
  DunPk: 'Dunstall Park', Harlow: 'Harlow', Hove: 'Hove', Kilky: 'Kilkenny',
  Kinsly: 'Kinsley', Lffrd: 'Lifford', Limrk: 'Limerick', Monmr: 'Monmore',
  Mulgr: 'Mullingar', Newc: 'Newcastle', Notts: 'Nottingham', Pelaw: 'Star Pelaw',
  Romfd: 'Romford', Sheff: 'Sheffield', ShelPk: 'Shelbourne Park', Sland: 'Sunderland',
  Towc: 'Towcester', Trlee: 'Tralee', Vlley: 'Valley', Yrmth: 'Yarmouth',
  Youghl: 'Youghal'
};

// Codigo -> nome completo (ou o proprio codigo se nao mapeado).
function nomePista(code) {
  return NOMES_PISTAS[code] || code;
}

// "DunPk A7" -> "Dunstall Park A7". Troca so o codigo da pista (1a palavra)
// pelo nome completo, preservando classe/resto. Se nao reconhecer, devolve
// a string original intacta.
function nomeCorridaCompleto(corrida) {
  if (!corrida) return corrida;
  const partes = String(corrida).trim().split(' ');
  if (NOMES_PISTAS[partes[0]]) {
    partes[0] = NOMES_PISTAS[partes[0]];
    return partes.join(' ');
  }
  return corrida;
}

module.exports = { NOMES_PISTAS, nomePista, nomeCorridaCompleto };