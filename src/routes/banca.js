'use strict';
// src/routes/banca.js
// Gestao de Banca — acompanha as apostas reais feitas em cima dos AvBs
// (Odd preenchida = aposta feita), calculando ganho/perda por unidade (1
// unidade = 1% da banca inicial DO MES — fixa o mes inteiro, nao recalcula a
// cada aposta). Visao diaria, mensal (fecha o mes) e anual.

const express = require('express');
const router = express.Router();
const { db, getUserConfig } = require('../db/database');
const { navBar, sidebarInfo } = require('./main');
const { designTokensCSS } = require('../utils/designTokens');
const { icon } = require('../utils/icons');

const BASE = process.env.BASE_PATH || '/greyhound';
const { exigirAcesso } = require('../middleware/acesso');
const { CANONICO } = require('../db/compartilhado');
// A MESMA funcao que o Historico e os robos usam. Nao se reimplementa "quem
// chegou na frente" numa quarta tela — foi pra isso que o avbResultado virou
// fonte unica em 03/09.
const { bateuPar } = require('../utils/avbResultado');

function getBancaPadrao(userId) {
  const cfg = getUserConfig(userId);
  return (cfg && cfg.banca_valor_inicial) || 1000;
}

function getLogo() {
  const path = require('path'), fs = require('fs');
  const logoPath = path.join(__dirname, '../../public/img/logo.png');
  if (fs.existsSync(logoPath)) return 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
  return '';
}

// %ganho/perda de UMA aposta. 1 unidade = 1 ponto percentual da banca do mes.
// Green: unidades x (odd-1). Red: -unidades. Pendente (sem resultado ainda): null.
// Converte string numerica no padrao brasileiro (virgula decimal, ex: "1,6")
// pra Number — parseFloat sozinho para de ler na virgula e trunca o valor
function parseNumBR(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).trim().replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function calcGanhoPct(bet) {
  if (bet.bateu !== 'sim' && bet.bateu !== 'nao') return null;
  const u = parseNumBR(bet.bet_unidades);
  const odd = parseNumBR(bet.odd);
  if (bet.bateu === 'sim') return u * (odd - 1);
  return -u;
}

// ── A APOSTA E SUA, O PAR TAMBEM (Bruno, 16/09/2026) ───────────────────────
//
// O que estava acontecendo: esta consulta trazia a odd e as unidades do
// USUARIO (race_user_data) mas o par e o resultado da CORRIDA (races.name_fav,
// races.name_und, races.bateu) — que sao do motor da manha.
//
// Quando voce aposta num par que a BW abriu fora da lista da manha, as tres
// colunas falam de duplas diferentes na mesma linha. O caso real: Vlley A6
// 11:59, que mostrava "Hawkfield Hugo x Arrigle Buster" (o par da manha, que a
// BW nem abriu) com a odd 1.61 (a aposta no T5 x T2) e o green calculado pro
// par da manha. Pago pelo resultado de uma aposta que nao foi feita.
//
// E quando o motor perde o pick durante o dia, uma rotina zera trap_fav/
// trap_und — entao races.bateu nunca resolve e a aposta fica Pendente pra
// sempre. Sao as linhas com "-" no favorito.
//
// `rud.avb_escolhido` ja estava neste JOIN, sem ser lido. Agora e' lido.
function getApostas(userId) {
  return db.prepare(
    `SELECT r.id, r.hora, r.hora_br, r.corrida, r.dist, r.name_fav, r.name_und,
            r.trap_fav, r.trap_und,
            rud.odd AS odd, rud.bet_unidades AS bet_unidades, r.bateu,
            rud.avb_escolhido AS avb_escolhido, r.finishing_order_json,
            date(s.created_at, '-3 hours') as dia
     FROM races r JOIN race_sessions s ON s.id = r.session_id
          LEFT JOIN race_user_data rud ON rud.race_id = r.id AND rud.user_id = ?
     WHERE r.user_id=? AND rud.odd IS NOT NULL AND rud.odd != ''
     ORDER BY s.created_at ASC, r.hora ASC`
  ).all(userId, CANONICO).map(resolverAposta);
}

// ── A REGRA DE RESOLUCAO, NUM LUGAR SO ─────────────────────────────────────
//
// A PRECEDENCIA INVERTEU EM 17/09/2026 ("pode corrigir geral"), e o motivo foi
// uma linha de dinheiro contada errado: Wtrfd A6 das 9:12, marcada Green, com
// R$ 16,75 creditados numa aposta que perdeu.
//
// A REGRA ANTIGA era: `races.bateu` decidido manda, fim. Ela existia pra nao
// mexer em numero que o Bruno ja tinha visto. So que `races.bateu` responde
// "o pick do MOTOR chegou na frente?" — e quem apostou noutro par esta fazendo
// OUTRA pergunta. A linha vinha com os nomes da dupla dele e o resultado da
// dupla do motor: parecia coerente e estava errada, que e' o pior dos casos.
// Eu tinha deixado isso declarado aqui como buraco aberto. Ele fechou hoje.
//
// A REGRA AGORA:
//   1) voce tem par + a corrida tem chegada -> resolve pelo SEU par. Sempre.
//      Nao importa o que a coluna diz: ela e' de outra dupla.
//   2) voce tem par, sem chegada -> a coluna so vale se voce apostou no MESMO
//      sentido do motor (ai as duas perguntas sao a mesma). Senao, Pendente.
//   3) sem par registrado -> a coluna, que e' tudo que existe.
//   4) nada disso -> Pendente de verdade, e a linha diz POR QUE.
//
// O PRECO, declarado: numeros do passado se corrigem sozinhos. Green que era
// red vira red e a banca acumulada muda. E tambem: linha cujo galgo nao aparece
// na chegada deixa de ser green/red e volta a ser Pendente — porque nesse caso
// ninguem sabe se a SUA aposta ganhou, e fingir que sabe foi o defeito.
function _parEscolhido(txt) {
  if (!txt) return null;
  try {
    const o = typeof txt === 'string' ? JSON.parse(txt) : txt;
    if (!o || o.aTrap == null || o.bTrap == null) return null;
    return o;
  } catch (e) { return null; }
}

function resolverAposta(a) {
  const esc = _parEscolhido(a.avb_escolhido);
  // Os NOMES seguem sempre o seu par quando ele existe: mostrar a dupla do
  // motor na linha da sua aposta foi o que escondeu o problema por tanto tempo.
  let nomeA = a.name_fav, nomeB = a.name_und, fonte_par = 'motor';
  // Os TRAPS andam junto com os nomes, pela mesma razao. A tela mostra uma
  // bolinha colorida antes de cada nome desde 18/09, e bolinha do par do motor
  // ao lado do nome do SEU par seria a divergencia de ontem redesenhada: o
  // numero e o nome tem que sair do mesmo lugar.
  let trapA = a.trap_fav, trapB = a.trap_und;
  if (esc) {
    fonte_par = 'sua_escolha';
    nomeA = esc.aNome || ('T' + esc.aTrap);
    nomeB = esc.bNome || ('T' + esc.bTrap);
    trapA = esc.aTrap;
    trapB = esc.bTrap;
  }

  // O par do motor existe mesmo? Corrida que perdeu o tier tem trap_fav/und
  // zerados, e ai nao ha com o que comparar — "nao sei" nao e "e diferente".
  const temParMotor = (a.trap_fav != null && a.trap_und != null
    && Number(a.trap_fav) > 0 && Number(a.trap_und) > 0);
  // A comparacao e COM DIRECAO. "T4 bate T1" e "T1 bate T4" sao perguntas
  // opostas, e responder uma pela outra e' o defeito inteiro desta rotina.
  const mesmoSentido = !!(esc && temParMotor
    && String(esc.aTrap) === String(a.trap_fav)
    && String(esc.bTrap) === String(a.trap_und));

  let bateu = null, fonte_resultado = null, motivo = null;
  const colunaDecidida = (a.bateu === 'sim' || a.bateu === 'nao');

  if (esc && a.finishing_order_json) {
    // O SEU par manda. A coluna nem e consultada: ela responde outra pergunta.
    const b = bateuPar(a.finishing_order_json, Number(esc.aTrap), Number(esc.bTrap));
    if (b === true) { bateu = 'sim'; fonte_resultado = 'seu_par'; }
    else if (b === false) { bateu = 'nao'; fonte_resultado = 'seu_par'; }
    // Galgo seu fora da chegada: ninguem sabe se VOCE ganhou. Cair na coluna
    // aqui seria voltar a responder pela dupla do motor, com outra roupagem.
    else motivo = 'um dos dois galgos da SUA dupla nao aparece na chegada';
  } else if (esc) {
    // Tem par, nao tem chegada. A coluna so serve se as duas perguntas forem a
    // mesma — ou seja, se voce apostou no sentido que o motor montou.
    if (colunaDecidida && mesmoSentido) { bateu = a.bateu; fonte_resultado = 'coluna'; }
    else motivo = 'a corrida ainda nao tem chegada registrada';
  } else if (colunaDecidida) {
    bateu = a.bateu; fonte_resultado = 'coluna';
  } else {
    motivo = 'sem par registrado nesta aposta';
  }

  return Object.assign({}, a, {
    bateu,
    name_fav: nomeA, name_und: nomeB,
    // trap_a/trap_b sao os traps DESTA aposta. Nao sobrescrevem trap_fav/
    // trap_und (que continuam sendo os do motor, e o mesmoSentido acima depende
    // deles) — sao um campo a mais, com nome proprio, pra ninguem confundir os
    // dois pares de novo.
    trap_a: trapA, trap_b: trapB,
    fonte_par, fonte_resultado, motivo_pendente: motivo,
    // AGORA e' informacao, nao alerta: diz que voce apostou num sentido
    // diferente do que o motor montou. O resultado ja vem certo.
    //
    // A versao antiga disto era `esc && decidido && fonte_resultado ===
    // 'coluna'`, e como `fonte_resultado` so mudava dentro do `if (!decidido)`,
    // ela acendia em TODA aposta resolvida com par escolhido — inclusive nas
    // que estavam certas. Marcador que acende sempre e' marcador que ninguem le.
    par_divergente: !!(esc && temParMotor && !mesmoSentido)
  });
}

// ── BANCA FIXA (Bruno, 16/09/2026) ─────────────────────────────────────────
//
// O ENCADEAMENTO MES-A-MES SAIU. Antes cada mes herdava o saldo final do mes
// anterior (com override manual na bankroll_months por cima), entao a unidade
// valia coisas diferentes em meses diferentes e as taxas nao eram comparaveis
// entre si: 2,5 unidades num mes de banca 623 nao e a mesma aposta que 2,5
// unidades num mes de banca 1000.
//
// Agora a base e' UMA SO — a banca fixa —, e ela nao se mexe sozinha. Uma
// unidade vale 1% dela sempre. A tabela bankroll_months continua no banco
// (nada foi apagado), mas deixou de ser lida: os overrides por mes nao valem
// mais. Decisao do Bruno em 16/09, com essa consequencia declarada antes.
//
// O nome da coluna continua `banca_valor_inicial` de proposito: criar uma
// coluna nova pro mesmo conceito deixaria duas fontes pro mesmo numero, e
// migrar valor entre elas e' risco sem ganho. Na tela ela se chama Banca fixa.
function getCadeiaBanca(userId) {
  const apostas = getApostas(userId);
  const fixa = getBancaPadrao(userId);
  const porMes = {};
  apostas.forEach(a => {
    const ym = a.dia.slice(0, 7);
    (porMes[ym] = porMes[ym] || []).push(a);
  });
  const cadeia = {};
  Object.keys(porMes).sort().forEach(ym => {
    const apostasDoMes = porMes[ym].map(a => {
      const ganhoPct = calcGanhoPct(a);
      return Object.assign({}, a, {
        ganhoPct,
        ganhoReais: ganhoPct != null ? (ganhoPct / 100) * fixa : null,
        status: a.bateu === 'sim' ? 'green' : a.bateu === 'nao' ? 'red' : 'pendente'
      });
    });
    const somaGanhoPct = apostasDoMes.reduce((s, a) => s + (a.ganhoPct || 0), 0);
    cadeia[ym] = {
      inicial: fixa,
      final: fixa + (somaGanhoPct / 100) * fixa,
      apostas: apostasDoMes,
      temOverride: false
    };
  });
  return cadeia;
}

// ── AS TRES BANCAS ─────────────────────────────────────────────────────────
//
//   fixa       = a base da unidade. Nao se mexe sozinha; so voce muda.
//   acumulada  = fixa + lucro/prejuizo desde o ultimo reset DELA.
//   bw         = o dinheiro real na casa: o valor informado no ultimo reset
//                mais o lucro/prejuizo desde entao. Reset separado de proposito
//                — a conta na BW tambem se mexe por deposito e saque, que o
//                sistema nao tem como saber.
//
// SEM RESET NENHUM, acumula desde a primeira aposta. Assim quem nunca resetou
// ve o historico inteiro, e o primeiro reset e' que cria o marco — ninguem
// perde passado por eu ter escolhido uma data de corte.
function getBancas(userId, cadeia) {
  const cfg = getUserConfig(userId) || {};
  const fixa = getBancaPadrao(userId);
  const todas = [];
  Object.keys(cadeia || {}).forEach(ym => {
    (cadeia[ym].apostas || []).forEach(a => todas.push(a));
  });
  const somaDesde = (marco) => todas
    .filter(a => a.ganhoReais != null && (!marco || a.dia >= marco))
    .reduce((s, a) => s + a.ganhoReais, 0);

  const bwBase = (cfg.banca_bw_valor != null) ? Number(cfg.banca_bw_valor) : 0;
  const fixaDesde = cfg.banca_fixa_reset_em || null;
  const bwDesde = cfg.banca_bw_reset_em || null;
  return {
    bancaFixa: fixa,
    bancaAcumulada: fixa + somaDesde(fixaDesde),
    // NULL enquanto a BW nunca foi ancorada. Sem o marco eu nao sei de quando
    // contar, e somar o historico inteiro em cima de zero mostraria um numero
    // com cara de saldo real da casa — o tipo de mentira que ninguem confere.
    // A tela desenha um traco e o titulo explica como configurar.
    bancaBw: bwDesde ? (bwBase + somaDesde(bwDesde)) : null,
    bancaBwBase: bwBase,
    bancaFixaResetEm: fixaDesde,
    bancaBwResetEm: bwDesde
  };
}

// Com a banca fixa isto virou uma linha. Ficou como funcao porque varios
// pontos do arquivo chamam por este nome.
function getBancaAtualPadrao(userId) {
  return getBancaPadrao(userId);
}

// ── API ──────────────────────────────────────────────────────────────────────
// ── RESET DE BANCA (Bruno, 16/09/2026) ─────────────────────────────────────
//
// Resetar NAO apaga aposta nenhuma: so move o marco a partir do qual a banca
// acumula. O historico continua inteiro na tabela e nas abas Mes e Ano.
//
//   qual=fixa -> a Banca acumulada volta a ser igual a fixa e passa a contar
//                de hoje.
//   qual=bw   -> grava o valor que voce informou como o saldo real na casa e
//                passa a contar de hoje. Serve pra depois de um deposito, um
//                saque, ou simplesmente pra recomecar a medir.
//
// `desfazer=1` limpa o marco e volta a acumular desde a primeira aposta — sem
// isso, um reset por engano nao teria volta a nao ser mexendo no banco.
router.post('/reset-banca', express.json(), (req, res) => {
  try {
    const userId = req.user.id;
    const qual = String((req.body && req.body.qual) || '');
    const desfazer = !!(req.body && req.body.desfazer);
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    if (qual === 'fixa') {
      db.prepare('UPDATE analysis_config SET banca_fixa_reset_em=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?')
        .run(desfazer ? null : hoje, userId);
    } else if (qual === 'bw') {
      const valor = parseFloat(req.body && req.body.valor);
      db.prepare('UPDATE analysis_config SET banca_bw_valor=?, banca_bw_reset_em=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?')
        .run(Number.isFinite(valor) ? valor : 0, desfazer ? null : hoje, userId);
    } else {
      return res.status(400).json({ error: 'qual deve ser "fixa" ou "bw"' });
    }
    res.json({ ok: true, em: desfazer ? null : hoje });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/data', (req, res) => {
  const userId = req.user.id;
  const view = req.query.view || 'day';
  const dateParam = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const cadeia = getCadeiaBanca(userId);

    if (view === 'day') {
      const ym = dateParam.slice(0, 7);
      const mes = cadeia[ym] || { inicial: getBancaAtualPadrao(userId), apostas: [] };
      const apostasDoDia = mes.apostas.filter(a => a.dia === dateParam);
      const resolvidas = apostasDoDia.filter(a => a.status !== 'pendente');
      const lucros = resolvidas.filter(a => a.ganhoReais > 0).reduce((s, a) => s + a.ganhoReais, 0);
      const prejuizos = resolvidas.filter(a => a.ganhoReais < 0).reduce((s, a) => s + Math.abs(a.ganhoReais), 0);
      const saldoDia = lucros - prejuizos;
      const pctDia = mes.inicial ? (saldoDia / mes.inicial) * 100 : 0;
      // Dinheiro transitado: soma de TUDO que foi apostado no dia (o volume
      // que entrou em jogo), independente de ter ganho ou perdido — nao e o
      // resultado liquido, e o "handle" do dia.
      const dinheiroTransitado = apostasDoDia.reduce((s, a) => s + (parseNumBR(a.bet_unidades) / 100) * mes.inicial, 0);
      const cfg = getUserConfig(userId);
      const pctStop = cfg && cfg.banca_pct_stop != null ? cfg.banca_pct_stop : 20;
      const stopHit = pctDia < 0 && Math.abs(pctDia) >= pctStop;
      res.json(Object.assign({
        ok: true, view: 'day', date: dateParam, bancaInicialMes: mes.inicial,
        apostas: apostasDoDia, lucros, prejuizos, saldoDia, pctDia, dinheiroTransitado,
        pendentes: apostasDoDia.length - resolvidas.length,
        stopHit, pctStop,
        avisoStop: cfg && cfg.banca_aviso_stop || 'Atenção: o prejuízo de hoje atingiu o limite configurado. Considere parar as apostas por hoje.'
      }, getBancas(userId, cadeia)));
    } else if (view === 'month') {
      const ym = dateParam.slice(0, 7);
      const mes = cadeia[ym] || { inicial: getBancaAtualPadrao(userId), final: getBancaAtualPadrao(userId), apostas: [] };
      const porDia = {};
      mes.apostas.forEach(a => { (porDia[a.dia] = porDia[a.dia] || []).push(a); });
      const dias = Object.keys(porDia).sort().map(dia => {
        const arr = porDia[dia];
        const gr = arr.reduce((s, a) => s + (a.ganhoReais || 0), 0);
        return { dia, saldo: gr, apostas: arr.length, green: arr.filter(a => a.status === 'green').length, red: arr.filter(a => a.status === 'red').length };
      });
      let acumulado = mes.inicial;
      const serie = dias.map(d => { acumulado += d.saldo; return { dia: d.dia, saldoAcumulado: acumulado, saldoDia: d.saldo, apostas: d.apostas }; });
      const totalGanho = mes.final - mes.inicial;
      const resolvidasMes = mes.apostas.filter(a => a.status !== 'pendente');
      res.json({
        ok: true, view: 'month', yearMonth: ym, bancaInicial: mes.inicial, bancaFinal: mes.final,
        totalGanho, pctMes: mes.inicial ? (totalGanho / mes.inicial) * 100 : 0, serie,
        totalApostas: mes.apostas.length,
        vitorias: resolvidasMes.filter(a => a.status === 'green').length,
        derrotas: resolvidasMes.filter(a => a.status === 'red').length,
        temOverride: !!mes.temOverride
      });
    } else if (view === 'year') {
      const year = dateParam.slice(0, 4);
      const mesesDoAno = Object.keys(cadeia).filter(ym => ym.startsWith(year)).sort();
      const serieMeses = mesesDoAno.map(ym => {
        const m = cadeia[ym];
        return { yearMonth: ym, inicial: m.inicial, final: m.final, ganho: m.final - m.inicial, pct: m.inicial ? ((m.final - m.inicial) / m.inicial) * 100 : 0, apostas: m.apostas.length };
      });
      const bancaInicioAno = mesesDoAno.length ? cadeia[mesesDoAno[0]].inicial : getBancaAtualPadrao(userId);
      const bancaFimAno = mesesDoAno.length ? cadeia[mesesDoAno[mesesDoAno.length - 1]].final : getBancaAtualPadrao(userId);
      res.json({
        ok: true, view: 'year', year, bancaInicioAno, bancaFimAno,
        ganhoAno: bancaFimAno - bancaInicioAno,
        pctAno: bancaInicioAno ? ((bancaFimAno - bancaInicioAno) / bancaInicioAno) * 100 : 0,
        serieMeses
      });
    } else {
      res.status(400).json({ error: 'view invalida' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/month-init', express.json(), (req, res) => {
  const userId = req.user.id;
  const { yearMonth, bancaInicial } = req.body || {};
  if (!yearMonth || bancaInicial == null || isNaN(parseFloat(bancaInicial))) {
    return res.status(400).json({ error: 'yearMonth e bancaInicial (numero) sao obrigatorios' });
  }
  db.prepare(
    'INSERT INTO bankroll_months (user_id, year_month, banca_inicial) VALUES (?,?,?) ' +
    'ON CONFLICT(user_id, year_month) DO UPDATE SET banca_inicial=excluded.banca_inicial'
  ).run(userId, yearMonth, parseFloat(bancaInicial));
  res.json({ ok: true });
});

// Salva SO a config de banca (movida da tela de Configuracoes). Cada usuario
// configura a propria banca. Nao toca em nenhum outro campo do analysis_config.
router.post('/save-config', express.json(), (req, res) => {
  try {
    const userId = req.user.id;
    const d = req.body || {};
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN banca_unidade_padrao REAL DEFAULT 2.5").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN banca_valor_inicial REAL DEFAULT 1000").run(); } catch(e) {}
    // 16/09/2026 — banca da BW (dinheiro real na casa) e os marcos de reset.
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN banca_bw_valor REAL DEFAULT 0").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN banca_bw_reset_em TEXT").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN banca_fixa_reset_em TEXT").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN banca_pct_stop REAL DEFAULT 20").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN banca_aviso_stop TEXT").run(); } catch(e) {}
    getUserConfig(userId); // garante que a linha de config do usuario existe
    db.prepare(`UPDATE analysis_config SET banca_unidade_padrao=?, banca_valor_inicial=?, banca_bw_valor=?, banca_pct_stop=?, banca_aviso_stop=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?`).run(
      parseFloat(d.banca_unidade_padrao) || 2.5,
      parseFloat(d.banca_valor_inicial) || 1000,
      parseFloat(d.banca_bw_valor) || 0,
      (d.banca_pct_stop != null && d.banca_pct_stop !== '') ? parseFloat(d.banca_pct_stop) : 20,
      d.banca_aviso_stop || 'Atenção: o prejuízo de hoje atingiu o limite configurado. Considere parar as apostas por hoje.',
      userId
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Pagina HTML ──────────────────────────────────────────────────────────────
router.get('/', exigirAcesso('screen.banca'), (req, res) => {
  const logoB64 = getLogo();
  const hoje = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);
  const mesAtual = hojeStr.slice(0, 7);
  const anoAtual = hojeStr.slice(0, 4);
  const cfg = getUserConfig(req.user.id); // valores de config de banca (movidos de Configuracoes)

  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gestão de Banca - Greyhound Validator</title>
<style>
${designTokensCSS()}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0D1117;color:#f0f0f0;font-size:14px}
.hero{width:100%;background:#000;border-bottom:2px solid #22c55e;overflow:hidden}
/* ── A LOGO NO MESMO TAMANHO DA ANALISAR (Bruno, 17/09/2026) ────────────────
   "olha a diferenca entre as duas telas Analisar e Banca... o tamanho nao e o
   mesmo... a logo la em cima tb".
   A Analisar limita a faixa a min(160px,15vh): em janela baixa ela encolhe
   junto, pra nao comer a area util. Esta tela pedia 160px fixos, entao a faixa
   ficava ~35px mais alta e empurrava tudo que vem abaixo — barra de menu
   inclusive. Mesma regra da Analisar, mesmo resultado na tela. */
.hero img{width:100%;height:auto;max-height:min(160px,15vh);object-fit:contain;object-position:center;display:block;background:#000}
/* O mesmo teto da Analisar no estreito. */
@media(max-width:900px){.hero img{max-height:130px}}
.content{padding:24px;max-width:1200px;margin:0 auto}
h1{font-size:22px;font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:10px}
.sub{color:#888;font-size:13px;margin-bottom:20px}
.viewtabs{display:flex;gap:6px;background:#161B27;border:1px solid #222;border-radius:10px;padding:6px;margin-bottom:16px;width:fit-content}
.viewtab{padding:8px 18px;border-radius:6px;background:none;border:none;color:#888;font-weight:600;font-size:12px;cursor:pointer;transition:all .15s}
.viewtab.active{background:rgba(34,197,94,.15);color:#22c55e}
.viewtab:hover:not(.active){color:#ccc}
.toprow{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}
.datepick{display:flex;align-items:center;gap:8px}
.datepick input,.datepick select{background:#161B27;border:1px solid #222;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px}
.navbtn{background:#161B27;border:1px solid #222;color:#ccc;width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center}
.navbtn:hover{border-color:#22c55e;color:#22c55e}
/* ── LAPIS DE EDICAO, COMO O DO HISTORICO (Bruno, 18/09/2026) ───────────────
   "no menu banca, teria como colocar um lapis de edicao igual da tela historico
   para eu editar as informacoes de Odd e UNID".
   As regras abaixo sao as MESMAS do Historico (.edit-pencil e .hist-inp). Elas
   estao repetidas aqui porque a Banca nao carrega o shared.css nem o <style> do
   Historico — e um lapis que so funciona na tela que carregou outro arquivo e'
   armadilha silenciosa. O que se repete e' desenho, nao regra.
   Campo desabilitado por padrao: sem isso da pra apagar a odd de uma aposta
   passando o dedo na tabela. */
.bnc-pencil{cursor:pointer;font-size:13px;opacity:.55;transition:opacity .15s}
.bnc-pencil:hover{opacity:1}
.bnc-pencil.editing{opacity:1;color:#22c55e}
/* A lixeira nasce apagada como o lapis e so fica vermelha no hover: acao
   destrutiva nao precisa gritar na tabela inteira o tempo todo, mas precisa
   deixar claro o que e' quando o dedo chega nela. */
.bnc-del{cursor:pointer;opacity:.45;transition:opacity .15s,color .15s;color:#888;
  display:inline-flex;vertical-align:middle;margin-left:10px}
.bnc-del:hover{opacity:1;color:#ef4444}
.bnc-inp{background:transparent;border:1px solid transparent;color:#ccc;font-family:inherit}
.bnc-inp:not([disabled]){background:#0D1117;border:1px solid #333;color:#fff}
.bnc-inp:focus{outline:1px solid #22c55e;outline-offset:-1px}
/* ── BOLINHA DO TRAP ANTES DO NOME (Bruno, 18/09/2026) ──────────────────────
   "consegue colocar o badge a bolinha antes do nome de cada galgo na banca?"
   As regras abaixo sao COPIA do public/css/shared.css (.trap-badge e .t1..t6),
   com as cores por extenso. Estao repetidas aqui pelo mesmo motivo do lapis: a
   Banca nao carrega o shared.css, e bolinha que so pinta na tela que carregou
   outro arquivo apareceria aqui como um circulo cinza sem cor nenhuma.
   O que se repete e' desenho, nao regra — quem decide QUAL trap mostrar e' o
   resolverAposta, no servidor, um lugar so. */
.trap-badge{display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;border-radius:50%;font-weight:700;font-size:13px;
  border:2px solid transparent}
.t1{background:radial-gradient(circle at 35% 35%, #ff4444, #c00 60%, #8b0000);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.4),inset 1px 1px 3px rgba(255,255,255,.4),0 2px 4px rgba(0,0,0,.3)}
.t2{background:radial-gradient(circle at 35% 35%, #4488ff, #1a3db5 60%, #0a1f6b);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.4),inset 1px 1px 3px rgba(255,255,255,.3),0 2px 4px rgba(0,0,0,.3)}
.t3{background:radial-gradient(circle at 35% 35%, #fff, #d0d0d0 60%, #a0a0a0);color:#111;box-shadow:inset -2px -2px 4px rgba(0,0,0,.2),inset 1px 1px 3px rgba(255,255,255,.8),0 2px 4px rgba(0,0,0,.25)}
.t4{background:radial-gradient(circle at 35% 35%, #444, #1a1a1a 60%, #000);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.6),inset 1px 1px 3px rgba(255,255,255,.15),0 2px 4px rgba(0,0,0,.4)}
.t5{background:radial-gradient(circle at 35% 35%, #ffaa00, #e07000 60%, #a04800);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.3),inset 1px 1px 3px rgba(255,255,255,.4),0 2px 4px rgba(0,0,0,.3)}
.t6{background:radial-gradient(circle at 50% 50%, #cc0000 0%, #cc0000 38%, transparent 38%),repeating-linear-gradient(90deg, #111 0%, #111 50%, #f0f0f0 50%, #f0f0f0 100%) 0/10px;color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.4),inset 1px 1px 3px rgba(255,255,255,.2),0 2px 4px rgba(0,0,0,.4)}
/* A celula segura bolinha e nome na mesma linha de base sem quebrar o nome. */
.bnc-galgo{display:inline-flex;align-items:center;white-space:nowrap}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
/* Linha unica do DIA (Bruno, 16/09): oito cartoes lado a lado. A fonte e o
   respiro encolhem so aqui — as abas Mes e Ano seguem com o tamanho de antes,
   porque la sao seis e cabem folgados. Abaixo de 1180px volta a quebrar
   sozinho: oito colunas num notebook estreito viram oito colunas ilegiveis. */
.cards.l8{grid-template-columns:repeat(8,minmax(0,1fr));gap:8px}
.cards.l8 .card{padding:11px 10px}
.cards.l8 .lbl{font-size:9px;letter-spacing:.3px;margin-bottom:4px}
.cards.l8 .val{font-size:16px;white-space:nowrap}
.card .val.bw{color:#eab308}
@media(max-width:1180px){.cards.l8{grid-template-columns:repeat(auto-fit,minmax(125px,1fr))}}
.card{background:#161B27;border:1px solid #222;border-radius:10px;padding:16px}
.card .lbl{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;font-weight:700}
.card .val{font-size:22px;font-weight:700}
.card .val.pos{color:#22c55e}
.card .val.neg{color:#ef4444}
.section{background:#161B27;border:1px solid #222;border-radius:10px;padding:18px;margin-bottom:16px}
.section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#22c55e;margin-bottom:14px}
/* A linha do grafico, que antes vivia em style="" dentro do JS. Mudou de
   lugar porque min-width em atributo nao ha regra de celular que relaxe sem
   !important — e o tal min-width:320px, somado ao respiro da pagina, sozinho
   ja empurrava a tela pra fora do aparelho. */
.bnc-chartrow{display:flex;gap:24px;align-items:stretch;flex-wrap:wrap}
.bnc-eq{flex:1;min-width:320px;border-left:1px solid #222;padding-left:24px}
/* ── A COLUNA AvB DO CELULAR (Bruno, 18/09/2026) ────────────────────────────
   "podemos colocar HORA, CORRIDA, AVB (badge v badge), STATUS e R$".
   No computador Favorito e Desafiado sao duas colunas com nome; no celular
   viram UMA com as duas bolinhas. A celula existe sempre no HTML e quem
   decide qual das duas versoes aparece e' o CSS — assim nao ha um segundo
   estado em JS pra desencontrar do primeiro. */
.bc-avb{display:none}
.bnc-avb{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.bnc-avb-v{font-size:9px;color:#555}
.bnc-semtrap{color:#444}
table.betstbl{width:100%;border-collapse:collapse;font-size:12px}
table.betstbl th{text-align:left;padding:8px 10px;color:#666;font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #2a2a2a}
table.betstbl td{padding:8px 10px;border-bottom:1px solid #1c1c1c}
.status-green{color:#22c55e;font-weight:700}
.status-red{color:#ef4444;font-weight:700}
.status-pendente{color:#888}
.gain-pos{color:#22c55e;font-weight:600}
.gain-neg{color:#ef4444;font-weight:600}
.empty-msg{padding:30px;text-align:center;color:#555;font-size:13px}
.monthinit-form{display:flex;align-items:center;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid #222}
.btn-mini{background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);color:#22c55e;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer}
/* ── A BANCA NO CELULAR (Bruno, 18/09/2026) ─────────────────────────────────

   "consegue deixar tambem slim a tela de banca no mobile... podemos colocar
   HORA, CORRIDA, AVB (badge v badge), STATUS e R$."

   MEDIDO ANTES, num navegador de verdade: a pagina pedia 872px em QUALQUER
   aparelho (a tabela sozinha, 829). Dois culpados: a tabela de dez colunas
   com nome de galgo inteiro, e o min-width:320px da coluna do grafico, que
   com o respiro da pagina ja passava de 390px sozinho.

   O QUE VOCE PERDE NO CELULAR, dito na cara: Favorito e Desafiado por
   extenso (viram as duas bolinhas), a Odd, as Unidades, o %Gain/Loss e a
   coluna dos icones — ou seja, o LAPIS e a LIXEIRA. No celular da pra ler;
   editar odd/unidades e excluir aposta continua sendo no computador.

   Acima de 768px nada muda: as dez colunas, os nomes e os dois icones
   continuam exatamente como estao. */
@media(max-width:768px){
  .content{padding:12px 10px}
  /* O grafico deixa de exigir 320px e passa a empilhar embaixo das barras,
     com um risco em cima no lugar da borda lateral. */
  .bnc-eq{min-width:0;border-left:none;border-top:1px solid #222;padding-left:0;padding-top:14px}
  .bnc-chartrow{gap:12px}
  .section{padding:12px 10px}
  table.betstbl{font-size:10px}
  table.betstbl th{padding:5px 3px;font-size:9px;letter-spacing:.2px}
  table.betstbl td{padding:6px 3px}
  .bc-fav,.bc-und,.bc-odd,.bc-unid,.bc-pct,.bc-acoes{display:none}
  .bc-avb{display:table-cell}
  /* O nome da pista pode quebrar em duas linhas; e' mais barato que rolar a
     pagina inteira pro lado. */
  .bc-corrida{white-space:normal}
}
</style>
<!-- Caixas de dialogo no visual do app. Substitui confirm()/alert(), que no
     Railway aparecem com o dominio no titulo e fonte do sistema — num momento
     de decisao (resetar banca) parece dialogo de outro site. -->
<script src="${BASE}/static/js/dialogo.js"></script>
</head><body>
<div class="hero"><img src="${logoB64}" alt="Greyhound Validator"></div>
${navBar(req.user, 'banca')}
<div class="gf-row">
${sidebarInfo(req.user)}
<div class="content">
  <h1>${icon('trophy', {size:22, color:'#22c55e'})} Gestão de Banca</h1>
  <p class="sub">Acompanhamento real das apostas feitas em cima dos AvBs — 1 unidade = 1% da banca inicial do mês.</p>

  <div class="viewtabs">
    <button class="viewtab active" data-view="day" onclick="mudarView('day')">Dia</button>
    <button class="viewtab" data-view="month" onclick="mudarView('month')">Mês</button>
    <button class="viewtab" data-view="year" onclick="mudarView('year')">Ano</button>
  </div>

  <div class="toprow">
    <div class="datepick" id="datepick-day">
      <button class="navbtn" onclick="mudarData(-1)">‹</button>
      <input type="date" id="date-input-day" value="${hojeStr}" onchange="carregarDados()">
      <button class="navbtn" onclick="mudarData(1)">›</button>
    </div>
    <div class="datepick" id="datepick-month" style="display:none">
      <button class="navbtn" onclick="mudarData(-1)">‹</button>
      <input type="month" id="date-input-month" value="${mesAtual}" onchange="carregarDados()">
      <button class="navbtn" onclick="mudarData(1)">›</button>
    </div>
    <div class="datepick" id="datepick-year" style="display:none">
      <button class="navbtn" onclick="mudarData(-1)">‹</button>
      <input type="number" id="date-input-year" value="${anoAtual}" style="width:90px" onchange="carregarDados()">
      <button class="navbtn" onclick="mudarData(1)">›</button>
    </div>
  </div>

  <div id="banca-cards" class="cards"></div>
  <div id="banca-chart-section" class="section" style="display:none">
    <div class="section-title" id="chart-title">Evolução</div>
    <div id="banca-chart"></div>
  </div>
  <div class="section">
    <div class="section-title" id="table-title">Apostas do dia</div>
    <div id="banca-table"></div>
  </div>

  <div class="section" id="banca-config">
    <div class="section-title">${icon('gear',{size:14,color:'#22c55e'})} Configurações da Banca</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">
      <div>
        <label style="display:block;font-size:12px;color:#aaa;margin-bottom:6px">Valor da unidade (padrão por aposta)</label>
        <input id="cfg_unidade" type="number" step="0.5" min="0" value="${cfg.banca_unidade_padrao||2.5}" style="width:100%;background:#0D1117;border:1px solid #222;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px">
        <div style="font-size:11px;color:#666;margin-top:4px">1 unidade entra automaticamente quando você marca "Apostei" (1 unidade = 1% da banca do mês).</div>
      </div>
      <div>
        <label style="display:block;font-size:12px;color:#aaa;margin-bottom:6px">Banca fixa (R$)</label>
        <input id="cfg_inicial" type="number" step="1" min="0" value="${cfg.banca_valor_inicial||1000}" style="width:100%;background:#0D1117;border:1px solid #222;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px">
        <div style="font-size:11px;color:#666;margin-top:4px">A base da unidade: 1 unidade = 1% dela. Não se mexe sozinha — vale igual em todos os meses.</div>
        <button type="button" onclick="resetarBanca('fixa')" style="margin-top:8px;background:#161B27;border:1px solid #333;color:#cbd5e1;padding:6px 12px;border-radius:7px;font-size:12px;cursor:pointer">Resetar acumulada (começa hoje)</button>
        <span style="font-size:11px;color:#666;margin-left:8px">${cfg.banca_fixa_reset_em ? 'acumulando desde ' + cfg.banca_fixa_reset_em : 'acumulando desde a primeira aposta'}</span>
      </div>
      <div>
        <label style="display:block;font-size:12px;color:#aaa;margin-bottom:6px">Banca BW — saldo real na casa (R$)</label>
        <input id="cfg_bw" type="number" step="0.01" min="0" value="${cfg.banca_bw_valor||0}" style="width:100%;background:#0D1117;border:1px solid #222;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px">
        <div style="font-size:11px;color:#666;margin-top:4px">O que está de fato na BetWinner. Resete depois de depósito ou saque — o sistema não tem como saber que eles aconteceram.</div>
        <button type="button" onclick="resetarBanca('bw')" style="margin-top:8px;background:#161B27;border:1px solid #333;color:#eab308;padding:6px 12px;border-radius:7px;font-size:12px;cursor:pointer">Resetar BW com este valor</button>
        <span style="font-size:11px;color:#666;margin-left:8px">${cfg.banca_bw_reset_em ? 'contando desde ' + cfg.banca_bw_reset_em : 'nunca resetada'}</span>
      </div>
      <div>
        <label style="display:block;font-size:12px;color:#aaa;margin-bottom:6px">Percentual de stop do dia (%)</label>
        <input id="cfg_pctstop" type="number" step="1" min="0" max="100" value="${cfg.banca_pct_stop!=null?cfg.banca_pct_stop:20}" style="width:100%;background:#0D1117;border:1px solid #222;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px">
        <div style="font-size:11px;color:#666;margin-top:4px">Se o prejuízo do dia atingir esse percentual, mostra um aviso (não bloqueia). Reinicia todo dia.</div>
      </div>
      <div style="grid-column:1/-1">
        <label style="display:block;font-size:12px;color:#aaa;margin-bottom:6px">Mensagem do aviso de stop</label>
        <textarea id="cfg_aviso" rows="2" style="width:100%;resize:vertical;background:#0D1117;border:1px solid #222;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px">${cfg.banca_aviso_stop||'Atenção: o prejuízo de hoje atingiu o limite configurado. Considere parar as apostas por hoje.'}</textarea>
      </div>
    </div>
    <div style="margin-top:14px;display:flex;align-items:center;gap:12px">
      <button class="btn-mini" onclick="salvarConfigBanca()">Salvar configurações</button>
      <span id="cfg-msg" style="font-size:12px;color:#22c55e;display:none">Configurações salvas!</span>
    </div>
  </div>
</div>
</div>

<script>
const BASE = '${BASE}';
let currentView = 'day';

function mudarView(v) {
  currentView = v;
  document.querySelectorAll('.viewtab').forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-view')===v); });
  document.getElementById('datepick-day').style.display = v==='day' ? 'flex' : 'none';
  document.getElementById('datepick-month').style.display = v==='month' ? 'flex' : 'none';
  document.getElementById('datepick-year').style.display = v==='year' ? 'flex' : 'none';
  carregarDados();
}

function getCurrentDateParam() {
  if (currentView === 'day') return document.getElementById('date-input-day').value;
  if (currentView === 'month') return document.getElementById('date-input-month').value + '-01';
  return document.getElementById('date-input-year').value + '-01-01';
}

function mudarData(delta) {
  if (currentView === 'day') {
    const el = document.getElementById('date-input-day');
    const d = new Date(el.value + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    el.value = d.toISOString().slice(0,10);
  } else if (currentView === 'month') {
    const el = document.getElementById('date-input-month');
    const parts = el.value.split('-').map(Number);
    let y = parts[0], m = parts[1] + delta;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    el.value = y + '-' + String(m).padStart(2,'0');
  } else {
    const el = document.getElementById('date-input-year');
    el.value = parseInt(el.value) + delta;
  }
  carregarDados();
}

function fmtR$(v) {
  const s = (v<0?'-':'') + 'R$ ' + Math.abs(v).toFixed(2).replace('.', ',');
  return s;
}
function fmtPct(v) { return (v>=0?'+':'') + v.toFixed(2).replace('.', ',') + '%'; }

function barChart(items) {
  // items: [{label, value, color}] — barras verticais simples, altura proporcional ao maior valor
  const max = Math.max.apply(null, items.map(function(i){return Math.abs(i.value);}).concat([1]));
  const h = 180;
  return '<div style="display:flex;align-items:flex-end;gap:24px;height:'+ (h+40) +'px;padding:10px 20px">' +
    items.map(function(i) {
      const barH = Math.max(4, Math.round((Math.abs(i.value)/max) * h));
      return '<div style="display:flex;flex-direction:column;align-items:center;gap:8px">' +
        '<div style="font-size:13px;font-weight:700;color:'+i.color+'">'+fmtR$(i.value)+'</div>' +
        '<div style="width:70px;height:'+barH+'px;background:'+i.color+';border-radius:4px 4px 0 0"></div>' +
        '<div style="font-size:11px;color:#888;font-weight:600">'+i.label+'</div>' +
        '</div>';
    }).join('') + '</div>';
}

// Curva intradiaria: saldo acumulado do dia, bet a bet, em ordem cronologica.
// Cada TRECHO da linha e colorido pelo resultado daquela aposta especifica —
// verde subindo (green), vermelho descendo (red) — tipo uma curva de equity.
function intradayEquityChart(apostas) {
  const resolvidas = apostas.filter(function(a){ return a.status !== 'pendente'; })
    .slice().sort(function(a,b){ return (a.hora_br||a.hora||'').localeCompare(b.hora_br||b.hora||''); });
  if (!resolvidas.length) return '<div class="empty-msg">Sem apostas resolvidas nesse dia ainda.</div>';

  const w = 900, h = 220, pad = 36;
  let acumulado = 0;
  const pts = [{ x: 0, valor: 0, label: 'início', cor: '#666' }];
  resolvidas.forEach(function(a, i) {
    acumulado += (a.ganhoReais || 0);
    pts.push({ x: i+1, valor: acumulado, label: a.hora_br||a.hora||'', cor: a.ganhoReais >= 0 ? '#22c55e' : '#ef4444' });
  });

  const vals = pts.map(function(p){return p.valor;});
  const minV = Math.min.apply(null, vals.concat([0])), maxV = Math.max.apply(null, vals.concat([0]));
  const range = (maxV - minV) || 1;
  const stepX = pts.length > 1 ? (w - pad*2) / (pts.length - 1) : 0;
  const coords = pts.map(function(p, i) {
    return { x: pad + i*stepX, y: h - pad - ((p.valor - minV) / range) * (h - pad*2), label: p.label, valor: p.valor, cor: p.cor };
  });

  // Um <path> por trecho (cor do trecho = cor do PONTO DE CHEGADA, ou seja,
  // do resultado daquela aposta especifica)
  const segments = [];
  for (let i = 1; i < coords.length; i++) {
    segments.push('<path d="M'+coords[i-1].x.toFixed(1)+','+coords[i-1].y.toFixed(1)+' L'+coords[i].x.toFixed(1)+','+coords[i].y.toFixed(1)+'" fill="none" stroke="'+coords[i].cor+'" stroke-width="2.5"/>');
  }
  const zeroY = h - pad - ((0 - minV) / range) * (h - pad*2);
  const linhaZero = '<line x1="'+pad+'" y1="'+zeroY.toFixed(1)+'" x2="'+(w-pad)+'" y2="'+zeroY.toFixed(1)+'" stroke="#333" stroke-width="1" stroke-dasharray="4,4"/>';
  const dots = coords.map(function(p){ return '<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3" fill="'+p.cor+'"><title>'+p.label+': '+fmtR$(p.valor)+'</title></circle>'; }).join('');
  const labels = coords.filter(function(_,i){ return i % Math.ceil(coords.length/8 || 1) === 0 || i === coords.length-1; })
    .map(function(p){ return '<text x="'+p.x.toFixed(1)+'" y="'+(h-6)+'" font-size="9" fill="#666" text-anchor="middle">'+p.label+'</text>'; }).join('');

  return '<svg viewBox="0 0 '+w+' '+h+'" style="width:100%;height:220px">' + linhaZero + segments.join('') + dots + labels + '</svg>';
}

function lineChart(pontos) {
  // pontos: [{label, valor}] — linha simples em SVG, eixo Y auto-escalado
  if (!pontos.length) return '<div class="empty-msg">Sem dados nesse período.</div>';
  const w = 900, h = 220, pad = 40;
  const vals = pontos.map(function(p){return p.valor;});
  const minV = Math.min.apply(null, vals), maxV = Math.max.apply(null, vals);
  const range = (maxV - minV) || 1;
  const stepX = pontos.length > 1 ? (w - pad*2) / (pontos.length - 1) : 0;
  const pts = pontos.map(function(p, i) {
    const x = pad + i*stepX;
    const y = h - pad - ((p.valor - minV) / range) * (h - pad*2);
    return {x:x, y:y, label:p.label, valor:p.valor};
  });
  const pathD = pts.map(function(p,i){ return (i===0?'M':'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
  const areaD = pathD + ' L' + pts[pts.length-1].x.toFixed(1) + ',' + (h-pad) + ' L' + pts[0].x.toFixed(1) + ',' + (h-pad) + ' Z';
  const corLinha = pts[pts.length-1].valor >= pts[0].valor ? '#22c55e' : '#ef4444';
  const labels = pts.filter(function(_,i){ return i % Math.ceil(pts.length/10 || 1) === 0 || i === pts.length-1; })
    .map(function(p){ return '<text x="'+p.x.toFixed(1)+'" y="'+(h-8)+'" font-size="9" fill="#666" text-anchor="middle">'+p.label+'</text>'; }).join('');
  const dots = pts.map(function(p){ return '<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3" fill="'+corLinha+'"><title>'+p.label+': '+fmtR$(p.valor)+'</title></circle>'; }).join('');
  return '<svg viewBox="0 0 '+w+' '+h+'" style="width:100%;height:220px">' +
    '<path d="'+areaD+'" fill="'+corLinha+'" fill-opacity="0.08" stroke="none"/>' +
    '<path d="'+pathD+'" fill="none" stroke="'+corLinha+'" stroke-width="2"/>' +
    dots + labels +
  '</svg>';
}

// ── EDICAO DE Odd E Unid. NA BANCA (Bruno, 18/09/2026) ─────────────────────
//
// Mesmo mecanismo do Historico, de proposito: o lapis liga a linha, o campo
// grava no MESMO endereco (PUT /api/race/:id), e os dois campos ja estavam na
// lista de permitidos de la. Nao ha rota nova nem regra nova.
//
// Depois de gravar, a tela RECARREGA em vez de recalcular no navegador. Odd e
// unidades entram no ganho, no saldo do dia, no percentual, nos oito cartoes e
// no grafico — refazer essas contas aqui seria uma segunda implementacao de
// tudo isso, divergindo da do servidor no dia em que alguem afinar uma delas.
// Uma ida a mais no servidor e' barata; dois numeros pra mesma pergunta, nao.
function _at(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
// O SVG da lixeira vem do conjunto compartilhado (icons.js), montado pelo
// servidor e guardado aqui como texto. Aspas SIMPLES na string: o icon() so
// usa aspas duplas no SVG, entao nao ha o que escapar, e escapar dentro de um
// template literal e' justamente onde este arquivo ja me pegou.
const ICONE_LIXO = '${icon('trash', {size: 13})}';
// As apostas do dia ficam guardadas pra caixa de confirmacao poder dizer QUAL
// aposta vai sair. Perguntar "deseja excluir?" sem dizer o que se apaga e'
// convite pra apagar a linha errada.
var APOSTAS_DO_DIA = [];

// ── EXCLUIR UMA APOSTA (Bruno, 18/09/2026) ─────────────────────────────────
//
// "uma lixeirinha tb pois serve pra quando eu clicar em entrei e nao entrar ou
// dar cash na BW".
//
// O QUE ELA APAGA: a APOSTA, nao a corrida. Zera a odd, as unidades e o ENTREI
// na race_user_data. A corrida, a analise, a chegada e o registro do Historico
// continuam inteiros — o que sai e' o dinheiro.
//
// Como a Banca so lista linha com odd preenchida (o WHERE do getApostas), zerar
// a odd tira a linha da tela, dos oito cartoes e do grafico de uma vez. Nao ha
// exclusao fisica de nada: da pra registrar a aposta de novo a hora que quiser.
//
// O campo avb_escolhido FICA de proposito (SEM CRASE AQUI: crase dentro de
// comentario, dentro deste template literal, FECHA a string e derruba a
// pagina inteira). Ele guarda em qual par voce tinha entrado, e o Historico
// continua mostrando esse par. Sozinho ele nao faz a aposta voltar: a
// tela Analisar so marca o AvB como escolhido quando ha par
// E odd, e a odd acabou de sair.
function excluirAposta(el) {
  var id = el.getAttribute('data-row');
  var linha = (APOSTAS_DO_DIA || []).find(function (a) { return String(a.id) === String(id); }) || {};
  var quem = (linha.name_fav || '?') + ' vs ' + (linha.name_und || '?');
  var quanto = (linha.odd ? 'odd ' + linha.odd : 'sem odd')
    + (linha.bet_unidades ? ', ' + linha.bet_unidades + ' un.' : '');
  ghConfirmar({
    titulo: 'Excluir esta aposta?',
    // \\n com DUAS barras: esta tela e' montada dentro de um template literal,
    // e um \\n de uma barra so vira quebra de linha DE VERDADE ali, partindo a
    // string ao meio. O tools/valida.js pegou; e' a mesma pegadinha do dialogo.
    texto: (linha.hora_br || linha.hora || '') + '  ' + (linha.corrida || '') + '\\n'
      + quem + '\\n' + quanto + '\\n\\n'
      + 'A aposta sai da Banca e o ENTREI e desmarcado. A corrida e a analise '
      + 'continuam no Historico, e voce pode registrar de novo depois.',
    ok: 'Excluir',
    perigo: true
  }).then(async function (sim) {
    if (!sim) return;
    try {
      var r = await fetch(BASE + '/api/race/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ odd: null, bet_unidades: null, bet_entrou: 0 })
      });
      if (!r.ok) throw new Error('o servidor respondeu ' + r.status);
      await carregarDados();
    } catch (e) {
      ghErro('Não consegui excluir: ' + e.message);
    }
  });
}
function setRowEditBanca(id, editando) {
  var lapis = document.querySelector('.bnc-pencil[data-row="' + id + '"]');
  if (lapis) {
    lapis.classList.toggle('editing', editando);
    lapis.innerHTML = editando ? '&#10003;' : '&#9998;';
  }
  document.querySelectorAll('.bnc-inp[data-id="' + id + '"]').forEach(function (el) {
    el.disabled = !editando;
  });
}
function toggleRowEditBanca(lapis) {
  var id = lapis.getAttribute('data-row');
  setRowEditBanca(id, !lapis.classList.contains('editing'));
}
// Delegado no documento: a tabela e' redesenhada a cada carregarDados(), entao
// ouvinte presa no elemento morreria no primeiro salvamento.
document.addEventListener('keydown', function (ev) {
  var el = ev.target;
  if (ev.key === 'Enter' && el && el.classList && el.classList.contains('bnc-inp')) el.blur();
});
document.addEventListener('change', async function (ev) {
  var el = ev.target;
  if (!el || !el.classList || !el.classList.contains('bnc-inp') || el.disabled) return;
  var id = el.getAttribute('data-id'), campo = el.getAttribute('data-f');
  var valor = String(el.value || '').trim().replace(',', '.');
  // Campo vazio APAGA o valor, e isso e' proposital: aposta registrada por
  // engano volta a nao ter odd e sai da conta, sem precisar mexer no banco.
  var corpo = {}; corpo[campo] = (valor === '' ? null : valor);
  el.disabled = true;
  try {
    var r = await fetch(BASE + '/api/race/' + id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    });
    if (!r.ok) throw new Error('o servidor respondeu ' + r.status);
    await carregarDados();
  } catch (e) {
    el.disabled = false;
    ghErro('Não consegui salvar: ' + e.message);
  }
});

async function carregarDados() {
  const dateParam = getCurrentDateParam();
  try {
    const r = await fetch(BASE + '/banca/data?view=' + currentView + '&date=' + dateParam);
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'erro');
    if (currentView === 'day') renderDay(d);
    else if (currentView === 'month') renderMonth(d);
    else renderYear(d);
  } catch(e) {
    document.getElementById('banca-table').innerHTML = '<div class="empty-msg">Erro ao carregar: ' + e.message + '</div>';
  }
}

function renderDay(d) {
  document.getElementById('table-title').textContent = 'Apostas do dia';
  document.getElementById('chart-title').textContent = 'Lucros x Prejuízos e evolução do dia';
  const cardsEl = document.getElementById('banca-cards');
  // l8 = os oito numa linha so. O cartao Pendentes saiu (16/09): o motivo de
  // cada pendencia passou a aparecer na propria linha da tabela, entao contar
  // quantas eram em cima so ocupava a vaga de um numero que importa mais.
  cardsEl.className = 'cards l8';
  var dicaFixa = d.bancaFixaResetEm ? 'Base da unidade. Acumulando desde o reset de ' + d.bancaFixaResetEm : 'Base da unidade: 1 unidade = 1% dela. Nao se mexe sozinha.';
  var dicaAcum = d.bancaFixaResetEm ? 'Banca fixa + resultado desde ' + d.bancaFixaResetEm : 'Banca fixa + resultado de todas as apostas';
  var dicaBw = d.bancaBwResetEm ? 'Saldo informado em ' + d.bancaBwResetEm + ' (' + fmtR$(d.bancaBwBase) + ') + resultado desde entao' : 'Informe o saldo real da casa em Configuracoes e resete pra comecar a medir';
  cardsEl.innerHTML =
    '<div class="card" title="'+dicaFixa+'"><div class="lbl">Banca fixa</div><div class="val">'+fmtR$(d.bancaFixa)+'</div></div>' +
    '<div class="card" title="'+dicaAcum+'"><div class="lbl">Banca acumulada</div><div class="val '+(d.bancaAcumulada>=d.bancaFixa?'pos':'neg')+'">'+fmtR$(d.bancaAcumulada)+'</div></div>' +
    '<div class="card" title="'+dicaBw+'"><div class="lbl">Banca BW</div><div class="val bw">'+(d.bancaBw==null?'&mdash;':fmtR$(d.bancaBw))+'</div></div>' +
    '<div class="card"><div class="lbl">Dinheiro transitado</div><div class="val" style="color:#3B82F7">'+fmtR$(d.dinheiroTransitado)+'</div></div>' +
    '<div class="card"><div class="lbl">Lucros do dia</div><div class="val pos">'+fmtR$(d.lucros)+'</div></div>' +
    '<div class="card"><div class="lbl">Prejuízos do dia</div><div class="val neg">'+fmtR$(-d.prejuizos)+'</div></div>' +
    '<div class="card"><div class="lbl">Saldo do dia</div><div class="val '+(d.saldoDia>=0?'pos':'neg')+'">'+fmtR$(d.saldoDia)+'</div></div>' +
    '<div class="card"><div class="lbl">% do dia</div><div class="val '+(d.pctDia>=0?'pos':'neg')+'">'+fmtPct(d.pctDia)+'</div></div>';

  const chartSection = document.getElementById('banca-chart-section');
  if (d.lucros || d.prejuizos) {
    chartSection.style.display = 'block';
    document.getElementById('banca-chart').innerHTML =
      '<div class="bnc-chartrow">' +
      '<div style="flex-shrink:0">' + barChart([
        { label: 'Lucros', value: d.lucros, color: '#22c55e' },
        { label: 'Prejuízos', value: -d.prejuizos, color: '#ef4444' }
      ]) + '</div>' +
      '<div class="bnc-eq">' +
      '<div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin-bottom:8px">Evolução do saldo — bet a bet</div>' +
      intradayEquityChart(d.apostas) +
      '</div></div>';
  } else { chartSection.style.display = 'none'; }

  const tblEl = document.getElementById('banca-table');
  APOSTAS_DO_DIA = d.apostas || [];
  if (!d.apostas.length) { tblEl.innerHTML = '<div class="empty-msg">Nenhuma aposta registrada nesse dia.</div>'; return; }
  tblEl.innerHTML = '<table class="betstbl"><thead><tr><th class="bc-hora">Hora</th><th class="bc-corrida">Corrida</th><th class="bc-avb">AvB</th><th class="bc-fav">Favorito</th><th class="bc-und">Desafiado</th><th class="bc-odd">Odd</th><th class="bc-unid">Unid.</th><th class="bc-status">Status</th><th class="bc-pct">%Gain/Loss</th><th class="bc-rs">R$</th><th class="bc-acoes" style="width:62px"></th></tr></thead><tbody>' +
    d.apostas.map(function(a) {
      const statusLabel = a.status==='green'?'Green':a.status==='red'?'Red':'Pendente';
      const statusCls = 'status-'+a.status;
      const gainCls = a.ganhoReais>0?'gain-pos':a.ganhoReais<0?'gain-neg':'';
      // Pendente sem explicacao e' o que fez isto passar meses despercebido: a
      // linha ficava igual a uma corrida que so nao correu ainda.
      const dica = a.motivo_pendente ? ' title="Pendente: '+a.motivo_pendente+'"' : '';
      const pend = a.status==='pendente' && a.motivo_pendente
        ? '<span style="color:#f59e0b;font-size:10px;margin-left:5px">&#9888;</span>' : '';
      // Voce apostou num sentido diferente do que o motor montou. Desde 17/09
      // isso NAO e mais um defeito: o resultado ja vem calculado pelo seu par.
      // O selo virou informacao, entao saiu do ambar de alerta e foi pro mesmo
      // verde-azulado que o Historico usa no REVERSE — e a mesma ideia nas duas
      // telas tem que ter a mesma cor.
      const diverg = a.par_divergente
        ? ' <span style="color:#14b8a6;font-size:10px" title="Voce apostou num sentido diferente do que o motor montou. O resultado desta linha e calculado pelo SEU par.">&#8644; seu par</span>' : '';
      // Odd e Unid. viram campo. O Status NAO: ele e' derivado da chegada pelo
      // SEU par, e um campo que grava em races.bateu seria ignorado justamente
      // nas linhas que ja tem chegada — voce editaria, a tela nao mudaria e nao
      // haveria erro nenhum pra explicar. Decisao do Bruno em 18/09: "status
      // nao precisa, so ODD e UND".
      // Bolinha do trap antes do nome, no mesmo desenho e no mesmo tamanho da
      // celula de AvB da tela Analisar (20px / 11px): a mesma coisa nas duas
      // telas tem que ter a mesma cara, senao viram dois desenhos do mesmo dado.
      // Sem trap conhecido a bolinha simplesmente nao aparece — inventar um
      // numero aqui seria pintar de vermelho um galgo que talvez corra na 4.
      const galgo = function(trap, nome) {
        const t = Number(trap) > 0 ? Number(trap) : null;
        const bola = t
          ? '<span class="trap-badge t' + t + '" style="width:20px;height:20px;font-size:11px;margin-right:7px">' + t + '</span>'
          : '';
        return '<span class="bnc-galgo">' + bola + (nome || '-') + '</span>';
      };
      // A mesma dupla, escrita curta: so as duas bolinhas, pro celular, onde
      // Favorito e Desafiado nao cabem como colunas separadas. Os traps sao os
      // MESMOS do galgo() acima (o par efetivo desta aposta) — se saissem de
      // outro lugar, a tela pequena e a grande poderiam discordar sobre quem
      // voce apostou, que e' exatamente o defeito de 16/09.
      const bola = function(trap) {
        const t = Number(trap) > 0 ? Number(trap) : null;
        return t
          ? '<span class="trap-badge t' + t + '" style="width:18px;height:18px;font-size:10px">' + t + '</span>'
          : '<span class="bnc-semtrap">-</span>';
      };
      const avbCurto = '<span class="bnc-avb">' + bola(a.trap_a)
        + '<span class="bnc-avb-v">v</span>' + bola(a.trap_b) + '</span>';
      const inp = function(campo, valor, largura) {
        return '<input type="text" class="bnc-inp" value="' + _at(valor) + '" placeholder="-"'
          + ' data-id="' + a.id + '" data-f="' + campo + '" disabled'
          + ' style="width:' + largura + 'px;text-align:center;border-radius:4px;padding:4px;font-size:11px">';
          // SEM onkeydown inline aqui. Esta tela e' montada dentro de um
          // template literal, e a barra de um \' some na avaliacao: o atributo
          // chegava ao navegador como if(event.key==='Enter'), que fecha a
          // string JS que o envolve. O Enter e' tratado no ouvinte delegado la
          // embaixo, que nao tem esse problema e ainda vale pras linhas
          // redesenhadas.
      };
      // Cada celula leva o NOME da sua coluna. No celular o que some e' escolhido
      // por esse nome, nunca por posicao: numero de coluna anda sozinho quando
      // alguem acrescenta uma, e foi assim que o Bateu sumiu do Historico.
      return '<tr'+dica+'><td class="bc-hora">'+(a.hora_br||a.hora||'')+'</td><td class="bc-corrida">'+a.corrida+diverg+'</td>' +
        '<td class="bc-avb">'+avbCurto+'</td>' +
        '<td class="bc-fav">'+galgo(a.trap_a, a.name_fav)+'</td>' +
        '<td class="bc-und">'+galgo(a.trap_b, a.name_und)+'</td>' +
        '<td class="bc-odd" style="text-align:center">'+inp('odd', a.odd, 46)+'</td>' +
        '<td class="bc-unid" style="text-align:center">'+inp('bet_unidades', a.bet_unidades, 42)+'</td>' +
        '<td class="bc-status '+statusCls+'">'+statusLabel+pend+'</td>' +
        '<td class="bc-pct '+gainCls+'">'+(a.ganhoPct!=null?fmtPct(a.ganhoPct):'-')+'</td>' +
        '<td class="bc-rs '+gainCls+'">'+(a.ganhoReais!=null?fmtR$(a.ganhoReais):'-')+'</td>' +
        '<td class="bc-acoes" style="text-align:center;white-space:nowrap">'
        +   '<span class="bnc-pencil" data-row="'+a.id+'" onclick="toggleRowEditBanca(this)" title="Editar Odd e Unidades">&#9998;</span>'
        +   '<span class="bnc-del" data-row="'+a.id+'" onclick="excluirAposta(this)" title="Excluir esta aposta">'+ICONE_LIXO+'</span>'
        + '</td></tr>';
    }).join('') + '</tbody></table>';
}

function renderMonth(d) {
  document.getElementById('table-title').textContent = 'Dias do mês';
  document.getElementById('chart-title').textContent = 'Evolução da banca no mês';
  const cardsEl = document.getElementById('banca-cards');
  // Tira o l8 do dia: sem isto, trocar de aba deixava seis cartoes espremidos
  // em oito colunas.
  cardsEl.className = 'cards';
  cardsEl.innerHTML =
    '<div class="card"><div class="lbl">Banca fixa</div><div class="val">'+fmtR$(d.bancaInicial)+'</div></div>' +
    '<div class="card"><div class="lbl">Banca final</div><div class="val">'+fmtR$(d.bancaFinal)+'</div></div>' +
    '<div class="card"><div class="lbl">Ganho do mês</div><div class="val '+(d.totalGanho>=0?'pos':'neg')+'">'+fmtR$(d.totalGanho)+'</div></div>' +
    '<div class="card"><div class="lbl">% do mês</div><div class="val '+(d.pctMes>=0?'pos':'neg')+'">'+fmtPct(d.pctMes)+'</div></div>' +
    '<div class="card"><div class="lbl">Green / Red</div><div class="val">'+d.vitorias+' / '+d.derrotas+'</div></div>' +
    '<div class="card"><div class="lbl">Total apostas</div><div class="val">'+d.totalApostas+'</div></div>';

  const chartSection = document.getElementById('banca-chart-section');
  if (d.serie.length) {
    chartSection.style.display = 'block';
    const pontos = [{label:'início', valor:d.bancaInicial}].concat(
      d.serie.map(function(s){ return { label: s.dia.slice(8,10), valor: s.saldoAcumulado }; })
    );
    document.getElementById('banca-chart').innerHTML = lineChart(pontos);
  } else { chartSection.style.display = 'none'; }

  const tblEl = document.getElementById('banca-table');
  let html = '';
  if (!d.serie.length) {
    html = '<div class="empty-msg">Nenhuma aposta registrada nesse mês.</div>';
  } else {
    html = '<table class="betstbl"><thead><tr><th>Dia</th><th>Apostas</th><th>Saldo do dia</th><th>Saldo acumulado</th></tr></thead><tbody>' +
      d.serie.map(function(s) {
        const cls = s.saldoDia>0?'gain-pos':s.saldoDia<0?'gain-neg':'';
        return '<tr><td>'+s.dia+'</td><td>'+s.apostas+'</td><td class="'+cls+'">'+fmtR$(s.saldoDia)+'</td><td>'+fmtR$(s.saldoAcumulado)+'</td></tr>';
      }).join('') + '</tbody></table>';
  }
  html += '<div class="monthinit-form">' +
    '<span style="font-size:11px;color:#888">Ajustar banca inicial desse mês:</span>' +
    '<input type="number" step="1" id="month-init-input" value="'+d.bancaInicial+'" style="width:100px;background:#0D1117;border:1px solid #222;color:#fff;padding:6px 10px;border-radius:6px">' +
    '<button class="btn-mini" onclick="salvarBancaInicial(\\''+d.yearMonth+'\\')">Salvar</button>' +
    (d.temOverride ? '<span style="font-size:11px;color:#22c55e">✓ configurado manualmente</span>' : '<span style="font-size:11px;color:#666">herdado do mês anterior</span>') +
    '</div>';
  tblEl.innerHTML = html;
}

function renderYear(d) {
  document.getElementById('table-title').textContent = 'Meses do ano';
  document.getElementById('chart-title').textContent = 'Evolução da banca no ano';
  const cardsEl = document.getElementById('banca-cards');
  cardsEl.className = 'cards';   // tira o l8 do dia
  cardsEl.innerHTML =
    '<div class="card"><div class="lbl">Banca início do ano</div><div class="val">'+fmtR$(d.bancaInicioAno)+'</div></div>' +
    '<div class="card"><div class="lbl">Banca fim do ano</div><div class="val">'+fmtR$(d.bancaFimAno)+'</div></div>' +
    '<div class="card"><div class="lbl">Ganho do ano</div><div class="val '+(d.ganhoAno>=0?'pos':'neg')+'">'+fmtR$(d.ganhoAno)+'</div></div>' +
    '<div class="card"><div class="lbl">% do ano</div><div class="val '+(d.pctAno>=0?'pos':'neg')+'">'+fmtPct(d.pctAno)+'</div></div>';

  const chartSection = document.getElementById('banca-chart-section');
  if (d.serieMeses.length) {
    chartSection.style.display = 'block';
    const pontos = d.serieMeses.map(function(m){ return { label: m.yearMonth.slice(5,7)+'/'+m.yearMonth.slice(2,4), valor: m.final }; });
    document.getElementById('banca-chart').innerHTML = lineChart(pontos);
  } else { chartSection.style.display = 'none'; }

  const tblEl = document.getElementById('banca-table');
  if (!d.serieMeses.length) { tblEl.innerHTML = '<div class="empty-msg">Nenhuma aposta registrada nesse ano.</div>'; return; }
  tblEl.innerHTML = '<table class="betstbl"><thead><tr><th>Mês</th><th>Apostas</th><th>Banca inicial</th><th>Banca final</th><th>Ganho</th><th>%</th></tr></thead><tbody>' +
    d.serieMeses.map(function(m) {
      const cls = m.ganho>0?'gain-pos':m.ganho<0?'gain-neg':'';
      return '<tr><td>'+m.yearMonth+'</td><td>'+m.apostas+'</td><td>'+fmtR$(m.inicial)+'</td><td>'+fmtR$(m.final)+'</td><td class="'+cls+'">'+fmtR$(m.ganho)+'</td><td class="'+cls+'">'+fmtPct(m.pct)+'</td></tr>';
    }).join('') + '</tbody></table>';
}

async function salvarBancaInicial(yearMonth) {
  const val = document.getElementById('month-init-input').value;
  try {
    const r = await fetch(BASE + '/banca/month-init', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ yearMonth: yearMonth, bancaInicial: val })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'erro');
    carregarDados();
  } catch(e) { ghErro('Nao consegui salvar. ' + e.message); }
}

carregarDados();
// Resetar NAO apaga aposta nenhuma: so move o marco a partir do qual a banca
// acumula. O historico continua inteiro nas abas Mes e Ano.
async function resetarBanca(qual){
  var corpo = { qual: qual };
  var ok;
  if (qual === 'bw') {
    corpo.valor = document.getElementById('cfg_bw').value;
    ok = await ghConfirmar({
      titulo: 'Resetar a Banca BW?',
      texto: 'O saldo passa a ser R$ ' + (corpo.valor || '0') + ' e o resultado volta a contar a partir de hoje.\\n\\n'
        + 'Nenhuma aposta e apagada — o historico continua inteiro nas abas Mes e Ano.',
      ok: 'Resetar'
    });
  } else {
    ok = await ghConfirmar({
      titulo: 'Resetar a Banca acumulada?',
      texto: 'Ela volta a ser igual a banca fixa e passa a contar a partir de hoje.\\n\\n'
        + 'Nenhuma aposta e apagada — o historico continua inteiro nas abas Mes e Ano.',
      ok: 'Resetar'
    });
  }
  if (!ok) return;
  try {
    var r = await fetch(BASE+'/banca/reset-banca', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(corpo)});
    if(!r.ok) throw new Error('HTTP '+r.status);
    location.reload();
  } catch(e){ ghErro('Nao consegui resetar a banca. ' + e.message); }
}
async function salvarConfigBanca(){
  var body = {
    banca_unidade_padrao: document.getElementById('cfg_unidade').value,
    banca_valor_inicial: document.getElementById('cfg_inicial').value,
    banca_bw_valor: document.getElementById('cfg_bw').value,
    banca_pct_stop: document.getElementById('cfg_pctstop').value,
    banca_aviso_stop: document.getElementById('cfg_aviso').value
  };
  try {
    var r = await fetch(BASE+'/banca/save-config', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok) throw new Error('HTTP '+r.status);
    var m=document.getElementById('cfg-msg'); if(m){ m.style.display='inline'; setTimeout(function(){m.style.display='none';},2200); }
  } catch(e){ ghErro('Nao consegui salvar as configuracoes. ' + e.message); }
}
</script>
</body></html>`);
});

module.exports = router;