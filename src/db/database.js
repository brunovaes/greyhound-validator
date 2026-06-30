const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const db = new Database(path.join(__dirname, '../../greyhound.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    plan TEXT DEFAULT 'free',
    analyses_used INTEGER DEFAULT 0,
    analyses_limit INTEGER DEFAULT 30,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  CREATE TABLE IF NOT EXISTS sessions_auth (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS race_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_races INTEGER DEFAULT 0,
    total_avbs INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS races (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    user_id INTEGER,
    hora TEXT,
    hora_br TEXT,
    corrida TEXT,
    dist TEXT,
    trap_fav INTEGER,
    name_fav TEXT,
    trap_und INTEGER,
    name_und TEXT,
    pct INTEGER,
    nivel TEXT,
    perfil_fav TEXT,
    perfil_und TEXT,
    obs TEXT,
    need_cap INTEGER DEFAULT 0,
    odd REAL,
    valor REAL,
    resultado_1 TEXT,
    resultado_2 TEXT,
    resultado_3 TEXT,
    bateu TEXT,
    back_trap INTEGER,
    back_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES race_sessions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS analysis_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    -- Pesos dos criterios (1-10)
    peso_categoria INTEGER DEFAULT 5,
    peso_caltm INTEGER DEFAULT 4,
    peso_bends INTEGER DEFAULT 3,
    peso_remarks INTEGER DEFAULT 3,
    peso_brt INTEGER DEFAULT 1,
    peso_post_pick INTEGER DEFAULT 0,
    -- Filtros de corrida
    dist_min INTEGER DEFAULT 400,
    dist_max INTEGER DEFAULT 575,
    classes_aceitas TEXT DEFAULT 'A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A12',
    min_corridas_uteis INTEGER DEFAULT 3,
    -- Thresholds de confianca
    pct_alta INTEGER DEFAULT 65,
    pct_media INTEGER DEFAULT 50,
    diff_caltm_significativa REAL DEFAULT 0.3,
    diff_caltm_empate REAL DEFAULT 0.1,
    -- Regra categoria vs caltm
    max_cat_diff_caltm INTEGER DEFAULT 1,
    -- Remarks
    remarks_muito_positivos TEXT DEFAULT 'SAw+RnOn,SAw+FinWll,FcdCk+RnOn,Bmp+RnOn,Crd+FinWll,Blk+StydOn',
    remarks_positivos TEXT DEFAULT 'RnOn,FinWll,StydOn,EP,Led,Chl,AHandy,ClrRn',
    remarks_atenuantes TEXT DEFAULT 'Bmp,Crd,Blk,FcdCk,Ck,Stb,Imp',
    remarks_negativos TEXT DEFAULT 'Fdd,NvrShwd,Outpaced,WeakFinish,SoonOutpaced,DroppedAway',
    -- MOTOR DE PONTUACAO (novos campos)
    ajuste_classe_segundos REAL DEFAULT 0.20,
    desconto_acidente_leve REAL DEFAULT 0.10,
    desconto_acidente_medio REAL DEFAULT 0.20,
    desconto_acidente_grave REAL DEFAULT 0.35,
    proporcao_media_caltm REAL DEFAULT 0.60,
    proporcao_melhor_caltm REAL DEFAULT 0.40,
    teto_diff_normalizacao REAL DEFAULT 0.50,
    threshold_skip_avb REAL DEFAULT 10.0,
    threshold_back REAL DEFAULT 25.0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Migracoes seguras para banco existente
const migrations = [
  'ALTER TABLE analysis_config ADD COLUMN peso_post_pick INTEGER DEFAULT 0',
  'ALTER TABLE analysis_config ADD COLUMN max_cat_diff_caltm INTEGER DEFAULT 1',
  'ALTER TABLE analysis_config ADD COLUMN ajuste_classe_segundos REAL DEFAULT 0.20',
  'ALTER TABLE analysis_config ADD COLUMN desconto_acidente_leve REAL DEFAULT 0.10',
  'ALTER TABLE analysis_config ADD COLUMN desconto_acidente_medio REAL DEFAULT 0.20',
  'ALTER TABLE analysis_config ADD COLUMN desconto_acidente_grave REAL DEFAULT 0.35',
  'ALTER TABLE analysis_config ADD COLUMN proporcao_media_caltm REAL DEFAULT 0.60',
  'ALTER TABLE analysis_config ADD COLUMN proporcao_melhor_caltm REAL DEFAULT 0.40',
  'ALTER TABLE analysis_config ADD COLUMN teto_diff_normalizacao REAL DEFAULT 0.50',
  'ALTER TABLE analysis_config ADD COLUMN threshold_skip_avb REAL DEFAULT 10.0',
  'ALTER TABLE analysis_config ADD COLUMN threshold_back REAL DEFAULT 25.0',
];
for (const sql of migrations) {
  try { db.prepare(sql).run(); } catch(e) { /* coluna ja existe */ }
}

// Funções de autenticação
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'greyhound-salt-2024').digest('hex');
}

function createUser(name, email, password, role = 'user', plan = 'free', limit = 30) {
  const hash = hashPassword(password);
  try {
    return db.prepare('INSERT INTO users (name, email, password_hash, role, plan, analyses_limit) VALUES (?,?,?,?,?,?)').run(name, email, hash, role, plan, limit);
  } catch(e) {
    return null;
  }
}

function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
}

function validatePassword(user, password) {
  return user.password_hash === hashPassword(password);
}

function getUserConfig(userId) {
  let config = db.prepare('SELECT * FROM analysis_config WHERE user_id = ?').get(userId);
  if (!config) {
    db.prepare('INSERT INTO analysis_config (user_id) VALUES (?)').run(userId);
    config = db.prepare('SELECT * FROM analysis_config WHERE user_id = ?').get(userId);
  }
  return config;
}

// Criar admin padrão se não existir
const admin = findUserByEmail('brunao@greyhound.com');
if (!admin) {
  createUser('Brunão', 'brunao@greyhound.com', 'greyhound2024', 'admin', 'premium', 999999);
  console.log('Admin criado: brunao@greyhound.com / greyhound2024');
}

module.exports = { db, hashPassword, createUser, findUserByEmail, validatePassword, getUserConfig };