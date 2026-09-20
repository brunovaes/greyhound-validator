'use strict';
// teste_indicadores.js — OS DOIS INDICADORES (Bruno, 20/09/2026)
//
// "Em 'entradas pela Banca' em dia pegar o valor '% do dia' e em mês pegar o
//  '% do mês', abaixo de 0 deixar os valores em vermelho. Em entradas pelo
//  sistema mantem as cores como hoje, abaixo de 50% em vermelho." E, depois:
//  os tres lugares, zero e' VERDE, e o titulo do segundo e' "Análises pelo
//  Sistema".
//
// O que este teste protege:
//   1. UM desenho so pros tres lugares (barra da Analisar, rodape do celular e
//      faixa lateral das outras telas). Tres copias do mesmo HTML divergem na
//      primeira mudanca;
//   2. os ids que OUTRO codigo procura pelo nome (o app.js pinta acertos-dia e
//      acertos-mes; o teste de sidebar exige os gf-*) continuam existindo;
//   3. as duas regras de cor, que sao DIFERENTES: banca corta em 0, sistema
//      corta em 50 - trocar uma pela outra pintaria de vermelho um dia lucrativo;
//   4. o formato do numero, que foi medido no Chromium: duas casas decimais nao
//      cabem na coluna do celular.
//
//   node teste_indicadores.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MAIN = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');
const BANCA = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'banca.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, 'src', 'app.js'), 'utf8');

let ok = 0, ruim = 0;
function t(nome, cond) {
  if (cond) { ok++; console.log('  OK    | ' + nome); }
  else { ruim++; console.log('  FALHOU| ' + nome); }
}
function bloco(n) { console.log('\n' + n + '\n'); }

bloco('[1] UM DESENHO SO, TRES LUGARES');

const mBloco = MAIN.match(/function blocoIndicadores\(ids\) \{[\s\S]*?\n\}/);
t('a funcao blocoIndicadores existe', !!mBloco);
t('os dois titulos estao nela',
  !!mBloco && /Entradas pela Banca/.test(mBloco[0]) && /Análises pelo Sistema/.test(mBloco[0]));
t('e cada caixa tem as colunas Dia e Mês',
  !!mBloco && /cel\('Dia', idDia\)/.test(mBloco[0]) && /cel\('Mês', idMes\)/.test(mBloco[0]));

t('a faixa lateral das outras telas usa a funcao',
  /blocoIndicadores\(\{ bancaDia: 'gf-banca-dia'[^}]*sisDia: 'gf-acertos-dia'/.test(MAIN));
t('a barra lateral da Analisar usa a funcao',
  /blocoIndicadores\(\{ bancaDia: 'banca-dia'[^}]*sisDia: 'acertos-dia'/.test(MAIN));
t('o rodape do celular usa a funcao',
  /blocoIndicadores\(\{ bancaDia: 'banca-dia-m'[^}]*sisDia: 'acertos-dia-m'/.test(MAIN));
t('nenhum dos tres ficou com HTML proprio (o rotulo velho sumiu)',
  !/>Acertos do dia</.test(MAIN) && !/>Acertos do mês</.test(MAIN));

bloco('[2] OS IDS QUE OUTRO CODIGO PROCURA PELO NOME');
t('o app.js continua pintando acertos-dia e acertos-mes',
  /getElementById\('acertos-dia'\)/.test(APP) && /getElementById\('acertos-mes'\)/.test(APP));
t('os ids da faixa lateral (gf-*) continuam existindo',
  /'gf-acertos-dia'/.test(MAIN) && /'gf-acertos-mes'/.test(MAIN));
t('o espelho do celular copia os QUATRO numeros',
  /\['acertos-dia','acertos-dia-m'\][\s\S]{0,200}\['banca-dia','banca-dia-m'\]/.test(MAIN));

bloco('[3] A COR DA BANCA: CORTE EM ZERO, E ZERO E VERDE');

const mPinta = MAIN.match(/function pintaBanca\(el, pct\)\{[\s\S]*?\n  \}/);
t('o pintaBanca foi encontrado', !!mPinta);

function pinta(pct) {
  const el = { textContent: '', style: {} };
  const ctx = { el: el, Math: Math };
  vm.createContext(ctx);
  vm.runInContext(mPinta[0] + '\npintaBanca(el, ' + JSON.stringify(pct) + ');', ctx);
  return el;
}

t('dia positivo fica verde', pinta(3.5).style.color === '#22c55e');
t('dia negativo fica vermelho', pinta(-3.5).style.color === '#ef4444');
t('ZERO fica verde (escolha do Bruno: dia sem aposta nao e prejuizo)',
  pinta(0).style.color === '#22c55e');
t('um prejuizo minimo ja e vermelho', pinta(-0.01).style.color === '#ef4444');
t('sem dado fica traco e cinza',
  pinta(null).textContent === '-' && pinta(null).style.color === '#666');

bloco('[4] O FORMATO DO NUMERO (MEDIDO NO CHROMIUM)');
// A coluna e estreita: medido em 234, 370 e 430px, "+12,75%" (duas casas com
// dois digitos) vaza. Entao as casas caem conforme o numero cresce, e o caso
// comum - o do dia a dia do Bruno, abaixo de 10% - sai IGUAL a tela Banca.
t('abaixo de 10% saem as duas casas, igual a tela Banca',
  pinta(2.8).textContent === '+2,80%' && pinta(8.96).textContent === '+8,96%');
t('negativo abaixo de 10% idem', pinta(-3.52).textContent === '-3,52%');
t('de 10% pra cima fica uma casa', pinta(12.75).textContent === '+12,8%');
t('de 100% pra cima nao fica nenhuma', pinta(123.4).textContent === '+123%');
t('e o mesmo vale no negativo', pinta(-123.4).textContent === '-123%');
t('zero aparece como +0,00%', pinta(0).textContent === '+0,00%');

bloco('[5] A COR DO SISTEMA NAO MUDOU: CORTE EM 50');
t('o app.js continua cortando em 50', /pct >= 50 \? '#22c55e' : '#ef4444'/.test(APP));
t('e a faixa lateral tambem', /pct >= 50 \? '#22c55e' : '#ef4444'/.test(MAIN));
t('a regra da banca NAO foi aplicada ao sistema (seriam duas regras trocadas)',
  !/pct >= 0 \? '#22c55e'[\s\S]{0,80}acertos/.test(MAIN));

bloco('[6] A ROTA /banca/resumo');
t('a rota existe', /router\.get\('\/resumo'/.test(BANCA));
t('devolve pctDia e pctMes', /pctDia:[\s\S]{0,120}pctMes:/.test(BANCA));
t('usa o dia de Brasilia, o mesmo do resto da Banca', /const hoje = hojeBr\(\);/.test(BANCA));
t('le a cadeia UMA vez (o motivo da rota existir)',
  (BANCA.match(/router\.get\('\/resumo'[\s\S]*?\n\}\);/) || [''])[0].split('getCadeiaBanca(userId)').length === 2);
t('a base e a banca inicial do mes, igual ao /data',
  /pctDia: mes\.inicial \? \(saldoDia \/ mes\.inicial\) \* 100 : 0/.test(BANCA));
t('o mes e final menos inicial, igual ao /data',
  /pctMes: mes\.inicial \? \(\(mes\.final - mes\.inicial\) \/ mes\.inicial\) \* 100 : 0/.test(BANCA));
t('so conta aposta resolvida no dia (pendente nao e resultado)',
  /x\.dia === hoje && x\.status !== 'pendente'/.test(BANCA));
t('tem cache curto, pra tela que abre nao remontar a cadeia toda hora',
  /RESUMO_BANCA_TTL_MS/.test(BANCA));

bloco('[7] A CAIXA CABE NOS TRES LUGARES');
// Medido no Chromium: com piso de 150px as duas caixas ficam lado a lado no
// rodape do celular (370px) e empilham na barra lateral (234px de sobra), onde
// lado a lado o numero vazava da coluna.
t('a caixa tem piso de 150px', !!mBloco && /flex:1 1 150px/.test(mBloco[0]));
t('a faixa lateral deixa quebrar linha', /\.gf-ac\{[^}]*flex-wrap:wrap/.test(MAIN));
t('a barra lateral da Analisar tambem',
  /acertos-box acertos-sidebar" style="[^"]*flex-wrap:wrap/.test(MAIN));
t('e o rodape do celular tambem',
  /acertos-box acertos-mobile" style="[^"]*flex-wrap:wrap/.test(MAIN));

console.log('\n' + (ruim ? 'FALHOU: ' + ruim + ' de ' + (ok + ruim) : 'TUDO OK: ' + ok + ' verificacoes'));
process.exit(ruim ? 1 : 0);
