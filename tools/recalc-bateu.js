'use strict';
// tools/recalc-bateu.js
//
// Regrava a coluna races.bateu de um dia pela FONTE UNICA (correcao 03/09/2026).
// As linhas gravadas antes daquela data podem ter veredito CHUTADO: o
// resultsRobot punha 'nao' por default e 'sim' quando o favorito ficava no top3
// e o underdog nao era achado. O bateuPar, no mesmo caso, diz indefinido.
//
// NAO APAGA NADA. A unica escrita e "UPDATE races SET bateu=? WHERE id=?", feita
// dentro do src/utils/recalcBateuDia.js. Nenhum DELETE, nenhuma outra coluna,
// nada em race_user_data nem em race_sessions.
//
// Le o banco DIRETO, entao roda na maquina onde ele esta. Do navegador, a mesma
// coisa sai por POST /greyhound/robot/bateu/recalc (mesmo modulo, mesma regra).
//
//   node tools/recalc-bateu.js --date=2026-09-03                  (simulacao)
//   node tools/recalc-bateu.js --date=2026-09-03 --aplicar        (grava)
//   node tools/recalc-bateu.js --date=2026-09-03 --db=/data/greyhound.db
//
// Sem --aplicar ele so mostra o antes/depois e sai sem escrever.

const fs   = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const args = process.argv.slice(2);
const arg  = (nome) => { const a = args.find(x => x.startsWith('--' + nome + '=')); return a ? a.slice(nome.length + 3) : null; };

const DATE    = arg('date');
const APLICAR = args.includes('--aplicar');
const DB_PATH = arg('db') || process.env.DB_PATH || path.join(RAIZ, 'data', 'greyhound.db');

if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) {
  console.error('uso: node tools/recalc-bateu.js --date=YYYY-MM-DD [--aplicar] [--db=caminho]');
  process.exit(2);
}

// Erro de caminho e o engano mais provavel aqui: no Railway o volume e /data,
// no .env local e ./data. Sem esta checagem o better-sqlite3 responde com um
// stack trace de "directory does not exist", que nao diz o que fazer.
if (!fs.existsSync(DB_PATH)) {
  console.error('\nBanco nao encontrado: ' + DB_PATH);
  console.error('  Railway: --db=/data/greyhound.db   (volume do container)');
  console.error('  Local:   --db=./data/greyhound.db');
  console.error('Este script le o banco DIRETO, entao precisa rodar na maquina onde ele esta.');
  process.exit(2);
}

const Database = require(path.join(RAIZ, 'node_modules', 'better-sqlite3'));
const { planejar, aplicar, contar } = require(path.join(RAIZ, 'src', 'utils', 'recalcBateuDia'));

const db = new Database(DB_PATH, { readonly: !APLICAR });

const linhaContagem = (c) => 'total ' + String(c.total).padStart(4)
  + ' | preenchido ' + String(c.preenchido).padStart(4)
  + ' | sim ' + String(c.sim).padStart(4)
  + ' | nao ' + String(c.nao).padStart(4)
  + ' | vazio ' + String(c.vazio).padStart(4);

console.log('\nbanco: ' + DB_PATH);
console.log('dia:   ' + DATE + (APLICAR ? '   [APLICANDO]' : '   [SIMULACAO - nada sera gravado]'));

const plano = planejar(db, DATE);
if (!plano.total) {
  console.log('\nNenhuma corrida nesse dia neste banco. Nada a fazer.');
  process.exit(0);
}

console.log('\nANTES   ' + linhaContagem(plano.antes));
console.log('\ncorridas sem resultado (intocadas): ' + plano.sem_resultado);
console.log('ja corretas (nao mudam):           ' + plano.ja_corretas);
console.log('LINHAS QUE MUDAM:                  ' + plano.linhas.length);

const ROTULO = { chute_desfeito: 'chute desfeito', resolvida: 'resolvida', veredito_trocado: 'veredito trocado' };
if (plano.linhas.length) {
  console.log('');
  for (const l of plano.linhas) {
    console.log('  ' + String(l.hora).padEnd(8) + String(l.corrida).padEnd(14) + l.par.padEnd(10)
      + (l.de_rotulo + ' -> ' + l.para_rotulo).padEnd(26) + '[' + ROTULO[l.tipo] + ']');
    console.log('      ' + l.motivo);
  }
}

if (!APLICAR) {
  console.log('\nSimulacao. Rode de novo com --aplicar para gravar.');
  process.exit(0);
}

const n = aplicar(db, plano.linhas);
console.log('\nDEPOIS  ' + linhaContagem(contar(db, DATE)));
console.log('\n' + n + ' linha(s) regravada(s). Nenhum registro apagado.');
