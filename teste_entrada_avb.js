'use strict';
// teste_entrada_avb.js — rede de seguranca da ENTRADA DA APOSTA.
//
// Por que existe: em 07/09/2026 o `avb_escolhido` nao estava na lista `allowed`
// do PUT /api/race/:id. O handler so itera `allowed`, entao o snapshot do par
// chegava no body e era DESCARTADO EM SILENCIO — sem erro, sem log, HTTP 200.
// A odd gravava, a escolha nao. E como o /api/painel-dia so monta `entrada`
// quando ha escolha + odd, a quebra se espalhava: o ENTREI nunca aparecia no
// board, o tile da Analisar nunca dormia e o alarme seguia apitando numa
// corrida ja apostada. Nada disso estoura em teste de sintaxe.
//
// Roda contra o CODIGO REAL (le os arquivos do disco), nao contra suposicao.
//   node teste_entrada_avb.js

const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const F_API = path.join(RAIZ, 'src', 'routes', 'api.js');
const F_COMPART = path.join(RAIZ, 'src', 'db', 'compartilhado.js');
const F_ANALISAR = path.join(RAIZ, 'public', 'js', 'analisarPainel.js');
const F_APP = path.join(RAIZ, 'src', 'app.js');

let falhas = 0;
function ok(cond, msg) {
  console.log((cond ? '  OK   ' : '  FALHA') + ' | ' + msg);
  if (!cond) falhas++;
}

// ── 1) extrai a lista `allowed` REAL do handler ──────────────────────────────
const srcApi = fs.readFileSync(F_API, 'utf8');
const mAllowed = srcApi.match(/const allowed = \[([^\]]*)\];/);
if (!mAllowed) {
  console.error('ERRO: nao achei a lista `allowed` no PUT /api/race/:id. O handler mudou de forma?');
  process.exit(1);
}
const allowed = mAllowed[1]
  .split(',')
  .map(s => s.trim().replace(/^'|'$/g, ''))
  .filter(Boolean);

console.log('\n[1] lista `allowed` do PUT /api/race/:id');
console.log('    ' + allowed.join(', '));

ok(allowed.indexOf('avb_escolhido') !== -1,
   "`allowed` contem 'avb_escolhido' (sem isso a escolha do par nao grava)");

// Regressao ao contrario: nenhum campo que ja gravava pode ter sumido da lista.
// Remover um daqui tambem falha em silencio (o campo passa a ser ignorado).
const OBRIGATORIOS = ['odd', 'valor', 'resultado_1', 'resultado_2', 'resultado_3',
                      'bateu', 'avb_nao_aberto', 'video_url', 'bet_entrou',
                      'bet_unidades', 'flag_atrasada'];
const sumiram = OBRIGATORIOS.filter(c => allowed.indexOf(c) === -1);
ok(sumiram.length === 0,
   'nenhum campo que ja gravava saiu da lista' + (sumiram.length ? ' (sumiram: ' + sumiram.join(', ') + ')' : ''));

// ── 2) o campo tem que ser reconhecido como PESSOAL ──────────────────────────
// Se `allowed` tem o campo mas `CAMPOS` nao, o salvarPessoal lanca
// "campo nao e pessoal" e o UPDATE tenta gravar numa coluna que nao existe em
// races. Os dois lados precisam concordar.
const compart = require(F_COMPART);
console.log('\n[2] roteamento pessoal vs. corrida (compartilhado.js)');
ok(typeof compart.ehCampoPessoal === 'function', 'compartilhado.js exporta ehCampoPessoal');
ok(compart.ehCampoPessoal('avb_escolhido') === true,
   "'avb_escolhido' e' campo pessoal -> vai pro race_user_data, nao pro UPDATE races");

// ── 3) executa a MESMA logica de separacao do handler ────────────────────────
// Reproduz o loop do PUT (allowed -> pessoais | sets) com um body igual ao que
// o front manda de verdade, e confere onde cada campo cai.
console.log('\n[3] simulacao do loop do handler com o body real do "Entrei !"');
const body = {
  odd: 1.70,
  bet_unidades: 2.5,
  avb_escolhido: JSON.stringify({
    aTrap: 1, aNome: 'Braemar Millie', bTrap: 6, bNome: 'Romeo On Point (W)',
    odd: 1.70, pct: 73, origem: 'TOP', id_confronto: 'sheff a2|01:31|1x6',
    ts: Math.floor(Date.now() / 1000)
  })
};
const sets = [], pessoais = [], ignorados = [];
for (const key of Object.keys(body)) {
  if (allowed.indexOf(key) === -1) { ignorados.push(key); continue; }
  if (compart.ehCampoPessoal(key)) pessoais.push(key); else sets.push(key);
}
console.log('    pessoais  -> ' + (pessoais.join(', ') || '(nenhum)'));
console.log('    UPDATE    -> ' + (sets.join(', ') || '(nenhum)'));
console.log('    IGNORADOS -> ' + (ignorados.join(', ') || '(nenhum)'));

ok(ignorados.length === 0,
   'nenhum campo do body do "Entrei !" e descartado em silencio');
ok(pessoais.indexOf('avb_escolhido') !== -1, "'avb_escolhido' foi roteado pro salvarPessoal");
ok(sets.indexOf('avb_escolhido') === -1, "'avb_escolhido' NAO vai pro UPDATE races");

// ── 4) a cascata: com a escolha gravada, o painel-dia monta a `entrada` ──────
// Reproduz a montagem do /api/painel-dia (api.js) pra provar que a gravacao
// destrava ENTREI + aguardando_entrada. Esta e' a parte que o usuario VE.
console.log('\n[4] cascata no /api/painel-dia (ENTREI + tile dormindo)');
const _c = c => String(c || '').trim().toLowerCase();
const _h = h => { const m = String(h || '').match(/(\d{1,2}):(\d{2})/); return m ? (m[1].padStart(2, '0') + ':' + m[2]) : String(h || '').trim(); };
const _idc = (co, ho, t1, t2) => _c(co) + '|' + _h(ho) + '|' + Math.min(t1, t2) + 'x' + Math.max(t1, t2);

function montarEntrada(pessoal, corrida) {
  let esc = null;
  try { esc = pessoal.avb_escolhido ? JSON.parse(pessoal.avb_escolhido) : null; } catch (e) {}
  let entrada = null, escId = null;
  if (esc && esc.aTrap != null && esc.bTrap != null && pessoal.odd != null && String(pessoal.odd) !== '') {
    escId = _idc(corrida.corrida, corrida.hora, Number(esc.aTrap), Number(esc.bTrap));
    entrada = { odd: Number(pessoal.odd), stake: pessoal.bet_unidades, em: esc.ts || null, id_confronto: escId };
  }
  return { entrada, escId };
}

const corrida = { corrida: 'Sheff A2', hora: '1:31' };
const confronto = { id: _idc('Sheff A2', '1:31', 1, 6), camada: 'TOP' };

// COM a gravacao (depois do fix)
const depois = montarEntrada({ odd: 1.70, bet_unidades: 2.5, avb_escolhido: body.avb_escolhido }, corrida);
ok(depois.entrada != null, 'com a escolha gravada, `entrada` e montada');
ok(confronto.id === depois.escId, 'o confronto casa com o id da escolha -> escolhido = true');
ok((confronto.camada !== 'OPORTUNIDADE' && depois.entrada == null) === false,
   'aguardando_entrada vira false -> o tile da Analisar dorme e o alarme cala');

// SEM a gravacao (o bug de antes) — prova que o teste realmente pega a regressao
const antes = montarEntrada({ odd: 1.70, bet_unidades: 2.5, avb_escolhido: null }, corrida);
ok(antes.entrada === null,
   'controle: sem a escolha gravada a `entrada` fica null (era exatamente o bug)');

// ── 5) os dois produtores continuam mandando o campo ─────────────────────────
// Se um front parar de mandar `avb_escolhido`, o backend certo nao salva nada.
console.log('\n[5] produtores do campo no front');
const srcAnalisar = fs.readFileSync(F_ANALISAR, 'utf8');
const srcApp = fs.readFileSync(F_APP, 'utf8');
ok(/avb_escolhido\s*:/.test(srcAnalisar),
   'analisarPainel.js (tiles novos) manda avb_escolhido no PUT');
ok(/avb_escolhido\s*:/.test(srcApp),
   'app.js/_persistirEscolha (Analisar antiga) manda avb_escolhido no PUT');

// ── resultado ────────────────────────────────────────────────────────────────
console.log('\n' + (falhas === 0
  ? 'TUDO OK — a entrada da aposta persiste o par escolhido.'
  : falhas + ' FALHA(S) — a entrada da aposta esta quebrada.'));
process.exit(falhas === 0 ? 0 : 1);
