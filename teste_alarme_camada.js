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
console.log('\n[2] ALARME DE FILTRO — APOSENTADO (Bruno, 10/09/2026)\n');

linhas = [novaLinha(0)];
corridas = [{ corrida: 'Sheff A2', hora: '1:31', _min: 2 }];
ctx = montarAmbiente(linhas, corridas, {
  filtro: { ativo: 1, turno: '', pistas: [], classes: [], regras: [], som: 'beep', cor: 'roxo' }
});
rodarCheck(ctx);
// ESTE BLOCO FOI INVERTIDO DE PROPOSITO. Ate 10/09/2026 ele exigia o contrario:
// que com alarme_filtro_ativo=1 o alarme por turno/pista/classe VOLTASSE a tocar.
// A secao "Alarme para filtro selecionado" saiu da tela de Configuracoes e o
// matchAlarmeFiltro passa a devolver false na raiz — quem tivesse deixado o
// alarme ligado continuaria ouvindo o beep sem ter mais onde desliga-lo.
//
// A coluna alarme_filtro_ativo continua no banco e pode valer 1: e' justamente
// por isso que o teste continua montando o cenario com ela ligada. O que ele
// verifica agora e' que nem assim o alarme volta.
ok(ctx.sons.length === 0,
   'mesmo com alarme_filtro_ativo=1 o alarme aposentado NAO toca  (tocou ' + ctx.sons.length + 'x)');
ok(!linhas[0].classList.contains('rc-alert-custom'),
   'e a linha nao recebe mais a cor do filtro');
ok(linhas[0].classList.contains('rc-perto'),
   'ela cai na marca cinza de proximidade, como qualquer outra');

// ═════════════════════════════════════════════════════════════════════════════
// A LINHA DA CORRIDA COM AvB ESPERANDO.
//
// Mudou em set/2026: deixou de ser um flash de 12 segundos disparado pela
// promocao e virou ESTADO — a linha fica marcada enquanto o AvB espera entrada
// e sai 1 minuto depois da largada. Quem pinta agora e' o renderRaceListPanel,
// que roda a cada redesenho da lista; o pintarPromocaoNaLista so forca o
// redesenho na hora do alarme.
//
// Duas informacoes convivem na mesma linha, em canais separados:
//   COR DO PISCA = procedencia  -> verde: a manha previu / azul: pescada
//   COR DO SELO  = camada       -> TOP azul / HIGH laranja / GOOD roxo
// Este teste EXECUTA o renderRaceListPanel contra um DOM de mentira e le o que
// saiu em cada canal. Se alguem juntar os dois de novo numa cor so, cai aqui.
console.log('\n[3] A LINHA DA CORRIDA COM AvB ESPERANDO\n');

// minutesToRace e convertHora ficam de FORA de proposito: as versoes reais leem
// o relogio da maquina, e um teste que depende da hora em que roda passa de
// manha e falha a tarde. Aqui elas entram como stub, pelo ctx, e cada cenario
// diz quantos minutos faltam.
const AUX = ['_horaChave', '_chaveCorridaRc', '_corDaCamada', '_forcaCamada',
             '_avbExpirou', '_avbDaCorrida'];

// DOM de mentira com o suficiente pro renderRaceListPanel: ele cria <div>,
// escreve innerHTML, poe atributo e empilha no container.
function novoNo() {
  const cls = new Set(), estilo = {}, filhos = [];
  const no = {
    _cls: cls, _estilo: estilo, _filhos: filhos, innerHTML: '', style: {},
    classList: {
      add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c),
      toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); }
    },
    setAttribute: (k, v) => { no['_attr_' + k] = String(v); },
    getAttribute: k => (no['_attr_' + k] != null ? no['_attr_' + k] : null),
    addEventListener: () => {},
    appendChild: f => filhos.push(f)
  };
  // className e classList apontam pro MESMO conjunto. O renderRaceListPanel
  // monta a linha atribuindo className de uma vez ("rc rc-camada rc-old"), e um
  // DOM de mentira em que os dois vivem separados daria classList vazio e o
  // teste passaria/falharia por motivo errado.
  Object.defineProperty(no, 'className', {
    get: () => Array.from(cls).join(' '),
    set: v => { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach(c => cls.add(c)); }
  });
  no.style.setProperty = (k, v) => { estilo[k] = v; };
  return no;
}

// Roda o renderRaceListPanel de verdade. `aguardando` e' o que o painel do dia
// traz; `minutos` diz, por corrida, quanto falta pra largada (negativo = ja
// largou), pro teste nao depender do relogio da maquina.
function rodarLista(corridas, aguardando, minutos) {
  // As duas variaveis de modulo saem do PROPRIO app.js, nao redeclaradas aqui:
  // o CORES_CAMADA e' a tabela de cor das camadas, e o teste tem que quebrar se
  // ela mudar sem ninguem avisar — nao acompanhar a mudanca em silencio.
  let vars = '';
  for (const re of [/^var AVB_AGUARDANDO = \{\};/m, /^var CORES_CAMADA = \{[^}]*\};/m]) {
    const m = src.match(re);
    if (!m) { console.error('ERRO: ' + re + ' sumiu do app.js'); process.exit(1); }
    vars += m[0] + '\n';
  }
  const corpo = vars + extrair(AUX.filter(n => new RegExp('^function\\s+' + n + '\\s*\\(', 'm').test(src)));
  const mRender = src.match(/^function renderRaceListPanel\s*\([^)]*\)\s*\{[\s\S]*?^\}/m);
  const mAplica = src.match(/window\.aplicarAguardandoNaLista = function[\s\S]*?\n\};/);
  if (!mRender) { console.error('ERRO: renderRaceListPanel sumiu do app.js'); process.exit(1); }
  if (!mAplica) { console.error('ERRO: aplicarAguardandoNaLista sumiu do app.js'); process.exit(1); }

  const col = novoNo();
  const ctx = {
    results: corridas,
    document: {
      getElementById: id => (id === 'race-list-col' ? col : null),
      createElement: () => novoNo(),
      querySelectorAll: () => []
    },
    // minutesToRace do cenario: a corrida carrega o proprio _min.
    minutesToRace: r => (r && r._min != null ? r._min : (minutos && minutos[r.corrida] != null ? minutos[r.corrida] : 30)),
    isOldRaceCard: () => false,
    matchAlarmeFiltro: () => false,
    raceAlertKey: r => (r.hora || '') + '|' + (r.corrida || ''),
    alertedRaces: {},
    avisarCorrida: () => {},
    ALERTA_MIN_ANTES: 3,
    ALARME_FILTRO: { ativo: 0, cor: 'azul' },
    CORES_ALARME: { azul: '#3b82f6' },
    convertHora: h => h,
    corridaDisplay: r => r.corrida,
    _parEmFoco: () => ({ a: 1, b: 2 }),
    renderFocusPanel: () => {},
    refreshFocusMode: () => {},
    atualizarProximas: () => {},
    window: {}
  };
  const nomes = Object.keys(ctx);
  new Function(...nomes,
    corpo + '\n' + mAplica[0] + '\n' + mRender[0]
    + '\n; window.aplicarAguardandoNaLista(' + JSON.stringify(aguardando) + ');'
    + '\n; renderRaceListPanel(' + JSON.stringify(corridas) + ');')
    (...nomes.map(n => ctx[n]));
  return col._filhos;
}

let L = rodarLista(
  [{ corrida: 'Newc A7', hora: '11:43', _min: 5 }, { corrida: 'Newc A6', hora: '11:09', _min: 2 }],
  [{ corrida: 'Newc A7', hora: '11:43', camada: 'HIGH', da_manha: true },
   { corrida: 'Newc A6', hora: '11:09', camada: 'GOOD', da_manha: false }]
);

ok(L.length === 2, 'as duas corridas viraram linha  (saiu ' + L.length + ')');
// Pisca e selo na MESMA cor, a do TIPO (Bruno, 09/09/2026). Por um dia a cor da
// linha disse a procedencia (verde = a manha previu, azul = pescada) e o selo
// disse o tipo — duas leituras pra entender uma coisa. Agora e' uma so.
ok(L[0]._cls.has('rc-camada') && L[0]._estilo['--cam-col'] === '#f97316',
   'HIGH pisca LARANJA  (' + L[0]._estilo['--cam-col'] + ')');
ok(L[1]._cls.has('rc-camada') && L[1]._estilo['--cam-col'] === '#8b5cf6',
   'GOOD pisca ROXO  (' + L[1]._estilo['--cam-col'] + ')');
ok(L[0]._estilo['--cam-badge'] === L[0]._estilo['--cam-col']
   && L[1]._estilo['--cam-badge'] === L[1]._estilo['--cam-col'],
   'o selo usa a MESMA cor do pisca — uma pergunta, uma resposta');
ok(L[0]._estilo['--cam-col'] !== L[1]._estilo['--cam-col'],
   'e tipos diferentes na mesma lista saem em cores diferentes');
ok(L[0].innerHTML.indexOf('rc-avb-badge') !== -1 && L[0].innerHTML.indexOf('>HIGH<') !== -1,
   'o selo escrito na linha traz o nome da camada');
ok(L[0].innerHTML.indexOf('PRÓXIMA') === -1,
   'e OCUPA o lugar do selo PRÓXIMA — os dois nao disputam a mesma linha');

// AS DUAS AO MESMO TEMPO: e' o desenho que o Bruno escolheu. Uma corrida
// destacada por vez faria a segunda passar batida.
ok(L[0]._cls.has('rc-camada') && L[1]._cls.has('rc-camada'),
   'DUAS corridas destacadas ao mesmo tempo, cada uma na cor do seu tipo');

// hora em formatos diferentes tem que casar: o payload traz "1:47", a lista
// pode ter "01:47". Sem normalizar, a linha certa nunca e' encontrada.
L = rodarLista(
  [{ corrida: 'Trlee A7', hora: '01:47', _min: 4 }],
  [{ corrida: 'trlee a7', hora: '1:47', camada: 'TOP', da_manha: true }]
);
ok(L[0]._cls.has('rc-camada'), 'casa a linha com hora "01:47" x "1:47" e corrida em caixa diferente');
ok(L[0]._estilo['--cam-badge'] === '#3b82f6', 'TOP e' + String.fromCharCode(39) + ' azul  (' + L[0]._estilo['--cam-badge'] + ')');

L = rodarLista([{ corrida: 'Sheff A2', hora: '1:31', _min: 20 }], []);
ok(!L[0]._cls.has('rc-camada'), 'corrida sem AvB esperando nao pisca');
ok(L[0].innerHTML.indexOf('PRÓXIMA') !== -1, 'e volta a exibir o selo PRÓXIMA normal');

// ── o corte de 1 minuto ─────────────────────────────────────────────────────
// O aguardando_entrada do backend so cai quando a chegada chega, e isso pode
// demorar. Quem tira a corrida da sua frente na hora certa e' o relogio da tela.
console.log('\n[3b] O AvB SAI 1 MINUTO DEPOIS DA LARGADA\n');
const CASOS = [
  [5, true, 'faltando 5 min -> destacada'],
  [0, true, 'na hora da largada -> ainda destacada'],
  [-1, true, 'um minuto depois -> ainda destacada (da pra entrar)'],
  [-2, false, 'dois minutos depois -> sai do destaque'],
  [-30, false, 'meia hora depois -> fora']
];
for (const [min, esperado, msg] of CASOS) {
  const r = rodarLista(
    [{ corrida: 'Sheff A2', hora: '1:31', _min: min }],
    [{ corrida: 'Sheff A2', hora: '1:31', camada: 'TOP', da_manha: true }]
  );
  ok(r[0]._cls.has('rc-camada') === esperado, msg);
}

// ═════════════════════════════════════════════════════════════════════════════
// A ordem e a escolha da corrida vigente saem do painelDia, nao da tela.
console.log('\n[3c] ORDEM: TOP na frente, e a tela de disputa pega UMA corrida\n');

const PD_MOD = require(path.join(__dirname, 'public', 'js', 'painelDia.js'));
const PainelDia = (function () {
  const g = {};
  new Function('window', fs.readFileSync(PD, 'utf8'))(g);
  return g.PainelDia;
})();

const PAYLOAD = { corridas: [
  { hora: '9:12', hora_br: '5:12', corrida: 'Kilky A4', race_id: 1,
    confrontos: [{ id: 'a', camada: 'GOOD', aguardando_entrada: true }] },
  { hora: '8:59', hora_br: '4:59', corrida: 'Monmr A10', race_id: 2,
    confrontos: [{ id: 'b', camada: 'TOP', aguardando_entrada: true },
                 { id: 'c', camada: 'HIGH', aguardando_entrada: true }] },
  { hora: '9:30', hora_br: '5:30', corrida: 'Hove A9', race_id: 3,
    confrontos: [{ id: 'd', camada: 'OPORTUNIDADE', aguardando_entrada: false }] }
] };

const esperando = PainelDia.aguardando(PAYLOAD);
ok(esperando.length === 3, 'aguardando devolve os 3 confrontos que esperam entrada  (' + esperando.length + ')');
ok(String(esperando[0].camada) === 'TOP', 'o TOP vem primeiro, mesmo sendo de corrida mais tardia na lista');
ok(esperando.map(x => x.camada).join(',') === 'TOP,HIGH,GOOD',
   'ordem por camada: ' + esperando.map(x => x.camada).join(','));

const vigente = PainelDia.paraEntrar(PAYLOAD);
ok(vigente.length === 2, 'a tela de disputa recebe SO a corrida vigente  (' + vigente.length + ' confrontos)');
ok(vigente.every(x => x.corrida === 'Monmr A10'),
   'e todos sao da MESMA corrida — dois relogios na mesma tela e o que faz voce entrar no AvB errado');

ok(PainelDia.paraEntrar({ corridas: [] }).length === 0, 'sem nada esperando, a tela fica em standby');

// ═════════════════════════════════════════════════════════════════════════════
// UM DONO POR CONTAINER. Este e' o defeito que mais custou tempo em set/2026, e
// apareceu tres vezes com caras diferentes: os cards das alternativas piscando e
// sumindo, o card do AvB da BW aparecendo por um segundo, a tela de disputa
// trocando sozinha. Todas as tres eram a mesma coisa — duas funcoes escrevendo
// no mesmo pedaco do DOM, em ritmos diferentes, e a de intervalo mais curto
// ganhando.
//
// O caso do fp-alts: o renderOddsLive roda a cada 5 SEGUNDOS e, quando o robo de
// odds nao achava a corrida, limpava o container que o _mmPintarBw acabara de
// preencher. O comentario que ja existia no arquivo avisava do risco e a escrita
// tinha sido removida na epoca — mas a LIMPEZA ficou, e continuou apagando.
console.log('\n[3d] UM DONO POR CONTAINER: so o _mmPintarBw mexe no fp-alts\n');

// Todo lugar que escreve ou apaga o fp-alts, contado no arquivo real.
const _linhasAlts = src.split(/\r?\n/)
  .map((l, i) => ({ n: i + 1, t: l }))
  .filter(x => x.t.indexOf('fp-alts') !== -1 && x.t.trim().indexOf('//') !== 0);
console.log('    referencias a fp-alts no app.js: ' + _linhasAlts.length);
for (const l of _linhasAlts) console.log('      linha ' + l.n + ': ' + l.t.trim().slice(0, 84));

// A prova: nenhuma linha que pega o fp-alts pode zerar o innerHTML FORA do
// _mmPintarBw. O _ajustaGradeAvb tambem o consulta, mas so pra CONTAR os cards.
const _corpoPintar = (src.match(/^function _mmPintarBw[\s\S]*?^\}/m) || [''])[0];
const _foraDoPintar = src.replace(_corpoPintar, '');
ok(_corpoPintar.length > 0, 'o _mmPintarBw existe e foi localizado no arquivo');
ok(!/fp-alts[\s\S]{0,160}?innerHTML\s*=\s*''/.test(_foraDoPintar),
   'NENHUMA outra funcao zera o fp-alts — era o renderOddsLive, a cada 5 segundos');
ok(_corpoPintar.indexOf("box.innerHTML = ''") !== -1,
   'e o proprio _mmPintarBw continua podendo limpar, quando nao ha o que mostrar');

// ═════════════════════════════════════════════════════════════════════════════
// DUAS FONTES PRA "A BW ABRIU", e a tela tem que ler a que tem o dado.
//
// O caso real (10/09/2026): a BW abriu o par T1xT6 do Towcester A3 a 1.91. O
// painel do dia recebeu isso pelo avb_abertos e classificou o AvB como GOOD — a
// linha piscou roxo na lista. Ao mesmo tempo, a tela da corrida mostrava o campo
// Odd VAZIO e a nota "BW ainda nao monitorou esta corrida".
//
// A causa: o avb_abertos e o MM_CACHE do monitor de card sao alimentados por
// robos diferentes, e o segundo ainda nao tinha passado naquela corrida. A tela
// lia so ele, e dizia que nao havia nada — com a odd na mao, do outro lado.
console.log('\n[3e] A ODD E A NOTA DA BW SAEM DO PAINEL DO DIA\n');

ok(src.indexOf('if (doPainel && doPainel.odd_bw != null) return doPainel.odd_bw;') !== -1,
   'o _parOddAtual consulta o painel do dia antes de desistir');

// A ORDEM importa: as odds ao vivo (5s) sao mais frescas que o painel (18s), e
// tem que continuar ganhando quando existem.
const _corpoOdd = (src.match(/^function _parOddAtual[\s\S]*?^\}/m) || [''])[0];
ok(_corpoOdd.indexOf('_avbsAoVivo') < _corpoOdd.indexOf('_tiposDaCorrida'),
   'e consulta DEPOIS das odds ao vivo — elas sao de 5s, o painel e de 18s');
ok(_corpoOdd.indexOf('_tiposDaCorrida') < _corpoOdd.indexOf('avbEscolhido'),
   'mas ANTES da odd guardada na escolha, que pode ser de horas atras');

// A nota nao pode dizer "nao monitorou" com AvB classificado na mesma tela.
ok(src.indexOf("var doPainel = _tiposDaCorrida(r);") !== -1,
   'a nota da BW consulta o painel do dia');
ok(/if \(doPainel\.length\) \{[\s\S]{0,400}?\} else if \(bw\) \{/.test(src),
   'e o painel MANDA: so cai no MM_CACHE quando o painel nao tem opiniao');
const _iPainel = src.indexOf("'a BW abriu ' + doPainel.length");
const _iNaoMon = src.indexOf("'BW ainda não monitorou esta corrida'");
ok(_iPainel !== -1 && _iNaoMon !== -1 && _iPainel < _iNaoMon,
   'com AvB classificado a tela diz que a BW ABRIU, nunca que nao monitorou');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[4] O HOOK ESTA LIGADO nas duas pontas\n');

const pd = fs.readFileSync(PD, 'utf8');
ok(pd.indexOf('glob.pintarPromocaoNaLista') !== -1,
   'painelDia.js chama pintarPromocaoNaLista junto com o som');
ok(pd.indexOf('typeof glob.pintarPromocaoNaLista === \'function\'') !== -1,
   'e chama protegido: tela sem lista nao quebra');
ok(src.indexOf('window.pintarPromocaoNaLista = function') !== -1,
   'app.js publica a funcao no window');
ok(src.indexOf('window.aplicarAguardandoNaLista = function') !== -1,
   'app.js publica o aplicarAguardandoNaLista, que e quem carrega o estado');
ok(src.indexOf(".rc-camada{") !== -1 && src.indexOf(".rc-perto{") !== -1
   && src.indexOf(".rc-avb-badge{") !== -1,
   'o CSS das tres classes existe (.rc-camada, .rc-perto, .rc-avb-badge)');

// O VERDE VOLTOU pro aviso de proximidade (Bruno, 09/09/2026). Ele tinha virado
// cinza em 08/09 porque o verde estava emprestado pro alarme de camada; agora
// que a cor da linha diz o TIPO, o verde esta livre e volta pra funcao original.
// Segue MUDO — o som so toca em promocao de tipo, e isso nao mudou.
const _rcPerto = (src.match(/'\.rc-perto\{[^']*'/) || [''])[0];
ok(_rcPerto.indexOf('#1B9D40') !== -1,
   'o aviso de 3 minutos voltou a piscar VERDE  (' + (_rcPerto || '(nao achei a regra)') + ')');
// A busca e' DENTRO da regra .rc-perto, nao no arquivo todo: aquele cinza
// tambem e a cor do cabecalho da tabela de validacao, num lugar sem relacao
// nenhuma com isto.
ok(_rcPerto.indexOf('rgba(255,255,255,.28)') === -1,
   'e a borda cinza que ele usou por um dia saiu da regra');

// O aviso fixo saiu de vez: sobra de CSS ou de div deixaria um balao morto
// escutando no topo da tela.
console.log('\n[5] O AVISO FIXO NO TOPO SAIU DE VEZ\n');
const MAIN = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');
for (const s of ['#ap-aviso', 'apa-txt', 'apa-cam', 'mostrarAviso']) {
  ok(MAIN.indexOf(s) === -1, 'nenhum resto de ' + s + ' no main.js');
}

// O CSS dos tiles tem que estar na rota que os desenha. Ele viveu meses dentro
// da /cascata, que nao usa nenhuma classe .ap-*, e a Analisar ficava sem.
console.log('\n[6] O CSS DOS TILES ESTA NA ROTA QUE OS USA\n');
const rotas = [];
const reR = /^router\.get\('([^']+)'/gm;
let mR;
while ((mR = reR.exec(MAIN)) !== null) rotas.push([mR.index, mR[1]]);
function rotaDe(marca) {
  const i = MAIN.indexOf(marca);
  if (i < 0) return null;
  let alvo = null;
  for (const [p, r] of rotas) { if (p < i) alvo = r; }
  return alvo;
}
for (const marca of ['.ap-tile{', '.ap-grid{display:grid', '.ap-entrada{', '.ap-standby{']) {
  const r = rotaDe(marca);
  ok(r === '/', 'o "' + marca + '" esta na rota "/" (Analisar)  — achei em: ' + r);
}
ok(MAIN.indexOf('id="ap-painel"') !== -1, 'e o container #ap-painel esta na mesma rota');

console.log('\n' + (falhas === 0
  ? 'TUDO OK — pisca e selo na cor do TIPO, verde de volta no aviso de 3 min, e o CSS na rota certa.'
  : falhas + ' FALHA(S) — nao subir.'));
process.exit(falhas === 0 ? 0 : 1);
