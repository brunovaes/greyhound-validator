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

// ============================================================
// DESEMPENHO POR CONTEXTO (HR por pista / nº de cães / classe)
// Instrumento de monitoramento — usa o "bateu" CORRIGIDO pela chegada real,
// e mostra o "bateu" cru lado a lado pra flagrar erro de resultado.
// ============================================================

// Coleta todos os AvBs resolvidos (favorito e underdog definidos + resultado
// que permite derivar o bateu). Se from/to forem nulos, pega tudo (all-time).
function coletarResolvidos(userId, fromISO, toISO, dbOverride) {
  const db = getDb(dbOverride);
  const rows = db.prepare(
    `SELECT r.*, s.name AS sessao
       FROM races r JOIN race_sessions s ON s.id = r.session_id
      WHERE r.user_id = ? AND r.trap_fav > 0 AND r.trap_und > 0`
  ).all(userId);
  const from = fromISO ? new Date(fromISO + 'T00:00:00') : null;
  const to = toISO ? new Date(toISO + 'T23:59:59') : null;
  const out = [];
  for (const r of rows) {
    const dt = parseSessionDate(r.sessao);
    if (from && (!dt || dt < from)) continue;
    if (to && (!dt || dt > to)) continue;
    let ordemFull = null;
    try { ordemFull = r.finishing_order_json ? JSON.parse(r.finishing_order_json) : null; } catch (e) { ordemFull = null; }
    const temFull = !!(ordemFull && ordemFull.length);
    const pf = posDoTrap(r, r.trap_fav, ordemFull);
    const pu = posDoTrap(r, r.trap_und, ordemFull);
    const der = derivarBateu(pf, pu, temFull);
    if (der == null) continue; // sem como derivar -> fora do HR
    let scores = [];
    try { scores = r.scores_json ? JSON.parse(r.scores_json) : []; } catch (e) { scores = []; }
    const partes = (r.corrida || '').split(' ');
    // timestamp (ord) pra ordenar por recencia — data da sessao + hora da corrida
    let hhmin = 0;
    { const pp = String(r.hora || '').split(':'); let H = parseInt(pp[0], 10); if (!isNaN(H)) { if (H >= 1 && H <= 9) H += 12; hhmin = H * 60 + (parseInt(pp[1], 10) || 0); } }
    out.push({
      pista: partes[0] || '?',
      classe: partes[partes.length - 1] || '?',
      dist: r.dist || '?',
      nElig: scores.length || null,
      hora: r.hora || '',
      ord: (dt ? dt.getTime() : 0) + hhmin * 60000,
      der, raw: r.bateu
    });
  }
  return out;
}

// Nomes completos das pistas — fonte UNICA em ./nomesPistas.js (compartilhada
// com historico/replay). Ajuste os nomes la, vale pra todas as telas.
const { nomePista } = require('./nomesPistas');

// hora_uk ("H:MM") -> hora em 24h UK (o sistema trata 1-9 como PM).
function horaUk24(h) {
  if (!h) return null;
  const p = String(h).split(':');
  let hr = parseInt(p[0], 10);
  if (isNaN(hr)) return null;
  if (hr >= 1 && hr <= 9) hr += 12;
  return hr;
}

// hora em 24h no fuso de Brasilia (BR = UK - 4h). Todo o dashboard trabalha em
// BR pra bater com o relogio do usuario.
function horaBr24(h) {
  const u = horaUk24(h);
  return u == null ? null : ((u - 4 + 24) % 24);
}

// Rotula o turno de uma corrida conforme as bordas configuraveis (horas 24h BR).
// So dois turnos: t1=inicio da Manha, t2=inicio da Tarde (tudo em BR).
function rotuloTurno(h, t1, t2) {
  const hr = horaBr24(h);
  if (hr == null) return null;
  if (hr < t1) return `Antes das ${t1}h BR`;
  if (hr < t2) return `Manhã (${t1}-${t2}h BR)`;
  return `Tarde (${t2}h+ BR)`;
}

// Converte um agrupamento {chave:{n,ac,nRaw,acRaw,err}} num array pronto pro
// front, com HR calculado e flag de amostra. ordenar: 'hr' (pior primeiro),
// 'num' (numerico crescente) ou 'none' (ordem de insercao).
function grupoParaArray(grupo, ordenar) {
  let arr = Object.entries(grupo).map(([k, b]) => ({
    chave: k, n: b.n, ac: b.ac,
    hr: b.n ? b.ac / b.n : 0,
    hrCru: b.nRaw ? b.acRaw / b.nRaw : null,
    err: b.err,
    amostra: b.n >= 30 ? 'boa' : b.n >= 15 ? 'media' : 'baixa'
  }));
  if (ordenar === 'hr') arr.sort((a, b) => a.hr - b.hr);
  else if (ordenar === 'num') arr.sort((a, b) => (parseFloat(a.chave) || 0) - (parseFloat(b.chave) || 0));
  return arr;
}

// Ordena classes na ordem natural A1, A2, ... A10, A11, A12 (nao alfabetica).
function cmpClasse(a, b) {
  const na = parseInt(String(a).replace(/\D/g, ''), 10);
  const nb = parseInt(String(b).replace(/\D/g, ''), 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b));
}

// Dados agregados pro dashboard (JSON puro, sem planilha).
// filtros = { turno, pista, caes, classe } — qualquer um pode faltar ('' = todos).
// pista e classe aceitam MULTIPLOS valores (lista separada por virgula).
// Cruza as dimensoes: aplica todos os filtros presentes e agrega o subconjunto.
function buildDesempenhoData(userId, fromISO, toISO, turnos, filtros, dbOverride) {
  // bordas em horario BR (Brasilia). Dois turnos: Manha a partir de t1 (6h) e
  // Tarde a partir de t2 (13h).
  const t1 = (turnos && turnos.t1) || 6;
  const t2 = (turnos && turnos.t2) || 13;
  const f = filtros || {};
  const todos = coletarResolvidos(userId, fromISO || null, toISO || null, dbOverride)
    .map(x => Object.assign(x, { turno: rotuloTurno(x.hora, t1, t2) }));

  // Opcoes dos dropdowns — sempre do conjunto do PERIODO (antes do cruzamento),
  // pra lista nao "sumir" conforme voce filtra.
  const uniq = (arr) => Array.from(new Set(arr.filter(v => v != null && v !== '')));
  const ordTurno = tv => { const m = /\((\d+)/.exec(tv || ''); return m ? parseInt(m[1], 10) : (/(Antes)/.test(tv||'') ? -1 : 99); };
  const opcoes = {
    turnos: uniq(todos.map(x => x.turno)).sort((a, b) => ordTurno(a) - ordTurno(b)),
    pistas: uniq(todos.map(x => x.pista)).sort(),
    caes: uniq(todos.map(x => x.nElig)).sort((a, b) => a - b),
    classes: uniq(todos.map(x => x.classe)).sort(cmpClasse)
  };

  // Nomes completos das pistas disponiveis (pro filtro e o relatorio).
  const nomes = {};
  opcoes.pistas.forEach(p => { nomes[p] = nomePista(p); });

  // Aplica o cruzamento. Pista e classe aceitam MULTIPLA (lista separada por virgula).
  const pistaSel = String(f.pista || '').split(',').map(s => s.trim()).filter(Boolean);
  const classeSel = String(f.classe || '').split(',').map(s => s.trim()).filter(Boolean);
  const items = todos.filter(x =>
    (!f.turno || x.turno === f.turno) &&
    (!pistaSel.length || pistaSel.includes(x.pista)) &&
    (!f.caes || String(x.nElig) === String(f.caes)) &&
    (!classeSel.length || classeSel.includes(x.classe))
  );

  // Filtro por QUANTIDADE de corridas: mostra so os grupos (pista/classe) cujo
  // numero de corridas (n) cai no intervalo [qtdMin, qtdMax]. Nao mexe no
  // resumo nem em turno/nElig (esses sao poucos grupos com muitas corridas).
  const qMin = parseInt(f.qtdMin, 10);
  const qMax = parseInt(f.qtdMax, 10);
  const passaQtd = n => (!(qMin > 0) || n >= qMin) && (!(qMax > 0) || n <= qMax);

  const total = items.length;
  const ac = items.filter(x => x.der === 'sim').length;
  const rawItems = items.filter(x => x.raw === 'sim' || x.raw === 'nao');
  const acRaw = rawItems.filter(x => x.raw === 'sim').length;
  const err = rawItems.filter(x => x.raw !== x.der).length;

  return {
    periodo: { from: fromISO || null, to: toISO || null },
    turnos: { t1, t2 },
    filtros: { turno: f.turno || '', pista: f.pista || '', caes: f.caes || '', classe: f.classe || '', qtdMin: f.qtdMin || '', qtdMax: f.qtdMax || '' },
    opcoes, nomes,
    resumo: {
      total, acertos: ac,
      hr: total ? ac / total : 0,
      hrCru: rawItems.length ? acRaw / rawItems.length : null,
      erros: err
    },
    porTurno: grupoParaArray(agrupaPor(items, x => x.turno), 'none'),
    porPista: grupoParaArray(agrupaPor(items, x => x.pista), 'hr').filter(r => passaQtd(r.n)),
    porCaes: grupoParaArray(agrupaPor(items, x => x.nElig), 'num'),
    porClasse: grupoParaArray(agrupaPor(items, x => x.classe), 'hr').filter(r => passaQtd(r.n))
  };
}

function agrupaPor(items, keyFn) {
  const g = {};
  for (const it of items) {
    const k = keyFn(it);
    if (k == null || k === '' || k === '?') continue;
    const b = (g[k] = g[k] || { n: 0, ac: 0, nRaw: 0, acRaw: 0, err: 0 });
    b.n++; if (it.der === 'sim') b.ac++;
    if (it.raw === 'sim' || it.raw === 'nao') {
      b.nRaw++; if (it.raw === 'sim') b.acRaw++;
      if (it.raw !== it.der) b.err++;
    }
  }
  return g;
}

function buildDesempenhoWorkbook(userId, fromISO, toISO, dbOverride) {
  const items = coletarResolvidos(userId, fromISO || null, toISO || null, dbOverride);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Greyhound Factory';

  const amostraLabel = n => (n >= 30 ? 'boa' : n >= 15 ? 'media' : 'baixa (ruido)');
  const fmtPct = { numFmt: '0.0%' };

  // Aba generica: recebe o agrupamento e o rotulo da 1a coluna
  function abaGrupo(nome, rotulo, grupo, ordenarPorHR) {
    const ws = wb.addWorksheet(nome, { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] });
    const headers = [rotulo, 'AvBs (n)', 'Acertos', 'HR corrigido', 'HR cru', 'Erros de label', 'Amostra'];
    headers.forEach((h, i) => {
      const cc = ws.getCell(1, i + 1);
      cc.value = h; cc.font = fontHdr; cc.fill = fillHdr; cc.border = borderAll;
      cc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    ws.getRow(1).height = 26;
    let entries = Object.entries(grupo);
    if (ordenarPorHR) entries.sort((a, b) => (a[1].ac / a[1].n) - (b[1].ac / b[1].n)); // pior primeiro
    else entries.sort((a, b) => (isNaN(+a[0]) ? String(a[0]).localeCompare(b[0]) : (+a[0]) - (+b[0])));
    let row = 2;
    for (const [k, b] of entries) {
      const hrCru = b.nRaw ? b.acRaw / b.nRaw : '';
      const vals = [k, b.n, b.ac, { formula: `C${row}/B${row}` }, hrCru, b.err, amostraLabel(b.n)];
      vals.forEach((v, i) => {
        const cc = ws.getCell(row, i + 1);
        cc.value = v; cc.font = fontBase; cc.border = borderAll;
        cc.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' };
        if (i === 3 || i === 4) cc.numFmt = fmtPct.numFmt;
        if (i === 5 && b.err > 0) cc.fill = fillSusp;         // erros de label em rosa
        if (i === 3) {
          const hr = b.ac / b.n;
          cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hr >= 0.65 ? 'FFDDF3E4' : hr < 0.5 ? 'FFF7D6D6' : 'FFFDF3D6' } };
        }
      });
      row++;
    }
    const wds = [rotulo.length > 10 ? 16 : 12, 10, 10, 13, 10, 14, 14];
    wds.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    return ws;
  }

  // Resumo geral
  const total = items.length;
  const acTot = items.filter(x => x.der === 'sim').length;
  const rawItems = items.filter(x => x.raw === 'sim' || x.raw === 'nao');
  const errTot = rawItems.filter(x => x.raw !== x.der).length;
  const wr = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
  const putR = (cell, val, font, align, numFmt) => {
    wr.getCell(cell).value = val; wr.getCell(cell).font = font || fontBase;
    if (align) wr.getCell(cell).alignment = align; if (numFmt) wr.getCell(cell).numFmt = numFmt;
  };
  putR('B2', 'Desempenho por Contexto — HR dos AvBs', { name: 'Arial', bold: true, size: 14, color: { argb: DARKG } });
  const periodo = (fromISO || toISO) ? `Periodo: ${fromISO || 'inicio'} a ${toISO || 'hoje'}` : 'Periodo: todo o historico';
  putR('B3', periodo, { name: 'Arial', italic: true, size: 10, color: { argb: 'FF666666' } });
  putR('B5', 'HR = acertos / AvBs resolvidos. "Corrigido" usa a chegada real; "cru" usa o campo bateu do banco.', fontBase);
  putR('B6', 'A coluna Erros de label conta onde os dois discordam — provavel resultado digitado errado.', fontBase);
  const linhasR = [
    ['B8', 'Total de AvBs resolvidos', total, null],
    ['B9', 'HR corrigido (geral)', total ? acTot / total : 0, '0.0%'],
    ['B10', 'HR cru (geral)', rawItems.length ? rawItems.filter(x => x.raw === 'sim').length / rawItems.length : 0, '0.0%'],
    ['B11', 'Erros de label detectados', errTot, null]
  ];
  linhasR.forEach(([c, lbl, val, nf]) => {
    putR(c, lbl, fontBase);
    const fc = 'E' + c.slice(1);
    putR(fc, val, { name: 'Arial', bold: true, size: 11 }, { horizontal: 'center' }, nf);
  });
  wr.getColumn('B').width = 34; wr.getColumn('C').width = 4; wr.getColumn('D').width = 4; wr.getColumn('E').width = 12;

  abaGrupo('HR por Pista', 'Pista', agrupaPor(items, x => x.pista), true);
  abaGrupo('HR por No de Caes', 'Nº cães elegiveis', agrupaPor(items, x => x.nElig), false);
  abaGrupo('HR por Classe', 'Classe', agrupaPor(items, x => x.classe), true);

  return { wb, total, acTot, errTot };
}

// ============================================================
// EXPORT DE DADOS BRUTOS (JSON) — pra analise/afinacao do motor.
// Reproduz a estrutura do backtest_motor_*.json direto do banco, e agora
// inclui automaticamente race_card + trapsCard (composicao do pareo, de onde
// saem as traps vazias) e o estilo no nome (W)/(M) — sem nenhum trabalho
// manual. O robo ja salvou tudo isso; aqui so empacota.
// ============================================================
function jp(s, fallback) { try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; } }

function buildBacktestJson(userId, fromISO, toISO, dbOverride) {
  const db = getDb(dbOverride);
  const rows = db.prepare(
    `SELECT r.*, s.name AS sessao
       FROM races r JOIN race_sessions s ON s.id = r.session_id
      WHERE r.user_id = ? AND r.trap_fav > 0 AND r.trap_und > 0
      ORDER BY s.created_at, r.hora`
  ).all(userId);
  const from = fromISO ? new Date(fromISO + 'T00:00:00') : null;
  const to = toISO ? new Date(toISO + 'T23:59:59') : null;

  const corridas = [];
  for (const r of rows) {
    const dt = parseSessionDate(r.sessao);
    if (from && (!dt || dt < from)) continue;
    if (to && (!dt || dt > to)) continue;

    const raceCard = jp(r.race_card, []);                 // [{trap,nome}] — nomes trazem (W)/(M)
    const trapsCard = raceCard.map(g => g.trap).filter(t => t != null).sort((a, b) => a - b);
    const presentes = new Set(trapsCard);
    const trapsVazias = [1, 2, 3, 4, 5, 6].filter(t => !presentes.has(t)); // derivado, so pra conveniencia

    corridas.push({
      sessao: r.sessao,
      hora_uk: r.hora || '', hora_br: r.hora_br || '',
      corrida: r.corrida || '', dist: r.dist || '',
      previsao_do_motor: {
        favorito: { trap: r.trap_fav, nome: r.name_fav, perfil: r.perfil_fav },
        underdog: { trap: r.trap_und, nome: r.name_und, perfil: r.perfil_und },
        confianca_pct: r.pct, nivel: r.nivel,
        scores_por_criterio: jp(r.scores_json, [])
      },
      resultado_real: {
        primeiro: r.resultado_1, segundo: r.resultado_2, terceiro: r.resultado_3,
        chegada_completa: jp(r.finishing_order_json, null)
      },
      bateu: r.bateu,
      eliminados_antes_do_calculo: jp(r.eliminados, []),
      historico_pre_corrida: jp(r.hist_all, []),
      // --- NOVO: composicao do pareo p/ validacao de trap vazia/vizinho ---
      race_card: raceCard,
      trapsCard,
      traps_vazias: trapsVazias
    });
  }
  return {
    total_corridas: corridas.length,
    total_bateu_sim: corridas.filter(c => c.bateu === 'sim').length,
    total_bateu_nao: corridas.filter(c => c.bateu === 'nao').length,
    corridas
  };
}

module.exports = {
  buildDerrotasWorkbook, coletarDerrotas,
  buildDesempenhoWorkbook, coletarResolvidos,
  buildBacktestJson, buildDesempenhoData
};