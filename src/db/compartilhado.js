'use strict';
// src/db/compartilhado.js
//
// ETAPA 2.2 da virada "corrida compartilhada, aposta pessoal".
//
// A ideia central: em vez de reescrever as ~52 consultas espalhadas pelo
// sistema com LEFT JOIN race_user_data, a consulta continua simples e le o
// CANONICO, e a sobreposicao do que e' pessoal acontece aqui, em JavaScript,
// num lugar so.
//
// Por que assim: 52 SQLs reescritos sao 52 chances de errar um join ou
// esquecer um filtro, e esse tipo de erro nao estoura — ele so devolve dado
// errado em silencio. Concentrando a regra numa funcao, ha um ponto unico pra
// revisar e testar. O custo e' uma consulta extra por pagina, irrelevante
// nesta escala (2 mil corridas).
//
// USO TIPICO
//   const { CANONICO, aplicarPessoais } = require('../db/compartilhado');
//   const races = db.prepare('SELECT * FROM races WHERE session_id=?').all(id);
//   aplicarPessoais(db, races, req.user.id);   // muta as linhas no lugar

const CANONICO = 1;

// Campos que saem da corrida e passam a ser de cada usuario.
const CAMPOS = ['odd', 'valor', 'bet_entrou', 'bet_unidades', 'avb_nao_aberto', 'flag_atrasada'];

// Valores usados quando o usuario nunca tocou naquela corrida. Nao herdam do
// canonico de proposito: a aposta do usuario 1 nao e' a aposta dos outros.
const VAZIO = { odd: null, valor: null, bet_entrou: 0, bet_unidades: null, avb_nao_aberto: 0, flag_atrasada: 0 };

// Sobrepoe os campos pessoais em uma lista de corridas ja lida do banco.
// Muta os objetos no lugar (as telas ja usam r.odd, r.flag_atrasada etc, entao
// nada mais precisa mudar depois desta chamada).
function aplicarPessoais(db, linhas, userId) {
  if (!linhas || !linhas.length) return linhas;
  const lista = Array.isArray(linhas) ? linhas : [linhas];

  // Uma consulta so pra todas as corridas da pagina, em vez de uma por linha.
  const ids = lista.map(r => r.id).filter(id => id != null);
  if (!ids.length) return linhas;

  const mapa = new Map();
  // SQLite tem limite de parametros por consulta (999 por padrao); fatiar
  // evita estourar em pagina com muitas corridas.
  const LOTE = 500;
  for (let i = 0; i < ids.length; i += LOTE) {
    const fatia = ids.slice(i, i + LOTE);
    const marcadores = fatia.map(() => '?').join(',');
    const rows = db.prepare(
      'SELECT * FROM race_user_data WHERE user_id=? AND race_id IN (' + marcadores + ')'
    ).all(userId, ...fatia);
    for (const row of rows) mapa.set(row.race_id, row);
  }

  for (const r of lista) {
    const p = mapa.get(r.id);
    for (const campo of CAMPOS) {
      r[campo] = p && p[campo] != null ? p[campo] : VAZIO[campo];
    }
  }
  return linhas;
}

// Grava um campo pessoal. Cria a linha se ainda nao existir.
function salvarPessoal(db, raceId, userId, campo, valor) {
  if (CAMPOS.indexOf(campo) === -1) throw new Error('campo nao e pessoal: ' + campo);
  db.prepare('INSERT OR IGNORE INTO race_user_data (race_id,user_id) VALUES (?,?)').run(raceId, userId);
  db.prepare('UPDATE race_user_data SET ' + campo + '=?, updated_at=CURRENT_TIMESTAMP WHERE race_id=? AND user_id=?')
    .run(valor, raceId, userId);
}

function ehCampoPessoal(campo) { return CAMPOS.indexOf(campo) !== -1; }

module.exports = { CANONICO, CAMPOS, aplicarPessoais, salvarPessoal, ehCampoPessoal };