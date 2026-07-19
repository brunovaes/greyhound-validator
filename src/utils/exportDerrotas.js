'use strict';
// src/utils/exportDerrotas.js
// Gera a planilha de "Revisao de Derrotas" (mesmo formato entregue na conversa
// de afinacao do motor) direto do banco, para um intervalo de datas escolhido
// na tela de Configuracoes. Uma linha por derrota (bateu='nao'), ordenada por
// prioridade de revisao, com as notas por criterio do favorito e colunas em
// branco pra marcacao manual (resultado confere / pista limpa / analise ruim).
//
// Depende de exceljs:  npm install exceljs

const ExcelJS = require('exceljs');

// db resolvido de forma preguicosa (e injetavel em teste) — evita quebrar o
// carregamento do modulo se por algum motivo o banco nao estiver disponivel,
// e permite passar um db mock nos testes.
function getDb(dbOverride) {
  return dbOverride || require('../db/database').db;
}

// "Races DD/MM/YYYY" -> Date (00:00 local). Retorna null se nao casar.
function parseSessionDate(name) {
  const m = (name || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}

// Posicao de chegada de um trap. Usa finishing_order_json (chegada completa)
// se existir; senao cai pro top3 (resultado_1/2/3). null = nao consta.
function posDoTrap(race, trap, ordemFull) {
  if (ordemFull && ordemFull.length) {
    const e = ordemFull.find(x => String(x.trap) === String(trap));
    return e ? e.pos : null;
  }
  if (String(race.resultado_1) === String(trap)) return 1;
  if (String(race.resultado_2) === String(trap)) return 2;
  if (String(race.resultado_3) === String(trap)) return 3;
  return null;
}

// Deriva o "bateu" real (favorito terminou na frente do underdog) a partir das
// posicoes — usado so pra sinalizar resultado SUSPEITO (diverge do gravado).
function derivarBateu(pf, pu, temFull) {
  if (temFull) {
    if (pf == null && pu == null) return null;
    if (pf == null) return 'nao';
    if (pu == null) return 'sim';
    return pf < pu ? 'sim' : 'nao';
  }
  if (pf != null && pu == null) return 'sim';
  if (pf == null && pu != null) return 'nao';
  if (pf != null && pu != null) return pf < pu ? 'sim' : 'nao';
  return null;
}

// Monta as linhas (derrotas) do intervalo [fromISO, toISO] (YYYY-MM-DD, inclusivo).
function coletarDerrotas(userId, fromISO, toISO, dbOverride) {
  const db = getDb(dbOverride);
  const from = new Date(fromISO + 'T00:00:00');
  const to = new Date(toISO + 'T23:59:59');
  const rows = db.prepare(
    `SELECT r.*, s.name AS sessao
       FROM races r JOIN race_sessions s ON s.id = r.session_id
      WHERE r.user_id = ? AND r.bateu = 'nao'`
  ).all(userId);

  const out = [];
  for (const r of rows) {
    const dt = parseSessionDate(r.sessao);
    if (!dt || dt < from || dt > to) continue;

    let scores = [];
    try { scores = r.scores_json ? JSON.parse(r.scores_json) : []; } catch (e) { scores = []; }
    let ordemFull = null;
    try { ordemFull = r.finishing_order_json ? JSON.parse(r.finishing_order_json) : null; } catch (e) { ordemFull = null; }
    const temFull = !!(ordemFull && ordemFull.length);

    const favSc = (scores.find(g => g.trap === r.trap_fav) || {}).scores || {};
    const pf = posDoTrap(r, r.trap_fav, ordemFull);
    const pu = posDoTrap(r, r.trap_und, ordemFull);
    const der = derivarBateu(pf, pu, temFull);
    const suspeito = der != null && der !== 'nao';

    let chegada;
    if (temFull) chegada = ordemFull.slice().sort((a, b) => a.pos - b.pos).map(e => e.trap).join('-');
    else chegada = [r.resultado_1, r.resultado_2, r.resultado_3].filter(v => v != null && v !== '').join('-');

    const dia = (r.sessao || '').replace('Races ', '').slice(0, 5); // DD/MM
    out.push({
      dia, hora: r.hora || '', corrida: r.corrida || '', dist: r.dist || '',
      favTrap: r.trap_fav, favNome: r.name_fav || '', favPerfil: r.perfil_fav || '',
      undTrap: r.trap_und, undNome: r.name_und || '', undPerfil: r.perfil_und || '',
      pct: r.pct || 0, nivel: r.nivel || '', chegada,
      favPos: pf == null ? 'fora' : pf, undPos: pu == null ? 'fora' : pu,
      suspeito: suspeito ? 'SIM' : '', temScore: scores.length > 0,
      der, gravado: r.bateu,
      caltm: favSc.caltm ?? '', categoria: favSc.categoria ?? '', bends: favSc.bends ?? '',
      split: favSc.split ?? '', sp: favSc.sp ?? '', remarks: favSc.remarks ?? '',
      postPick: favSc.postPick ?? '', brt: favSc.brt ?? ''
    });
  }

  // Prioridade: suspeitos por ultimo; depois maior confianca; depois favorito
  // que chegou mais atras primeiro.
  const fpNum = v => (typeof v === 'number' ? v : 9);
  out.sort((a, b) => {
    if ((a.suspeito === 'SIM') !== (b.suspeito === 'SIM')) return a.suspeito === 'SIM' ? 1 : -1;
    if (b.pct !== a.pct) return b.pct - a.pct;
    return fpNum(b.favPos) - fpNum(a.favPos);
  });
  return out;
}

// ---- estilos ----
const GREEN = 'FF1F7A3D', DARKG = 'FF14532D';
const fillHdr = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
const fillInput = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7CC' } };
const fillSusp = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } };
const fillEx = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };
const thin = { style: 'thin', color: { argb: 'FFD0D0D0' } };
const borderAll = { top: thin, left: thin, bottom: thin, right: thin };
const fontBase = { name: 'Arial', size: 10 };
const fontHdr = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };

function buildDerrotasWorkbook(userId, fromISO, toISO, dbOverride) {
  const linhas = coletarDerrotas(userId, fromISO, toISO, dbOverride);
  const suspeitos = linhas.filter(x => x.suspeito === 'SIM');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Greyhound Factory';

  // ---------- Instrucoes ----------
  const wi = wb.addWorksheet('Instrucoes', { views: [{ showGridLines: false }] });
  const put = (cell, val, font, align) => {
    wi.getCell(cell).value = val;
    wi.getCell(cell).font = font || fontBase;
    if (align) wi.getCell(cell).alignment = align;
  };
  put('B2', `Revisao de Derrotas — ${fromISO} a ${toISO}`, { name: 'Arial', bold: true, size: 14, color: { argb: DARKG } });
  put('B3', 'Motor Greyhound Factory · gerado pela tela de Configuracoes', { name: 'Arial', italic: true, size: 10, color: { argb: 'FF666666' } });
  const txt = [
    ['B5', 'COMO USAR', { name: 'Arial', bold: true, size: 11, color: { argb: GREEN } }],
    ['B6', 'Aba "Derrotas": todas as derrotas do periodo, ordenadas por prioridade de revisao', fontBase],
    ['B7', '(maior confianca do motor + favorito que chegou mais atras = erro de analise mais grave).', fontBase],
    ['B9', 'Preencha SO as 4 colunas amarelas, checando cada corrida:', { name: 'Arial', bold: true, size: 10 }],
    ['B10', '   • Result. confere?  — S se a chegada bate; N se o resultado gravado esta errado', fontBase],
    ['B11', '   • Pista limpa?       — S se limpa (sem Block/Bumped no favorito); N se suja', fontBase],
    ['B12', '   • Analise ruim?      — S quando pista limpa E o favorito perdeu mesmo assim (erro do motor)', fontBase],
    ['B13', '   • Observacoes         — notas livres (qual criterio enganou, o que viu no video)', fontBase],
    ['B15', 'Colunas CalTm..BRT = notas 0-100 do FAVORITO em cada criterio (pra ver qual criterio vendeu o favorito errado).', fontBase],
    ['B17', 'Aba "Resultados suspeitos": corridas onde o "bateu" gravado contradiz a chegada — conferir e corrigir PRIMEIRO.', { name: 'Arial', bold: true, size: 10, color: { argb: 'FFB00000' } }]
  ];
  txt.forEach(([c, v, f]) => put(c, v, f));
  put('B20', 'RESUMO (atualiza sozinho conforme voce preenche)', { name: 'Arial', bold: true, size: 11, color: { argb: GREEN } });
  const resumo = [
    ['B21', 'Total de derrotas no periodo', 'COUNTA(Derrotas!B3:B1000)'],
    ['B22', 'Marcadas "Analise ruim = S"', 'COUNTIF(Derrotas!Z3:Z1000,"S")'],
    ['B23', 'Marcadas "Pista limpa = S"', 'COUNTIF(Derrotas!Y3:Y1000,"S")'],
    ['B24', 'Resultado NAO confere (N)', 'COUNTIF(Derrotas!X3:X1000,"N")']
  ];
  resumo.forEach(([c, lbl, formula]) => {
    put(c, lbl, fontBase);
    const fc = 'D' + c.slice(1);
    wi.getCell(fc).value = { formula };
    wi.getCell(fc).font = { name: 'Arial', bold: true, size: 10 };
    wi.getCell(fc).alignment = { horizontal: 'center' };
  });
  wi.getColumn('B').width = 60; wi.getColumn('C').width = 6; wi.getColumn('D').width = 10; wi.getColumn('A').width = 2;

  // ---------- Derrotas ----------
  const ws = wb.addWorksheet('Derrotas', { views: [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: 2 }] });
  const headers = ['#', 'Dia', 'Hora', 'Corrida', 'Dist', 'Favorito', 'Perfil Fav', 'Underdog', 'Perfil Und',
    'Conf %', 'Nivel', 'Chegada (traps)', 'Pos Fav', 'Pos Und', 'Susp?', 'CalTm', 'Categoria', 'Bends', 'Split',
    'SP', 'Remarks', 'PostPick', 'BRT', 'Result. confere? (S/N)', 'Pista limpa? (S/N)', 'Analise ruim? (S/N)', 'Observacoes'];
  const leftCols = new Set([4, 6, 8, 27]);
  headers.forEach((h, i) => {
    const cc = ws.getCell(1, i + 1);
    cc.value = h; cc.font = fontHdr; cc.fill = fillHdr; cc.border = borderAll;
    cc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  ws.getRow(1).height = 30;
  // linha de exemplo
  const ex = ['ex', '16/07', '1:41', 'Kinsly A7', '480', 'T4 - Exemplo', 'avassalador', 'T2 - Outro', 'estavel', 78,
    'alta', '3-6-1-2-4-5', 5, 1, '', 90, 50, 80, 35, 55, 10, 55, 80, 'S', 'S', 'S', 'favorito chegou em 5o em pista limpa'];
  ex.forEach((v, i) => {
    const cc = ws.getCell(2, i + 1);
    cc.value = v; cc.font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF888888' } };
    cc.fill = fillEx; cc.border = borderAll;
    cc.alignment = { horizontal: leftCols.has(i + 1) ? 'left' : 'center', vertical: 'middle' };
  });
  let rowIdx = 3;
  linhas.forEach((x, i) => {
    const vals = [i + 1, x.dia, x.hora, x.corrida, x.dist, `T${x.favTrap} - ${x.favNome}`, x.favPerfil,
      `T${x.undTrap} - ${x.undNome}`, x.undPerfil, x.pct, x.nivel, x.chegada, x.favPos, x.undPos, x.suspeito,
      x.caltm, x.categoria, x.bends, x.split, x.sp, x.remarks, x.postPick, x.brt, '', '', '', ''];
    vals.forEach((v, j) => {
      const cc = ws.getCell(rowIdx, j + 1);
      cc.value = v; cc.font = fontBase; cc.border = borderAll;
      cc.alignment = { horizontal: leftCols.has(j + 1) ? 'left' : 'center', vertical: 'middle' };
      if (j + 1 >= 24) cc.fill = fillInput;
      if (x.suspeito === 'SIM' && j + 1 === 15) cc.fill = fillSusp;
    });
    rowIdx++;
  });
  const widths = [4, 7, 6, 13, 6, 22, 12, 22, 12, 7, 7, 16, 7, 7, 6, 7, 9, 7, 7, 6, 8, 9, 6, 13, 13, 13, 34];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const lastRow = Math.max(3, rowIdx - 1);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: lastRow, column: 27 } };

  // ---------- Resultados suspeitos ----------
  if (suspeitos.length) {
    const w2 = wb.addWorksheet('Resultados suspeitos', { views: [{ showGridLines: false }] });
    w2.getCell('B2').value = 'Resultados onde o "bateu" gravado contradiz a chegada — conferir e corrigir.';
    w2.getCell('B2').font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFB00000' } };
    const h2 = ['#', 'Dia', 'Hora', 'Corrida', 'Favorito', 'Pos Fav', 'Underdog', 'Pos Und', 'Gravado', 'Deveria', 'Chegada', 'Confere? (S/N)'];
    h2.forEach((h, i) => {
      const cc = w2.getCell(4, i + 1);
      cc.value = h; cc.font = fontHdr; cc.fill = fillHdr; cc.border = borderAll; cc.alignment = { horizontal: 'center' };
    });
    suspeitos.forEach((s, i) => {
      const vals = [i + 1, s.dia, s.hora, s.corrida, `T${s.favTrap}`, s.favPos, `T${s.undTrap}`, s.undPos, s.gravado, s.der, s.chegada, ''];
      vals.forEach((v, j) => {
        const cc = w2.getCell(5 + i, j + 1);
        cc.value = v; cc.font = fontBase; cc.border = borderAll;
        cc.alignment = { horizontal: j + 1 === 4 ? 'left' : 'center' };
        if (j + 1 === 12) cc.fill = fillInput;
      });
    });
    [4, 11, 6, 13, 8, 7, 8, 7, 9, 9, 16, 14].forEach((w, i) => { w2.getColumn(i + 1).width = w; });
  }

  return { wb, total: linhas.length, suspeitos: suspeitos.length };
}

module.exports = { buildDerrotasWorkbook, coletarDerrotas };