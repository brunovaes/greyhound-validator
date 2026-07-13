'use strict';
// src/utils/pdfParser.js
// Parser determinístico de PDFs do Racing Post — zero tokens de API

// ── Carrega a pagina 1 do PDF (pdf.js) — reaproveitada tanto pra extrair texto
// quanto pra extrair as imagens dos badges de trap ──────────────────────────
async function loadPage(buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  return doc.getPage(1);
}

// ── Extrai linhas do PDF com posições ────────────────────────────────────────
async function extractRows(page) {
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

// ── Badge de trap: o card imprime uma imagem raster 16x16 por galgo (o
// numero colorido "1"-"6"), NUNCA como texto — confirmado inspecionando o
// PDF real (pdf.js nao extrai nenhum digito de trap via getTextContent()).
// Estrategia: ler essas imagens na ordem em que aparecem no PDF (que segue a
// mesma ordem top-a-baixo dos blocos de historico) e casar a cor media de
// cada uma contra uma paleta de referencia das 6 cores oficiais de trap.
//
// Paleta padrao (semente) — cores reais medidas num PDF de exemplo (traps
// 2,3,4,5,6) + trap 1 (vermelho puro, amostrado da legenda oficial). E so um
// ponto de partida: sempre que um card vier com os 6 galgos completos (nenhum
// ausente), a ordem sequencial antiga (1..6) e garantidamente correta por
// definicao — nesse caso o chamador (api.js) recalibra a paleta com as cores
// medidas NAQUELE pdf, mantendo-a sempre atualizada sem precisar de nada
// cravado manualmente.
const DEFAULT_TRAP_COLORS = {
  1: [212, 12, 2],     // vermelho
  2: [34, 150, 218],   // azul
  3: [196, 196, 196],  // branco (com digito preto — media fica cinza claro)
  4: [38, 38, 38],     // preto
  5: [255, 159, 40],   // laranja
  6: [134, 95, 95],    // listrado preto/branco + digito vermelho — media fica um marrom-avermelhado
};

// Distancia euclidiana ao quadrado ate a cor mais proxima da paleta.
// Limiar conservador — se a cor extraida nao chegar perto de nenhuma das 6
// referencias, e mais seguro nao confiar (deixa pra rede de seguranca) do
// que forcar um match ruim.
const TRAP_MATCH_MAX_DIST = 100;

function nearestTrapColor(rgb, palette) {
  let bestTrap = null, bestDist = Infinity;
  for (const trapStr of Object.keys(palette)) {
    const [r, g, b] = palette[trapStr];
    const d = Math.sqrt((rgb[0]-r)**2 + (rgb[1]-g)**2 + (rgb[2]-b)**2);
    if (d < bestDist) { bestDist = d; bestTrap = parseInt(trapStr); }
  }
  return { trap: bestTrap, dist: bestDist };
}

// Extrai a cor media de cada imagem "paintImageXObject" da pagina, NA ORDEM
// em que aparecem no fluxo de conteudo do PDF (que empiricamente segue a
// mesma ordem top-a-baixo dos blocos de galgo — confirmado batendo contra
// resultado real de corrida). Retorna um array paralelo a dogSections.
async function extractBadgeColors(page) {
  const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let opList;
  try { opList = await page.getOperatorList(); } catch(e) { return []; }

  const imageNames = [];
  for (let i = 0; i < opList.fnArray.length; i++) {
    if (opList.fnArray[i] === OPS.paintImageXObject) {
      imageNames.push(opList.argsArray[i][0]);
    }
  }

  const colors = [];
  for (const name of imageNames) {
    try {
      const img = await new Promise((resolve) => page.objs.get(name, resolve));
      if (!img || !img.data || !img.width || !img.height) { colors.push(null); continue; }
      const channels = img.data.length / (img.width * img.height);
      if (channels !== 3 && channels !== 4) { colors.push(null); continue; }
      let rs = 0, gs = 0, bs = 0, cnt = img.width * img.height;
      for (let p = 0; p < cnt; p++) {
        rs += img.data[p*channels]; gs += img.data[p*channels+1]; bs += img.data[p*channels+2];
      }
      colors.push([Math.round(rs/cnt), Math.round(gs/cnt), Math.round(bs/cnt)]);
    } catch(e) { colors.push(null); }
  }
  return colors;
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

// ── Parse da esquerda: [SPLIT] [BENDS] [POS] [By] [Win/Sec] REMARKS ────────
// O remark de verdade e' sempre o ULTIMO token (bloco colado por virgula,
// sem espaco) — "By" (margem) e "Win/Sec" (nome do vencedor/2o colocado)
// vem sempre ANTES, separados por espaco. Confirmado em todos os exemplos
// reais revisados em 13/07/2026 — sem isso, o campo remarks vinha
// contaminado com o nome do outro galgo (ex: "Kopek" contendo "KO" por
// coincidencia, ou "Bmp1" perdido dentro de "The Other Rafa Bmp1").
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
  const resto = tokens.slice(i);
  const remarks = resto.length ? resto[resto.length - 1] : '';
  return { split, bends, pos, remarks };
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
// trapPalette (opcional): paleta de cores {1:[r,g,b],...,6:[r,g,b]} calibrada
// pelo chamador (api.js, que persiste isso no banco). Sem ela, usa a semente
// padrao DEFAULT_TRAP_COLORS.
async function parseRacingPostPDF(buffer, trapPalette) {
  const page = await loadPage(buffer);
  const rows = await extractRows(page);
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

  // ── Trap real via badge de imagem ──────────────────────────────────────────
  // O card imprime uma imagem 16x16 por galgo com o numero do trap — nunca
  // como texto (confirmado: getTextContent() nao extrai nenhum digito perto
  // do nome/BRT de cada galgo). So confia no casamento por cor quando o
  // numero de badges extraidos bate EXATAMENTE com o numero de blocos de
  // galgo, nenhum falhou ao decodificar, e nenhum trap saiu duplicado —
  // qualquer divergencia cai pro heuristico antigo (idx+1) e marca a corrida
  // como trapsConfiaveis:false, em vez de arriscar um match errado em silencio.
  const palette = trapPalette || DEFAULT_TRAP_COLORS;
  const badgeColors = await extractBadgeColors(page).catch(() => []);
  let trapsConfiaveis = dogSections.length > 0 && badgeColors.length === dogSections.length;
  let trapsPorIndice = null;
  if (trapsConfiaveis) {
    trapsPorIndice = badgeColors.map(rgb => {
      if (!rgb) return null;
      const { trap, dist } = nearestTrapColor(rgb, palette);
      return dist <= TRAP_MATCH_MAX_DIST ? trap : null;
    });
    const semNulos = trapsPorIndice.every(t => t !== null);
    const semDuplicata = new Set(trapsPorIndice).size === trapsPorIndice.length;
    trapsConfiaveis = semNulos && semDuplicata;
  }

  const galgos = dogSections.map((section, idx) => {
    const brt = brtEntries[idx] || { nome: `Dog ${idx+1}`, brt: 0, brtClasse: '' };
    const historico = section.map(r => parseHistoryLine(r.text)).filter(h => h !== null);
    const trap = trapsConfiaveis ? trapsPorIndice[idx] : idx + 1;
    return { trap, nome: brt.nome, brt: brt.brt, brtClasse: brt.brtClasse, historico };
  }).filter(g => g.historico.length > 0);

  // Oportunidade de recalibrar a paleta: card com os 6 galgos completos (sem
  // nenhum ausente) + traps identificados com confianca == garantidamente
  // {1,2,3,4,5,6} (a checagem "sem duplicata" acima ja obriga isso quando
  // sao exatamente 6 blocos). Devolve as cores medidas NESSE pdf pro
  // chamador persistir como nova referencia, mantendo a paleta sempre
  // atualizada sem precisar de nada cravado manualmente.
  let badgeCalibration = null;
  if (trapsConfiaveis && dogSections.length === 6) {
    badgeCalibration = {};
    trapsPorIndice.forEach((trap, idx) => { badgeCalibration[trap] = badgeColors[idx]; });
  }

  return {
    hora: header.hora,
    corrida: `${trackAbbr} ${header.classe}`,
    trackFull: header.track,
    dist: String(header.dist),
    classe: header.classe,
    postPick: header.postPick.join('-'),
    trapsCard: galgos.map(g => g.trap),
    dataCard: header.dataCard,
    trapsConfiaveis,
    badgeCalibration,
    galgos
  };
}

module.exports = {
  parseRacingPostPDF,
  // Exportados a mais pra reaproveitar no robo de monitoramento de card (que
  // le texto raspado do navegador, nao de um PDF, mas no mesmo formato de linha)
  parseHistoryLine,
  isHistLine,
  isColHeader,
  isBrtLine,
  extractBrtInfo,
  parseDataCard,
  // Exportados pro api.js poder ler a paleta padrao (semente) e persistir/
  // aplicar a paleta calibrada do banco nas proximas chamadas de parse
  DEFAULT_TRAP_COLORS,
  nearestTrapColor
};