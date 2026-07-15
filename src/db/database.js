const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || '/data/greyhound.db';
const db = new Database(DB_PATH);
console.log('[DB] usando banco em:', DB_PATH);

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
    peso_categoria INTEGER DEFAULT 4,
    peso_caltm INTEGER DEFAULT 5,
    peso_bends INTEGER DEFAULT 3,
    peso_remarks INTEGER DEFAULT 2,
    peso_brt INTEGER DEFAULT 1,
    peso_post_pick INTEGER DEFAULT 2,
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
    min_corridas_retorno INTEGER DEFAULT 2,
    dias_inatividade_threshold INTEGER DEFAULT 25,
    max_niveis_pool INTEGER DEFAULT 2,
    max_linhas_cat_inferior INTEGER DEFAULT 3,
    max_dias_gap_nova_cat INTEGER DEFAULT 14,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Trilha de auditoria: registra toda alteracao de campo relevante numa
  -- corrida, independente de quem/o que mudou (robo de monitoramento, robo
  -- de resultados, edicao manual). Historico permanente, nao reseta nunca.
  CREATE TABLE IF NOT EXISTS race_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER NOT NULL,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT NOT NULL,
    field TEXT NOT NULL,
    valor_antigo TEXT,
    valor_novo TEXT,
    FOREIGN KEY (race_id) REFERENCES races(id)
  );

  -- Banca inicial de referencia por mes (1 unidade = 1% desse valor, fixo o
  -- mes inteiro — nao recalcula a cada aposta). Se nao existir linha pro mes
  -- atual, o sistema usa o saldo final do mes anterior como padrao (ou 1000
  -- se for o primeiro mes), mas o usuario pode sobrescrever manualmente.
  CREATE TABLE IF NOT EXISTS bankroll_months (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    year_month TEXT NOT NULL,
    banca_inicial REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, year_month),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Guarda o log da ULTIMA execucao de cada robo (PDF/Resultados/Monitoramento)
  -- em disco, pra sobreviver a restart do servidor (deploy, etc). Sem isso, o
  -- log some toda vez que o processo reinicia, porque hoje vive so na memoria.
  CREATE TABLE IF NOT EXISTS robot_logs (
    robot_name TEXT PRIMARY KEY,
    status_json TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Paleta de cores dos badges de trap (1-6), usada pelo pdfParser.js pra
  -- identificar o trap real de cada galgo pela imagem do card, em vez de
  -- assumir posicao sequencial (que quebra quando um trap fica ausente do
  -- PDF). Semeada com valores padrao (ver seedTrapBadgeColors abaixo) e
  -- recalibrada automaticamente sempre que um card com os 6 galgos completos
  -- e processado (nesse caso a ordem 1..6 e garantidamente correta, entao da
  -- pra confiar na cor medida daquele PDF como referencia mais fresca).
  CREATE TABLE IF NOT EXISTS trap_badge_colors (
    trap INTEGER PRIMARY KEY,
    r INTEGER NOT NULL,
    g INTEGER NOT NULL,
    b INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  "ALTER TABLE races ADD COLUMN hist_fav TEXT DEFAULT NULL",
  "ALTER TABLE races ADD COLUMN hist_und TEXT DEFAULT NULL",
  "ALTER TABLE races ADD COLUMN race_card TEXT DEFAULT NULL",
  "ALTER TABLE races ADD COLUMN video_url TEXT DEFAULT NULL",
  "ALTER TABLE races ADD COLUMN top3 TEXT DEFAULT NULL",
  "ALTER TABLE races ADD COLUMN avb_nao_aberto INTEGER DEFAULT 0",
  "ALTER TABLE races ADD COLUMN hist_all TEXT DEFAULT NULL",
  "ALTER TABLE races ADD COLUMN data_card TEXT DEFAULT NULL",
  "ALTER TABLE races ADD COLUMN track_full TEXT DEFAULT NULL",
  "ALTER TABLE races ADD COLUMN card_suspect INTEGER DEFAULT 0",
  "ALTER TABLE races ADD COLUMN nivel_pre_suspeita TEXT DEFAULT NULL",
  "ALTER TABLE races ADD COLUMN bet_entrou INTEGER DEFAULT 0",
  "ALTER TABLE races ADD COLUMN bet_unidades REAL DEFAULT 2.5",
  "ALTER TABLE races ADD COLUMN eliminados TEXT",
  "ALTER TABLE races ADD COLUMN post_pick TEXT",
  'ALTER TABLE analysis_config ADD COLUMN teto_diff_normalizacao REAL DEFAULT 0.50',
  'ALTER TABLE analysis_config ADD COLUMN threshold_skip_avb REAL DEFAULT 10.0',
  'ALTER TABLE analysis_config ADD COLUMN threshold_back REAL DEFAULT 25.0',
  'ALTER TABLE analysis_config ADD COLUMN min_corridas_retorno INTEGER DEFAULT 2',
  'ALTER TABLE analysis_config ADD COLUMN dias_inatividade_threshold INTEGER DEFAULT 25',
  'ALTER TABLE analysis_config ADD COLUMN max_niveis_pool INTEGER DEFAULT 2',
  'ALTER TABLE analysis_config ADD COLUMN max_linhas_cat_inferior INTEGER DEFAULT 3',
  'ALTER TABLE analysis_config ADD COLUMN max_dias_gap_nova_cat INTEGER DEFAULT 14',
  'ALTER TABLE analysis_config ADD COLUMN visibility_interval_min INTEGER DEFAULT 120',
  'ALTER TABLE analysis_config ADD COLUMN results_interval_min INTEGER DEFAULT 30',
  'ALTER TABLE analysis_config ADD COLUMN results_window_start TEXT DEFAULT \'07:30\'',
  'ALTER TABLE analysis_config ADD COLUMN results_window_end TEXT DEFAULT \'19:30\'',
  'ALTER TABLE analysis_config ADD COLUMN pdf_cron_time TEXT DEFAULT \'13:30\'',
  'ALTER TABLE analysis_config ADD COLUMN auto_refresh_min INTEGER DEFAULT 1',
  'ALTER TABLE analysis_config ADD COLUMN racas_em_tela INTEGER DEFAULT 6',
  "ALTER TABLE analysis_config ADD COLUMN monitor_interval_min INTEGER DEFAULT 60",
  "ALTER TABLE analysis_config ADD COLUMN monitor_window_start TEXT DEFAULT '07:00'",
  "ALTER TABLE analysis_config ADD COLUMN monitor_window_end TEXT DEFAULT '20:00'",
  "ALTER TABLE analysis_config ADD COLUMN banca_unidade_padrao REAL DEFAULT 2.5",
  "ALTER TABLE analysis_config ADD COLUMN banca_valor_inicial REAL DEFAULT 1000",
  "ALTER TABLE analysis_config ADD COLUMN banca_pct_stop REAL DEFAULT 20",
  "ALTER TABLE analysis_config ADD COLUMN banca_aviso_stop TEXT DEFAULT 'Atenção: o prejuízo de hoje atingiu o limite configurado. Considere parar as apostas por hoje.'",
  "ALTER TABLE analysis_config ADD COLUMN bloco_pesos_ativo INTEGER DEFAULT 1",
  "ALTER TABLE analysis_config ADD COLUMN bloco_categoria_ativo INTEGER DEFAULT 1",
  "ALTER TABLE analysis_config ADD COLUMN bloco_filtros_ativo INTEGER DEFAULT 1",
  "ALTER TABLE analysis_config ADD COLUMN bloco_confianca_ativo INTEGER DEFAULT 1",
  "ALTER TABLE analysis_config ADD COLUMN bloco_motor_ativo INTEGER DEFAULT 1",
  "ALTER TABLE races ADD COLUMN final_check_status TEXT DEFAULT NULL",
  "ALTER TABLE races ADD COLUMN final_check_at DATETIME DEFAULT NULL",
  "ALTER TABLE analysis_config ADD COLUMN final_check_min_antes INTEGER DEFAULT 15",
  "ALTER TABLE races ADD COLUMN scores_json TEXT DEFAULT NULL",
  "ALTER TABLE analysis_config ADD COLUMN peso_sp INTEGER DEFAULT 3", // adicionado 13/07 — motor de SP (Starting Price / IRM)
  "ALTER TABLE analysis_config ADD COLUMN peso_split INTEGER DEFAULT 3", // adicionado 14/07 — Split virou criterio proprio (antes era bonus fixo dentro do Bends); peso atualizado no mesmo dia
  "ALTER TABLE analysis_config ADD COLUMN teto_diff_split REAL DEFAULT 0.15",
  "ALTER TABLE analysis_config ADD COLUMN alerta_min_antes INTEGER DEFAULT 3", // adicionado 14/07 — antes fixo em 3, agora configuravel
  "ALTER TABLE analysis_config ADD COLUMN tela_grace_min INTEGER DEFAULT 0", // adicionado 14/07 — quanto tempo apos a corrida rodar ela ainda fica em tela (antes fixo em 0)
  "ALTER TABLE analysis_config ADD COLUMN som_alerta TEXT DEFAULT 'sino'", // adicionado 14/07 — sino/beep/alarme/suave
  "ALTER TABLE races ADD COLUMN finishing_order_json TEXT DEFAULT NULL", // adicionado 14/07 — chegada completa (1o-6o), nao so o top3
];
for (const sql of migrations) {
  try { db.prepare(sql).run(); } catch(e) { /* coluna ja existe */ }
}

// Ajuste pontual 13/07/2026: muda a janela padrao do robo de Resultados de
// 09:00-18:30 pra 07:30-19:30 — corridas do fim do dia UK (ate ~20:00 BRT)
// estavam ficando de fora da janela antiga, e nunca pegavam resultado
// automatico. So aplica se a coluna ainda estiver exatamente no valor
// padrao antigo (nao sobrescreve se o usuario ja tiver customizado).
try {
  db.prepare("UPDATE analysis_config SET results_window_start='07:30' WHERE results_window_start='09:00'").run();
  db.prepare("UPDATE analysis_config SET results_window_end='19:30' WHERE results_window_end='18:30'").run();
  db.prepare("UPDATE analysis_config SET monitor_window_start='07:00' WHERE monitor_window_start='09:00'").run();
  // Pesos novos confirmados com o Bruno em 14/07/2026 — so aplica se ainda
  // estiver exatamente no valor padrao antigo (nao sobrescreve customizacao).
  db.prepare("UPDATE analysis_config SET peso_caltm=5 WHERE peso_caltm=4").run();
  db.prepare("UPDATE analysis_config SET peso_remarks=2 WHERE peso_remarks=3").run();
  db.prepare("UPDATE analysis_config SET peso_post_pick=2 WHERE peso_post_pick=0").run();
  db.prepare("UPDATE analysis_config SET peso_split=3 WHERE peso_split=2").run();
  db.prepare("UPDATE analysis_config SET peso_categoria=4 WHERE peso_categoria=5").run();
  // Categoria fica sempre em 4 pra quem ainda nao tem opiniao formada — coluna
  // nova, nao precisa de checagem de "valor antigo" (nunca existiu antes).
} catch(e) { /* ignora */ }

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

// "Motor fixo" — valores de fabrica de cada bloco, usados quando o usuario
// desliga a customizacao daquele bloco (Configuracoes). Sao os MESMOS valores
// originais do schema (DEFAULT de cada coluna), fixos aqui separadamente pra
// nunca mudarem mesmo que o schema em si seja alterado no futuro.
const MOTOR_FIXO_DEFAULTS = {
  pesos: { peso_caltm: 4, peso_bends: 3, peso_remarks: 3, peso_brt: 1, peso_post_pick: 0 },
  categoria: { max_cat_diff_caltm: 1, max_niveis_pool: 2, max_linhas_cat_inferior: 3, max_dias_gap_nova_cat: 14 },
  filtros: { classes_aceitas: 'A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A12', dist_min: 400, dist_max: 575, min_corridas_uteis: 3 },
  confianca: { pct_alta: 65, pct_media: 50 },
  motor: { ajuste_classe_segundos: 0.20, desconto_acidente_leve: 0.10, desconto_acidente_medio: 0.20, proporcao_media_caltm: 0.60, teto_diff_normalizacao: 0.50, threshold_skip_avb: 10.0, threshold_back: 25.0 }
};

// aplicaBlocos=true (padrao): retorna os valores EFETIVOS (o que o motor de
// analise/robos devem realmente usar) — troca pelo motor fixo nos blocos
// desligados. aplicaBlocos=false: retorna os valores BRUTOS como estao
// salvos no banco, sem substituicao — usado pela propria tela de
// Configuracoes, pra nao "esconder"/perder a customizacao antiga do usuario
// quando ele desliga um bloco temporariamente (se nao fizesse essa distincao,
// religar o bloco depois mostraria os valores fixos como se fossem os dele).
function getUserConfig(userId, aplicaBlocos) {
  if (aplicaBlocos === undefined) aplicaBlocos = true;
  let config = db.prepare('SELECT * FROM analysis_config WHERE user_id = ?').get(userId);
  if (!config) {
    db.prepare('INSERT INTO analysis_config (user_id) VALUES (?)').run(userId);
    config = db.prepare('SELECT * FROM analysis_config WHERE user_id = ?').get(userId);
  }
  if (!aplicaBlocos) return config;
  // Bloco desligado (bloco_x_ativo=0) -> usa os valores de fabrica (motor
  // fixo) daquele bloco em vez do que o usuario configurou manualmente.
  // Aplicado aqui, central, pra valer automaticamente em qualquer lugar que
  // chame getUserConfig (motor de analise, robos, etc), sem precisar mudar
  // cada ponto de uso um por um.
  if (!config.bloco_pesos_ativo) Object.assign(config, MOTOR_FIXO_DEFAULTS.pesos);
  if (!config.bloco_categoria_ativo) Object.assign(config, MOTOR_FIXO_DEFAULTS.categoria);
  if (!config.bloco_filtros_ativo) Object.assign(config, MOTOR_FIXO_DEFAULTS.filtros);
  if (!config.bloco_confianca_ativo) Object.assign(config, MOTOR_FIXO_DEFAULTS.confianca);
  if (!config.bloco_motor_ativo) Object.assign(config, MOTOR_FIXO_DEFAULTS.motor);
  return config;
}

// Criar admin padrão se não existir
const admin = findUserByEmail('brunao@greyhound.com');
if (!admin) {
  createUser('Brunão', 'brunao@greyhound.com', 'greyhound2024', 'admin', 'premium', 999999);
  console.log('Admin criado: brunao@greyhound.com / greyhound2024');
}

// Semente da paleta de cores dos badges de trap — so insere se a tabela
// ainda estiver vazia (primeira vez), pra nunca sobrescrever uma calibracao
// mais fresca que ja tenha sido aprendida de um PDF real. Precisa ficar em
// sincronia com DEFAULT_TRAP_COLORS em src/utils/pdfParser.js (mesmos
// valores — a semente aqui so existe pra popular o banco no primeiro boot).
const SEED_TRAP_COLORS = {
  1: [212, 12, 2],
  2: [34, 150, 218],
  3: [196, 196, 196],
  4: [38, 38, 38],
  5: [255, 159, 40],
  6: [134, 95, 95],
};
try {
  const jaTem = db.prepare('SELECT COUNT(*) as n FROM trap_badge_colors').get();
  if (!jaTem || jaTem.n === 0) {
    const ins = db.prepare('INSERT INTO trap_badge_colors (trap,r,g,b) VALUES (?,?,?,?)');
    for (const trap of Object.keys(SEED_TRAP_COLORS)) {
      const [r,g,b] = SEED_TRAP_COLORS[trap];
      ins.run(parseInt(trap), r, g, b);
    }
    console.log('[trap_badge_colors] paleta semeada com valores padrao');
  }
} catch (e) { console.error('[trap_badge_colors] erro ao semear', e.message); }

// Le a paleta atual (calibrada) do banco -> {1:[r,g,b], ..., 6:[r,g,b]}.
// Se por algum motivo a tabela estiver vazia/inacessivel, devolve null e
// quem chamou (api.js) cai pro DEFAULT_TRAP_COLORS do proprio pdfParser.js.
function getTrapBadgeColors() {
  try {
    const rows = db.prepare('SELECT trap,r,g,b FROM trap_badge_colors').all();
    if (!rows.length) return null;
    const palette = {};
    rows.forEach(row => { palette[row.trap] = [row.r, row.g, row.b]; });
    return palette;
  } catch (e) { return null; }
}

// Atualiza a paleta com cores medidas de um card real com os 6 galgos
// completos (a unica situacao em que a cor medida e garantidamente
// confiavel como referencia — ver comentario em parseRacingPostPDF).
function saveTrapBadgeColors(colorsByTrap) {
  try {
    const upd = db.prepare(
      'INSERT INTO trap_badge_colors (trap,r,g,b,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ' +
      'ON CONFLICT(trap) DO UPDATE SET r=excluded.r, g=excluded.g, b=excluded.b, updated_at=CURRENT_TIMESTAMP'
    );
    for (const trap of Object.keys(colorsByTrap)) {
      const [r,g,b] = colorsByTrap[trap];
      upd.run(parseInt(trap), r, g, b);
    }
  } catch (e) { console.error('[trap_badge_colors] erro ao recalibrar', e.message); }
}

// Persiste o status/log de um robo (pdf/results/monitor) em disco, pra
// sobreviver a restart do processo. Chamado no fim de cada execucao (e pode
// ser chamado no meio tambem, pra nao perder nada se cair no meio do caminho).
function saveRobotLog(robotName, status) {
  try {
    db.prepare(
      'INSERT INTO robot_logs (robot_name, status_json, updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ' +
      'ON CONFLICT(robot_name) DO UPDATE SET status_json=excluded.status_json, updated_at=CURRENT_TIMESTAMP'
    ).run(robotName, JSON.stringify(status));
  } catch (e) { console.error('[robot_logs] erro ao salvar', robotName, e.message); }
}
// Recupera o ultimo status salvo de um robo — usado quando a memoria em RAM
// esta vazia (acabou de reiniciar), pra mostrar a ultima execucao mesmo assim.
function loadRobotLog(robotName) {
  try {
    const row = db.prepare('SELECT status_json, updated_at FROM robot_logs WHERE robot_name=?').get(robotName);
    if (!row) return null;
    const status = JSON.parse(row.status_json);
    status._persistedAt = row.updated_at;
    return status;
  } catch (e) { return null; }
}

module.exports = { db, hashPassword, createUser, findUserByEmail, validatePassword, getUserConfig, saveRobotLog, loadRobotLog, getTrapBadgeColors, saveTrapBadgeColors };