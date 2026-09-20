'use strict';
// teste_analisar_celular.js — A TELA ANALISAR NO CELULAR (Bruno, 20/09/2026)
//
// "Somente no celular... Tirei a primeira linha com o botao Historicos / Inclui
//  o link dos dados do historico na mesma linha onde tem o botao Atualizar / Na
//  lista das corridas, no mobile so quero que aparecam no maximo 3 / Na
//  informacao da pista, tirei a segunda linha e puxei o percentual pra primeira
//  linha (com a hora nos dois fusos) / Coloquei todos os itens na mesma linha:
//  Odd, Stake, Entrei, atrasada (so o checkbox e a bandeirinha), relatorio e
//  pdf."
//
// O que este teste protege, e por que cada item existe:
//   - o desktop NAO pode ter mudado: cada regra nova mora dentro do @media do
//     celular, e as regras antigas continuam onde estavam;
//   - as classes .fp-race-meta e .fp-inputs-row sao usadas TAMBEM pelas tiles do
//     Painel do Dia. Regra sem escopo apagaria a segunda linha e desmontaria a
//     barra das tiles. Por isso o teste exige o escopo (.fp-hdr / .focus-col >);
//   - o selo de confianca tem que ser IRMAO do titulo: dentro dele, o corte por
//     "..." de uma linha so cortava o selo junto (medido no Chromium).
//
//   node teste_analisar_celular.js

const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, 'src', 'app.js'), 'utf8');
const MAIN = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');

let ok = 0, ruim = 0;
function t(nome, cond) {
  if (cond) { ok++; console.log('  OK    | ' + nome); }
  else { ruim++; console.log('  FALHOU| ' + nome); }
}
function bloco(n) { console.log('\n' + n + '\n'); }

// O @media(max-width:768px) da pagina Analisar: o que tem o #val-modal (e agora
// tambem a .sidebar). Pegar o bloco inteiro pelas chaves, pra poder afirmar que
// uma regra esta DENTRO dele e nao solta na folha.
function mediaCelular() {
  const re = /@media\(max-width:768px\)\{/g;
  let m;
  while ((m = re.exec(MAIN))) {
    let i = MAIN.indexOf('{', m.index), n = 0, fim = -1;
    for (let k = i; k < MAIN.length; k++) {
      if (MAIN[k] === '{') n++;
      else if (MAIN[k] === '}') { n--; if (!n) { fim = k + 1; break; } }
    }
    const trecho = MAIN.slice(m.index, fim);
    if (trecho.indexOf('#val-modal') >= 0) return trecho;
  }
  return '';
}
const CEL = mediaCelular();

bloco('[0] O BLOCO DO CELULAR FOI ENCONTRADO');
t('o @media(max-width:768px) da Analisar existe', CEL.length > 0);

bloco('[1] A PRIMEIRA LINHA (HISTORICOS) SAIU');
t('a sidebar inteira sai no celular', /\.sidebar\{display:none!important\}/.test(CEL));
t('e os elementos continuam no DOM (o servidor ainda gera o #st)',
  /id="st"/.test(MAIN) && /class="flist" id="rlist"/.test(MAIN));
t('o Historicos continua existindo no menu de cima', /\/historico" class="nl|\/historico"/.test(MAIN));

bloco('[2] A LINHA DA SESSAO NA MESMA LINHA DO ATUALIZAR');
t('o setSt escreve tambem no espelho #st-m',
  /function setSt\(m\)\{[\s\S]*?getElementById\('st'\)\.textContent=m;[\s\S]*?getElementById\('st-m'\)/.test(APP));
t('o cabecalho da lista chama o espelho', /_stEspelhoHtml\(\) \+ '<\/span>'/.test(APP));
t('o espelho le o texto do #st (nunca inventa a data)',
  /function _stEspelhoHtml\(\)\{[\s\S]*?getElementById\('st'\)/.test(APP));
t('e o link vem do <a> que o servidor gerou (.st-link)',
  /function _stEspelhoHtml\(\)\{[\s\S]*?querySelector\('\.st-link'\)/.test(APP));
t('o <span> de fora do espelho fica sempre, pro Atualizar nao escorregar pra esquerda',
  /'<span style="min-width:0;overflow:hidden">' \+ _stEspelhoHtml\(\)/.test(APP));
t('o espelho nasce escondido (regra base)', /\n\.st-m\{display:none\}/.test(MAIN));
t('e aparece so no celular', /\.st-m\{display:block/.test(CEL));
t('cortando com "..." em vez de empurrar o Atualizar',
  /\.st-m\{[^}]*text-overflow:ellipsis/.test(CEL));

bloco('[3] NO MAXIMO 3 CORRIDAS NA LISTA DO CELULAR');
t('existe o teto do celular', /var RACAS_EM_TELA_MOBILE = 3;/.test(APP));
t('a largura e medida na hora (matchMedia), nao no carregamento',
  /function ehTelaCelular\(\)\{[\s\S]*?matchMedia\('\(max-width:768px\)'\)/.test(APP));
t('o teto do celular nunca passa do teto configurado',
  /function racasEmTela\(\)\{ return ehTelaCelular\(\) \? Math\.min\(RACAS_EM_TELA_MOBILE, RACAS_EM_TELA\) : RACAS_EM_TELA; \}/.test(APP));
t('os dois cortes da lista passam pelo racasEmTela()',
  (APP.match(/racasEmTela\(\)/g) || []).length >= 3);
t('nenhum corte usa mais o RACAS_EM_TELA cru',
  !/slice\(0, RACAS_EM_TELA\)/.test(APP));
t('no celular a marcada como atrasada DESCONTA vaga',
  /ehTelaCelular\(\)\s*\n?\s*\? _atrasadas\.concat\(_comAvb\.concat\(_resto\)\.slice\(0, Math\.max\(0, _lim - _atrasadas\.length\)\)\)\.slice\(0, _lim\)/.test(APP));
t('e no computador ela continua entrando por fora do teto',
  /: _atrasadas\.concat\(_comAvb\.concat\(_resto\)\.slice\(0, _lim\)\);/.test(APP));

bloco('[4] O CABECALHO DA CORRIDA EM UMA LINHA, COM OS DOIS FUSOS');
t('a hora BR entra no titulo num pedaco so-celular',
  /'<span class="fp-so-cel">' \+ hbr \+ ' BR \/ <\/span>'/.test(APP));
t('e a hora UK ganha o rotulo UK, tambem so no celular',
  /'<span class="fp-so-cel"> UK<\/span>'/.test(APP));
t('o pedaco so-celular nasce escondido', /\.fp-so-cel\{display:none\}/.test(MAIN));
t('e aparece no celular', /\.fp-so-cel\{display:inline\}/.test(CEL));
t('o selo de confianca e IRMAO do titulo, nao filho',
  /<\/div>'\s*\n(?:\s*\/\/[^\n]*\n)*\s*\+ '<span class="fp-so-cel fp-badge-cel">/.test(APP));
t('a segunda linha do cabecalho sai no celular',
  /\.fp-hdr \.fp-race-meta\{display:none!important\}/.test(CEL));
t('ESCOPADA no .fp-hdr: as tiles do Painel do Dia usam a mesma classe',
  !/(?<!\.fp-hdr )\.fp-race-meta\{display:none/.test(CEL));
t('o titulo e uma linha, com corte por "..."',
  /\.fp-hdr \.fp-race-title\{[\s\S]*?white-space:nowrap;overflow:hidden;text-overflow:ellipsis/.test(CEL));
t('o bloco do titulo vira uma linha flex', /\.fp-hdr-left\{display:flex!important/.test(CEL));
t('o selo nao encolhe junto com o titulo', /\.fp-so-cel\.fp-badge-cel\{flex:0 0 auto\}/.test(CEL));
t('o chip de odd ao vivo sai (era ele que empurrava o nome da pista pra fora)',
  /\.fp-hdr #fp-odds-hdr\{display:none!important\}/.test(CEL));
t('a altura do cabecalho cai (padding menor e sem piso de 52px)',
  /\.fp-hdr\{padding:6px 10px!important;min-height:0!important/.test(CEL));
t('e o piso de 52px continua valendo no computador',
  /\.fp-hdr\{padding:10px 18px;[^}]*min-height:52px/.test(MAIN));

bloco('[5] TODOS OS CONTROLES NA MESMA LINHA');
t('o texto "Atrasada" fica num span proprio',
  /<span class="fp-atr-txt">Atrasada<\/span>/.test(APP));
t('quem some no celular e a BANDEIRINHA; o rotulo fica (2a rodada do Bruno)',
  /\.fp-atr-bnd\{display:none\}/.test(CEL) && !/\.fp-atr-txt\{display:none\}/.test(CEL));
t('a bandeirinha esta num span proprio (texto solto nao se esconde por CSS)',
  /<span class="fp-atr-bnd">\u{1F6A9}<\/span>/u.test(APP));
t('e no computador a bandeirinha continua aparecendo (nenhuma regra a esconde fora do celular)',
  !/(?<!  )\.fp-atr-bnd\{display:none/.test(MAIN.replace(CEL, '')));
t('o Entrei e a caixinha de atrasada ganham respiro a esquerda',
  /#fp-entrei\{margin-left:6px\}/.test(CEL) && /\.fp-atr-lb\{margin-left:8px/.test(CEL));
t('e o respiro sai em tela de 360px, onde a barra estourava por 4px',
  /@media\(max-width:374px\)\{[\s\S]*?#fp-entrei\{margin-left:0\}[\s\S]*?\.fp-atr-lb\{margin-left:0\}/.test(CEL));
t('a barra nao quebra mais linha no celular',
  /\.focus-col > \.fp-inputs-row\{flex-wrap:nowrap!important/.test(CEL));
t('ESCOPADA em .focus-col >: a barra das tiles do Painel do Dia usa a mesma classe',
  !/(?<!\.focus-col > )\.fp-inputs-row\{flex-wrap:nowrap/.test(CEL));
t('os campos encolhem (com !important, porque o style vem no elemento)',
  /\.focus-col > \.fp-inputs-row input\[type=text\]\{width:40px!important/.test(CEL));
t('os rotulos encolhem', /\.focus-col > \.fp-inputs-row > span,[\s\S]*?font-size:10px!important/.test(CEL));
t('o botao Entrei encolhe', /#fp-entrei\{padding:4px 8px!important/.test(CEL));
t('e no computador a barra continua podendo quebrar linha',
  /\.fp-inputs-row\{display:flex;gap:12px;padding:8px 18px;[^}]*flex-wrap:wrap/.test(MAIN));
t('os dois icones (relatorio e pdf) continuam na barra',
  /icone_relatorio\.png/.test(APP) && /icone_pdf\.png/.test(APP));

bloco('[6] O QUE NAO PODE TER MUDADO NO COMPUTADOR');
t('o titulo do computador comeca na hora UK, sem rotulo',
  /\+ ' - ' \+ r\.trackFull \+ \(raceClass \? ' \('\+raceClass\+'\)' : ''\) \+ ' - ' \+ \(r\.dist\|\|''\) \+ 'm'/.test(APP));
t('a segunda linha continua sendo escrita no HTML (o computador a mostra)',
  /<div class="fp-race-meta">'\+\(r\.dist\|\|''\)\+'m &middot; '\+hbr\+' BR/.test(APP));
t('o chip de odd ao vivo continua no HTML', /id="fp-odds-hdr"/.test(APP));
t('as tiles do Painel do Dia continuam com a segunda linha',
  /\.ap-tile-hd \.fp-race-title\{/.test(MAIN));

console.log('\n' + (ruim ? 'FALHOU: ' + ruim + ' de ' + (ok + ruim) : 'TUDO OK: ' + ok + ' verificacoes'));
process.exit(ruim ? 1 : 0);
