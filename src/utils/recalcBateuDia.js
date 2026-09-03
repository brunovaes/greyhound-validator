'use strict';
// src/utils/recalcBateuDia.js
//
// Recalculo da coluna races.bateu de um DIA inteiro pela fonte unica.
// Existe porque a correcao de 03/09/2026 so vale para escrita nova: as linhas
// gravadas antes dela podem ter veredito CHUTADO (o resultsRobot punha 'nao' por
// default e 'sim' quando o favorito ficava no top3 e o underdog nao era achado).
//
// Dois consumidores, mesma funcao, de proposito:
//   tools/recalc-bateu.js         (shell, onde o banco estiver)
//   POST /robot/bateu/recalc      (admin, do navegador)
//
// NAO APAGA NADA. A unica escrita e "UPDATE races SET bateu=? WHERE id=?".
// Nenhum DELETE, nenhuma outra coluna, nada em race_user_data nem em
// race_sessions. planejar() e so-leitura; quem grava e aplicar(), e so ela.

const { recalcularBateu, motivoDoRecalculo } = require('./avbResultado');

// O dia e a data de criacao da SESSAO (o mesmo criterio do resto do sistema).
// Ver CLAUDE.md 9.4-iii: nao e a data da corrida, e ja mordeu antes.
const SQL_DIA = "FROM races r JOIN race_sessions s ON s.id=r.session_id WHERE date(s.created_at,'-3 hours')=?";

function contar(db, date) {
  const c = db.prepare(
    "SELECT COUNT(*) total,"
    + " SUM(CASE WHEN r.bateu IS NOT NULL AND r.bateu!='' THEN 1 ELSE 0 END) preenchido,"
    + " SUM(CASE WHEN r.bateu='sim' THEN 1 ELSE 0 END) sim,"
    + " SUM(CASE WHEN r.bateu='nao' THEN 1 ELSE 0 END) nao,"
    + " SUM(CASE WHEN r.bateu IS NULL OR r.bateu='' THEN 1 ELSE 0 END) vazio "
    + SQL_DIA
  ).get(date);
  // o SUM de tabela vazia volta null; contagem que aparece na tela nunca e null
  return { total: c.total || 0, preenchido: c.preenchido || 0, sim: c.sim || 0, nao: c.nao || 0, vazio: c.vazio || 0 };
}

// So-leitura. Devolve o que MUDARIA, com o motivo de cada linha.
function planejar(db, date) {
  const antes = contar(db, date);
  const races = db.prepare(
    'SELECT r.id, r.hora, r.corrida, r.nivel, r.trap_fav, r.trap_und, r.bateu, '
    + 'r.resultado_1, r.resultado_2, r.resultado_3, r.finishing_order_json '
    + SQL_DIA + ' ORDER BY r.hora'
  ).all(date);

  const linhas = [];
  let sem_resultado = 0, ja_corretas = 0;

  for (const r of races) {
    const novo = recalcularBateu(r.resultado_1, r.resultado_2, r.resultado_3, r.trap_fav, r.trap_und, r.finishing_order_json);
    if (novo === null) { sem_resultado++; continue; }   // corrida que ainda nao rodou: intocada
    const velho = r.bateu == null ? '' : String(r.bateu);
    if (novo === velho) { ja_corretas++; continue; }

    const m = motivoDoRecalculo(r.resultado_1, r.resultado_2, r.resultado_3, r.trap_fav, r.trap_und, r.finishing_order_json);
    linhas.push({
      race_id: r.id, hora: r.hora, corrida: r.corrida, nivel: r.nivel || null,
      par: 'T' + r.trap_fav + 'xT' + r.trap_und,
      de: velho, para: novo,
      de_rotulo: velho === '' ? '(vazio)' : velho,
      para_rotulo: novo === '' ? '(indefinido)' : novo,
      fonte: m.fonte, pos_fav: m.pos_fav, pos_und: m.pos_und,
      motivo: m.texto,
      // O que mudou em uma palavra. 'chute_desfeito' e a linha que a heuristica
      // antiga tinha resolvido inventando; e a razao de tudo isto existir.
      tipo: (velho !== '' && novo === '') ? 'chute_desfeito'
          : (velho === '' && novo !== '') ? 'resolvida'
          : 'veredito_trocado'
    });
  }

  return { date, antes, linhas, sem_resultado, ja_corretas, total: antes.total };
}

// UNICA funcao que escreve. Recebe as linhas de planejar() e nada mais.
function aplicar(db, linhas) {
  if (!Array.isArray(linhas) || !linhas.length) return 0;
  const upd = db.prepare('UPDATE races SET bateu=? WHERE id=?');
  const tx = db.transaction((lista) => { for (const l of lista) upd.run(l.para, l.race_id); });
  tx(linhas);
  return linhas.length;
}

module.exports = { planejar, aplicar, contar };
