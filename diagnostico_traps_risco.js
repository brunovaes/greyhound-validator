'use strict';
// Diagnostico (SOMENTE LEITURA) — identifica corridas cujo race_card tem
// menos de 6 galgos, ou seja, corridas onde algum trap ficou ausente do PDF
// e por isso corriam risco do bug de numeracao sequencial (idx+1) antes da
// correcao via leitura de badge. Nao altera nada no banco.
//
// Uso (no Railway, no mesmo ambiente onde DB_PATH ja aponta pro banco real):
//   node diagnostico_traps_risco.js

const { db } = require('./src/db/database');

const races = db.prepare(`
  SELECT id, session_id, hora, hora_br, corrida, dist, data_card,
         trap_fav, name_fav, trap_und, name_und, race_card, created_at
  FROM races
  WHERE race_card IS NOT NULL AND race_card != ''
`).all();

let emRisco = [];
let total = 0;
for (const r of races) {
  total++;
  let card;
  try { card = JSON.parse(r.race_card); } catch(e) { continue; }
  if (!Array.isArray(card)) continue;
  if (card.length > 0 && card.length < 6) {
    emRisco.push({ ...r, qtdGalgos: card.length });
  }
}

console.log(`Total de corridas com race_card salvo: ${total}`);
console.log(`Corridas EM RISCO (menos de 6 galgos no card): ${emRisco.length}`);
console.log('');

if (emRisco.length) {
  // Agrupa por data pra facilitar ver o que ainda esta dentro da janela de 7
  // dias de retencao de PDF (essas dao pra corrigir de verdade reprocessando).
  const hoje = new Date(Date.now() - 3*60*60*1000); // BRT
  const seteDiasAtras = new Date(hoje.getTime() - 7*24*60*60*1000);

  console.log('Detalhe (mais recentes primeiro):');
  emRisco
    .sort((a,b) => (b.data_card||'').localeCompare(a.data_card||''))
    .forEach(r => {
      const dataCard = r.data_card ? new Date(r.data_card + 'T12:00:00') : null;
      const recuperavel = dataCard && dataCard >= seteDiasAtras;
      console.log(
        `  [id=${r.id}] ${r.data_card||'?'} ${r.hora||'?'} ${r.corrida||'?'} `+
        `— ${r.qtdGalgos} galgos no card — Fav:T${r.trap_fav} Und:T${r.trap_und} `+
        `— ${recuperavel ? '✅ PDF ainda deve existir (< 7 dias)' : '❌ PDF provavelmente ja foi limpo (> 7 dias)'}`
      );
    });

  const recuperaveis = emRisco.filter(r => {
    const dataCard = r.data_card ? new Date(r.data_card + 'T12:00:00') : null;
    return dataCard && dataCard >= seteDiasAtras;
  });
  console.log('');
  console.log(`Resumo: ${recuperaveis.length} de ${emRisco.length} corridas em risco ainda estao dentro da janela de 7 dias (dá pra tentar reprocessar o PDF original e corrigir).`);
  console.log(`As outras ${emRisco.length - recuperaveis.length} provavelmente ja perderam o PDF de origem (fora da janela de retencao).`);
}
