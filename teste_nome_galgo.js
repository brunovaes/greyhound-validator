'use strict';
// teste_nome_galgo.js — o nome do galgo saindo do PDF
//
// Por que existe: o nome do galgo ja se perdeu DUAS vezes pelo mesmo motivo, e
// nas duas o erro passou em silencio ate o Bruno ver na tela.
//   11/09  "Golden Lion (W) ltbd d Dorotas Wildcat-Golden Mist Jun24"  -> faltava `ltbd`
//   15/09  "Reefer Madness (W) wf b Out Of Range ASB-Sweet Leaf Aug24" -> faltava `wf`
// A causa das duas era a mesma: o COLOR_BREED_RE era uma LISTA de codigos de
// cor, e cor fora da lista fazia o parser tomar a ficha de criacao inteira por
// nome. Em 11/09 eu tratei na exibicao (svLimpaNome), que so salva quando o
// nome vem ANTES do lixo; quando a cor vem primeiro o nome se perde na origem.
//
// Este teste trava a regra nos dois sentidos: os nomes tem que sair limpos, E
// os nomes-armadilha (Titulo Maiusculo, sem cor) tem que sair inteiros. Se
// alguem trocar o padrao de volta por uma lista, ele quebra aqui.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let ok = 0;
const eq = (a, b, msg) => { assert.strictEqual(a, b, msg + '\n    esperado: ' + JSON.stringify(b) + '\n    veio:     ' + JSON.stringify(a)); ok++; };
const ver = (c, msg) => { assert.ok(c, msg); ok++; };

const ARQ = path.join(__dirname, 'src', 'utils', 'pdfParser.js');
const SRC = fs.readFileSync(ARQ, 'utf8');

// ── o regex e o cortador, extraidos do arquivo REAL ─────────────────────────
const mRe = /const COLOR_BREED_RE = (\/[^\n]*\/[a-z]*);/.exec(SRC);
ver(!!mRe, 'achei o COLOR_BREED_RE no pdfParser.js');
const COLOR_BREED_RE = eval(mRe[1]);
const mPre = /const RNUM_PREFIX_RE = (\/[^\n]*\/[a-z]*);/.exec(SRC);
ver(!!mPre, 'achei o RNUM_PREFIX_RE');
const RNUM_PREFIX_RE = eval(mPre[1]);

// mesma implementacao do arquivo, extraida por regex pra nao virar copia que envelhece
const mCorta = /function cortarNomePorCor\(str\) \{[\s\S]*?\n\}/.exec(SRC);
ver(!!mCorta, 'achei o cortarNomePorCor');
const cortarNomePorCor = new Function('COLOR_BREED_RE', 'RNUM_PREFIX_RE',
  mCorta[0] + '; return cortarNomePorCor;')(COLOR_BREED_RE, RNUM_PREFIX_RE);

const mBrt = /function extractBrtInfo\(brtLine, nameLine\) \{[\s\S]*?\n\}/.exec(SRC);
ver(!!mBrt, 'achei o extractBrtInfo');
const mSsn = /const SSN_DATE_RE = (\/[^\n]*\/[a-z]*);/.exec(SRC);
const mParseSsn = /function parseSsnDate\([\s\S]*?\n\}/.exec(SRC);
const mMeses = /const MESES_ABBR = \{[^}]*\};/.exec(SRC);
ver(!!mSsn && !!mParseSsn && !!mMeses, 'achei as pecas do (Ssn)');
const extractBrtInfo = new Function('cortarNomePorCor', 'SSN_DATE_RE',
  mMeses[0] + '\n' + mParseSsn[0] + '\n' + mBrt[0] + '; return extractBrtInfo;')(cortarNomePorCor, eval(mSsn[1]));

// ── 1) A LISTA NAO PODE VOLTAR ──────────────────────────────────────────────
// Um regex de cor com `(?:` cheio de `|` e' a lista de volta. O que vale e o
// padrao: classe de caracteres minusculos + quantificador.
const fonteRe = mRe[1];
ver(!/\(\?:bk\|/.test(fonteRe), 'o COLOR_BREED_RE nao voltou a ser lista de codigos');
ver(!/\/[a-z]*i[a-z]*$/.test(fonteRe),
  'o COLOR_BREED_RE NAO pode ser case-insensitive: com /i, "Bit Of A Lad" vira candidato a cor');

// ── 2) os seis galgos do card 5:57 Monmore de 15/09/2026 ────────────────────
// Linhas copiadas do PDF real. O trap 5 e o que quebrava.
const CARD = [
  ['trap 1', 'bk b Burgess Bucks-Cosy Trend May23 BRT: 29.16 A7 (3Sep26) Tnr: Aj Slater', 'Bounceback Bucks', 'Bounceback Bucks'],
  ['trap 2', 'Starmount Herbie bkw d Ballyhimikin Jet-Songtime Sep24 BRT: 29.29 A6 (16Jul26) Tnr: D J Page', null, 'Starmount Herbie'],
  ['trap 3', 'Aero Greatest be b Good Cody-Droopys Greatest May24 (SsnSupp) BRT: 29.12 A10 (7Jul26) Tnr: R Ta', null, 'Aero Greatest'],
  ['trap 4', 'Tromora Lizzie f b Dromana Bucko-Julieanna Nov24 (Ssn 13Apr26) BRT: 29.37 A8 (25Aug26) Tnr: K B', null, 'Tromora Lizzie'],
  ['trap 5', 'wf b Out Of Range ASB-Sweet Leaf Aug24 (Ssn 08May26) BRT: 29.26 T3 (25Aug26) Tnr: M J Russell', 'Reefer Madness (W)', 'Reefer Madness (W)'],
  ['trap 6', 'Yama King (W) bk d King Sheeran-Goldies Mabbutt Oct24 BRT: 29.44 A8 (2Sep26) Tnr: C Fereday', null, 'Yama King (W)']
];
for (const [rot, brtLine, nameLine, esperado] of CARD) {
  eq(extractBrtInfo(brtLine, nameLine).nome, esperado, rot + ' — nome do card 5:57 Monmore');
}

// ── 3) o caso de 11/09, que o svLimpaNome so mascarava ──────────────────────
eq(cortarNomePorCor('Golden Lion (W) ltbd d Dorotas Wildcat-Golden Mist Jun24'), 'Golden Lion (W)',
  'ltbd: a cor de 11/09 tambem e cortada agora');

// ── 4) NOMES-ARMADILHA: nao podem ser cortados ──────────────────────────────
// Nome de galgo e Titulo Maiusculo. Se o padrao ficar frouxo, estes quebram.
const INTEIROS = ['Reefer Madness (W)', 'Bounceback Bucks', 'Bit Of A Lad', 'Kilty Cara-Lee',
  'Droopys De Niro', 'Ballymac Bolger', 'Out Of Range ASB', 'Sweet Leaf', 'Aero Superstar',
  'Newinn Magico', 'A B C Dog'];
for (const n of INTEIROS) eq(cortarNomePorCor(n), n, 'nome sem cor sai inteiro: ' + n);

// ── 5) a cor no inicio devolve vazio, pra o chamador usar a nameLine ────────
for (const s of ['bk b Burgess Bucks-Cosy Trend May23', 'wf b Out Of Range ASB-Sweet Leaf Aug24',
                 'f b Dromana Bucko-Julieanna Nov24', 'ltbd d Dorotas Wildcat-Golden Mist Jun24']) {
  eq(cortarNomePorCor(s), '', 'cor no inicio -> vazio (cai na nameLine): ' + s.slice(0, 22));
}

// ── 6) cores que a lista antiga NAO tinha ───────────────────────────────────
// A prova de que o padrao resolve a classe, e nao so os dois casos conhecidos.
const NOVAS = ['wf', 'ltbd', 'ltbe', 'bkbd', 'brw', 'wbrd', 'dkf', 'ltf'];
for (const cor of NOVAS) {
  eq(cortarNomePorCor('Nome Do Galgo ' + cor + ' d Pai-Mae Jan25'), 'Nome Do Galgo',
    'cor fora da lista antiga tambem corta: ' + cor);
}

// ── 7) o (Ssn) continua sendo lido, das duas linhas ─────────────────────────
const t5 = extractBrtInfo(CARD[4][1], CARD[4][2]);
eq(t5.brt, 29.26, 'trap 5: BRT lido');
eq(t5.brtClasse, 'T3', 'trap 5: classe do BRT');
ver(t5.ssnDate != null, 'trap 5: data de cio lida da linha do BRT');
const t3 = extractBrtInfo(CARD[2][1], CARD[2][2]);
eq(t3.ssnSupp, true, 'trap 3: (SsnSupp) capturado');
eq(t3.ssnDate, null, 'trap 3: SsnSupp nao tem data');

console.log('\nTUDO OK — ' + ok + ' verificacoes');
