'use strict';
// src/db/migracaoCompartilhado.js
//
// ETAPA 2.1 da virada "corrida compartilhada, aposta pessoal".
//
// O QUE ESTE ARQUIVO FAZ: cria a tabela race_user_data e copia pra ela os
// campos pessoais que hoje moram na races. So isso.
//
// O QUE ELE NAO FAZ: nao muda nenhuma leitura, nenhuma escrita e nao apaga
// nada. Depois de rodar, o sistema continua se comportando exatamente como
// antes — os campos pessoais seguem na races e continuam sendo lidos de la.
// Isso e' de proposito: a virada das telas (etapas 2.2 e 2.3) fica separada,
// pra que este passo seja seguro e reversivel. Se algo der errado aqui, basta
// dropar a race_user_data e nada mais foi tocado.
//
// MODELO ALVO
//   races           -> uma corrida, uma linha. Card, analise, chegada, bateu,
//                      obs. Igual pra todo mundo.
//   race_user_data  -> o que e' de cada um: odd, valor, aposta, avb nao
//                      aberto, flag de atrasada.
//
// CANONICO: as linhas da races do usuario 1 sao a versao boa. As dos outros
// usuarios sao copias historicas (o robo gravava so pro usuario 1, entao na
// pratica os outros tem pouca ou nenhuma corrida). Elas NAO sao apagadas: o
// que fazemos e' salvar os dados PESSOAIS delas na tabela nova, casando com a
// corrida canonica equivalente.

const CANONICO = 1;

// Campos que deixam de ser da corrida e passam a ser do usuario.
const CAMPOS_PESSOAIS = ['odd', 'valor', 'bet_entrou', 'bet_unidades', 'avb_nao_aberto', 'flag_atrasada'];

function criarTabela(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS race_user_data (
      race_id        INTEGER NOT NULL,
      user_id        INTEGER NOT NULL,
      odd            REAL,
      valor          REAL,
      bet_entrou     INTEGER DEFAULT 0,
      bet_unidades   REAL,
      avb_nao_aberto INTEGER DEFAULT 0,
      flag_atrasada  INTEGER DEFAULT 0,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (race_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_rud_user ON race_user_data(user_id);
  `);
}

// Chave de casamento entre a corrida de um usuario e a canonica equivalente.
// Usa a data do card quando existe (mais confiavel) e cai pro nome da sessao
// quando nao existe, que e' o caso das sessoes antigas.
function chaveDaCorrida(r) {
  const dia = r.data_card || r.session_name || '';
  return dia + '|' + (r.hora || '') + '|' + (r.corrida || '');
}

// Vale copiar? Linha sem nenhum dado pessoal preenchido nao precisa virar
// registro — evita encher a tabela de zeros.
function temDadoPessoal(r) {
  return (r.odd != null && r.odd !== '')
      || (r.valor != null && r.valor !== '')
      || !!r.bet_entrou
      || (r.bet_unidades != null && r.bet_unidades !== '')
      || !!r.avb_nao_aberto
      || !!r.flag_atrasada;
}

function migrar(db, opts) {
  const log = (opts && opts.log) || console.log;
  criarTabela(db);

  // Idempotente: se ja rodou, nao faz de novo. Este modulo e' chamado no boot,
  // e o servidor reinicia varias vezes por dia (todo deploy e' um restart).
  const jaTem = db.prepare('SELECT COUNT(*) c FROM race_user_data').get().c;
  if (jaTem > 0) {
    log('[migracao 2.1] ja aplicada (' + jaTem + ' registros pessoais). Nada a fazer.');
    return { pulou: true, existentes: jaTem };
  }

  const todas = db.prepare(`
    SELECT r.*, s.name AS session_name, s.user_id AS session_user
    FROM races r LEFT JOIN race_sessions s ON s.id = r.session_id
  `).all();

  if (!todas.length) {
    log('[migracao 2.1] banco sem corridas. Tabela criada, nada a copiar.');
    return { criouTabela: true, copiados: 0 };
  }

  // Indice das canonicas por chave, pra saber pra onde apontar o dado pessoal
  // de um usuario que tinha a propria copia da mesma corrida.
  const canonPorChave = new Map();
  for (const r of todas) {
    if (r.user_id === CANONICO) canonPorChave.set(chaveDaCorrida(r), r.id);
  }

  const inserir = db.prepare(
    'INSERT OR REPLACE INTO race_user_data (race_id,user_id,odd,valor,bet_entrou,bet_unidades,avb_nao_aberto,flag_atrasada) ' +
    'VALUES (?,?,?,?,?,?,?,?)'
  );

  let copiados = 0, semDado = 0, orfaos = 0;
  for (const r of todas) {
    if (!temDadoPessoal(r)) { semDado++; continue; }

    // Canonica aponta pra si mesma; a de outro usuario procura a equivalente.
    let alvo = r.user_id === CANONICO ? r.id : canonPorChave.get(chaveDaCorrida(r));
    if (alvo == null) {
      // Corrida que so existe fora do canonico (ex.: alguem analisou algo que
      // o robo nunca trouxe). Mantem apontando pra propria linha: ela nao se
      // perde, e a etapa 2.2 decide se promove a canonica.
      alvo = r.id;
      orfaos++;
    }
    inserir.run(alvo, r.user_id,
      r.odd != null && r.odd !== '' ? r.odd : null,
      r.valor != null && r.valor !== '' ? r.valor : null,
      r.bet_entrou ? 1 : 0,
      r.bet_unidades != null && r.bet_unidades !== '' ? r.bet_unidades : null,
      r.avb_nao_aberto ? 1 : 0,
      r.flag_atrasada ? 1 : 0);
    copiados++;
  }

  const porUsuario = db.prepare('SELECT user_id, COUNT(*) c FROM race_user_data GROUP BY user_id').all();
  log('[migracao 2.1] concluida: ' + copiados + ' registros pessoais copiados, ' +
      semDado + ' corridas sem dado pessoal ignoradas, ' + orfaos + ' fora do canonico.');
  for (const u of porUsuario) log('[migracao 2.1]   usuario ' + u.user_id + ': ' + u.c + ' registro(s)');

  return { criouTabela: true, copiados, semDado, orfaos, porUsuario };
}

module.exports = { migrar, criarTabela, CANONICO, CAMPOS_PESSOAIS, chaveDaCorrida, temDadoPessoal };