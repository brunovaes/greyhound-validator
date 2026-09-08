'use strict';
// teste_alarme_camada.js — O QUE APITA E O QUE PISCA na lista de corridas.
//
// Por que existe: em set/2026 descobrimos que desligar os dois alarmes nas
// Configuracoes NAO silenciava a tela. O ramo base do checkRaceAlerts disparava
// som e pisca-verde 3 minutos antes de CADA corrida da lista, sem olhar nenhum
// toggle — os campos alarme_filtro_ativo e alarme_top_ativo so controlavam as
// variantes customizadas. Ninguem tinha como perceber isso lendo a tela de
// Configuracoes: ela dizia "desligado" e o app apitava.
//
//   node teste_alarme_camada.js
//
// COMO ELE TESTA: extrai as funcoes reais do app.js (checkRaceAlerts e
// pintarPromocaoNaLista) e as EXECUTA contra um DOM de mentira, contando quantas
// vezes o som foi chamado e que classe/cor cada linha recebeu. Nao le o texto do
// arquivo procurando padrao — roda a funcao e observa o efeito.

const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, 'src', 'app.js');
const PD = path.join(__dirname, 'public', 'js', 'painelDia.js');
const src = fs.readFileSync(APP, 'utf8');

let falhas = 0;
function ok(cond, msg) {
  console.log((cond ? '  OK   ' : '  FALHA') + ' | ' + msg);
  if (!cond) falhas++;
}

// ── DOM de mentira, so o que as funcoes tocam ────────────────────────────────
function novaLinha(idx) {
  const cls = new Set();
  const estilo = {};
  return {
    _idx: idx, _cls: cls, _estilo: estilo,
    getAttribute: n => (n === 'data-idx' ? String(idx) : null),
    classList: {
      add: c => cls.add(c),
      remove: c => cls.delete(c),
      toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); },
      contains: c => cls.has(c)
    },
    style: { setProperty: (k, v) => { estilo[k] = v; } }
  };
}

function montarAmbiente(linhas, corridas, opts) {
  opts = opts || {};
  const sons = [];
  const ctx = {
    results: corridas,
    alertedRaces: {},
    ALERTA_MIN_ANTES: 3,
    ALARME_FILTRO: opts.filtro || { ativo: 0, turno: '', pistas: [], classes: [], regras: [], som: 'beep', cor: 'azul' },
    CORES_ALARME: { azul: '#3b82f6', roxo: '#8b5cf6', laranja: '#f97316', rosa: '#ec4899' },
    SOM_ALERTA: 'sino',
    document: { querySelectorAll: () => linhas },
    // minutesToRace controlado pelo cenario, pra o teste nao depender do relogio
    minutesToRace: r => (r._min != null ? r._min : null),
    isOldRaceCard: r => !!r._old,
    getRaceClass: c => { const m = (c || '').trim().match(/([A-Z]\d+)$/i); return m ? m[1].toUpperCase() : null; },
    alarmeTurnoDaCorrida: () => 'manha',
    ALARME_CASA_REGRAS: () => null,
    raceAlertKey: r => (r.hora || '') + '|' + (r.corrida || ''),
    avisarCorrida: (r, custom) => { sons.push({ corrida: r.corrida, custom: !!custom }); },
    setTimeout: () => 0,
    window: {}
  };
  ctx.sons = sons;
  return ctx;
}

function extrair(nomes) {
  let corpo = '';
  for (const n of nomes) {
    const re = new RegExp('^function\\s+' + n + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?^\\}', 'm');
    const m = src.match(re);
    if (!m) { console.error('ERRO: funcao ' + n + ' sumiu do app.js'); process.exit(1); }
    corpo += m[0] + '\n';
  }
  return corpo;
}

function rodarCheck(ctx) {
  const corpo = extrair(['checkRaceAlerts', 'matchAlarmeFiltro']);
  const nomes = Object.keys(ctx);
  const fn = new Function(...nomes, corpo + '; checkRaceAlerts();');
  fn(...nomes.map(n => ctx[n]));
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[1] AVISO DE PROXIMIDADE (3 min antes) — tem que ser MUDO\n');

let linhas = [novaLinha(0)];
let corridas = [{ corrida: 'Sheff A2', hora: '1:31', _min: 2 }];   // dentro da janela
let ctx = montarAmbiente(linhas, corridas);
rodarCheck(ctx);

ok(ctx.sons.length === 0,
   'corrida a 2 min da largada NAO toca  (tocou ' + ctx.sons.length + 'x)');
ok(linhas[0].classList.contains('rc-perto'), 'a linha recebe a marca cinza rc-perto');
ok(!linhas[0].classList.contains('rc-alert'),
   'a linha NAO recebe mais o verde rc-alert (verde ficou pro alarme de camada)');

linhas = [novaLinha(0)];
corridas = [{ corrida: 'Sheff A2', hora: '1:31', _min: 40 }];      // longe
ctx = montarAmbiente(linhas, corridas);
rodarCheck(ctx);
ok(!linhas[0].classList.contains('rc-perto') && ctx.sons.length === 0,
   'corrida longe da largada: sem marca e sem som');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[2] ALARME DE FILTRO — continua funcionando, com o toggle dele\n');

linhas = [novaLinha(0)];
corridas = [{ corrida: 'Sheff A2', hora: '1:31', _min: 2 }];
ctx = montarAmbiente(linhas, corridas, {
  filtro: { ativo: 1, turno: '', pistas: [], classes: [], regras: [], som: 'beep', cor: 'roxo' }
});
rodarCheck(ctx);
ok(ctx.sons.length === 1 && ctx.sons[0].custom === true,
   'com alarme_filtro_ativo=1 ele volta a tocar  (tocou ' + ctx.sons.length + 'x)');
ok(linhas[0].classList.contains('rc-alert-custom') && linhas[0]._estilo['--alert-col'] === '#8b5cf6',
   'e pinta na cor configurada, sem usar verde nem azul');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[3] PROMOCAO DE CAMADA — verde pra manha+BW, azul pra pescada\n');

function rodarPintor(linhas, corridas, novas) {
  const corpo = extrair(['_horaChave']);
  const m = src.match(/window\.pintarPromocaoNaLista = function \(novas\) \{[\s\S]*?\n\};/);
  if (!m) { console.error('ERRO: pintarPromocaoNaLista sumiu do app.js'); process.exit(1); }
  const ctx = {
    results: corridas,
    document: { querySelectorAll: () => linhas },
    setTimeout: () => 0,
    window: {}
  };
  const nomes = Object.keys(ctx);
  new Function(...nomes, corpo + '\n' + m[0] + '\n; window.pintarPromocaoNaLista(' + JSON.stringify(novas) + ');')
    (...nomes.map(n => ctx[n]));
}

linhas = [novaLinha(0), novaLinha(1)];
corridas = [{ corrida: 'Newc A7', hora: '11:43' }, { corrida: 'Newc A6', hora: '11:09' }];
rodarPintor(linhas, corridas, [
  { corrida: 'Newc A7', hora: '11:43', camada: 'HIGH', da_manha: true },
  { corrida: 'Newc A6', hora: '11:09', camada: 'GOOD', da_manha: false }
]);

ok(linhas[0].classList.contains('rc-camada') && linhas[0]._estilo['--cam-col'] === '#1B9D40',
   'AvB da manha que a BW abriu -> linha pisca VERDE  (' + linhas[0]._estilo['--cam-col'] + ')');
ok(linhas[1].classList.contains('rc-camada') && linhas[1]._estilo['--cam-col'] === '#3b82f6',
   'pescada (a BW abriu fora da lista da manha) -> linha pisca AZUL  (' + linhas[1]._estilo['--cam-col'] + ')');

// hora em formatos diferentes tem que casar: o payload traz "1:47", a lista pode
// ter "01:47". Sem normalizar, a linha certa nunca era encontrada.
linhas = [novaLinha(0)];
corridas = [{ corrida: 'Trlee A7', hora: '01:47' }];
rodarPintor(linhas, corridas, [{ corrida: 'trlee a7', hora: '1:47', da_manha: true }]);
ok(linhas[0].classList.contains('rc-camada'),
   'casa a linha com hora "01:47" x "1:47" e corrida em caixa diferente');

linhas = [novaLinha(0)];
corridas = [{ corrida: 'Sheff A2', hora: '1:31' }];
rodarPintor(linhas, corridas, [{ corrida: 'Outra A9', hora: '9:99', da_manha: true }]);
ok(!linhas[0].classList.contains('rc-camada'), 'corrida que nao foi promovida nao pisca');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[4] O HOOK ESTA LIGADO nas duas pontas\n');

const pd = fs.readFileSync(PD, 'utf8');
ok(pd.indexOf('glob.pintarPromocaoNaLista') !== -1,
   'painelDia.js chama pintarPromocaoNaLista junto com o som');
ok(pd.indexOf('typeof glob.pintarPromocaoNaLista === \'function\'') !== -1,
   'e chama protegido: tela sem lista nao quebra');
ok(src.indexOf('window.pintarPromocaoNaLista = function') !== -1,
   'app.js publica a funcao no window');
ok(src.indexOf(".rc-camada{") !== -1 && src.indexOf(".rc-perto{") !== -1,
   'o CSS das duas classes novas existe');

console.log('\n' + (falhas === 0
  ? 'TUDO OK — som so no alarme de camada; verde = manha+BW, azul = pescada, cinza = perto da largada.'
  : falhas + ' FALHA(S) — nao subir.'));
process.exit(falhas === 0 ? 0 : 1);
