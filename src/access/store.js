// ============================================================================
// Armazenamento e motor de decisao do controle de acesso (RBAC por perfil).
// - Cria as tabelas sob demanda (nao mexe no database.js compartilhado).
// - Perfis de fabrica: Admin (libera tudo) + os planos existentes.
// - can(user, chave): a pergunta central "esse usuario pode acessar isso?".
//   Regra de seguranca: Admin sempre libera tudo; item sem regra explicita =
//   liberado (default-allow), pra nada sumir sem o admin mandar.
// ============================================================================

const { db } = require('../db/database');
const { isValidKey } = require('./registry');

db.exec(
  'CREATE TABLE IF NOT EXISTS access_profiles(' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
  '  key TEXT UNIQUE NOT NULL,' +
  '  name TEXT NOT NULL,' +
  '  is_admin INTEGER DEFAULT 0,' +   // 1 = libera tudo (bypass)
  '  is_system INTEGER DEFAULT 0,' +  // 1 = perfil de fabrica (nao pode excluir)
  "  created_at TEXT DEFAULT (datetime('now'))" +
  ');' +
  'CREATE TABLE IF NOT EXISTS access_permissions(' +
  '  profile_id INTEGER NOT NULL,' +
  '  item_key TEXT NOT NULL,' +
  '  allowed INTEGER NOT NULL DEFAULT 1,' +
  '  PRIMARY KEY(profile_id, item_key)' +
  ');'
);

// Coluna que amarra um usuario a um perfil especifico. Ate a Fase 2 o perfil
// vinha SO do plano (user.plan), o que tornava os perfis criados na tela de
// Acessos inuteis: dava pra criar "Analista", configurar tudo, e nenhum
// usuario podia receber esse perfil. Com a coluna, o admin escolhe na tela de
// Usuarios; quem ficar sem escolha continua caindo no plano, como antes.
try { db.prepare('ALTER TABLE users ADD COLUMN access_profile TEXT').run(); } catch (e) { /* ja existe */ }

function seedDefaults() {
  const seed = [
    { key: 'admin',   name: 'Admin',    is_admin: 1, is_system: 1 },
    { key: 'free',    name: 'Standard', is_admin: 0, is_system: 1 },
    { key: 'pro',     name: 'Pró',      is_admin: 0, is_system: 1 },
    { key: 'premium', name: 'Premium',  is_admin: 0, is_system: 1 },
  ];
  const ins = db.prepare('INSERT OR IGNORE INTO access_profiles(key,name,is_admin,is_system) VALUES(?,?,?,?)');
  seed.forEach(function (p) { ins.run(p.key, p.name, p.is_admin, p.is_system); });
  // Migra nomes antigos para os novos rotulos, sem sobrescrever renome manual.
  db.prepare("UPDATE access_profiles SET name='Standard' WHERE key='free' AND name='Free'").run();
  db.prepare("UPDATE access_profiles SET name='Pró' WHERE key='pro' AND name IN ('Pro','Pró')").run();
}
seedDefaults();

function listProfiles() {
  return db.prepare('SELECT * FROM access_profiles ORDER BY is_admin DESC, is_system DESC, id ASC').all();
}
function getProfileByKey(key) { return db.prepare('SELECT * FROM access_profiles WHERE key=?').get(key); }
function getProfileById(id)   { return db.prepare('SELECT * FROM access_profiles WHERE id=?').get(id); }

function createProfile(name) {
  const base = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'perfil';
  let key = base, n = 2;
  while (getProfileByKey(key)) key = base + '_' + (n++);
  const info = db.prepare('INSERT INTO access_profiles(key,name,is_admin,is_system) VALUES(?,?,0,0)').run(key, String(name || key).trim());
  return getProfileById(info.lastInsertRowid);
}
function renameProfile(id, name) {
  const nm = String(name || '').trim();
  if (nm) db.prepare('UPDATE access_profiles SET name=? WHERE id=?').run(nm, id);
}
function deleteProfile(id) {
  const p = getProfileById(id);
  if (!p || p.is_system) return false; // nao exclui perfil de fabrica
  db.prepare('DELETE FROM access_permissions WHERE profile_id=?').run(id);
  db.prepare('DELETE FROM access_profiles WHERE id=?').run(id);
  return true;
}

function getProfilePerms(id) {
  const rows = db.prepare('SELECT item_key, allowed FROM access_permissions WHERE profile_id=?').all(id);
  const map = {};
  rows.forEach(function (r) { map[r.item_key] = !!r.allowed; });
  return map;
}
function setPerm(id, key, allowed) {
  if (!isValidKey(key)) return;
  db.prepare('INSERT INTO access_permissions(profile_id,item_key,allowed) VALUES(?,?,?) ' +
    'ON CONFLICT(profile_id,item_key) DO UPDATE SET allowed=excluded.allowed').run(id, key, allowed ? 1 : 0);
}
function setPermsBulk(id, permsObj) {
  const tx = db.transaction(function (obj) {
    Object.keys(obj).forEach(function (k) { setPerm(id, k, obj[k]); });
  });
  tx(permsObj || {});
}

// Descobre o perfil do usuario: admin sempre; senao pelo plano.
function profileForUser(user) {
  if (!user) return null;
  if (user.role === 'admin') return getProfileByKey('admin');
  // 1) perfil escolhido pelo admin na tela de Usuarios; 2) senao, o plano.
  if (user.access_profile) {
    const p = getProfileByKey(user.access_profile);
    if (p) return p;
  }
  return getProfileByKey(user.plan) || null;
}

// A pergunta central. Admin -> tudo. Item sem regra -> liberado (default-allow).
function can(user, key) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const prof = profileForUser(user);
  if (!prof || prof.is_admin) return true;
  const row = db.prepare('SELECT allowed FROM access_permissions WHERE profile_id=? AND item_key=?').get(prof.id, key);
  if (!row) return true; // default-allow
  return !!row.allowed;
}

module.exports = {
  listProfiles, getProfileById, getProfileByKey,
  createProfile, renameProfile, deleteProfile,
  getProfilePerms, setPerm, setPermsBulk, profileForUser, can,
};