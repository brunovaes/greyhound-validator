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

// vereditoAvB(finishingOrderJson, trapA, trapB, posA, posB) -> 'sim' | 'nao' | ''
//
// Versao "para gravar na coluna races.bateu" do bateuPar. Existe porque quem
// GRAVA a coluna (resultsRobot, reprocessarDiaInteiro) precisa de string, e ate
// 03/09/2026 cada um decidia por conta propria — e CHUTAVA quando nao achava um
// dos dois galgos na chegada ('nao' por default, e 'sim' quando o fav ficou no
// top3). O bateuPar, no mesmo caso, devolve null. Resultado: a coluna do banco
// dizia "sim" e a tela do Historico (que ja deriva com bateuPar) dizia "-", na
// mesma linha, e os KPIs globais liam a coluna crua.
//
// Ordem de preferencia, sem chute em lugar nenhum:
//   1) bateuPar sobre a chegada gravada — a MESMA funcao que a tela e os KPIs usam
//   2) posicoes ja resolvidas por fora (por nome, ou o top3), e SO quando os
//      DOIS galgos foram achados. Um so achado nao decide nada.
//   3) '' = INDEFINIDO. Nunca 'nao'.
//
// Por que '' e nao null: quem chama grava com COALESCE(?, bateu), onde null quer
// dizer "nao mexe". Indefinido precisa LIMPAR o valor velho, entao vai '' — que
// e o que a tela ja trata como pendente e o que os KPIs ja excluem da conta
// (filtram por bateu IS NOT NULL AND bateu != '').
function vereditoAvB(finishingOrderJson, trapA, trapB, posA, posB) {
  const b = bateuPar(finishingOrderJson, trapA, trapB);
  if (b !== null) return b ? 'sim' : 'nao';

  // 99 e o "nao achei" historico do resultsRobot; null/undefined valem o mesmo.
  const norm = (p) => (p == null || Number(p) >= 99 || !(Number(p) > 0)) ? null : Number(p);
  const pa = norm(posA), pb = norm(posB);
  if (pa != null && pb != null && pa !== pb) return pa < pb ? 'sim' : 'nao';

  return '';
}

// recalcularBateu(...) -> 'sim' | 'nao' | '' | null
//
// Versao "recalculo sobre o que ja esta no banco": nao ha nomes raspados aqui,
// so a chegada gravada e o top3 (resultado_1/2/3, que sao numeros de trap).
// Morava no robot.js ate 03/09/2026; veio pra ca quando ganhou o terceiro
// consumidor (o reprocessamento do dia, o tools/recalc-bateu.js e a rota
// /robot/bateu/recalc).
//
//   null = corrida ainda sem resultado. O UPDATE do reprocessamento usa
//          COALESCE(?,bateu), entao null quer dizer "nao mexe no que ja esta".
//   ''   = INDEFINIDO (um dos dois traps fora da chegada: retirada, nao largou,
//          chegada incompleta). Vazio DE PROPOSITO, pra limpar veredito velho.
function recalcularBateu(resultado_1, resultado_2, resultado_3, novoTrapFav, novoTrapUnd, finishingOrderJson) {
  if (!resultado_1) return null;

  // Prefere a chegada COMPLETA (1o-6o) quando disponivel — corridas raspadas
  // antes de 14/07/2026 nao tem isso, cai pro fallback so-top3. Achado real do
  // Bruno: quando os dois traps do AvB ficam fora do top3, o fallback antigo
  // nao tinha como saber quem bateu e chutava 'nao'.
  const b = bateuPar(finishingOrderJson, novoTrapFav, novoTrapUnd);
  if (b !== null) return b ? 'sim' : 'nao';

  // Fallback so-top3, com a MESMA funcao: o bateuPar so decide quando acha os
  // DOIS traps, entao ele ja recusa sozinho o caso que antes virava chute.
  const b3 = bateuPar(_top3Como(resultado_1, resultado_2, resultado_3), novoTrapFav, novoTrapUnd);
  if (b3 !== null) return b3 ? 'sim' : 'nao';

  // Ate 03/09/2026 aqui havia "posFav <= 3 ? 'sim' : 'nao'" e um 'nao' final.
  // Os dois eram chute, e discordavam do bateuPar (que devolve indefinido no
  // mesmo caso): a coluna do banco dizia "sim" onde a tela dizia "-".
  return '';
}

function _top3Como(r1, r2, r3) {
  const t = [];
  if (r1) t.push({ pos: 1, trap: r1 });
  if (r2) t.push({ pos: 2, trap: r2 });
  if (r3) t.push({ pos: 3, trap: r3 });
  return t;
}

// motivoDoRecalculo(...) -> { fonte, pos_fav, pos_und, texto }
//
// Diz POR QUE o veredito e esse, nao so qual e. Quem manda regravar a coluna
// precisa poder auditar linha a linha antes de aplicar: "mudou de sim para
// indefinido" sozinho nao deixa ninguem decidir nada. Mesma ideia do
// _bateuConta do Historico (main.js), que ja guarda a conta no title da celula.
//
// fonte: 'chegada' (a chegada gravada decidiu) | 'top3' (caiu no fallback) |
//        'nenhuma' (nem uma nem outra achou os dois traps) | 'sem_resultado'.
function motivoDoRecalculo(resultado_1, resultado_2, resultado_3, trapFav, trapUnd, finishingOrderJson) {
  const lugar = (ordem, trap) => {
    let arr = ordem;
    try { if (typeof arr === 'string') arr = JSON.parse(arr); } catch (e) { arr = null; }
    if (!Array.isArray(arr)) return null;
    for (const f of arr) if (f && f.pos != null && Number(f.trap) === Number(trap)) return Number(f.pos);
    return null;
  };
  const diz = (p) => (p == null ? 'fora da chegada' : p + 'o');

  if (!resultado_1) {
    return { fonte: 'sem_resultado', pos_fav: null, pos_und: null,
      texto: 'corrida sem resultado gravado, nao se mexe nela' };
  }

  const pfC = lugar(finishingOrderJson, trapFav), puC = lugar(finishingOrderJson, trapUnd);
  if (pfC != null && puC != null && pfC !== puC) {
    return { fonte: 'chegada', pos_fav: pfC, pos_und: puC,
      texto: 'chegada gravada: T' + trapFav + ' ' + diz(pfC) + ', T' + trapUnd + ' ' + diz(puC) };
  }

  const top3 = _top3Como(resultado_1, resultado_2, resultado_3);
  const pfT = lugar(top3, trapFav), puT = lugar(top3, trapUnd);
  if (pfT != null && puT != null && pfT !== puT) {
    return { fonte: 'top3', pos_fav: pfT, pos_und: puT,
      texto: 'sem chegada completa; top3: T' + trapFav + ' ' + diz(pfT) + ', T' + trapUnd + ' ' + diz(puT) };
  }

  // Este e o caso que a heuristica antiga resolvia no chute. O texto precisa
  // separar "achei um" de "nao achei nenhum": sao situacoes diferentes (galgo
  // retirado x chegada nao raspada) e dizer "so um dos dois" quando nenhum foi
  // achado e simplesmente falso.
  const pf = pfC != null ? pfC : pfT, pu = puC != null ? puC : puT;
  const achados = (pf != null ? 1 : 0) + (pu != null ? 1 : 0);
  const porque = achados === 0
    ? 'nenhum dos dois localizado na chegada'
    : 'so um dos dois localizado';
  return { fonte: 'nenhuma', pos_fav: pf, pos_und: pu,
    texto: 'indefinido: T' + trapFav + ' ' + diz(pf) + ', T' + trapUnd + ' ' + diz(pu)
      + ' — ' + porque + ', nao da pra dizer quem chegou na frente' };
}

module.exports = { bateuPar, vereditoAvB, recalcularBateu, motivoDoRecalculo };
