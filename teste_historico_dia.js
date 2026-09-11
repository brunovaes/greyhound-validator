// TESTE: o Historico e' do DIA e da BW, e o cabecalho manda nos cartoes
// (Bruno, 10/09/2026)
//
// Por que existe: em 10/09 a tela mostrou 7 corridas onde o dia inteiro tinha
// 17, e o unico HIGH do dia sumiu junto. Duas causas, as duas so no Historico:
//   (1) ele lia por LOTE (`WHERE session_id=?`) enquanto o painel-dia lia por DIA;
//   (2) ele descartava corrida `nivel='skip'`, contra o "livre acesso" de 09/09.
// Depois: os cartoes ignoravam o filtro do cabecalho, e o filtro de Tipo estava
// quebrado por uma variavel que nao existe.
//
// Os blocos [1] a [4] leem o FONTE — provam que a regressao especifica nao
// voltou, nao que a pagina renderiza. Os blocos [5] e [6] RODAM as funcoes: o
// [6] arranca o filtro e os cartoes do proprio main.js e executa os dois contra
// um DOM de mentira. E' o teste que teria pego o `mo` antes de voce.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');
const cd = require('./src/utils/camadasDoDia');

let ok = 0, fail = 0;
function t(nome, cond) {
  if (cond) { ok++; console.log('  OK    | ' + nome); }
  else { fail++; console.log('  FALHA | ' + nome); }
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── [1] ESCOPO ──────────────────────────────────────────────────────────────
bloco('[1] O HISTORICO LE O DIA, NAO O LOTE');

t('a consulta antiga por session_id nao existe mais',
  !SRC.includes("SELECT * FROM races WHERE session_id=? ORDER BY hora"));
t('a consulta nova casa a data do lote pedido',
  SRC.includes("date(s.created_at,'-3 hours') = (SELECT date(created_at,'-3 hours') FROM race_sessions WHERE id=?)"));
t('e continua presa ao usuario canonico (as corridas sao compartilhadas)',
  /racesBrutas[\s\S]{0,600}?r\.user_id=\?/.test(SRC));
t('o mesmo corte de fuso do painel-dia (-3 horas), pra os dois nunca divergirem',
  (SRC.match(/date\((?:s\.)?created_at,'-3 hours'\)/g) || []).length >= 2);

// ── [2] DEDUPE ──────────────────────────────────────────────────────────────
bloco('[2] DOIS LOTES DO MESMO DIA NAO VIRAM LINHA DUPLICADA');

t('existe deduplicacao por corrida+hora', /porChave\.set\(ch, r\)/.test(SRC));
t('a chave junta corrida e hora', /String\(r\.corrida[\s\S]{0,80}String\(r\.hora/.test(SRC));
t('desempate prefere a copia com hist_full (sem ele nao ha classificacao)',
  /nota = function \(r\) \{ return \(r\.hist_full \? 2 : 0\)/.test(SRC));
t('e, empatando, a copia mais recente', /dif === 0 && Number\(r\.id\) > Number\(atual\.id\)/.test(SRC));
t('a ordem final continua sendo por hora como texto (igual ao SQL de antes)',
  /return x < y \? -1 : \(x > y \? 1 : 0\)/.test(SRC));

// ── [3] LIVRE ACESSO ────────────────────────────────────────────────────────
bloco('[3] CORRIDA QUE A BW ABRIU ENTRA MESMO SEM SER OPORTUNIDADE');

t("o `continue` de skip saiu do funil do Historico",
  !SRC.includes("if (r.nivel === 'skip') continue;"));
t('OPORTUNIDADE continua fora — o registro e do que o mercado confirmou',
  SRC.includes("confs.filter(function (c) { return c.camada !== 'OPORTUNIDADE'; })"));

// ── [4] A LINHA NOVA NAO PODE NASCER PELA METADE ────────────────────────────
bloco('[4] SELETOR DE PISTA E ALL_RACES ENXERGAM AS LINHAS NOVAS');

t('existe o conjunto de ids que ganharam linha', /const idsNoHistorico = new Set\(linhasAvb\.map/.test(SRC));
t('naTela aceita skip/trap_fav 0 quando a corrida tem registro',
  /const naTela = function \(r\) \{ return \(r\.nivel !== 'skip' && r\.trap_fav > 0\) \|\| idsNoHistorico\.has\(r\.id\); \};/.test(SRC));
t('o seletor de Corrida usa naTela', /pistaOpts = \[\.\.\.new Set\(races\.filter\(naTela\)/.test(SRC));
t('o ALL_RACES usa naTela', /var ALL_RACES=\$\{JSON\.stringify\(races\.filter\(naTela\)/.test(SRC));

const posIds = SRC.indexOf('const idsNoHistorico');
const posNaTela = SRC.indexOf('const naTela =');
const posPista = SRC.indexOf('pistaOpts = [...new Set(races.filter(naTela)');
const posAll = SRC.indexOf('var ALL_RACES=${JSON.stringify(races.filter(naTela)');
t('idsNoHistorico e naTela sao definidos ANTES dos dois usos (senao e ReferenceError em producao)',
  posIds > 0 && posNaTela > posIds && posPista > posNaTela && posAll > posNaTela);

// ── [5] QUAL AvB VIRA O REGISTRO ────────────────────────────────────────────
// A pergunta do Bruno em 10/09: "caso hoje aparecam 2, 3 ou 4 na tela, a que
// vai para o historico e a mais TOP de todas ou aquela que eu escolhi entrar?"
bloco('[5] A APOSTA GANHA DO MERITO; SEM APOSTA, GANHA O MELHOR');

const mk = (id, camada, pct, split, caltm) => ({
  id: id, camada: camada, pct: pct, split_dif: split, caltm_dif: caltm,
  par: 'T1xT2', pick_trap: 1, outro_trap: 2, bateu: null
});

const tela4 = [mk('a', 'GOOD', 95, 0.10, 0.5), mk('b', 'TOP', 77, 0.06, 0.2),
               mk('c', 'HIGH', 81, 0.04, 0.3), mk('d', 'GOOD', 88, 0.02, 0.1)];

t('sem aposta, vai o TOP mesmo tendo o menor pct da tela',
  cd.registroDoHistorico(tela4, null) && cd.registroDoHistorico(tela4, null).id === 'b');
t('com aposta num GOOD, vai o GOOD que ele apostou — nao o TOP',
  cd.registroDoHistorico(tela4, 'a') && cd.registroDoHistorico(tela4, 'a').id === 'a');
t('aposta num id que nao esta na tela cai no melhor, nao devolve nada quebrado',
  cd.registroDoHistorico(tela4, 'zzz') && cd.registroDoHistorico(tela4, 'zzz').id === 'b');

const soOportunidade = [mk('x', 'OPORTUNIDADE', 90, 0.1, 0.5)];
t('corrida que so tem OPORTUNIDADE nao gera registro (a BW nao abriu)',
  cd.registroDoHistorico(soOportunidade, null) === null);

const doisTop = [mk('p', 'TOP', 70, 0.02, 0.9), mk('q', 'TOP', 70, 0.09, 0.1)];
t('dois TOP na mesma corrida: desempata por SPLIT antes de tempo e pct',
  cd.registroDoHistorico(doisTop, null) && cd.registroDoHistorico(doisTop, null).id === 'q');

// ── [6] O CABECALHO MANDA NOS CARTOES ───────────────────────────────────────
// Aqui o teste sai do fonte e RODA. Arranca do main.js o codigo que o navegador
// executa (_histSet, recalcKpisHist e aplicarFiltroHist), monta um DOM de
// mentira com quatro linhas e confere o que os cartoes passam a dizer.
//
// Por que assim: em 09/09 eu escrevi um teste que conferia o payload e nao a
// tela, dei o simulador por pronto e o Bruno abriu numa tela em branco. Um
// teste que le so o texto do arquivo nao teria pego o `mo` inexistente, porque
// a linha estava sintaticamente perfeita.
bloco('[6] FILTRAR MUDA OS NUMEROS DOS CARTOES (E O TIPO NAO ESTOURA)');

function extraiFuncao(nome) {
  const ini = SRC.indexOf('function ' + nome + '(');
  if (ini < 0) return null;
  let i = SRC.indexOf('{', ini), nivel = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') nivel++;
    else if (SRC[i] === '}') { nivel--; if (!nivel) return SRC.slice(ini, i + 1); }
  }
  return null;
}

const fnHistSet = extraiFuncao('_histSet');
const fnRecalc = extraiFuncao('recalcKpisHist');
const fnFiltro = extraiFuncao('aplicarFiltroHist');
t('as tres funcoes do cabecalho foram encontradas no main.js',
  !!fnHistSet && !!fnRecalc && !!fnFiltro);

// DOM de mentira: so o que essas funcoes tocam.
function montaDom(linhas, filtros) {
  const els = {};
  const pegaEl = function (id) {
    if (!els[id]) els[id] = { textContent: '', style: {}, value: (filtros && filtros[id]) || '' };
    return els[id];
  };
  for (const k in (filtros || {})) pegaEl(k).value = filtros[k];
  const trs = linhas.map(function (L) {
    return {
      style: { display: '' },
      getAttribute: function (a) {
        const m = { 'data-race': '1', 'data-turno': L.turno || '', 'data-pista': L.pista || '',
                    'data-bateu': L.bateu || '', 'data-camada': L.camada || '',
                    'data-entrei': L.entrei || '', 'data-abriu': L.abriu == null ? '' : String(L.abriu),
                    'data-naoaberto': L.naoaberto ? '1' : '0' };
        return m[a] == null ? null : m[a];
      }
    };
  });
  return {
    els: els, trs: trs,
    document: {
      getElementById: function (id) { return (filtros && !(id in filtros) && !/^kpi-/.test(id)) ? null : pegaEl(id); },
      querySelectorAll: function (sel) { return sel === 'tr[data-race]' ? trs : []; },
      addEventListener: function () {}
    }
  };
}

function roda(linhas, filtros) {
  const dom = montaDom(linhas, filtros || {});
  const ctx = { document: dom.document, console: console };
  vm.createContext(ctx);
  vm.runInContext(fnHistSet + '\n' + fnRecalc + '\n' + fnFiltro + '\naplicarFiltroHist();', ctx);
  const val = function (id) { return dom.els[id] ? dom.els[id].textContent : undefined; };
  return {
    visiveis: dom.trs.filter(function (tr) { return tr.style.display !== 'none'; }).length,
    card: function (n) {
      return { qtd: val('kpi-' + n + '-qtd'), ok: val('kpi-' + n + '-ok'),
               err: val('kpi-' + n + '-err'), pct: val('kpi-' + n + '-pct') };
    },
    // Estilos aplicados: e por aqui que se verifica a cor da taxa e a largura da
    // barra do grafico, que sao efeito colateral do pinta() e nao valor de texto.
    estilo: function (id) { return (dom.els[id] && dom.els[id].style) || {}; }
  };
}

const LINHAS = [
  { camada: 'TOP',  bateu: 'sim', pista: 'Sheff', turno: 'Tarde', entrei: 'sim', abriu: 1 },
  { camada: 'TOP',  bateu: 'nao', pista: 'CPark', turno: 'Tarde', entrei: 'nao', abriu: 1 },
  { camada: 'HIGH', bateu: 'sim', pista: 'Sheff', turno: 'Manhã', entrei: 'nao', abriu: 1 },
  { camada: 'GOOD', bateu: '',    pista: 'Towc',  turno: 'Tarde', entrei: 'nao', abriu: 1 }
];
const SEM_FILTRO = { 'fh-turno': '', 'fh-corrida': '', 'fh-bateu': '', 'fh-aberto': '', 'fh-motor': '', 'fh-entrei': '' };
const com = function (o) { return Object.assign({}, SEM_FILTRO, o); };

let base = null;
try { base = roda(LINHAS, SEM_FILTRO); } catch (e) { console.log('  (erro sem filtro: ' + e.message + ')'); }
t('sem filtro, o cartao Geral conta as quatro linhas', base && base.card('geral').qtd === 4);
t('sem filtro, a taxa Geral sai so dos resolvidos: 2 de 3 = 67%', base && base.card('geral').pct === '67%');
t('sem filtro, o cartao GOOD tem 1 registro e nenhuma taxa (nao correu)',
  base && base.card('good').qtd === 1 && base.card('good').pct === '—');

// O QUE ESTAVA QUEBRADO: escolher um Tipo estourava ReferenceError no `mo`,
// o forEach morria na primeira linha e o recalcKpisHist nem chegava a rodar.
let porTipo = null, erroTipo = null;
try { porTipo = roda(LINHAS, com({ 'fh-motor': 'TOP' })); } catch (e) { erroTipo = e; }
t('filtrar por Tipo=TOP nao estoura (era ReferenceError: mo is not defined)', !erroTipo);
t('filtrar por Tipo=TOP deixa 2 linhas na tela', porTipo && porTipo.visiveis === 2);
t('e o cartao Geral passa a dizer 2, nao 4 — os cartoes seguem o filtro',
  porTipo && porTipo.card('geral').qtd === 2);
t('a taxa Geral vira 1 de 2 = 50%', porTipo && porTipo.card('geral').pct === '50%');
t('o cartao HIGH zera junto, porque nenhuma HIGH esta visivel',
  porTipo && porTipo.card('high').qtd === 0);

let porPista = null;
try { porPista = roda(LINHAS, com({ 'fh-corrida': 'Sheff' })); } catch (e) {}
t('filtrar por pista tambem mexe nos cartoes', porPista && porPista.card('geral').qtd === 2);
t('e o TOP de outra pista sai da conta do cartao TOP', porPista && porPista.card('top').qtd === 1);

let porEntrei = null;
try { porEntrei = roda(LINHAS, com({ 'fh-entrei': 'sim' })); } catch (e) {}
t('filtrar por Entrei=sim deixa so a aposta e o cartao acompanha',
  porEntrei && porEntrei.card('geral').qtd === 1 && porEntrei.card('geral').pct === '100%');

let porTurno = null;
try { porTurno = roda(LINHAS, com({ 'fh-turno': 'Manhã' })); } catch (e) {}
t('filtrar por turno idem', porTurno && porTurno.card('geral').qtd === 1);

t('nao sobrou nenhuma leitura da variavel `mo` no filtro', !/\(mo === fm\)/.test(SRC));

// ── [7] A COLUNA "AvB na BW" LE A FONTE QUE CLASSIFICOU A LINHA ────────────
// Bruno, 10/09: "se praticamente todos os que estao no historico abriu no BW,
// porque a coluna AvB na BW nao foi preenchida pra todos que ja correram?"
// Porque ela lia races.abriu (par da reanalise, outro robo, congelado) em vez
// do confronto da propria linha. Aqui a funcao roda de verdade.
bloco('[7] A ODD DO MERCADO APARECE SEMPRE QUE A BW ABRIU');

const fnAbriu = extraiFuncao('_abriuDaLinha');
t('_abriuDaLinha existe no main.js', !!fnAbriu);

const ctxAb = {};
vm.createContext(ctxAb);
vm.runInContext(fnAbriu + '\nthis.f = _abriuDaLinha;', ctxAb);
const abriuDa = ctxAb.f;

const cfBW = (camada, odd, pick, outro) => ({
  camada: camada, odd_bw: odd, pick_trap: pick, outro_trap: outro,
  par: 'T' + pick + 'xT' + outro
});

// O caso do print: Sheffield A4 2:04, linha GOOD T6xT5, a BW abriu a 1.57,
// e a coluna mostrava travessao porque races.abriu era null.
const sheff = abriuDa({ abriu: null, odd_abertura: null, abriu_par: null }, cfBW('GOOD', 1.57, 6, 5));
t('linha GOOD com races.abriu null continua marcando que ABRIU', sheff.abriu === 1);
t('e mostra a odd do mercado que classificou o AvB (1.57)', sheff.odd === 1.57);

t('TOP idem', abriuDa({ abriu: null, odd_abertura: null, abriu_par: null }, cfBW('TOP', 1.65, 1, 3)).abriu === 1);
t('HIGH idem', abriuDa({ abriu: 0, odd_abertura: null, abriu_par: '9x9' }, cfBW('HIGH', 1.5, 4, 3)).abriu === 1);
t('races.abriu=0 nao consegue mais desmentir uma linha classificada',
  abriuDa({ abriu: 0, odd_abertura: 9.9, abriu_par: '9x9' }, cfBW('HIGH', 1.5, 4, 3)).odd === 1.5);

// Fallback: sem odd_bw, so aproveita a odd_abertura se for o MESMO par.
const mesmo = abriuDa({ abriu: 1, odd_abertura: 1.9, abriu_par: '6x5' }, cfBW('GOOD', null, 6, 5));
t('sem odd_bw, aproveita a odd_abertura quando o par e o mesmo', mesmo.odd === 1.9);
const invertido = abriuDa({ abriu: 1, odd_abertura: 1.9, abriu_par: '5x6' }, cfBW('GOOD', null, 6, 5));
t('e reconhece o par invertido (5x6 e o mesmo que 6x5)', invertido.odd === 1.9);
const outroPar = abriuDa({ abriu: 1, odd_abertura: 1.9, abriu_par: '2x4' }, cfBW('GOOD', null, 6, 5));
t('mas NAO usa a odd de outro par — melhor sem odd do que com a odd errada',
  outroPar.abriu === 1 && outroPar.odd === null);

// A linha FORA nao passou pelo camadasDoDia: nela races.abriu ainda manda.
const fora = { abriu: 1, odd_abertura: 2.0, abriu_par: '1x2' };
t('linha FORA com abriu=1 mantem o comportamento antigo',
  abriuDa(fora, { camada: 'FORA', pick_trap: 1, outro_trap: 2 }).odd === 2.0);
t('linha FORA com abriu=0 continua dizendo que nao abriu',
  abriuDa({ abriu: 0, odd_abertura: null, abriu_par: '1x2' }, { camada: 'FORA' }).abriu === 0);
t('linha FORA sem medicao continua "nao monitorada"',
  abriuDa({ abriu: null, odd_abertura: null, abriu_par: null }, { camada: 'FORA' }).abriu === null);
t('sem cf nenhum nao estoura', abriuDa({ abriu: null }, null).abriu === null);

// O filtro e a celula tem que sair do MESMO calculo.
t('a linha calcula stAberto uma vez so', /var stAberto = _abriuDaLinha\(r, cf\);/.test(SRC));
t('o data-abriu sai do stAberto, nao mais de r.abriu',
  /data-abriu="' \+ \(stAberto\.abriu==null\?'':String\(stAberto\.abriu\)\)/.test(SRC));
t('a celula recebe o mesmo stAberto', /_celulaAberto\(r, stAberto\)/.test(SRC));
t('nao sobrou leitura de r.abriu na celula', !/_celulaAberto\(r\)\s*:/.test(SRC));

// ── [8] VER HISTORICO: os galgos do AvB DA LINHA ───────────────────────────
// Bruno, 10/09: a janela abria como "T0 vs T0", bolinha zerada e sem nome, e
// tinha perdido pista/distancia do cabecalho. Ela lia trap_fav/name_fav — o par
// do MOTOR DA MANHA —, e corrida que o motor pulou tem trap_fav = 0. Desde que
// o Historico passou a listar essas corridas, a janela delas nascia vazia.
bloco('[8] A JANELA DE HISTORICO FALA DOS GALGOS DA LINHA');

// GUARDA DE SINTAXE. O bug que quebrou esta entrega foi uma CRASE dentro de um
// comentario que vive dentro do template literal do res.send: crase ali fecha a
// string e derruba a rota inteira. `new vm.Script` faz o mesmo que node --check,
// dentro da suite que voce roda de verdade.
let erroSintaxe = null;
try { new vm.Script(SRC, { filename: 'main.js' }); } catch (e) { erroSintaxe = e; }
t('o main.js inteiro continua compilando (pega crase solta em template literal)', !erroSintaxe);
if (erroSintaxe) console.log('        -> ' + erroSintaxe.message);

const fnSvGalgo = extraiFuncao('_svGalgo');
const fnModal = extraiFuncao('openSessValModal');
t('_svGalgo e openSessValModal existem', !!fnSvGalgo && !!fnModal);

const GRID = [
  { trap: 3, nome: 'Golden Boy', historico: [{ data: '03Sep26', pista: 'Wtrfd' }] },
  { trap: 5, nome: 'Finnery Ace', historico: [{ data: '27Aug26', pista: 'Wtrfd' }] }
];
const CORRIDA_SKIP = {
  id: 7, corrida: 'Wtrfd A6', corridaNome: 'Waterford A6', dist: '480',
  trap_fav: 0, name_fav: '', perfil_fav: 'modoturbo',
  trap_und: 0, name_und: '', perfil_und: 'modoturbo',
  hist_fav: null, hist_und: null, hist_full: JSON.stringify(GRID)
};

function rodaModal(corrida, a, b) {
  const els = {};
  const pega = function (id) { if (!els[id]) els[id] = { textContent: '', innerHTML: '', classList: { add: function () {} } }; return els[id]; };
  const ctx = {
    console: console,
    ALL_RACES: [corrida],
    document: { getElementById: pega },
    svCard: function (trap, nome, perfil, hist) {
      return '[card ' + trap + '|' + (nome || '') + '|' + (perfil || '') + '|' + ((hist && hist.length) || 0) + ']';
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fnSvGalgo + '\n' + fnModal + '\nopenSessValModal(' + corrida.id + ',' + a + ',' + b + ');', ctx);
  return { titulo: pega('sv-title').textContent, corpo: pega('sv-body').innerHTML };
}

const rSkip = rodaModal(CORRIDA_SKIP, 3, 5);
t('corrida sem pick do motor nao abre mais como T0 vs T0', rSkip.titulo.indexOf('T0') < 0);
t('o titulo traz os dois galgos do AvB da linha',
  rSkip.titulo.indexOf('T3 Golden Boy') >= 0 && rSkip.titulo.indexOf('T5 Finnery Ace') >= 0);
t('e volta a trazer pista por extenso e distancia',
  rSkip.titulo.indexOf('Waterford A6') >= 0 && rSkip.titulo.indexOf('480m') >= 0);
t('as bolinhas recebem o numero certo, nao 0',
  rSkip.corpo.indexOf('[card 3|Golden Boy') >= 0 && rSkip.corpo.indexOf('[card 5|Finnery Ace') >= 0);
t('e cada galgo leva o proprio historico', rSkip.corpo.indexOf('|1]') >= 0);
t('perfil nao e inventado para galgo que nao era o pick do motor',
  rSkip.corpo.indexOf('|modoturbo|') < 0);

const CORRIDA_MOTOR = Object.assign({}, CORRIDA_SKIP, { trap_fav: 3, name_fav: 'Golden Boy' });
const rMotor = rodaModal(CORRIDA_MOTOR, 3, 5);
t('quando o galgo E o pick do motor, o perfil dele aparece', rMotor.corpo.indexOf('|modoturbo|') >= 0);

// Sessao antiga: sem hist_full, com o par do motor gravado. Tem que continuar abrindo.
const ANTIGA = {
  id: 9, corrida: 'Sheff A2', corridaNome: 'Sheffield A2', dist: '500',
  trap_fav: 1, name_fav: 'Braemar', perfil_fav: 'forte',
  trap_und: 6, name_und: 'Romeo', perfil_und: 'fraco',
  hist_fav: JSON.stringify([{ data: '01Aug26' }]), hist_und: JSON.stringify([{ data: '02Aug26' }]),
  hist_full: null
};
const rAntiga = rodaModal(ANTIGA, 0, 0);
t('sessao antiga (sem hist_full) continua abrindo pelo par do motor',
  rAntiga.titulo.indexOf('T1 Braemar') >= 0 && rAntiga.titulo.indexOf('T6 Romeo') >= 0);
t('e ainda mostra o historico que ela tinha', rAntiga.corpo.indexOf('|1]') >= 0);

const SEM_NADA = Object.assign({}, ANTIGA, { hist_fav: null, hist_und: null });
const rVazia = rodaModal(SEM_NADA, 0, 0);
t('sem historico nenhum, avisa em vez de abrir uma janela vazia',
  rVazia.titulo.indexOf('indisponivel') >= 0);

t('a celula do Historico passa o par no onclick',
  /openSessValModal\(' \+ r\.id \+ ',' \+ Number\(cf\.pick_trap/.test(SRC));

// ── [9] NOME DO GALGO SEM A FICHA DE CRIACAO ───────────────────────────────
// Bruno, 11/09: "Golden Lion (W) ltbd d Dorotas Wildcat-Golden Mist Jun24modoturbo".
// O PDF traz o nome grudado na ficha de criacao. O sistema ja tratava isso
// (_limpaNome, no app.js e no cargaVip.js), mas o card deste modal recebia o
// nome CRU do hist_full. A limpeza e na EXIBICAO: corrigir so na gravacao
// deixaria toda corrida ja analisada com a ficha na tela pra sempre.
bloco('[9] O NOME DO GALGO CHEGA LIMPO NA TELA');

const SRC_CARD = fs.readFileSync(path.join(__dirname, 'public', 'js', 'cardGalgo.js'), 'utf8');
const ctxCard = {};
vm.createContext(ctxCard);
vm.runInContext(SRC_CARD + '\nthis.limpa = svLimpaNome; this.card = svCard;', ctxCard);
const limpa = ctxCard.limpa;

[
  ['Golden Lion (W) ltbd d Dorotas Wildcat-Golden Mist Jun24', 'Golden Lion (W)'],
  ['Dorotas Wildcat (M) bk d Pat C Sabbath-Ballymac Jun22', 'Dorotas Wildcat (M)'],
  ['Swift Finnery ltbd d Kinloch Brae-Ela Mai Jun24', 'Swift Finnery'],
  ['Beach Hollyoak bkw d X-Y Aug23', 'Beach Hollyoak'],
  ['Romeo On Point Jun24', 'Romeo On Point'],
  ['Braemar Millie (Ssn 12Aug)', 'Braemar Millie']
].forEach(function (C) {
  t('corta a ficha de criacao: ' + C[0].slice(0, 34) + '...', limpa(C[0]) === C[1]);
  // Idempotencia: sem isso, quem ja limpou na entrada nao poderia chamar de novo.
  t('   e chamar de novo nao muda nada', limpa(C[1]) === C[1]);
});
t('nome sem ficha passa inteiro', limpa('Golden Lion (W)') === 'Golden Lion (W)');
t('a mascara "sem nome" do motor nao e mutilada', limpa('b3 (sem nome)') === 'b3 (sem nome)');
t('vazio e nulo nao estouram', limpa('') === '' && limpa(null) === '');
t('corta "ltbd", que a lista de cores do app.js nao cobria',
  limpa('Fulano Beltrano ltbd d X-Y Jan25') === 'Fulano Beltrano');

const cardSujo = ctxCard.card(3, 'Golden Lion (W) ltbd d Dorotas Wildcat-Golden Mist Jun24', 'modoturbo',
  [{ data: '03Sep26', pista: 'Wtrfd', dist: 480, trap: 6, split: '3.34', bends: '4322', pos: 1, remarks: 'StrFn', classe: 'A4', caltm: '29.48' }]);
t('o svCard mostra o nome limpo', cardSujo.indexOf('Golden Lion (W)</span>') >= 0);
t('e nao deixa a ficha de criacao vazar pro HTML', cardSujo.indexOf('Dorotas Wildcat-Golden') < 0);

const cardVazio = ctxCard.card(3, 'Golden Lion (W) ltbd d X-Y Jun24', null, []);
t('o ramo "Sem historico" tambem limpa',
  cardVazio.indexOf('Sem hist') >= 0 && cardVazio.indexOf('Dorotas') < 0 && cardVazio.indexOf('X-Y') < 0);

t('o _svGalgo do main.js passa o nome pelo svLimpaNome',
  /typeof svLimpaNome === 'function'\) \? svLimpaNome\(g\.nome\)/.test(SRC));
t('e o cardGalgo.js esta carregado nesta tela (senao o guarda de typeof cairia sempre)',
  /static\/js\/cardGalgo\.js/.test(SRC));

// ── [10] COR DA TAXA E BARRA DO GRAFICO ────────────────────────────────────
// Bruno, 11/09: "a taxa sempre que tiver abaixo de 50% tem que vir em vermelho"
// e "nao esta atualizando o grafico TOP, HIGH e GOOD".
//
// A regra anterior era "0% branco, abaixo de 0% vermelho" — e taxa de acerto nao
// fica negativa, entao o vermelho nunca acendeu desde que foi escrito.
//
// O grafico e outro assunto: a barra e um <span>, e width em elemento inline e
// ignorada pelo navegador. Ela nascia com largura zero e NUNCA apareceu — nem no
// HTML do servidor. Nao era "parou de atualizar", era "nunca funcionou".
bloco('[10] TAXA VERMELHA ABAIXO DE 50% E A BARRA QUE NUNCA APARECEU');

const VERDE = '#22C65E', VERMELHO = '#ef4444', CINZA = '#555';

// 2 de 3 = 67% -> verde
const cVerde = roda([
  { camada: 'TOP', bateu: 'sim', pista: 'S', turno: 'Tarde', entrei: 'nao', abriu: 1 },
  { camada: 'TOP', bateu: 'sim', pista: 'S', turno: 'Tarde', entrei: 'nao', abriu: 1 },
  { camada: 'TOP', bateu: 'nao', pista: 'S', turno: 'Tarde', entrei: 'nao', abriu: 1 }
], SEM_FILTRO);
t('67% fica verde', cVerde.card('geral').pct === '67%' && cVerde.estilo('kpi-geral-pct').color === VERDE);

// 1 de 2 = 50% -> verde (50 e o piso do verde, nao do vermelho)
const cMeio = roda([
  { camada: 'TOP', bateu: 'sim', pista: 'S', turno: 'Tarde', entrei: 'nao', abriu: 1 },
  { camada: 'TOP', bateu: 'nao', pista: 'S', turno: 'Tarde', entrei: 'nao', abriu: 1 }
], SEM_FILTRO);
t('exatamente 50% ainda e verde', cMeio.card('geral').pct === '50%' && cMeio.estilo('kpi-geral-pct').color === VERDE);

// 1 de 3 = 33% -> vermelho
const cRuim = roda([
  { camada: 'TOP', bateu: 'sim', pista: 'S', turno: 'Tarde', entrei: 'nao', abriu: 1 },
  { camada: 'TOP', bateu: 'nao', pista: 'S', turno: 'Tarde', entrei: 'nao', abriu: 1 },
  { camada: 'TOP', bateu: 'nao', pista: 'S', turno: 'Tarde', entrei: 'nao', abriu: 1 }
], SEM_FILTRO);
t('33% vem em VERMELHO — era isto que nunca acendia',
  cRuim.card('geral').pct === '33%' && cRuim.estilo('kpi-geral-pct').color === VERMELHO);

// 0 de 2 = 0% -> vermelho (antes era branco)
const cZero = roda([
  { camada: 'TOP', bateu: 'nao', pista: 'S', turno: 'Tarde', entrei: 'nao', abriu: 1 },
  { camada: 'TOP', bateu: 'nao', pista: 'S', turno: 'Tarde', entrei: 'nao', abriu: 1 }
], SEM_FILTRO);
t('0% agora e vermelho, nao branco — 0 tambem esta abaixo de 50',
  cZero.card('geral').pct === '0%' && cZero.estilo('kpi-geral-pct').color === VERMELHO);

// nada resolvido -> cinza, nao vermelho
const cPend = roda([
  { camada: 'TOP', bateu: '', pista: 'S', turno: 'Tarde', entrei: 'nao', abriu: 1 }
], SEM_FILTRO);
t('sem resultado fica CINZA — desempenho nenhum nao e desempenho ruim',
  cPend.card('geral').pct === '—' && cPend.estilo('kpi-geral-pct').color === CINZA);

t('o servidor pinta pela mesma regra do cliente',
  /K\.k\.pct >= 50 \? '#22C65E' : '#ef4444'/.test(SRC) && /pct >= 50 \? '#22C65E' : '#ef4444'/.test(SRC));
t('e nenhuma das duas pontas guarda o ramo "abaixo de 0%", que nunca podia rodar',
  !/pct < 0 \? '#ef4444'/.test(SRC));

// ── a barra ────────────────────────────────────────────────────────────────
t('a barra do grafico e display:block (width em <span> inline e ignorada)',
  /\.kg-bar\{display:block;height:100%/.test(SRC));
t('e a trilha continua sendo item de flex, que ja e blocada sozinha',
  /\.kg-lin\{display:flex/.test(SRC) && /\.kg-tri\{flex:1/.test(SRC));

t('o pinta() escreve a largura da barra de cada tipo',
  cRuim.estilo('kpi-top-bar').width === '33%');
const cBarra = roda([
  { camada: 'GOOD', bateu: 'sim', pista: 'S', turno: 'Tarde', entrei: 'nao', abriu: 1 },
  { camada: 'GOOD', bateu: 'sim', pista: 'S', turno: 'Tarde', entrei: 'nao', abriu: 1 },
  { camada: 'HIGH', bateu: 'nao', pista: 'S', turno: 'Tarde', entrei: 'nao', abriu: 1 }
], SEM_FILTRO);
t('GOOD 100% enche a barra', cBarra.estilo('kpi-good-bar').width === '100%');
t('HIGH 0% esvazia a barra', cBarra.estilo('kpi-high-bar').width === '0%');
t('TOP sem registro fica com a barra zerada, nao com lixo da volta anterior',
  cBarra.estilo('kpi-top-bar').width === '0%');
t('filtrar tambem mexe na barra, nao so no numero',
  roda(LINHAS, com({ 'fh-motor': 'TOP' })).estilo('kpi-top-bar').width === '50%');

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
