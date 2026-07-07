'use strict';
// src/utils/pdfParser.js
// Parser determinístico de PDFs do Racing Post — zero tokens de API

// ── Extrai linhas do PDF com posições ────────────────────────────────────────
async function extractRows(buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();

  const lineMap = {};
  for (const item of content.items) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5]);
    const x = Math.round(item.transform[4]);
    const existingKey = Object.keys(lineMap).find(k => Math.abs(parseInt(k) - y) <= 2);
    const key = existingKey !== undefined ? existingKey : y;
    if (!lineMap[key]) lineMap[key] = [];
    lineMap[key].push({ str: item.str, x });
  }

  return Object.entries(lineMap)
    .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
    .map(([y, items]) => ({
      y: parseInt(y),
      text: items.sort((a, b) => a.x - b.x).map(i => i.str).join('').trim()
    }))
    .filter(r => r.text.length > 0);
}

// ── Parse do cabeçalho ───────────────────────────────────────────────────────
const MESES_EN = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};

function parseDataCard(str) {
  if (!str) return null;
  const m = str.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const mes = MESES_EN[m[2].toLowerCase()];
  if (!mes) return null;
  return m[3] + '-' + String(mes).padStart(2, '0') + '-' + String(parseInt(m[1])).padStart(2, '0');
}

function parseHeader(text) {
  const m = text.match(/^(.+?)\s+(\d+:\d+)\s+.+?\(([^)]+)\)\s+-\s+(\d+)m\s+-\s+Post Pick:\s+([\d-]+)/);
  if (!m) return null;
  // A data fica no final da linha, mas pode ter coisas no meio (ex: "(nap)"
  // apos o post pick) — entao busca o padrao de data ancorado no FIM da
  // string, em vez de exigir que venha logo depois do post pick.
  const dateMatch = text.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*$/);
  return {
    track: m[1].trim(),
    hora: m[2],
    classe: m[3],
    dist: parseInt(m[4]),
    postPick: m[5].split('-').map(Number).filter(n => !isNaN(n)),
    dataCard: parseDataCard(dateMatch ? dateMatch[1] : null)
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const isColHeader = t => /^Date\s+Track\s+Dis\s+Trp/.test(t);
const isHistLine  = t => /^\d{2}[A-Za-z]{3}\d{2}\s+\w+\s+\d+m\s+\[\d\]/.test(t);
const isBrtLine   = t => t.includes('BRT:');

const GRADE_RE = /^(?:[A-Z]\d+|HP|OR\d*|B\d+|T\d*|D\d+|IV|S\d+|ON\d*|Mdn)$/;
const COLOR_BREED_RE = /\b(?:bk|bd|be|bef|bebd|bew|wbe|wbd|wbk|bkw|dkbd|dkbe|dkbef|fawn|fw|w|f)\s+(?:b|d)\s+/i;
const RNUM_PREFIX_RE = /^\([A-Za-z][A-Za-z0-9]*\)\s*/;

// ── Extrai nome e BRT ────────────────────────────────────────────────────────
function extractBrtInfo(brtLine, nameLine) {
  const brtMatch = brtLine.match(/BRT:\s*([\d.]+)\s+([A-Z][A-Z0-9]*)/);
  const brt      = brtMatch ? parseFloat(brtMatch[1]) : 0;
  const brtClasse= brtMatch ? brtMatch[2] : '';

  const beforeBrt = brtLine.split('BRT:')[0].trim();
  const colorIdx  = beforeBrt.search(COLOR_BREED_RE);
  let nome = '';
  if (colorIdx > 3) {
    nome = beforeBrt.substring(0, colorIdx).trim().replace(RNUM_PREFIX_RE, '').trim();
  } else if (nameLine) {
    nome = nameLine.replace(RNUM_PREFIX_RE, '').trim();
  }
  return { nome, brt, brtClasse };
}

// ── Parse da direita: CALTM, GRADE, [SP], WGHT, GNG, WNTM ──────────────────
function parseRightSide(text) {
  const tokens = text.trim().split(/\s+/);
  const n = tokens.length;
  if (n < 3) return { leftover: text, parsed: { caltm: 0, classe: '', peso: 0, gng: '', sp: '', vencedorTm: 0 } };

  const caltm = parseFloat(tokens[n-1]) || 0;
  let grade = '';
  if (GRADE_RE.test(tokens[n-2])) {
    grade = tokens[n-2];
  } else {
    for (let i = n-3; i >= Math.max(0, n-5); i--) {
      if (GRADE_RE.test(tokens[i])) { grade = tokens[i]; break; }
    }
    if (!grade) return { leftover: text, parsed: { caltm, classe: '', peso: 0, gng: '', sp: '', vencedorTm: 0 } };
  }

  const beforeGrade = tokens[n-3] || '';
  const hasExplicitSP = /^(?:\d+\/\d+[A-Z]{0,2}|Evs[A-Z]?|EvsF?)$/.test(beforeGrade);

  let sp, wght, gng, wntm, rightIdx;
  if (hasExplicitSP) {
    sp = beforeGrade;
    wght = parseFloat(tokens[n-4]) || 0;
    gng  = tokens[n-5] || '';
    wntm = parseFloat(tokens[n-6]) || 0;
    rightIdx = n - 6;
  } else {
    sp   = '';
    wght = parseFloat(beforeGrade) || 0;
    gng  = tokens[n-4] || '';
    wntm = parseFloat(tokens[n-5]) || 0;
    rightIdx = n - 5;
  }

  return {
    leftover: tokens.slice(0, Math.max(0, rightIdx)).join(' '),
    parsed: { caltm, classe: grade, sp, peso: wght, gng, vencedorTm: wntm }
  };
}

// ── Parse da esquerda: [SPLIT] [BENDS] [POS] ... REMARKS ────────────────────
function parseLeftSide(text) {
  if (!text) return { split: null, bends: '', pos: 0, remarks: '' };
  const tokens = text.trim().split(/\s+/);
  let i = 0, split = null, bends = '', pos = 0;

  if (tokens[i] && /^\d+\.\d+$/.test(tokens[i]) && parseFloat(tokens[i]) < 20) {
    split = parseFloat(tokens[i++]);
  }
  if (tokens[i] && /^\d{4}$/.test(tokens[i])) {
    bends = tokens[i++];
  } else if (tokens[i] && /^\d+-\d+-$/.test(tokens[i])) {
    bends = tokens[i++];
  }
  if (tokens[i] && /^\d+(?:st|nd|rd|th)$/.test(tokens[i])) {
    const m = tokens[i++].match(/^(\d+)/);
    pos = m ? parseInt(m[1]) : 0;
  }
  return { split, bends, pos, remarks: tokens.slice(i).join(' ') };
}

// ── Parse de uma linha de histórico ──────────────────────────────────────────
function parseHistoryLine(text) {
  const base = text.match(/^(\d{2}[A-Za-z]{3}\d{2})\s+(\w+)\s+(\d+)m\s+\[(\d)\]\s*(.*)/);
  if (!base) return null;
  const [, data, pista, distStr, trapStr, rest] = base;
  const dist = parseInt(distStr), trap = parseInt(trapStr); // dist como number para comparações

  if (/^NR\b/.test(rest)) {
    return { data, pista, dist, trap, pos: 0, bends: '', remarks: 'NR', caltm: 0, classe: '', peso: 0, gng: '', sp: '', split: null, vencedorTm: 0 };
  }
  if (/^(?:\d+\.\d+\s+)?Solo\b/.test(rest)) {
    const m1 = rest.match(/^(\d+\.\d+)\s+Solo\s*(.*)/);
    const m2 = rest.match(/^Solo\s*(.*)/);
    const splitVal = m1 ? parseFloat(m1[1]) : null;
    const rightRest = m1 ? m1[2] : (m2 ? m2[1] : '');
    const right = parseRightSide(rightRest);
    return { data, pista, dist, trap, split: splitVal, bends: '', pos: 0, remarks: right.leftover || 'Solo', ...right.parsed };
  }

  const right = parseRightSide(rest);
  const left  = parseLeftSide(right.leftover);
  return { data, pista, dist, trap, ...left, ...right.parsed };
}

// ── Parser principal ─────────────────────────────────────────────────────────
async function parseRacingPostPDF(buffer) {
  const rows = await extractRows(buffer);
  if (!rows.length) return null;

  const header = parseHeader(rows[0].text);
  if (!header) return null;

  const colHeaderIdxs = rows.map((r, i) => isColHeader(r.text) ? i : -1).filter(i => i >= 0);

  const dogSections = colHeaderIdxs.map((chIdx, secNum) => {
    const nextChIdx = colHeaderIdxs[secNum + 1] ?? rows.length;
    return rows.slice(chIdx + 1, nextChIdx).filter(r => isHistLine(r.text));
  });

  const brtRows = rows.filter(r => isBrtLine(r.text));
  const brtEntries = brtRows.map(brtRow => {
    const nameRow = rows.find(r =>
      r !== brtRow &&
      Math.abs(r.y - brtRow.y) <= 6 &&
      !isBrtLine(r.text) &&
      !isHistLine(r.text) &&
      !isColHeader(r.text) &&
      r.text.length > 2
    );
    return extractBrtInfo(brtRow.text, nameRow?.text);
  });

  // Abreviação do track via primeira linha de histórico
  const trackAbbr = dogSections[0]?.[0] ? parseHistoryLine(dogSections[0][0].text)?.pista : header.track.replace(/\s+/g,'').substring(0,5);

  const galgos = dogSections.map((section, idx) => {
    const brt = brtEntries[idx] || { nome: `Dog ${idx+1}`, brt: 0, brtClasse: '' };
    const historico = section.map(r => parseHistoryLine(r.text)).filter(h => h !== null);
    return { trap: idx + 1, nome: brt.nome, brt: brt.brt, brtClasse: brt.brtClasse, historico };
  }).filter(g => g.historico.length > 0);

  return {
    hora: header.hora,
    corrida: `${trackAbbr} ${header.classe}`,
    dist: String(header.dist),
    classe: header.classe,
    postPick: header.postPick.join('-'),
    trapsCard: galgos.map(g => g.trap),
    dataCard: header.dataCard,
    galgos
  };
}

module.exports = { parseRacingPostPDF };