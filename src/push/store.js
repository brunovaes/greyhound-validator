'use strict';
// src/push/store.js
// Inscricoes de Web Push, uma por aparelho. A tabela e' criada SOB DEMANDA
// aqui, sem tocar no database.js — mesmo padrao ja usado pelo src/access/store.js.
//
// Uma inscricao e' o "endereco" que o navegador entrega pro nosso servidor
// poder acordar aquele aparelho pelo servico de push da Apple/Google. Ela e'
// por aparelho E por navegador: o mesmo usuario no iPhone e no desktop gera
// duas linhas. Por isso a PK e' o endpoint, nao o user_id.

const { db } = require('../db/database');

let _pronto = false;
function garantirTabela() {
  if (_pronto) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint    TEXT PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        p256dh      TEXT NOT NULL,
        auth        TEXT NOT NULL,
        user_agent  TEXT,
        criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
        ultimo_ok   DATETIME,
        falhas      INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
    `);
    _pronto = true;
  } catch (e) {
    console.error('[push/store] erro criando tabela:', e.message);
  }
}

// Salva ou atualiza. O navegador pode reemitir a mesma inscricao; o ON CONFLICT
// evita duplicar e ja zera o contador de falhas.
function salvar(userId, sub, userAgent) {
  garantirTabela();
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    throw new Error('inscricao invalida (faltam endpoint/keys)');
  }
  db.prepare(
    'INSERT INTO push_subscriptions (endpoint,user_id,p256dh,auth,user_agent) VALUES (?,?,?,?,?) ' +
    'ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, ' +
    'auth=excluded.auth, user_agent=excluded.user_agent, falhas=0'
  ).run(sub.endpoint, userId, sub.keys.p256dh, sub.keys.auth, String(userAgent || '').slice(0, 300));
}

function remover(endpoint) {
  garantirTabela();
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(endpoint);
}

function listarPorUsuario(userId) {
  garantirTabela();
  return db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').all(userId);
}

function listarTodas() {
  garantirTabela();
  return db.prepare('SELECT * FROM push_subscriptions').all();
}

function marcarOk(endpoint) {
  garantirTabela();
  db.prepare('UPDATE push_subscriptions SET ultimo_ok=CURRENT_TIMESTAMP, falhas=0 WHERE endpoint=?').run(endpoint);
}

// Falha nao derruba a inscricao na hora: so 404/410 do servico de push
// significam "morreu de vez" (ver sender.js). Aqui contamos as outras pra
// dar visibilidade e limpar as cronicas.
function marcarFalha(endpoint) {
  garantirTabela();
  db.prepare('UPDATE push_subscriptions SET falhas=falhas+1 WHERE endpoint=?').run(endpoint);
}

// Converte a linha do banco no formato que a lib web-push espera.
function paraWebPush(row) {
  return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
}

module.exports = { garantirTabela, salvar, remover, listarPorUsuario, listarTodas, marcarOk, marcarFalha, paraWebPush };