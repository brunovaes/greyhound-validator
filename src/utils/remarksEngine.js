'use strict';
// src/utils/remarksEngine.js
// Motor de pontuacao de Remarks — especificacao fechada com o Bruno em
// 13/07/2026 (documento "Especificacao_Motor_Remarks_Greyhound_Factory.docx"
// + ajustes decididos em conversa). Substitui o scoreRemarks() antigo
// (combo/positivo/negativo com teto) por um modelo de Merito + Corrida
// Escondida (HiddenRun), com bonus de sinergia so alimentando o HiddenRun
// pra nao contar a mesma informacao duas vezes.

// ── Dicionario de pesos ──────────────────────────────────────────────────
// Chave = remark normalizado (sem trap/curva). Sufixos numéricos (1,2,3,4)
// e faixas (1_2, 1_4 etc) sao chaves PROPRIAS quando existem — nao derivadas
// automaticamente da chave base.
const PESOS = {
  // Largada
  EP: 4, QAw: 5, Aw: 3, EvAw: 2,
  // Lideranca
  ALd: 5, Ld: 4,
  Ld1: 5, Ld2: 4, Ld3: 3, Ld4: 2,
  Ld1_4: 3, Ld1_2: 4, Ld3_4: 4,
  Ld1_2curve: 4, Ld1_3curve: 5, Ld1_4curve: 5, Ld2_3curve: 3, Ld2_4curve: 3,
  LdFr1: 5, LdFr2: 4, LdFr3: 3, LdFr4: 2,
  LdNrLn: 3, LdBrflyRnIn: 1, LdRnIn: 2,
  // Final
  FnWll: 5, StrFn: 5, RnOn: 4, HldOn: 4, CmAgn: 5, CmAgnNrLn: 5,
  Styd: 2, StydWll: 3, StydBst: 4,
  // Disputa
  EvCh: 5, Chl: 4, SnClr: 5, SnHandy: 3, Handy3: 2, Handy4: 1,
  A2nd: 2, SecondFr1: 3, SecondFr2: 2,
  // Interferencias (negativos)
  Bmp: -2, Bmp1: -4, Bmp2: -3, Bmp3: -2, Bmp4: -1,
  Bmp1_3: -5, Bmp1_4: -5, Bmp2_3: -4, Bmp3_4: -3,
  Blk: -3, Blk1: -5, Blk2: -4, Blk3: -3, Blk4: -2,
  Blk1_4: -5, Blk1_2: -5, Blk3_4: -3,
  BdBlk1: -5, BdBlk3: -5, BdBlk1_4: -5,
  Ck: -2, Ckd3: -3, Fcd: -2, FcdCk: -5,
  MvdOff1: -4, HitRls1: -4, Outp: -3, Stmb: -5,
  Crd: -3, Crd1: -4, Crd2: -3, Crd3: -2, Crd4: -1, // adicionado 13/07, confirmado com o Bruno
  SAw: -2, VSAw: -4, BdBmp: -4, // adicionado 13/07, confirmado com o Bruno
  // Apenas posicao (nao pontuam)
  Rls: 0, Mid: 0, W: 0, MidW: 0, RlsMid: 0, VW: 0, VW2: 0, VW4: 0, WRnIn: 0, ToRls: 0,
};

// Remarks que zeram a linha inteira (sem nota nenhuma, nao so desconto)
const SCORE_ZERO = ['BroughtDown', 'Fell'];

// Sinonimos — normaliza pra chave canonica do dicionario ANTES de procurar
const SINONIMOS = {
  FinWll: 'FnWll',
  FinishedWell: 'FnWll',
  RanOn: 'RnOn',
  StrongFinish: 'StrFn',
  AlwaysLed: 'ALd',
  Led: 'Ld',
  NearLine: 'NrLn',
  Briefly: 'Brfly',
  'Fcd-Ck': 'FcdCk', // mesmo fix de hoje mais cedo, agora centralizado aqui tambem
};

// Remarks que contam pra RECOVERY (recuperacao no fim da corrida)
const RECOVERY_LIST = ['FnWll','FinWll','CmAgn','CmAgnNrLn','StrFn','RnOn','HldOn','StydBst','StydWll','Styd'];

// Combos de SINERGIA — só alimentam o HiddenRunScore (bonus flat, capado em
// 100 no final), nunca o MeritScore. Lista enxuta, so recuperacao apos
// adversidade de verdade (decidido com o Bruno em 13/07 — o sistema antigo
// de combos redundantes tipo EP&&ALd foi removido por dupla contagem).
const COMBOS_HIDDEN = [
  [['Blk1'], ['FnWll'], 15],
  [['Blk1'], ['RnOn'], 12],
  [['Blk1'], ['CmAgn'], 18],
  [['Bmp1'], ['FnWll'], 15],
  [['Bmp1'], ['RnOn'], 12],
  [['Bmp1'], ['CmAgn'], 15],
  [['FcdCk'], ['FnWll'], 18],
  [['FcdCk'], ['RnOn'], 15],
  [['FcdCk'], ['CmAgn'], 20],
  [['HitRls1'], ['FnWll'], 15],
  [['MvdOff1'], ['RnOn'], 12],
];

module.exports = { PESOS, SCORE_ZERO, SINONIMOS, RECOVERY_LIST, COMBOS_HIDDEN };

// ── Parser de um token de remark ────────────────────────────────────────
// Ordem de prioridade (definida no documento): (1) chave completa exata,
// (2) versao normalizada (sinonimo), (3) hifen = faixa continua, procura
// chave composta ANTES de tentar quebrar, (4) '&' = ocorrencias separadas,
// soma cada uma, (5) NUNCA quebra automaticamente fracao tipo 1/2, 3/4 —
// trata como marcador atomico de posicao.
//
// Retorna { valor, encontrados: [chaves reconhecidas] } — encontrados e
// usado pra popular Merito/Interferencia/Recovery depois.
function normalizaChave(chave) {
  if (PESOS.hasOwnProperty(chave)) return chave;
  if (SINONIMOS[chave] && PESOS.hasOwnProperty(SINONIMOS[chave])) return SINONIMOS[chave];
  return null;
}

// Resolve um "segmento" (pedaco entre vírgulas, ja sem o '&') — pode ter
// hifen (faixa OU parte de nome composto tipo "Fcd-Ck"), sufixo numerico de
// curva, ou ser uma chave direta.
function resolveSegmento(segmento) {
  // (1) chave completa exata / sinonimo
  let direta = normalizaChave(segmento);
  if (direta) return [direta];

  // (2) tem sufixo numerico de curva? separa base + numero e tenta achar
  // "base+numero" (ex: FcdCk3) antes de cair pro "base" sozinho — isso
  // cobre nomes compostos com hifen tipo "Fcd-Ck2" (a base "Fcd-Ck" e' o
  // sinonimo de FcdCk, o "2" e' so a curva, NAO e' uma faixa).
  const mNum = segmento.match(/^(.+?)(\d)$/);
  if (mNum) {
    const base = mNum[1], num = mNum[2];
    const baseNorm = normalizaChave(base);
    if (baseNorm) {
      const comCurva = normalizaChave(baseNorm + num);
      if (comCurva) return [comCurva];
      return [baseNorm]; // nao tem versao por curva, usa a base
    }
  }

  // (3) hifen = faixa continua — SO tenta isso se os passos acima nao
  // resolveram nada (evita confundir com nome composto tipo Fcd-Ck)
  if (segmento.includes('-')) {
    const composta = segmento.replace(/-/g, '_');
    direta = normalizaChave(composta);
    if (direta) return [direta];
    const base = segmento.split('-')[0];
    direta = normalizaChave(base);
    if (direta) return [direta];
  }

  return []; // nao reconhecido
}

// Extrai o prefixo alfabetico de um token (ex: "Crd1" -> "Crd", "Bmp" -> "Bmp")
function prefixoBase(token) {
  const m = token.match(/^([A-Za-z\-]+)/);
  return m ? m[1] : token;
}

// Resolve um TOKEN inteiro (ja sem virgula) — pode ter '&' dentro (varias
// ocorrencias). Fracao tipo "3/4" que sobra de um split por '&' HERDA o
// prefixo do segmento anterior no mesmo grupo (ex: "Crd1&3/4" -> "Crd1" e
// "Crd"+"3/4").
function resolveToken(token) {
  const encontrados = [];

  if (token.includes('&')) {
    const partes = token.split('&').map(p => p.trim()).filter(Boolean);
    let baseAnterior = null;
    partes.forEach(parte => {
      // Se a parte comeca so com numero/fracao (sem letra), herda a base
      // do segmento anterior do mesmo grupo '&'
      let parteCompleta = parte;
      if (/^[\d/]+$/.test(parte) && baseAnterior) {
        parteCompleta = baseAnterior + parte;
      } else {
        baseAnterior = prefixoBase(parte);
      }
      resolveSegmento(parteCompleta).forEach(k => encontrados.push(k));
    });
    return encontrados;
  }

  return resolveSegmento(token);
}

// Interpreta uma string de remarks inteira (ja como vem do PDF, com
// virgulas separando tokens) — devolve TODAS as chaves canonicas
// encontradas, SEM deduplicar (cada ocorrencia soma separado — confirmado
// com o exemplo do Bruno: "Bmp1&2" = Bmp1 + Bmp2, duas ocorrencias, nao uma).
function interpretarRemarks(remarksStr) {
  if (!remarksStr) return [];
  const tokens = remarksStr.split(',').map(t => t.trim()).filter(Boolean);
  const encontrados = [];
  tokens.forEach(t => resolveToken(t).forEach(k => encontrados.push(k)));
  return encontrados;
}

module.exports.interpretarRemarks = interpretarRemarks;
module.exports.normalizaChave = normalizaChave;

// ── Calculo completo de UMA linha de historico ──────────────────────────
function calcularRemarksLinha(remarksStr) {
  const chaves = interpretarRemarks(remarksStr);

  // Regra do documento: BroughtDown/Fell zera a linha inteira, incondicional
  if (chaves.some(k => SCORE_ZERO.includes(k))) {
    return { remarksScore: 0, meritScore: 0, interferenceScore: 0, hiddenRunScore: 0, meritRaw: 0, interferenceRaw: 0 };
  }

  let meritRaw = 0, interferenceRaw = 0, recoveryRaw = 0, preIncidentRaw = 0;
  chaves.forEach(k => {
    const v = PESOS[k];
    if (v > 0) {
      meritRaw += v;
      if (RECOVERY_LIST.includes(k)) recoveryRaw += v; else preIncidentRaw += v;
    } else if (v < 0) {
      interferenceRaw += Math.abs(v);
    }
  });

  const meritScore = Math.min(meritRaw, 20) / 20 * 100;
  const interferenceScore = Math.min(interferenceRaw, 10) / 10 * 100;
  const recoveryScore = Math.min(recoveryRaw, 5) / 5 * 100;
  const preIncidentScore = Math.min(preIncidentRaw, 10) / 10 * 100;

  // "Sem interferencia nao existe Hidden Run" / "sem merito anterior e sem
  // recuperacao, Hidden Run = 0" (regra do documento)
  let hiddenRunScore = 0;
  if (interferenceRaw > 0 && (recoveryRaw > 0 || preIncidentRaw > 0)) {
    hiddenRunScore = (interferenceScore * 0.35) + (recoveryScore * 0.45) + (preIncidentScore * 0.20);

    // Bonus de sinergia — soma flat no HiddenRun (nunca no Merito), capado em 100
    let comboBonus = 0;
    COMBOS_HIDDEN.forEach(([grupoA, grupoB, bonus]) => {
      if (grupoA.some(k => chaves.includes(k)) && grupoB.some(k => chaves.includes(k))) comboBonus += bonus;
    });
    hiddenRunScore = Math.min(100, hiddenRunScore + comboBonus);
  }

  let remarksScore;
  if (hiddenRunScore === 0) {
    remarksScore = meritScore;
  } else {
    remarksScore = Math.round(meritScore * 0.70) + Math.round(hiddenRunScore * 0.30);
    if (hiddenRunScore >= 80) remarksScore = Math.max(remarksScore, meritScore * 0.95);
  }

  return {
    remarksScore: Math.max(0, Math.min(100, Math.round(remarksScore))),
    meritScore: Math.round(meritScore),
    interferenceScore: Math.round(interferenceScore),
    hiddenRunScore: Math.round(hiddenRunScore),
    meritRaw, interferenceRaw
  };
}

// ── Media das 3 linhas mais recentes — mesmo padrao do scoreRemarks antigo ──
function scoreRemarksNovo(linhasValidas) {
  if (!linhasValidas || !linhasValidas.length) return 50;
  const linhas = linhasValidas.slice(0, 3);
  const soma = linhas.reduce((acc, l) => acc + calcularRemarksLinha(l.remarks).remarksScore, 0);
  return Math.round(soma / linhas.length);
}

module.exports.calcularRemarksLinha = calcularRemarksLinha;
module.exports.scoreRemarksNovo = scoreRemarksNovo;