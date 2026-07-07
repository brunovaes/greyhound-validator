'use strict';
// src/utils/auditLog.js
// Helper reutilizavel pra gravar a trilha de auditoria (race_audit_log).
// Qualquer robo ou rota pode chamar: "aqui esta a linha antiga, aqui esta a
// nova" — e ele grava so os campos que realmente mudaram.

const { db } = require('../db/database');

const insertStmt = db.prepare(
  'INSERT INTO race_audit_log (race_id, source, field, valor_antigo, valor_novo) VALUES (?,?,?,?,?)'
);

/**
 * Compara os campos rastreados entre a linha antiga (oldRow, objeto vindo do
 * banco) e os novos valores (newValues, objeto com os MESMOS nomes de campo
 * do banco) — grava uma linha de auditoria pra cada campo que for diferente.
 *
 * @param {number} raceId - id da corrida (races.id)
 * @param {string} source - quem fez a mudanca (ex: 'monitor_robot', 'results_robot', 'usuario')
 * @param {object} oldRow - linha atual do banco (antes da mudanca)
 * @param {object} newValues - novos valores (so precisa ter os campos rastreados)
 * @param {string[]} fields - quais campos comparar
 */
function logChanges(raceId, source, oldRow, newValues, fields) {
  if (!raceId || !oldRow || !newValues || !fields) return 0;
  let count = 0;
  for (const field of fields) {
    const antigo = oldRow[field];
    const novo = newValues[field];
    const antigoStr = antigo === null || antigo === undefined ? '' : String(antigo);
    const novoStr = novo === null || novo === undefined ? '' : String(novo);
    if (antigoStr === novoStr) continue;
    try {
      insertStmt.run(raceId, source, field, antigoStr, novoStr);
      count++;
    } catch (e) {
      console.error('[auditLog] erro ao gravar', field, e.message);
    }
  }
  return count;
}

module.exports = { logChanges };