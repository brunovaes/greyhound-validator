const express = require('express');
const router = express.Router();
const multer = require('multer');
const https = require('https');

// Fetch com streaming da API Anthropic - evita timeout em respostas longas
function fetchAnthropicStream(apiKey, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify({ ...body, stream: true });
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(bodyStr)
      },
      agent: new https.Agent({ keepAlive: true })
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errData = '';
        res.on('data', c => errData += c);
        res.on('end', () => {
          try { const e = JSON.parse(errData); reject(new Error(e.error?.message || 'Erro API ' + res.statusCode)); }
          catch(e) { reject(new Error('Erro API ' + res.statusCode + ': ' + errData.slice(0,100))); }
        });
        return;
      }

      let fullText = '';
      let buffer = '';

      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // guarda linha incompleta

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            // Acumula texto dos eventos de content_block_delta
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              fullText += evt.delta.text || '';
            }
          } catch(e) { /* ignora linhas malformadas */ }
        }
      });

      res.on('end', () => {
        resolve({ content: [{ type: 'text', text: fullText }] });
      });

      res.on('error', reject);
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}
const { db, getUserConfig } = require('../db/database');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ============================================================
// PROMPT DE EXTRACAO — Claude SO le o PDF e devolve dados brutos
// Sem julgamento, sem decisao, sem ranking — apenas leitura factual
// ============================================================
function buildExtractionPrompt() {
  return `Leitor de PDFs de corridas de galgos Racing Post. Extraia dados brutos. ZERO analise.

ATENCAO CRITICA: O numero do TRAP de cada galgo esta no campo "Trp" do cabecalho de cada galgo no PDF (ex: [2] significa trap 2, [6] significa trap 6). NAO use a posicao do galgo na lista — use o numero real do trap impresso no card. Galgos com trap de fundo diferente (W = wide = fora) ainda tem seu numero de trap proprio.

Para cada corrida extraia:
hora, corrida (pista+classe), dist (ex:"450m"), classe (ex:"A3"), postPick (ex:"2-1-4" ou null), trapsCard (array dos numeros de trap reais — leia do campo [N] de cada galgo), galgos (array).

Para cada galgo: trap (int — do campo [N] do cabecalho), nome, brt (float), brtClasse, historico (3 linhas mais recentes validas).

Para cada linha de historico: data, pista, dist (int), trap (int — campo Trp da linha), split (float ou null), bends (string ou null), pos (int), caltm (float — SEMPRE CalTm, NUNCA WnTm), going (string ou null), classe, remarks (string ou null).

OMITIR campos nulos. INCLUIR linhas Trial/Solo/NR mesmo sem CalTm (usar caltm:0) — sao necessarias para detectar inatividade. Grade 'T' ou 'S' no campo classe indica trial/solo.
RESPOSTA: JSON puro, sem markdown, sem backticks, sem texto extra.
{"races":[{"hora":"7:42","corrida":"Star Pelaw A4","dist":"435m","classe":"A4","postPick":"5-3-2","trapsCard":[1,2,3,5,6],"galgos":[{"trap":6,"nome":"All About Rosie","brt":29.34,"brtClasse":"A2","historico":[{"data":"18Jun26","pista":"Towc","dist":500,"trap":6,"split":4.16,"bends":"5443","pos":2,"caltm":29.34,"going":"N","classe":"A2","remarks":"Mid-W,SAw,RnOnWll"}]}]}]}`;
}

// ============================================================
// MOTOR DE PONTUACAO — 100% deterministico em JavaScript
// ============================================================

// Hierarquia de classes (menor = mais forte)
const CLASS_HIERARCHY = {
  'A1':1,'A2':2,'A3':3,'A4':4,'A5':5,'A6':6,'A7':7,'A8':8,'A9':9,'A10':10,'A11':11,'A12':12,
  'B1':1,'B2':2,'B3':3,'B4':4,'B5':5,'B6':6,
  'C1':1,'C2':2,'C3':3,'C4':4,'C5':5,'C6':6,
  'D1':1,'D2':2,'D3':3,'D4':4,'D5':5,'D6':6,
  'S1':1,'S2':2,'S3':3,'S4':4,'S5':5,'S6':6
};

function getClassLevel(classe) {
  if (!classe) return null;
  const c = (classe||'').trim().toUpperCase().replace(/\s/g,'');
  return CLASS_HIERARCHY[c] || null;
}

// Remarks que indicam acidente GRAVE (descarta a linha inteira)
const REMARKS_DESCARTE = ['Fall','Fll','RnUp','Unseated','BdBmp','Stmb','Stumbled','UR'];
// Remarks de acidente MEDIO
const REMARKS_MEDIO = ['Crd','FcdCk','BlkOff'];
// Remarks de acidente LEVE
const REMARKS_LEVE = ['Bmp','SAw','MsdBrk','SlwAw','SltBmp','SltCrd'];
// Remarks que ATENUAM queda nos bends (nao classifica como fumador)
const REMARKS_ATENUAM_BENDS = ['Crd','FcdCk','Bmp','BlkOff','Stmb','BdBmp'];
// Remarks MUITO POSITIVOS (combinacoes)
const REMARKS_MUITO_POS_COMBOS = [['SAw','RnOn'],['SAw','FinWll'],['FcdCk','RnOn'],['Bmp','RnOn'],['Crd','FinWll'],['Blk','StydOn']];
// Remarks POSITIVOS simples
const REMARKS_POS = ['RnOn','FinWll','StydOn','EP','Led','Chl','AHandy','ClrRn','QAw','LdRnIn','SnLd','LdRnUp'];
// Remarks NEGATIVOS
const REMARKS_NEG = ['Fdd','NvrShwd','Outpaced','WeakFinish','SoonOutpaced','DroppedAway','DropAway'];

// ============================================================
// DETECCAO DE RETORNO POR INATIVIDADE
// ============================================================

function parseDateEntry(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  const m = dateStr.match(/(\d{1,2})([a-z]{3})(\d{2})/i);
  if (!m) return null;
  const mon = months[m[2].toLowerCase()];
  if (mon === undefined) return null;
  return new Date(2000 + parseInt(m[3]), mon, parseInt(m[1]));
}

const CLASSES_TRIAL_FLAG = ['T','HP','OR','TRIAL','SOLO'];
function isTipoTrial(classe) {
  const c = (classe||'').trim().toUpperCase();
  return CLASSES_TRIAL_FLAG.some(t => c === t || c.startsWith(t+'1') || c.startsWith(t+'2') || c.startsWith(t+'3') || c.startsWith(t+'4') || c.startsWith(t+'5') || c.startsWith(t+'6'));
}

// Retorna objeto com detalhes se o galgo voltou de inatividade longa com poucas corridas pós-trial
// Retorna null se tudo ok
function detectarRetornoInatividade(historicoCompleto, config) {
  const minCorridasRetorno = config.min_corridas_retorno != null ? config.min_corridas_retorno : 2;
  const diasThreshold = config.dias_inatividade_threshold != null ? config.dias_inatividade_threshold : 25;
  if (!historicoCompleto || historicoCompleto.length < 2) return null;

  const comDatas = historicoCompleto
    .map(l => ({ ...l, _date: parseDateEntry(l.data) }))
    .filter(l => l._date);
  if (comDatas.length < 2) return null;
  comDatas.sort((a, b) => b._date - a._date); // mais recente primeiro

  // Procurar trial/solo nas últimas 3 entradas
  let idxTrial = -1;
  for (let i = 0; i < Math.min(3, comDatas.length); i++) {
    if (isTipoTrial(comDatas[i].classe)) { idxTrial = i; break; }
  }
  if (idxTrial === -1) return null;

  // Última corrida competitiva ANTES do trial
  const antesDoTrial = comDatas.slice(idxTrial + 1).filter(l => !isTipoTrial(l.classe));
  if (!antesDoTrial.length) return null;

  const gapDias = Math.round((comDatas[idxTrial]._date - antesDoTrial[0]._date) / 86400000);
  if (gapDias < diasThreshold) return null; // gap pequeno = não é inatividade relevante

  // Corridas competitivas APÓS o trial (entre o trial e hoje)
  const aposDoTrial = comDatas.slice(0, idxTrial).filter(l => !isTipoTrial(l.classe));
  if (aposDoTrial.length >= minCorridasRetorno) return null; // já tem corridas suficientes pós-retorno

  return { gapDias, corridasAposTrial: aposDoTrial.length, minNecessario: minCorridasRetorno };
}

function parseRemarks(remarksStr) {
  if (!remarksStr) return [];
  return remarksStr.split(',').map(r => r.trim()).filter(Boolean);
}

function hasAnyRemark(remarksList, targets) {
  return targets.some(t => remarksList.some(r => r.toUpperCase().includes(t.toUpperCase())));
}

// CAMADA 1: Filtrar linhas validas do historico de cada galgo
function filtrarLinhasValidas(historico, corridaDist, corridaClasse, config) {
  const classeLevel = getClassLevel(corridaClasse);
  const distMin = corridaDist * 0.90;
  const distMax = corridaDist * 1.10;

  return historico.filter(linha => {
    // Descartar classes invalidas (HP, Trial, Solo, OR)
    const classeInvalida = ['HP','T1','T2','T3','T4','T5','T6','OR','Mdn','Trial','Solo','T','S1','S2','S3','S4','S5','S6'];
    if (classeInvalida.some(c => (linha.classe||'').toUpperCase().includes(c.toUpperCase()))) return false;

    // Distancia compativel (+/- 10%)
    if (!linha.dist || linha.dist < distMin || linha.dist > distMax) return false;

    // Classe comparavel (nao mais de 4 niveis de diferenca)
    const linhaLevel = getClassLevel(linha.classe);
    if (classeLevel && linhaLevel && Math.abs(linhaLevel - classeLevel) > 4) return false;

    // Sem acidente gravissimo
    const remarks = parseRemarks(linha.remarks);
    if (hasAnyRemark(remarks, REMARKS_DESCARTE)) return false;

    // Precisa ter CalTm valido
    if (!linha.caltm || linha.caltm <= 0) return false;

    return true;
  });
}

// CAMADA 2: Ajustar CalTm de cada linha com contexto
function ajustarCaltm(linha, corridaClasse, config) {
  let caltm = linha.caltm;
  const remarks = parseRemarks(linha.remarks);

  // Desconto por acidente (melhora o tempo aparente do galgo — ele teria sido mais rapido)
  if (hasAnyRemark(remarks, REMARKS_LEVE)) caltm -= (config.desconto_acidente_leve || 0.10);
  if (hasAnyRemark(remarks, REMARKS_MEDIO)) caltm -= (config.desconto_acidente_medio || 0.20);

  // Ajuste por nivel de classe (classe mais fraca = tempo mais facil = ajustar para cima)
  const classeLevel = getClassLevel(corridaClasse);
  const linhaLevel = getClassLevel(linha.classe);
  if (classeLevel && linhaLevel) {
    const diff = linhaLevel - classeLevel; // positivo = linha foi em classe mais fraca
    caltm += diff * (config.ajuste_classe_segundos || 0.20);
  }

  return Math.max(caltm, 10);
}

// CAMADA 3: Agregar CalTms em score unico por galgo (com peso por recencia)
function agregarCaltm(calTmsAjustados, config) {
  if (!calTmsAjustados.length) return null;
  const ultimas3 = calTmsAjustados.slice(0, 3);
  const pesos = [3, 2, 1];
  let somaPonderada = 0, somaPesos = 0;
  ultimas3.forEach((v, i) => {
    const p = pesos[i] || 1;
    somaPonderada += v * p;
    somaPesos += p;
  });
  const mediaPonderada = somaPonderada / somaPesos;
  const melhor = Math.min(...calTmsAjustados);
  const propMedia = config.proporcao_media_caltm || 0.60;
  const propMelhor = config.proporcao_melhor_caltm || 0.40;
  return mediaPonderada * propMedia + melhor * propMelhor;
}

// Score 0-100 para CalTm (menor tempo = maior score)
function normalizarCaltm(caltmGalgo, elegiveis, config) {
  const validos = elegiveis.map(g => g.caltmAgregado).filter(v => v !== null && v > 0);
  if (!validos.length) return 50;
  const melhor = Math.min(...validos);
  const teto = config.teto_diff_normalizacao || 0.50;
  const diff = caltmGalgo - melhor;
  return Math.max(0, Math.round(100 - (diff / teto) * 100));
}

// Score 0-100 para Categoria
function scoreCategoria(histClasse, corridaClasse, posicoes, config) {
  const galgoLevel = getClassLevel(histClasse);
  const corridaLevel = getClassLevel(corridaClasse);
  if (!galgoLevel || !corridaLevel) return 50;

  const diff = galgoLevel - corridaLevel;
  // diff positivo = galgo em classe mais fraca que a corrida (ex: A5 em A3) = desvantagem
  // diff negativo = galgo em classe mais forte (ex: A2 em A3) = descendo
  // diff zero = classe exata

  let baseScore;
  if (diff === 0) baseScore = 80;
  else if (diff === 1) baseScore = 90;  // 1 nivel abaixo = favorito relativo
  else if (diff === 2) baseScore = 75;  // 2 niveis abaixo = ainda favoravel
  else if (diff === -1) baseScore = 70; // 1 nivel acima = desafio
  else if (diff === -2) baseScore = 55; // 2 niveis acima = grande desafio
  else if (diff > 2) baseScore = 60;    // muito abaixo = cuidado
  else baseScore = 35;                  // muito acima = penaliza

  // Bonus por posicoes boas recentes
  const pos12 = (posicoes||[]).filter(p => p <= 2).length;
  baseScore += pos12 * 5;

  // Trava: se diferenca > max_cat_diff_caltm, penaliza forte
  const maxDiff = config.max_cat_diff_caltm || 1;
  if (Math.abs(diff) > maxDiff + 1) baseScore = Math.min(baseScore, 40);

  return Math.min(100, Math.max(0, baseScore));
}

// Perfil do galgo baseado nos bends das linhas validas
function calcularPerfil(linhasValidas) {
  const resultados = linhasValidas.slice(0, 5).map(linha => {
    const bends = linha.bends;
    if (!bends || bends.length < 2) return null;
    const nums = bends.toString().split('').map(Number).filter(n => !isNaN(n) && n > 0);
    if (nums.length < 2) return null;

    const remarks = parseRemarks(linha.remarks);
    const temAtenuante = hasAnyRemark(remarks, REMARKS_ATENUAM_BENDS);

    const primeiro = nums[0];
    const ultimo = nums[nums.length - 1];
    const diff = primeiro - ultimo; // positivo = subiu posicoes (melhorou)

    if (primeiro <= 2 && Math.abs(diff) <= 1) return 'frontrunner';
    if (diff >= 2) return 'recuperador';
    if (diff <= -2 && !temAtenuante) return 'fumador';
    return 'estavel';
  }).filter(Boolean);

  if (!resultados.length) return 'estavel';
  const contagem = {};
  resultados.forEach(p => { contagem[p] = (contagem[p]||0)+1; });
  return Object.entries(contagem).sort((a,b)=>b[1]-a[1])[0][0];
}

// Score 0-100 para Bends/Perfil
function scoreBends(galgo) {
  const perfil = galgo.perfil;
  const baseScores = { frontrunner:80, recuperador:90, estavel:60, fumador:20 };
  let score = baseScores[perfil] || 50;

  // Bonus por split bom
  const splits = (galgo.linhasValidas||[]).filter(l=>l.split>0).map(l=>l.split);
  if (splits.length) {
    const mediaSplit = splits.reduce((a,b)=>a+b,0)/splits.length;
    if (mediaSplit < 5.10) score += 10;
    else if (mediaSplit < 5.20) score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

// Score 0-100 para Remarks (media das 3 linhas mais recentes)
function scoreRemarks(linhasValidas) {
  if (!linhasValidas.length) return 50;
  let totalScore = 0;
  const linhas = linhasValidas.slice(0, 3);
  linhas.forEach(linha => {
    const remarks = parseRemarks(linha.remarks);
    let linhaScore = 50;
    // Combos muito positivos
    for (const combo of REMARKS_MUITO_POS_COMBOS) {
      if (combo.every(r => hasAnyRemark(remarks, [r]))) { linhaScore = Math.min(100, linhaScore+30); break; }
    }
    // Positivos simples
    const posEncontrados = REMARKS_POS.filter(r=>hasAnyRemark(remarks,[r]));
    linhaScore = Math.min(100, linhaScore + posEncontrados.slice(0,2).length * 15);
    // Negativos
    const negEncontrados = REMARKS_NEG.filter(r=>hasAnyRemark(remarks,[r]));
    linhaScore = Math.max(0, linhaScore - negEncontrados.length * 20);
    totalScore += linhaScore;
  });
  return Math.round(totalScore / linhas.length);
}

// Score 0-100 para BRT
function scoreBRT(galgo, elegiveis, corridaClasse, config) {
  const brts = elegiveis.map(g=>g.brt).filter(v=>v&&v>0);
  if (!brts.length || !galgo.brt) return 50;
  const melhorBrt = Math.min(...brts);
  const teto = config.teto_diff_normalizacao || 0.50;
  const diff = galgo.brt - melhorBrt;
  let score = Math.max(0, 100-(diff/teto)*100);

  // Penaliza se BRT em classe muito diferente
  const brtLevel = getClassLevel(galgo.brtClasse);
  const corridaLevel = getClassLevel(corridaClasse);
  if (brtLevel && corridaLevel && Math.abs(brtLevel-corridaLevel)>3) score *= 0.5;

  // Penaliza se muito longe da forma atual (BRT = passado glorioso, forma atual = ruim)
  if (galgo.caltmAgregado && galgo.brt) {
    const diffForma = galgo.caltmAgregado - galgo.brt;
    if (diffForma > 0.50) score *= 0.6;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

// Score 0-100 para Post Pick
function scorePostPick(trap, postPick) {
  if (!postPick) return 50;
  const picks = postPick.split('-').map(Number);
  const pos = picks.indexOf(trap);
  if (pos===0) return 100;
  if (pos===1) return 75;
  if (pos===2) return 55;
  return 30;
}

// Calcular score final de um galgo
function calcularScoreGalgo(galgo, elegiveis, corridaClasse, postPick, config) {
  const sc = {
    caltm: normalizarCaltm(galgo.caltmAgregado, elegiveis, config),
    categoria: scoreCategoria(galgo.histClasse, corridaClasse, galgo.posicoes, config),
    bends: scoreBends(galgo),
    remarks: scoreRemarks(galgo.linhasValidas),
    brt: scoreBRT(galgo, elegiveis, corridaClasse, config),
    postPick: scorePostPick(galgo.trap, postPick)
  };
  const pesos = {
    caltm: config.peso_caltm||4,
    categoria: config.peso_categoria||5,
    bends: config.peso_bends||3,
    remarks: config.peso_remarks||3,
    brt: config.peso_brt||1,
    postPick: config.peso_post_pick||0
  };
  const somaPesos = Object.values(pesos).reduce((a,b)=>a+b,0);
  const scoreFinal = Object.entries(sc).reduce((acc,[k,v])=>acc+v*(pesos[k]||0),0)/somaPesos;
  return { ...galgo, scores:sc, scoreFinal: Math.round(scoreFinal*10)/10 };
}

// Converter diferenca de score em percentual de confianca
function scoreToPct(diffScore) {
  return Math.min(95, Math.round(50+(diffScore/50)*45));
}

function calcularNivel(pct, config) {
  if (pct>=(config.pct_alta||65)) return 'alta';
  if (pct>=(config.pct_media||50)) return 'media';
  return 'baixa';
}

// FUNCAO PRINCIPAL: processa uma corrida extraida
function processarCorrida(corridaRaw, config) {
  const { hora, corrida, dist, classe, postPick, trapsCard, galgos } = corridaRaw;
  const distNum = parseInt((dist||'').replace(/[^0-9]/g,''))||0;

  // Filtros de corrida
  if (distNum < (config.dist_min||400) || distNum > (config.dist_max||575)) {
    return { hora, corrida, dist, tipo:'avb', nivel:'skip', pct:0, trapFav:0, trapUnd:0, top3:[], obs:`Distancia ${dist} fora do range`, trapsCard:trapsCard||[] };
  }
  const classesAceitas = (config.classes_aceitas||'').split(',').map(c=>c.trim());
  if (classe && !classesAceitas.includes(classe)) {
    return { hora, corrida, dist, tipo:'avb', nivel:'skip', pct:0, trapFav:0, trapUnd:0, top3:[], obs:`Classe ${classe} nao aceita`, trapsCard:trapsCard||[] };
  }

  const elegiveis = [];
  const eliminados = [];

  for (const galgo of (galgos||[])) {
    if (trapsCard && trapsCard.length && !trapsCard.includes(galgo.trap)) continue;
    const linhasValidas = filtrarLinhasValidas(galgo.historico||[], distNum, classe, config);

    // Verificar retorno de inatividade longa (trial/solo após pausa >= threshold dias)
    const inatividade = detectarRetornoInatividade(galgo.historico||[], config);
    if (inatividade) {
      eliminados.push({ trap:galgo.trap, motivo:`Ret.inatividade (${inatividade.gapDias}d parado, ${inatividade.corridasAposTrial}/${inatividade.minNecessario} corridas pos-trial)` });
      continue;
    }

    if (linhasValidas.length < 3) {
      eliminados.push({ trap:galgo.trap, motivo:`${linhasValidas.length} linha(s) valida(s)` });
      continue;
    }
    const calTmsAjustados = linhasValidas.map(l=>ajustarCaltm(l, classe, config));
    const caltmAgregado = agregarCaltm(calTmsAjustados, config);
    const classesHist = linhasValidas.map(l=>l.classe).filter(Boolean);
    const histClasse = classesHist.length ? classesHist.sort((a,b)=>classesHist.filter(c=>c===b).length-classesHist.filter(c=>c===a).length)[0] : classe;
    const posicoes = linhasValidas.slice(0,3).map(l=>l.pos).filter(p=>p>0);
    elegiveis.push({ trap:galgo.trap, nome:galgo.nome, brt:galgo.brt, brtClasse:galgo.brtClasse, histClasse, linhasValidas, caltmAgregado, posicoes, perfil:calcularPerfil(linhasValidas) });
  }

  if (elegiveis.length < 4) {
    const obsElim = eliminados.map(e=>`T${e.trap} elim.(${e.motivo})`).join('; ');
    return { hora, corrida, dist, tipo:'avb', nivel:'skip', pct:0, trapFav:0, trapUnd:0, top3:[], obs:`Menos de 4 elegiveis. ${obsElim}`, trapsCard:trapsCard||[] };
  }

  // Calcular scores com todos os elegiveis como referencia
  const comScores = elegiveis.map(g=>calcularScoreGalgo(g, elegiveis, classe, postPick, config));
  comScores.sort((a,b)=>b.scoreFinal-a.scoreFinal);

  const top3 = comScores.slice(0,3).map(g=>g.trap);
  const melhor = comScores[0];
  const pior = comScores[comScores.length-1];
  const segundo = comScores[1];
  const diffAvB = melhor.scoreFinal - pior.scoreFinal;
  const diffBack = melhor.scoreFinal - segundo.scoreFinal;
  const thresholdSkip = config.threshold_skip_avb||10;
  const thresholdBack = config.threshold_back||25;

  const obsElim = eliminados.length ? eliminados.map(e=>`T${e.trap} elim.(${e.motivo})`).join('; ')+'. ' : '';
  const ranking = comScores.map(g=>`T${g.trap}:${g.scoreFinal}`).join(' > ');

  // Narrativa curta do confronto AvB
  function gerarNarrativa(fav, und) {
    const pf = fav.perfil, pu = und.perfil;
    const nf = `T${fav.trap}`, nu = `T${und.trap}`;
    const combos = {
      'frontrunner_fumador':    `${nf} lidera desde a saída. ${nu} começa bem mas tende a cair — corrida favorável ao ${nf}.`,
      'frontrunner_estavel':    `${nf} na frente desde o início. ${nu} mantém ritmo mas dificilmente alcança — espaço deve crescer.`,
      'frontrunner_recuperador':`${nf} tenta liderar desde a saída. ${nu} vem de trás e pode ameaçar na reta — depende da margem inicial do ${nf}.`,
      'frontrunner_frontrunner':`Dois galgos que gostam de liderar. Disputa esperada pelos primeiros bends — vantagem de score para ${nf}.`,
      'recuperador_fumador':    `${nf} vem de trás progressivamente. ${nu} começa forte mas perde ritmo — ${nf} tende a passar na reta final.`,
      'recuperador_estavel':    `${nf} acelera ao longo da corrida. ${nu} constante mas sem explosão final — ${nf} favorito na reta.`,
      'recuperador_recuperador':`Ambos vêm de trás. ${nf} com score superior deve ter aceleração mais consistente.`,
      'recuperador_frontrunner':`${nu} larga na frente mas tende a cair. ${nf} vem por trás — se a vantagem inicial do ${nu} não for grande, ${nf} passa.`,
      'estavel_fumador':        `${nf} mantém posição consistente. ${nu} começa bem mas cansa — ${nf} se beneficia no final.`,
      'estavel_recuperador':    `${nu} pode ameaçar na reta. ${nf} precisa manter margem nos bends iniciais para segurar.`,
      'estavel_estavel':        `Corrida equilibrada em ritmo. Diferença de score (${(fav.scoreFinal-und.scoreFinal).toFixed(1)}pts) deve definir.`,
      'estavel_frontrunner':    `${nu} tenta liderar mas tende a cair. ${nf} consistente deve manter posição e passar.`,
      'fumador_fumador':        `Ambos começam forte mas podem perder ritmo. ${nf} com score superior deve aguentar melhor.`,
      'fumador_recuperador':    `${nf} lidera no início, ${nu} vem de trás. Risco de ${nu} alcançar — margem inicial do ${nf} é decisiva.`,
      'fumador_estavel':        `${nf} forte nos bends iniciais. ${nu} constante mas sem recuperação — ${nf} favorito se segurar o ritmo.`,
      'fumador_frontrunner':    `Dois galgos que lideram cedo. ${nf} com score maior deve prevalecer na disputa direta.`
    };
    return combos[`${pf}_${pu}`] || `${nf} (${pf}) vs ${nu} (${pu}) — diferença de ${(fav.scoreFinal-und.scoreFinal).toFixed(1)}pts no score.`;
  }

  const narrativa = gerarNarrativa(melhor, pior);

  if (diffAvB < thresholdSkip) {
    return { hora, corrida, dist, tipo:'avb', nivel:'skip', pct:0, trapFav:0, trapUnd:0, nameFav:'', nameUnd:'', top3, perfilFav:melhor.perfil, perfilUnd:pior.perfil, obs:`${obsElim}Parelha (dif ${diffAvB.toFixed(1)}pts). ${ranking}`, trapsCard:trapsCard||[], scores:comScores.map(g=>({trap:g.trap,nome:g.nome,score:g.scoreFinal,perfil:g.perfil,scores:g.scores})) };
  }

  const pct = scoreToPct(diffAvB);
  const nivel = calcularNivel(pct, config);
  const resultado = {
    hora, corrida, dist, tipo:'avb',
    trapFav:melhor.trap, nameFav:melhor.nome,
    trapUnd:pior.trap, nameUnd:pior.nome,
    pct, nivel,
    perfilFav:melhor.perfil, perfilUnd:pior.perfil,
    top3, trapsCard:trapsCard||[],
    obs:`${obsElim}${ranking}\n${narrativa}`,
    scores:comScores.map(g=>({trap:g.trap,nome:g.nome,score:g.scoreFinal,perfil:g.perfil,scores:g.scores}))
  };

  if (diffBack >= thresholdBack) {
    resultado.vencedor = { tipo:'vencedor', trapFav:melhor.trap, nameFav:melhor.nome };
  }

  return resultado;
}

// Pos-validacao de coerencia
function sanitizeEliminatedTraps(races) {
  return races.map(r => {
    const out = Object.assign({}, r);
    const cardTraps = Array.isArray(out.trapsCard) && out.trapsCard.length ? new Set(out.trapsCard) : null;
    const eliminados = new Set();
    if (cardTraps) {
      if (out.trapFav && !cardTraps.has(out.trapFav)) eliminados.add(out.trapFav);
      if (out.trapUnd && !cardTraps.has(out.trapUnd)) eliminados.add(out.trapUnd);
    }
    if (!eliminados.size) return r;
    out.nivel='skip'; out.pct=0; out.trapFav=0; out.trapUnd=0; out.nameFav=''; out.nameUnd='';
    out.obs=(out.obs||'')+' [Auto-correcao: trap invalido]';
    return out;
  });
}

// ============================================================
// ROTAS
// ============================================================
const BATCH_SIZE = 5;

function parseClaudeJson(raw) {
  // Limpa backticks de forma robusta com regex
  let clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Remove qualquer texto antes do primeiro {
  const start = clean.indexOf('{');
  if (start > 0) clean = clean.slice(start);
  // Remove qualquer texto depois do ultimo }
  const end = clean.lastIndexOf('}');
  if (end >= 0 && end < clean.length - 1) clean = clean.slice(0, end + 1);

  try { return JSON.parse(clean); } catch(e1) {
    try {
      const s1=clean.indexOf('{"races"'); const s2=clean.indexOf('{ "races"');
      const s=s1>=0?s1:s2; const e=clean.lastIndexOf('}');
      if(s>=0&&e>=0) return JSON.parse(clean.slice(s,e+1));
    } catch(e2) {
      console.error('Parse falhou:', clean.slice(0,300));
      return null;
    }
  }
  return null;
}

async function extractBatch(pdfFiles, capFiles, apiKey) {
  const content = [];
  for (const file of pdfFiles) {
    content.push({ type:'document', source:{ type:'base64', media_type:'application/pdf', data:file.buffer.toString('base64') } });
  }
  for (const file of capFiles) {
    const isImg = /\.(jpg|jpeg|png|webp)$/i.test(file.originalname);
    if(isImg) content.push({ type:'image', source:{ type:'base64', media_type:file.mimetype, data:file.buffer.toString('base64') } });
    else content.push({ type:'document', source:{ type:'base64', media_type:'application/pdf', data:file.buffer.toString('base64') } });
  }
  content.push({ type:'text', text:'Extraia os dados de TODOS os PDFs enviados. Retorne SOMENTE JSON. Zero texto antes ou depois.' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 280000);
  try {
  const data = await fetchAnthropicStream(apiKey, {
    model:'claude-sonnet-4-6', max_tokens:16000,
    system:buildExtractionPrompt(),
    messages:[{ role:'user', content }]
  });
  const raw = data.content.filter(b=>b.type==='text').map(b=>b.text).join('');
  const parsed = parseClaudeJson(raw);
  if(!parsed||!Array.isArray(parsed.races)) throw new Error('JSON de extracao invalido. Raw: '+raw.slice(0,200));
  console.log('[EXTRACAO] Lote com '+pdfFiles.length+' PDFs: '+parsed.races.length+' corridas extraidas');
  parsed.races.forEach(r => console.log('  '+r.hora+' '+r.corrida+' classe:'+r.classe+' galgos:'+(r.galgos||[]).length));
  return parsed.races;
  } finally {
    clearTimeout(timeout);
  }
}

router.post('/analyze', upload.fields([{name:'pdfs'},{name:'caps'}]), async (req, res) => {
  try {
    const user = req.user;
    if(user.analyses_limit!==999999&&user.analyses_used>=user.analyses_limit) return res.json({ limitReached:true, races:[] });

    const config = getUserConfig(user.id);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if(!apiKey) return res.status(500).json({ error:'API Key nao configurada.' });

    const pdfFiles = req.files['pdfs']||[];
    const capFiles = req.files['caps']||[];
    if(!pdfFiles.length) return res.status(400).json({ error:'Nenhum PDF enviado.' });

    // SSE: envia resultados por lote, browser recebe progressivamente
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // desativa buffer do nginx/railway

    const sendEvent = (data) => {
      try { res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch(e) {}
    };

    const batches = [];
    for(let i=0;i<pdfFiles.length;i+=BATCH_SIZE) batches.push(pdfFiles.slice(i,i+BATCH_SIZE));

    sendEvent({ type:'start', total: pdfFiles.length, batches: batches.length });

    let allRaces = [];
    const errors = [];

    for(let i=0;i<batches.length;i++) {
      sendEvent({ type:'progress', lote: i+1, totalLotes: batches.length });
      try {
        const rawRaces = await extractBatch(batches[i], i===0?capFiles:[], apiKey);
        const processadas = rawRaces.map(corridaRaw => {
          try { return processarCorrida(corridaRaw, config); }
          catch(e) { console.error('Erro motor:', corridaRaw?.hora, e.message); return null; }
        }).filter(Boolean);
        const sanitizadas = sanitizeEliminatedTraps(processadas);
        allRaces = allRaces.concat(sanitizadas);
        // Envia corridas do lote imediatamente ao browser
        sendEvent({ type:'races', races: sanitizadas });
      } catch(errBatch) {
        console.error('Erro lote '+(i+1)+':', errBatch.message);
        errors.push('Lote '+(i+1)+': '+errBatch.message);
        sendEvent({ type:'batchError', lote: i+1, error: errBatch.message });
      }
    }

    db.prepare('UPDATE users SET analyses_used=analyses_used+1 WHERE id=?').run(user.id);
    sendEvent({ type:'done', totalRaces: allRaces.length, errors: errors.length ? errors : undefined });
    res.end();
  } catch(err) {
    console.error('Erro geral:', err);
    try { res.write('data: ' + JSON.stringify({ type:'error', error: err.message }) + '\n\n'); res.end(); }
    catch(e) {}
  }
});

router.post('/session', express.json(), (req, res) => {
  try {
    const user = req.user;
    const { name, races } = req.body;
    const result = db.prepare('INSERT INTO race_sessions (user_id,name,total_races,total_avbs) VALUES (?,?,?,?)').run(user.id, name||'Sessao', races.length, races.filter(r=>r.nivel!=='skip').length);
    const sessionId = result.lastInsertRowid;
    const ins = db.prepare(`INSERT INTO races (session_id,user_id,hora,hora_br,corrida,dist,trap_fav,name_fav,trap_und,name_und,pct,nivel,perfil_fav,perfil_und,obs,need_cap,odd,valor,resultado_1,resultado_2,resultado_3,bateu) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for(const r of races) {
      const p=(r.hora||'').split(':');
      let h=parseInt(p[0]||0)-4; if(h<0)h+=24;
      const horaBr=p.length>=2?h+':'+p[1]:'';
      ins.run(sessionId,user.id,r.hora||'',horaBr,r.corrida||'',r.dist||'',r.trapFav||0,r.nameFav||'',r.trapUnd||0,r.nameUnd||'',r.pct||0,r.nivel||'',r.perfilFav||'',r.perfilUnd||'',r.obs||'',0,r.odd||null,r.valor||null,r.r1||null,r.r2||null,r.r3||null,r.hit||null);
    }
    res.json({ ok:true, sessionId });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

module.exports = router;