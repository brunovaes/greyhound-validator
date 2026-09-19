'use strict';
// src/utils/anuladas.js — CORRIDA ANULADA (Bruno, 19/09/2026)
//
// "Sera que conseguimos colocar uma lixeirinha no historico para quando a
//  corrida nao acontecer por algum motivo extraordinario eu poder excluir?"
//
// NAO APAGA NADA. Marca. Tres motivos, todos medidos no codigo antes:
//   1. A aposta da Banca aponta pra corrida pelo id (race_user_data). Apagar
//      a corrida deixaria a aposta solta, sem corrida.
//   2. O autoSaveSession da Analisar apaga e RECRIA as corridas do dia com ids
//      novos. Corrida apagada, ou marca guardada no id antigo, voltaria na
//      proxima reanalise.
//   3. Apagar nao tem volta. Marcar tem: desanular.
//
// Por isso a marca mora numa tabela propria e a CHAVE e' o dia + a corrida +
// a hora, nunca o id: sobrevive a corrida ser recriada. A chave e' a mesma do
// dedupe do Historico (lower(trim(corrida)) + '|' + trim(hora)), que ja e' o
// que o sistema usa pra dizer "estas duas linhas sao a mesma prova".
//
// O dia e' o da SESSAO em Brasilia (date(created_at,'-3 hours')), o mesmo
// recorte do Historico, do painel-dia e do Placar.

function chave(corrida, hora) {
  return String(corrida || '').trim().toLowerCase() + '|' + String(hora || '').trim();
}

// Pedaco de SQL pra ser colado num WHERE que ja tem `r` (races) e `s`
// (race_sessions). A conta da chave e' a mesma do chave() acima, em SQL.
const SQL_ANULADA =
  "EXISTS (SELECT 1 FROM corridas_anuladas ca WHERE ca.data = date(s.created_at,'-3 hours') "
  + "AND ca.chave = lower(trim(r.corrida)) || '|' || trim(r.hora))";
const SQL_NAO_ANULADA = 'NOT ' + SQL_ANULADA;

// As chaves anuladas de um dia. Banco sem a tabela (migracao ainda nao rodou)
// devolve vazio: nunca derruba a tela que perguntou.
function doDia(db, data) {
  try {
    const rows = db.prepare('SELECT chave FROM corridas_anuladas WHERE data=?').all(data);
    return new Set(rows.map(x => x.chave));
  } catch (e) { return new Set(); }
}

function lista(db, data) {
  try {
    return db.prepare('SELECT data, chave, corrida, hora, motivo, por, em FROM corridas_anuladas WHERE data=? ORDER BY hora').all(data);
  } catch (e) { return []; }
}

// Dia (Brasilia), corrida e hora de uma linha de races, pelo id.
function daCorrida(db, raceId) {
  return db.prepare(
    "SELECT r.id, r.corrida, r.hora, date(s.created_at,'-3 hours') AS data "
    + 'FROM races r JOIN race_sessions s ON s.id=r.session_id WHERE r.id=?'
  ).get(raceId) || null;
}

function anular(db, o) {
  db.prepare(
    'INSERT OR REPLACE INTO corridas_anuladas (data, chave, corrida, hora, motivo, por) VALUES (?,?,?,?,?,?)'
  ).run(o.data, chave(o.corrida, o.hora), o.corrida, o.hora, o.motivo || null, o.por || null);
}

function desanular(db, o) {
  return db.prepare('DELETE FROM corridas_anuladas WHERE data=? AND chave=?')
    .run(o.data, o.chave || chave(o.corrida, o.hora)).changes;
}

module.exports = { chave, SQL_ANULADA, SQL_NAO_ANULADA, doDia, lista, daCorrida, anular, desanular };
