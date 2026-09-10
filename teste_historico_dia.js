// TESTE: o Historico e' do DIA e da BW (Bruno, 10/09/2026)
//
// Por que existe: em 10/09 a tela mostrou 7 corridas onde o dia inteiro tinha
// 17, e o unico HIGH do dia sumiu junto. Duas causas, as duas so no Historico:
//   (1) ele lia por LOTE (`WHERE session_id=?`) enquanto o painel-dia lia por DIA;
//   (2) ele descartava corrida `nivel='skip'`, contra o "livre acesso" de 09/09.
// Este arquivo trava as duas, mais a regra de QUAL AvB vira o registro.
//
// Os blocos [1] a [4] leem o FONTE. E' teste de forma, nao de tela: ele nao
// prova que a pagina renderiza, prova que a regressao especifica nao voltou.
// O bloco [5] roda a funcao de verdade.
const fs = require('fs');
const path = require('path');

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

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
