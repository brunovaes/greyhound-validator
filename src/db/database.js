const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../../greyhound.db'));

db.exec(`
  -- Configurações do sistema
  CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Sessões de análise
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_races INTEGER DEFAULT 0,
    total_avbs INTEGER DEFAULT 0
  );

  -- Resultados de corridas
  CREATE TABLE IF NOT EXISTS races (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
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
    back_pct INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  -- Configurações de análise personalizadas
  CREATE TABLE IF NOT EXISTS analysis_config (
    id INTEGER PRIMARY KEY,
    -- Pesos dos critérios (1-10)
    peso_categoria INTEGER DEFAULT 5,
    peso_caltm INTEGER DEFAULT 4,
    peso_bends INTEGER DEFAULT 3,
    peso_remarks INTEGER DEFAULT 3,
    peso_brt INTEGER DEFAULT 1,
    -- Filtros de corrida
    dist_min INTEGER DEFAULT 400,
    dist_max INTEGER DEFAULT 575,
    classes_aceitas TEXT DEFAULT 'A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A12',
    min_corridas_uteis INTEGER DEFAULT 3,
    -- Thresholds
    pct_alta INTEGER DEFAULT 65,
    pct_media INTEGER DEFAULT 50,
    diff_caltm_significativa REAL DEFAULT 0.3,
    diff_caltm_empate REAL DEFAULT 0.1,
    -- Remarks positivos
    remarks_muito_positivos TEXT DEFAULT 'SAw+RnOn,SAw+FinWll,FcdCk+RnOn,Bmp+RnOn,Crd+FinWll,Blk+StydOn,Ck+FinWll,Bmp1+ChlRunIn,FcdCk1+FinWll',
    remarks_positivos TEXT DEFAULT 'RnOn,FinWll,StydOn,EP,Led,Chl,AHandy,ClrRn',
    remarks_atenuantes TEXT DEFAULT 'Bmp,Crd,Blk,FcdCk,Ck,Stb,Baulked,Imp',
    remarks_negativos TEXT DEFAULT 'Fdd,NvrShwd,Outpaced,WeakFinish,SoonOutpaced,AlwaysBehind,NeverNear,DroppedAway',
    -- Regras de perfil
    min_corridas_recuperador INTEGER DEFAULT 3,
    -- Capivara
    exigir_capivara_subindo INTEGER DEFAULT 1,
    exigir_capivara_descendo INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Inserir config padrão se não existir
  INSERT OR IGNORE INTO analysis_config (id) VALUES (1);
`);

module.exports = db;
