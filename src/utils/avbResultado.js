'use strict';
// src/utils/avbResultado.js
// FONTE UNICA da regra de "bateu" de um AvB. Importada pelo Historico, pelo
// dashboard de HR e pelo export de derrotas — todos usam ESTA mesma funcao, pra
// nao existir duas implementacoes que divergem em silencio.
//
//   bateuPar(finishingOrderJson, trapA, trapB) -> true | false | null
//     true  = o trap A chegou A FRENTE do trap B (o AvB "bateu")
//     false = o trap B chegou a frente do trap A (nao bateu)
//     null  = INDEFINIDO: um dos dois traps nao aparece na chegada (retirada,
//             nao largou, chegada incompleta). NAO deve contar na taxa — nem
//             acerto nem erro —, senao a comparacao entre as taxas distorce.
//
// Semantica AvB (confirmada com a UI): "bateu" = A na frente de B, e NAO "A
// venceu a corrida". Muda so QUAL par entra na conta, nunca o significado.
//
// Formato esperado de finishing_order_json: [{trap, pos}, ...] (chegada 1o-6o),
// que e' o que o robo de resultados grava na coluna races.finishing_order_json.
function bateuPar(finishingOrderJson, trapA, trapB) {
  if (trapA == null || trapB == null) return null;
  let ordem;
  try { ordem = (typeof finishingOrderJson === 'string') ? JSON.parse(finishingOrderJson) : finishingOrderJson; }
  catch (e) { return null; }
  if (!Array.isArray(ordem) || !ordem.length) return null;

  const posDe = (trap) => {
    for (const f of ordem) {
      if (f && f.pos != null && Number(f.trap) === Number(trap)) return Number(f.pos);
    }
    return null;
  };

  const pa = posDe(trapA), pb = posDe(trapB);
  if (pa == null || pb == null) return null; // um dos dois fora da chegada -> INDEFINIDO
  if (pa === pb) return null;                // seguranca: nao deveria empatar
  return pa < pb;                            // A chegou na frente de B?
}

module.exports = { bateuPar };
