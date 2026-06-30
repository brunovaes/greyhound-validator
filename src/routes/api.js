const express = require('express');
const router = express.Router();
const multer = require('multer');
const fetch = require('node-fetch');
const { db, getUserConfig } = require('../db/database');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ============================================================
// PROMPT DE EXTRACAO — Claude SO le o PDF e devolve dados brutos
// Sem julgamento, sem decisao, sem ranking — apenas leitura factual
// ============================================================
function buildExtractionPrompt() {
  return `Voce e um leitor especializado de PDFs de corridas de galgos do Racing Post.
Sua UNICA funcao e extrair dados brutos de cada galgo e cada linha de historico.
ZERO julgamento, ZERO analise, ZERO decisao de favorito.
Apenas leia e transcreva o que esta no PDF.

Para cada corrida no PDF, extraia:
- hora: horario da corrida (ex: "7:42")
- corrida: nome da pista + classe (ex: "Towcester B5")
- dist: distancia em metros como string (ex: "460m")
- classe: classe da corrida (ex: "B5", "A3")
- postPick: indicacao do Racing Post no cabecalho (ex: "5-3-2", ou null se nao houver)
- trapsCard: array com numeros de trap que REALMENTE existem nessa corrida (ex: [1,2,3,5,6] se trap 4 estiver vago)
- galgos: array com dados de cada galgo

Para cada galgo:
- trap: numero do trap (inteiro)
- nome: nome do galgo
- brt: melhor tempo historico (numero, ex: 27.68)
- brtClasse: classe onde fez o BRT (ex: "A4")
- historico: array com as linhas de historico (maximo 5, da mais recente para a mais antiga)

Para cada linha de historico:
- data: data da corrida (ex: "23Jun26")
- pista: nome da pista (ex: "Sland")
- dist: distancia em metros (inteiro, ex: 450)
- trap: trap que correu nessa corrida (inteiro)
- split: tempo de saida (numero, ex: 5.16) ou null se nao informado
- bends: sequencia de posicoes nos bends (string, ex: "2554") ou null
- pos: posicao final (inteiro, ex: 2)
- by: margem para o proximo (string, ex: "1 3/4") ou null
- caltm: tempo calibrado CalTm (numero, ex: 27.77) — NUNCA usar WnTm
- wntm: tempo do vencedor WnTm (numero, ex: 27.58)
- going: condicao da pista (string, ex: "+10", "N", "-20") ou null
- classe: classe da corrida (ex: "A3", "HP", "T3")
- sp: cotacao (string, ex: "7/4F") ou null
- remarks: observacoes da corrida (string, ex: "Crd1,RnOn") ou null

IMPORTANTE: Extraia TODOS os galgos de TODAS as corridas. Nao pule nenhum.
RESPOSTA: APENAS JSON PURO. Zero texto antes ou depois.
Formato:
{"races":[{"hora":"7:42","corrida":"Star Pelaw A4","dist":"435m","classe":"A4","postPick":"5-3-2","trapsCard":[1,2,3,5,6],"galgos":[{"trap":1,"nome":"Caseys Jake","brt":26.01,"brtClasse":"A3","historico":[{"data":"26Jun26","pista":"Pelaw","dist":435,"trap":1,"split":5.76,"bends":"5355","pos":5,"by":"5 1/4","caltm":27.02,"wntm":26.60,"going":"N","classe":"A4","sp":"6/5F","remarks":"SAw,Rls,Bmp1,Fcd-Ck2"}]}]}]}`;
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
    const classeInvalida = ['HP','T1','T2','T3','T4','T5','T6','OR','Mdn','Trial','Solo'];
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
    obs:`${obsElim}${ranking}`,
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
const BATCH_SIZE = 5; // Menor batch pra nao estourar tokens com o novo formato verboso

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

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
    body:JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:16000, system:buildExtractionPrompt(), messages:[{ role:'user', content }] })
  });

  if(!response.ok) { const e=await response.json(); throw new Error(e.error?.message||('Erro API '+response.status)); }
  const data = await response.json();
  const raw = data.content.filter(b=>b.type==='text').map(b=>b.text).join('');
  const parsed = parseClaudeJson(raw);
  if(!parsed||!Array.isArray(parsed.races)) throw new Error('JSON de extracao invalido. Raw: '+raw.slice(0,200));
  return parsed.races;
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

    // FASE 1: Extracao de dados brutos via Claude
    const batches = [];
    for(let i=0;i<pdfFiles.length;i+=BATCH_SIZE) batches.push(pdfFiles.slice(i,i+BATCH_SIZE));

    let allRawRaces = [];
    const errors = [];
    for(let i=0;i<batches.length;i++) {
      const batchCaps = i===0?capFiles:[];
      try {
        const races = await extractBatch(batches[i], batchCaps, apiKey);
        allRawRaces = allRawRaces.concat(races);
      } catch(errBatch) {
        console.error(`Erro extracao lote ${i+1}:`, errBatch.message);
        errors.push(`Lote ${i+1}: ${errBatch.message}`);
      }
    }

    if(!allRawRaces.length&&errors.length) return res.status(500).json({ error:errors.join(' | ') });

    // FASE 2: Motor JS calcula tudo — zero arbitrio do Claude
    const allRaces = allRawRaces.map(corridaRaw => {
      try { return processarCorrida(corridaRaw, config); }
      catch(e) { console.error('Erro motor:', corridaRaw?.hora, e.message); return null; }
    }).filter(Boolean);

    const sanitized = sanitizeEliminatedTraps(allRaces);

    db.prepare('UPDATE users SET analyses_used=analyses_used+1 WHERE id=?').run(user.id);
    res.json({ races:sanitized, partialErrors:errors.length?errors:undefined });
  } catch(err) {
    console.error('Erro geral:', err);
    res.status(500).json({ error:err.message });
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