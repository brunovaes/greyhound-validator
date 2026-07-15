const express = require('express');
const { parseRacingPostPDF } = require('../utils/pdfParser');
const { scoreRemarksNovo } = require('../utils/remarksEngine');
const { calcularSP } = require('../utils/spEngine');
const router = express.Router();
const multer = require('multer');
const https = require('https');
const archiver = require('archiver');

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
const { db, getUserConfig, getTrapBadgeColors, saveTrapBadgeColors } = require('../db/database');

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

Para cada galgo: trap (int — do campo [N] do cabecalho), nome, brt (float), brtClasse, historico (ultimas 5 linhas mais recentes validas — necessario para regras de categoria e inatividade).

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
const REMARKS_DESCARTE = ['BrkDown', 'BroughtDown', 'Bmp&BroughtDown', 'Fell', 'Fll', 'Fall', 'KO1','KO2','KO3','KO4','KO5','KO6'];
// Remarks de acidente MEDIO
const REMARKS_MEDIO = ['Crd','FcdCk','Fcd-Ck','BlkOff'];
// Remarks de acidente LEVE
const REMARKS_LEVE = ['Bmp','SAw','MsdBrk','SlwAw','SltBmp','SltCrd'];
// Remarks que ATENUAM queda nos bends (nao classifica como fumador)
const REMARKS_ATENUAM_BENDS = ['Crd','FcdCk','Fcd-Ck','Bmp','BlkOff','Stmb','BdBmp'];
// Remarks MUITO POSITIVOS (combinacoes)
const REMARKS_MUITO_POS_COMBOS = [['SAw','RnOn'],['SAw','FinWll'],['FcdCk','RnOn'],['Fcd-Ck','RnOn'],['Bmp','RnOn'],['Crd','FinWll'],['Blk','StydOn']];
// Remarks POSITIVOS simples
const REMARKS_POS = ['RnOn','FinWll','StydOn','EP','Led','Chl','AHandy','ClrRn','QAw','LdRnIn','SnLd','LdRnUp'];
// Remarks NEGATIVOS
const REMARKS_NEG = ['Fdd','NvrShwd','Outpaced','WeakFinish','SoonOutpaced','DroppedAway','DropAway'];

// ============================================================
// CALCULO DE PERFIL A PARTIR DE BENDS (motor JS — sem Claude)
// ============================================================

// Atenuantes que justificam queda de posição (não é fumador real)
const ATENUANTES_PERFIL = ['Bmp','Crd','Blk','FcdCk','Ck','Stb','Imp','Eased','Fcd-Ck'];

function calcularPerfil(linhasValidas) {
  if (!linhasValidas || !linhasValidas.length) return 'Estavel';

  const cnt = { Frontrunner:0, Fumador:0, Recuperador:0, Estavel:0 };
  let total = 0;

  for (const linha of linhasValidas.slice(0, 5)) {
    // Extrai apenas dígitos 1-6 da sequência de bends
    const bends = (linha.bends||'').toString().replace(/[^1-6]/g,'');
    if (bends.length < 2) continue;

    const primeiro = parseInt(bends[0]);
    const ultimo   = parseInt(bends[bends.length - 1]);
    const temAtenuante = ATENUANTES_PERFIL.some(a => (linha.remarks||'').includes(a));
    total++;

    if (primeiro <= 2 && ultimo <= 2) {
      cnt.Frontrunner++;
    } else if (primeiro <= 2 && ultimo > primeiro + 1 && !temAtenuante) {
      // Fumador só sem atenuante (queda real, não causada por colisão)
      cnt.Fumador++;
    } else if (primeiro >= 4 && ultimo <= Math.max(1, primeiro - 1)) {
      cnt.Recuperador++;
    } else {
      cnt.Estavel++;
    }
  }

  if (!total) return 'Estavel';

  // Perfil dominante; em caso de empate Estavel tem prioridade
  const sorted = Object.entries(cnt).sort((a,b) => b[1]-a[1]);
  // Se dois empatados e Estavel é um deles, retorna Estavel
  if (sorted[0][1] === sorted[1][1] && sorted.find(e=>e[0]==='Estavel'&&e[1]===sorted[0][1])) return 'Estavel';
  return sorted[0][0];
}

// ============================================================
// REGRA: SEQUENCIA DE CORRIDAS ABAIXO DA CLASSE DO CARD
// ============================================================

// Retorna true se o galgo tem 3+ corridas consecutivas abaixo da classe
// do card, nas corridas ANTERIORES à mais recente (linhas 1, 2, 3...)
function temSequenciaAbaixoClasse(linhasValidas, corridaClasse) {
  if (!linhasValidas || linhasValidas.length < 4) return false;
  const corridaNivel = getClassLevel(corridaClasse);
  if (!corridaNivel) return false;
  // Pula a mais recente (index 0), verifica as anteriores
  let sequencia = 0;
  for (let i = 1; i < linhasValidas.length; i++) {
    const nivel = getClassLevel(linhasValidas[i].classe);
    if (nivel && nivel > corridaNivel) {
      sequencia++;
      if (sequencia >= 3) return true;
    } else {
      break; // sequência quebrada
    }
  }
  return false;
}

// ============================================================
// TIEBREAKER: dias entre últimas corridas
// ============================================================

function getDiasEntreUltimas(linhasValidas) {
  if (!linhasValidas || linhasValidas.length < 2) return 999;
  const d1 = parseDateEntry(linhasValidas[0].data);
  const d2 = parseDateEntry(linhasValidas[1].data);
  if (!d1 || !d2) return 999;
  return Math.round((d1 - d2) / 86400000);
}

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

// ============================================================
// REGRA: NOVO NA CATEGORIA COM INATIVIDADE
// Elimina galgo que tem muitas linhas em categoria inferior + gap grande
// ============================================================

function detectarNovoNaCategoriaComGap(linhasValidas, corridaClasse, config) {
  const maxLinhasInferiores = config.max_linhas_cat_inferior != null ? config.max_linhas_cat_inferior : 3;
  const maxDiasGap          = config.max_dias_gap_nova_cat   != null ? config.max_dias_gap_nova_cat   : 14;
  if (!linhasValidas || linhasValidas.length < 2) return null;
  const corridaNivel = getClassLevel(corridaClasse);
  if (!corridaNivel) return null;

  // Contar linhas em categoria inferior antes da ultima
  const anteriores = linhasValidas.slice(1);
  const linhasInferiores = anteriores.filter(l => {
    const lv = getClassLevel(l.classe);
    return lv && lv > corridaNivel;
  });
  if (linhasInferiores.length < maxLinhasInferiores) return null;

  const venceuUltima = linhasValidas[0].pos === 1;
  const d1 = parseDateEntry(linhasValidas[0].data);
  const d2 = parseDateEntry(linhasValidas[1].data);
  const gapDias = (d1 && d2) ? Math.round((d1 - d2) / 86400000) : 999;

  // Ex1: nao venceu a ultima -> corta independente do gap
  if (!venceuUltima) return { linhasInferiores: linhasInferiores.length, gapDias, motivo:'nao venceu ultima' };

  // Ex2: venceu + gap <= maxDiasGap -> mantem (em forma e ativo)
  if (gapDias <= maxDiasGap) return null;

  // Ex3: venceu + gap > maxDiasGap -> corta (parado demais mesmo tendo vencido)
  return { linhasInferiores: linhasInferiores.length, gapDias, motivo:'venceu mas gap longo' };
}

// CAMADA 1: Filtrar linhas validas do historico de cada galgo
function filtrarLinhasValidas(historico, corridaDist, corridaClasse, corridaPista, config, mediaBRT) {
  const classeLevel = getClassLevel(corridaClasse);
  const pistaAlvo = (corridaPista||'').trim().toLowerCase();

  return historico.filter(linha => {
    // Descartar classes invalidas (HP, Trial, Solo, OR)
    const classeInvalida = ['HP','T1','T2','T3','T4','T5','T6','OR','Mdn','Trial','Solo','T','S1','S2','S3','S4','S5','S6'];
    if (classeInvalida.some(c => (linha.classe||'').toUpperCase().includes(c.toUpperCase()))) return false;

    // Pista E distancia EXATAS — corrida de 480m na Hove so conta historico
    // tambem rodado na Hove, tambem a 480m. Sem tolerancia: pistas diferentes
    // tem configuracoes fisicas diferentes (curvas, retas) mesmo com a mesma
    // distancia nominal, e isso afeta o tempo de forma nao-comparavel.
    if (!linha.dist || linha.dist !== corridaDist) return false;
    if (pistaAlvo && (linha.pista||'').trim().toLowerCase() !== pistaAlvo) return false;

    // Classe comparavel (max_niveis_pool configuravel, default 2)
    const linhaLevel = getClassLevel(linha.classe);
    if (classeLevel && linhaLevel && Math.abs(linhaLevel - classeLevel) > (config.max_niveis_pool||2)) return false;

    // So descarta a linha inteira quando o remark tira o galgo da prova de
    // verdade (caiu, foi derrubado, quebrou) — remark de trombada comum
    // (BdBmp, Stmb, etc) NAO descarta mais: conta como perda normal, e quem
    // filtra isso e a regra de tempo logo abaixo (mais de 2s da media).
    const remarks = parseRemarks(linha.remarks);
    if (hasAnyRemark(remarks, REMARKS_DESCARTE)) return false;

    // Precisa ter CalTm valido
    if (!linha.caltm || linha.caltm <= 0) return false;

    // Descarta se o tempo ficou muito pior que a media da pista (BRT medio
    // do campo de hoje — soma dos BRT de todos os galgos do PDF / qtd) —
    // mais de 2s pior que essa media e tratado como corrida atipica (nao
    // representa o nivel real do galgo), independente do remark que teve.
    if (mediaBRT != null && (linha.caltm - mediaBRT) > 2) return false;

    return true;
  });
}

// CAMADA 2: Ajustar CalTm de cada linha com contexto
// Decide, POR GALGO (uma vez so, nao linha a linha), se o ajuste de classe
// (CAMADA 2 abaixo) deve ser pulado pra esse galgo — regra definida com o
// Bruno em 13/07. Categoria "maior"/"superior" = mais FORTE (numero MENOR:
// A1 e a mais forte de todas, A1>A2>A3...). Usa as linhas VALIDAS (as que ja
// passaram pelo filtro de elegibilidade), ordenadas mais recente primeiro.
function decidirPularAjusteClasse(linhasValidas, corridaClasse) {
  const corridaLevel = getClassLevel(corridaClasse);
  if (!corridaLevel || linhasValidas.length < 2) return false; // sem base pra decidir, aplica normal

  // Regra 1: as 2 linhas MAIS RECENTES sao categoria igual ou mais forte que hoje
  const nivel0 = getClassLevel(linhasValidas[0].classe);
  const nivel1 = getClassLevel(linhasValidas[1].classe);
  if (nivel0 && nivel1 && nivel0 <= corridaLevel && nivel1 <= corridaLevel) return true;

  // Regra 2: a corrida mais recente terminou em 1o ou 2o lugar
  const posUltima = linhasValidas[0].pos;
  if (posUltima === 1 || posUltima === 2) return true;

  return false;
}

function ajustarCaltm(linha, corridaClasse, config, pularAjusteClasse) {
  let caltm = linha.caltm;
  const remarks = parseRemarks(linha.remarks);

  // Desconto por acidente (melhora o tempo aparente do galgo — ele teria sido mais rapido)
  if (hasAnyRemark(remarks, REMARKS_LEVE)) caltm -= (config.desconto_acidente_leve || 0.10);
  if (hasAnyRemark(remarks, REMARKS_MEDIO)) caltm -= (config.desconto_acidente_medio || 0.20);

  // Ajuste por nivel de classe (classe mais fraca = tempo mais facil = ajustar
  // para cima) — pulado quando decidirPularAjusteClasse() decidiu que esse
  // galgo ja mostrou forma/nivel suficiente pra nao precisar dessa compensacao.
  if (!pularAjusteClasse) {
    const classeLevel = getClassLevel(corridaClasse);
    const linhaLevel = getClassLevel(linha.classe);
    if (classeLevel && linhaLevel) {
      const diff = linhaLevel - classeLevel; // positivo = linha foi em classe mais fraca
      caltm += diff * (config.ajuste_classe_segundos || 0.20);
    }
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

// Score 0-100 para Categoria — motor novo, usado no DESEMPATE (nao na soma
// ponderada geral). Decidido com o Bruno em 14/07/2026. Olha as 3 linhas
// mais recentes, classifica cada uma pela diferenca de nivel de classe
// contra a corrida de hoje, usa a MAIORIA (2 de 3 ou 3 de 3) — se as 3
// discordarem total entre si, cai pra linha mais recente sozinha.
// "Mais forte" = nivel de classe MENOR (A1 e a mais forte de todas).
function scoreCategoriaNova(linhasValidas, corridaClasse) {
  const corridaLevel = getClassLevel(corridaClasse);
  if (!corridaLevel) return 50;

  function classificar(linha) {
    const nivel = getClassLevel(linha.classe);
    if (!nivel) return null;
    const diff = corridaLevel - nivel; // positivo = linha foi em classe MAIS FORTE
    if (diff === 0) return 0;
    if (diff >= 2) return 2;    // 2+ niveis mais forte
    if (diff === 1) return 1;   // 1 nivel mais forte
    if (diff === -1) return -1; // 1 nivel mais fraco
    if (diff === -2) return -2; // 2 niveis mais fraco
    return -3;                  // 3+ niveis mais fraco
  }

  const TABELA = { '0':70, '1':60, '2':50, '-1':40, '-2':30, '-3':20 };

  const linhas3 = (linhasValidas||[]).slice(0, 3);
  const classificacoes = linhas3.map(classificar).filter(c => c !== null);
  if (!classificacoes.length) return 50;

  const contagem = {};
  classificacoes.forEach(c => { contagem[c] = (contagem[c]||0) + 1; });
  const maisComum = Object.entries(contagem).sort((a,b) => b[1]-a[1])[0];

  const categoriaFinal = maisComum[1] >= 2 ? parseInt(maisComum[0]) : classificacoes[0];
  return TABELA[String(categoriaFinal)] || 50;
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

    // Diferencas entre curvas CONSECUTIVAS (nao so primeiro vs ultimo) —
    // negativo = melhorou naquela curva, positivo = piorou.
    const diffs = [];
    for (let i = 1; i < nums.length; i++) diffs.push(nums[i] - nums[i-1]);
    const primeiro = nums[0];
    const ultimo = nums[nums.length - 1];
    const terminouMelhor = ultimo < primeiro;
    const terminouPior = ultimo > primeiro;
    const nuncaMelhorou = diffs.every(d => d >= 0);   // nenhuma curva com diff negativo
    const nuncaPiorou   = diffs.every(d => d <= 0);   // nenhuma curva com diff positivo
    const qtdPrimeiro = nums.filter(n => n === 1).length;

    // Regra definida com o Bruno em 13/07 — ordem importa (a 1a que bater vence):
    if (qtdPrimeiro >= 3) return 'avassalador';                                  // ficou em 1o quase o tempo todo
    if (nuncaPiorou && terminouMelhor) return 'modoturbo';                       // so melhora, direto, do inicio ao fim
    if (nuncaMelhorou && terminouPior && !temAtenuante) return 'fumador';        // so piora/empata, sem desculpa
    if (terminouMelhor) return 'recuperador';                                    // melhorou no total, mas nao foi so-melhora
    return 'estavel';
  }).filter(Boolean);

  if (!resultados.length) return 'estavel';
  const contagem = {};
  resultados.forEach(p => { contagem[p] = (contagem[p]||0)+1; });
  return Object.entries(contagem).sort((a,b)=>b[1]-a[1])[0][0];
}

// Score 0-100 para Bends/Perfil — perfil calculado pelo motor JS
function scoreBends(galgo) {
  const perfil = (calcularPerfil(galgo.linhasValidas)||'Estavel').toLowerCase();
  const baseScores = { avassalador:80, modoturbo:80, recuperador:65, estavel:50, fumador:25 };
  return baseScores[perfil] || 50;
}

// Score 0-100 para Split — mesma logica do CalTm: compara a media do galgo
// contra o MELHOR (mais rapido) da corrida, nao contra numero fixo. Criterio
// separado desde 14/07/2026 (antes era um bonus fixo escondido no Bends).
function scoreSplit(splitGalgo, elegiveis, config) {
  const validos = elegiveis.map(g => g.splitMedio).filter(v => v !== null && v > 0);
  if (!validos.length || !splitGalgo) return 50;
  const melhor = Math.min(...validos);
  const teto = config.teto_diff_split || 0.15;
  const diff = splitGalgo - melhor;
  return Math.max(0, Math.round(100 - (diff / teto) * 100));
}

// Score 0-100 para Remarks (media das 3 linhas mais recentes)
// Score 0-100 para Remarks — motor novo (Merito + Corrida Escondida),
// especificacao fechada com o Bruno em 13/07/2026. Mantem o nome/assinatura
// da funcao antiga de proposito, pra nao precisar mexer no ponto de chamada
// (calcularScoreGalgo continua chamando scoreRemarks() normalmente).
function scoreRemarks(linhasValidas) {
  return scoreRemarksNovo(linhasValidas);
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
    // categoria: virou criterio com peso proprio em 14/07/2026 (antes so
    // aparecia pra referencia/desempate) — decidido com o Bruno.
    categoria: scoreCategoriaNova(galgo.linhasValidas, corridaClasse),
    bends: scoreBends(galgo),
    split: scoreSplit(galgo.splitMedio, elegiveis, config),
    remarks: scoreRemarks(galgo.linhasValidas),
    sp: calcularSP(galgo.linhasValidas),
    brt: scoreBRT(galgo, elegiveis, corridaClasse, config),
    postPick: scorePostPick(galgo.trap, postPick)
  };
  const pesos = {
    caltm: config.peso_caltm||5,
    categoria: config.peso_categoria||4,
    bends: config.peso_bends||3,
    split: config.peso_split||3,
    remarks: config.peso_remarks||2,
    sp: config.peso_sp||3,
    brt: config.peso_brt||1,
    postPick: config.peso_post_pick||2
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

// Mapeia as linhas de historico de um galgo pro formato slim usado nos modais
// (mesma logica ja usada em histFav/histUnd, agora reaproveitada pra histAll)
function mapHistLinhas(linhasValidas) {
  return (linhasValidas||[]).slice(0,5).map(h=>({data:h.data,pista:h.pista,dist:h.dist,trap:h.trap,split:h.split,bends:h.bends,pos:h.pos,classe:h.classe,caltm:h.caltm,sp:h.sp,gng:h.gng,peso:h.peso,vencedorTm:h.vencedorTm,remarks:(h.remarks||'').substring(0,60)}));
}

// FUNCAO PRINCIPAL: processa uma corrida extraida
function processarCorrida(corridaRaw, config) {
  const { hora, corrida, dist, classe, postPick, trapsCard, galgos, dataCard, trackFull, trapsConfiaveis } = corridaRaw;
  const distNum = parseInt((dist||'').replace(/[^0-9]/g,''))||0;

  // Filtros de corrida
  if (distNum < (config.dist_min||400) || distNum > (config.dist_max||575)) {
    return { hora, corrida, dist, tipo:'avb', nivel:'skip', pct:0, trapFav:0, trapUnd:0, top3:[], obs:`Distancia ${dist} fora do range`, trapsCard:trapsCard||[], trapsConfiaveis, eliminados:[], dataCard, trackFull };
  }
  const classesAceitas = (config.classes_aceitas||'').split(',').map(c=>c.trim());
  if (classe && !classesAceitas.includes(classe)) {
    return { hora, corrida, dist, tipo:'avb', nivel:'skip', pct:0, trapFav:0, trapUnd:0, top3:[], obs:`Classe ${classe} nao aceita`, trapsCard:trapsCard||[], trapsConfiaveis, eliminados:[], dataCard, trackFull };
  }

  const elegiveis = [];
  const eliminados = [];

  const pistaAtual = (corrida||'').split(' ')[0] || '';
  const minCorridasUteis = config.min_corridas_uteis || 3;

  // "Media da pista" (o BRT medio do campo de hoje) — soma o BRT de TODOS os
  // galgos do PDF (o card inteiro, nao so os elegiveis) e divide pela
  // quantidade. Usado como referencia pra descartar linha de historico com
  // tempo muito fora da curva (ver filtrarLinhasValidas).
  const brtsDoCard = (galgos||[]).map(g => g.brt).filter(v => v && v > 0);
  const mediaBRT = brtsDoCard.length ? brtsDoCard.reduce((a,b)=>a+b,0) / brtsDoCard.length : null;

  for (const galgo of (galgos||[])) {
    if (trapsCard && trapsCard.length && !trapsCard.includes(galgo.trap)) continue;
    const linhasValidas = filtrarLinhasValidas(galgo.historico||[], distNum, classe, pistaAtual, config, mediaBRT);

    // Verificar retorno de inatividade longa (trial/solo após pausa >= threshold dias)
    const inatividade = detectarRetornoInatividade(galgo.historico||[], config);
    if (inatividade) {
      eliminados.push({ trap:galgo.trap, motivo:`Ret.inatividade (${inatividade.gapDias}d parado, ${inatividade.corridasAposTrial}/${inatividade.minNecessario} corridas pos-trial)` });
      continue;
    }

    // Verificar: novo na categoria + gap grande entre últimas corridas
    const novaCategoria = detectarNovoNaCategoriaComGap(linhasValidas, classe, config);
    if (novaCategoria) {
      console.log(`[NOVA_CAT] ${hora} ${corrida}: T${galgo.trap} eliminado — ${novaCategoria.linhasInferiores} linhas cat.inferior + gap ${novaCategoria.gapDias}d`);
      eliminados.push({ trap:galgo.trap, motivo:`Novo na cat. (${novaCategoria.linhasInferiores} linhas inferiores + ${novaCategoria.gapDias}d de gap)` });
      continue;
    }

    if (linhasValidas.length < minCorridasUteis) {
      eliminados.push({ trap:galgo.trap, motivo:`${linhasValidas.length} linha(s) na pista/distancia exata (min. ${minCorridasUteis})` });
      continue;
    }
    const pularAjusteClasse = decidirPularAjusteClasse(linhasValidas, classe);
    const calTmsAjustados = linhasValidas.map(l=>ajustarCaltm(l, classe, config, pularAjusteClasse));
    const caltmAgregado = agregarCaltm(calTmsAjustados, config);
    const classesHist = linhasValidas.map(l=>l.classe).filter(Boolean);
    const histClasse = classesHist.length ? classesHist.sort((a,b)=>classesHist.filter(c=>c===b).length-classesHist.filter(c=>c===a).length)[0] : classe;
    const posicoes = linhasValidas.slice(0,3).map(l=>l.pos).filter(p=>p>0);
    const splitsValidos = linhasValidas.filter(l=>l.split>0).map(l=>l.split);
    const splitMedio = splitsValidos.length ? splitsValidos.reduce((a,b)=>a+b,0)/splitsValidos.length : null;
    elegiveis.push({ trap:galgo.trap, nome:galgo.nome, brt:galgo.brt, brtClasse:galgo.brtClasse, histClasse, linhasValidas, caltmAgregado, splitMedio, posicoes, perfil:calcularPerfil(linhasValidas) });
  }

  if (elegiveis.length < 4) {
    return { hora, corrida, dist, tipo:'avb', nivel:'skip', pct:0, trapFav:0, trapUnd:0, top3:[], obs:`Galgos insuficientes com histórico válido para esta corrida.`, trapsCard:trapsCard||[], trapsConfiaveis, eliminados, dataCard, trackFull };
  }

  // Calcular scores com todos os elegiveis como referencia
  const comScores = elegiveis.map(g=>calcularScoreGalgo(g, elegiveis, classe, postPick, config));
  // Sort com tiebreaker quando scores muito próximos (<= 5pts)
  comScores.sort((a,b) => {
    const diff = b.scoreFinal - a.scoreFinal;
    if (Math.abs(diff) > 5) return diff;
    // Tiebreaker 1: melhor nota de CalTm (decidido com o Bruno 14/07/2026)
    const caltmA = a.scores.caltm, caltmB = b.scores.caltm;
    if (Math.abs(caltmA-caltmB) > 1) return caltmB - caltmA;
    // Tiebreaker 2: melhor nota de Categoria
    const catA = a.scores.categoria, catB = b.scores.categoria;
    if (Math.abs(catA-catB) > 1) return catB - catA;
    return diff;
  });

  const top3 = comScores.slice(0,3).map(g=>g.trap);

  // Regra: melhor não pode ter 3+ corridas consecutivas abaixo da classe do card
  let idxMelhor = 0;
  while (idxMelhor < comScores.length - 2) {
    const candidato = comScores[idxMelhor];
    if (temSequenciaAbaixoClasse(candidato.linhasValidas, classe)) {
      console.log(`[MELHOR] ${hora} ${corrida}: T${candidato.trap} ${candidato.nome||''} descartado como melhor — 3+ corridas abaixo de ${classe} antes da ultima`);
      idxMelhor++;
    } else {
      break;
    }
  }
  const melhor = comScores[idxMelhor];
  const segundo = comScores[idxMelhor === 0 ? 1 : 0]; // segundo = próximo após melhor

  // Regra: se o underdog (pior do ranking) venceu a última corrida válida,
  // descarta ele como oponente e usa o penúltimo para o AvB
  // Também garante que pior != melhor
  const idxPiorInicial = comScores.length - 1;
  let pior = comScores[idxPiorInicial];
  let notaReanalise = '';
  // Se pior == melhor (não deveria, mas garante)
  let idxPior = idxPiorInicial;
  if (idxPior === idxMelhor) idxPior = Math.max(0, idxPior - 1);
  pior = comScores[idxPior];

  if (comScores.length >= 3) {
    const ultimaLinhaPior = pior.linhasValidas && pior.linhasValidas[0];
    if (ultimaLinhaPior && ultimaLinhaPior.pos === 1) {
      // Usar penúltimo (evitando colidir com melhor)
      let novoPiorIdx = idxPior - 1;
      if (novoPiorIdx === idxMelhor) novoPiorIdx--;
      if (novoPiorIdx >= 0 && novoPiorIdx < comScores.length) {
        const penultimo = comScores[novoPiorIdx];
        console.log(`[AvB] ${hora} ${corrida}: T${pior.trap} venceu ultima — reanalise com T${penultimo.trap} como underdog`);
        notaReanalise = ` Nota: T${pior.trap} venceu última — reanalise vs T${penultimo.trap}.`;
        pior = penultimo;
      }
    }
  }

  const diffAvB = melhor.scoreFinal - pior.scoreFinal;
  const diffBack = melhor.scoreFinal - segundo.scoreFinal;
  const thresholdSkip = config.threshold_skip_avb||10;
  const thresholdBack = config.threshold_back||25;

  // obsElim mantido apenas internamente para debug no console
  const obsElimDebug = eliminados.length ? eliminados.map(e=>`T${e.trap}:(${e.motivo})`).join('; ') : '';
  if (obsElimDebug) console.log(`[ELIM] ${hora} ${corrida}: ${obsElimDebug}`);
  const ranking = 'Chegada dos Ativos: ' + comScores.map(g=>g.trap).join('-');

  // Narrativa rica do confronto AvB — tom narrativo
  function gerarNarrativaRica(fav, und, corrClasse) {
    const pf = (fav.perfil||'estavel').toLowerCase();
    const pu = (und.perfil||'estavel').toLowerCase();
    const nf = `T${fav.trap}`, nu = `T${und.trap}`;

    // Contexto de CalTm
    let ctxCalTm = '';
    if (fav.caltmAgregado && und.caltmAgregado) {
      const diffCt = und.caltmAgregado - fav.caltmAgregado;
      if (diffCt >= 0.15) ctxCalTm = `carregando uma vantagem real de tempo (+${diffCt.toFixed(2)}s no agregado)`;
      else if (diffCt >= 0.10) ctxCalTm = `com leve superioridade de ritmo (+${diffCt.toFixed(2)}s)`;
      else if (diffCt <= -0.10) ctxCalTm = `apesar de ${nu} mostrar tempo ligeiramente melhor (${Math.abs(diffCt).toFixed(2)}s)`;
    }

    // Contexto de categoria
    const favLv = getClassLevel(fav.histClasse), undLv = getClassLevel(und.histClasse);
    const corrLv = getClassLevel(corrClasse);
    let ctxCat = '';
    if (favLv && corrLv) {
      if (favLv < corrLv) ctxCat = `vindo de ${fav.histClasse} — um degrau acima desta categoria`;
      else if (favLv > corrLv) ctxCat = `em ascensão vindo de ${fav.histClasse}`;
    }
    if (!ctxCat && undLv && corrLv && undLv < corrLv) {
      ctxCat = `enquanto ${nu} desce de ${und.histClasse} e pode surpreender`;
    }

    // Contexto de remarks recentes do favorito
    const remarksRecentes = (fav.linhasValidas||[]).slice(0,2).flatMap(l=>parseRemarks(l.remarks));
    const temComboPos = REMARKS_MUITO_POS_COMBOS.some(c=>c.every(r=>hasAnyRemark(remarksRecentes,[r])));
    const temPos = REMARKS_POS.some(r=>hasAnyRemark(remarksRecentes,[r]));
    const temNeg = REMARKS_NEG.some(r=>hasAnyRemark(remarksRecentes,[r]));
    let ctxRemarks = '';
    if (temComboPos) ctxRemarks = `O histórico recente de ${nf} é especialmente encorajador — combinou bem após contratempos.`;
    else if (temPos) ctxRemarks = `${nf} vem encerrando corridas com força, o que reforça a confiança na escolha.`;
    else if (temNeg) ctxRemarks = `Vale atenção: ${nf} mostrou sinais de queda de ritmo nas últimas saídas.`;

    // Narrativas por combinação de perfil
    const combos = {
      frontrunner_fumador:     `${nf} é o tipo que decide a corrida nos primeiros metros — dispara, crava posição e não deixa espaço. ${nu} também arranca bem, mas a história mostra que perde força quando a exigência aumenta nos bends finais. ${nf} deve controlar do início ao fim${ctxCalTm ? ', ' + ctxCalTm : ''}${ctxCat ? ', ' + ctxCat : ''}.`,
      frontrunner_estavel:     `${nf} vai buscar a frente desde a saída e tende a não ceder. ${nu} é constante e disciplinado, mas raramente tem o impulso para alcançar quem lidera com folga. Se ${nf} abrir margem nos primeiros bends${ctxCalTm ? ' — e o tempo sugere que sim (' + ctxCalTm + ')' : ''}, a corrida deve ser controlada${ctxCat ? ' — e ' + ctxCat + ' pesa a favor' : ''}.`,
      frontrunner_recuperador: `A dinâmica aqui é clássica: ${nf} tenta cravar a liderança cedo enquanto ${nu} tenta recuperar posições ao longo da prova. Tudo depende da margem que ${nf} consegue construir nos primeiros bends${ctxCalTm ? '. ' + ctxCalTm.charAt(0).toUpperCase() + ctxCalTm.slice(1) + ' apoia' : ''}${ctxCat ? ' — ' + ctxCat : ''}.`,
      frontrunner_frontrunner: `Dois galgos que querem a frente — a largada vai definir quem dita o ritmo. O score favorece ${nf}${ctxCalTm ? ', que também apresenta ' + ctxCalTm : ''}${ctxCat ? ', além de ' + ctxCat : ''}. Disputa direta esperada na saída, mas ${nf} tem argumentos para sair na frente.`,
      recuperador_fumador:     `${nf} cresce ao longo da corrida e chega mais forte na reta. ${nu} tende a fazer uma largada vistosa mas vai perdendo o fio à medida que a prova avança. O momento do cruzamento entre os dois costuma ser decisivo — e ${nf} costuma chegar em melhor estado físico${ctxCalTm ? ', ' + ctxCalTm : ''}${ctxCat ? '. ' + ctxCat.charAt(0).toUpperCase() + ctxCat.slice(1) : ''}.`,
      recuperador_estavel:     `${nf} não precisa estar na frente para vencer — ele cresce e vai buscar. ${nu} é sólido e regular, mas sem a explosão para reagir quando ${nf} aparece por fora. A tendência é que ${nf} domine a parte final da corrida${ctxCalTm ? ', ' + ctxCalTm : ''}${ctxCat ? ' — ' + ctxCat : ''}.`,
      recuperador_recuperador: `Dois recuperadores — a diferença está em quem acelera com mais consistência. ${nf} apresenta histórico de aceleração mais assertivo${ctxCalTm ? ', reforçado por ' + ctxCalTm : ''}${ctxCat ? '. ' + ctxCat.charAt(0).toUpperCase() + ctxCat.slice(1) : ''}. Corrida que pode ser decidida no último bend.`,
      recuperador_frontrunner: `${nu} vai tentar escapar pela frente, mas tende a ceder quando a exigência aumenta. ${nf} vem de trás, cresce e pressiona — se a margem inicial de ${nu} não for grande, a reta final pertence a ${nf}${ctxCalTm ? '. ' + ctxCalTm.charAt(0).toUpperCase() + ctxCalTm.slice(1) : ''}${ctxCat ? ' — ' + ctxCat : ''}.`,
      estavel_fumador:         `${nf} é constante e não desperdiça energia. ${nu} começa bem mas vai dando sinais de fadiga quando a prova exige mais. Essa diferença de consistência tende a aparecer na parte final${ctxCalTm ? ', e ' + ctxCalTm + ' confirma a vantagem' : ''}${ctxCat ? '. ' + ctxCat.charAt(0).toUpperCase() + ctxCat.slice(1) : ''}.`,
      estavel_recuperador:     `${nf} precisa construir margem nos bends iniciais, pois ${nu} vai crescer na reta. A consistência de ${nf} é o trunfo — se não ceder espaço no meio da corrida, deve segurar${ctxCalTm ? '. ' + ctxCalTm.charAt(0).toUpperCase() + ctxCalTm.slice(1) + ' dá suporte a essa leitura' : ''}${ctxCat ? ' — ' + ctxCat : ''}.`,
      estavel_estavel:         `Corrida de ritmo — nenhum dos dois tem mudança brusca de posição. O que vai separar é a consistência acumulada de tempo e posicionamento. ${nf} leva vantagem no score${ctxCalTm ? ' e ' + ctxCalTm : ''}${ctxCat ? ', além de ' + ctxCat : ''}. Disputa equilibrada mas com ${nf} como referência.`,
      estavel_frontrunner:     `${nu} vai tentar impor o ritmo desde a saída, mas o histórico mostra desgaste ao longo da prova. ${nf}, constante e eficiente, tende a se beneficiar dessa queda${ctxCalTm ? '. ' + ctxCalTm.charAt(0).toUpperCase() + ctxCalTm.slice(1) : ''}${ctxCat ? ' — ' + ctxCat : ''}.`,
      fumador_fumador:         `Os dois têm punch na saída mas podem desacelerar. ${nf} tem melhor histórico de sustentar o ritmo${ctxCalTm ? ' e ' + ctxCalTm + ' reforça isso' : ''}${ctxCat ? '. ' + ctxCat.charAt(0).toUpperCase() + ctxCat.slice(1) : ''}. Corrida que pode ser decidida mais cedo do que parece.`,
      fumador_recuperador:     `${nf} vai tentar decidir nos primeiros bends — se abrir margem suficiente, ${nu} não terá tempo de alcançar. A chave está em quão forte ${nf} sai${ctxCalTm ? ', e ' + ctxCalTm + ' indica capacidade para isso' : ''}${ctxCat ? ' — ' + ctxCat : ''}.`,
      fumador_estavel:         `${nf} pode impressionar no início. ${nu} é mais regular mas sem explosão para reagir a uma largada dominante. Se ${nf} manter o ritmo além dos primeiros bends${ctxCalTm ? ' — e o tempo médio sugere que pode (' + ctxCalTm + ')' : ''}, a vantagem deve ser mantida${ctxCat ? '. ' + ctxCat.charAt(0).toUpperCase() + ctxCat.slice(1) : ''}.`,
      fumador_frontrunner:     `Dois galgos explosivos na saída — mas ${nf} tem consistência superior no score${ctxCalTm ? ' e ' + ctxCalTm : ''}${ctxCat ? ', além de ' + ctxCat : ''}. O duelo pela frente deve ser intenso mas breve — ${nf} deve sair vencedor do confronto direto.`
    };

    const chave = `${pf}_${pu}`;
    let narrativa = combos[chave] || `${nf} (${pf}) parte como favorito sobre ${nu} (${pu})${ctxCalTm ? ', ' + ctxCalTm : ''}${ctxCat ? ' — ' + ctxCat : ''}.`;

    // Append remarks ao final
    if (ctxRemarks) narrativa += ' ' + ctxRemarks;

    return `AvB ${nf} vs ${nu}: ` + narrativa;
  }

  const narrativa = gerarNarrativaRica(melhor, pior, classe);

  if (diffAvB < thresholdSkip) {
    return { hora, corrida, dist, tipo:'avb', nivel:'skip', pct:0, trapFav:0, trapUnd:0, nameFav:'', nameUnd:'', top3, perfilFav:melhor.perfil, perfilUnd:pior.perfil, obs:`${ranking} | Pontuações muito próximas — margem insuficiente para indicação confiável.${notaReanalise}`, trapsCard:trapsCard||[], trapsConfiaveis, scores:comScores.map(g=>({trap:g.trap,nome:g.nome,score:g.scoreFinal,perfil:g.perfil,scores:g.scores})), histAll:comScores.map(g=>({trap:g.trap,nome:g.nome,historico:mapHistLinhas(g.linhasValidas)})), eliminados, postPick:postPick||'', dataCard, trackFull };
  }

  const pct = scoreToPct(diffAvB);
  const nivel = calcularNivel(pct, config);
  const resultado = {
    hora, corrida, dist, tipo:'avb',
    trapFav:melhor.trap, nameFav:melhor.nome,
    trapUnd:pior.trap, nameUnd:pior.nome,
    pct, nivel,
    perfilFav:melhor.perfil, perfilUnd:pior.perfil,
    top3, trapsCard:trapsCard||[], trapsConfiaveis,
    obs:`${ranking} | ${narrativa}${notaReanalise}`,
    histFav:mapHistLinhas(melhor.linhasValidas),
    histUnd:mapHistLinhas(pior.linhasValidas),
    histAll:comScores.map(g=>({trap:g.trap,nome:g.nome,historico:mapHistLinhas(g.linhasValidas)})),
    scores:comScores.map(g=>({trap:g.trap,nome:g.nome,score:g.scoreFinal,perfil:g.perfil,scores:g.scores})),
    raceCard:(galgos||[]).map(g=>({trap:g.trap,nome:g.nome})),
    eliminados,
    postPick:postPick||'',
    dataCard,
    trackFull
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
    if (eliminados.size) {
      out.nivel='skip'; out.pct=0; out.trapFav=0; out.trapUnd=0; out.nameFav=''; out.nameUnd='';
      out.obs=(out.obs||'')+' [Auto-correcao: trap invalido]';
    }
    // trapsConfiaveis===false: o badge de trap do PDF nao pode ser lido com
    // confianca (card com trap ausente + falha ao ler a imagem, ou imagem
    // ambigua) — nao forca skip (pode estar certo mesmo assim), mas avisa
    // visivelmente em vez de deixar passar em silencio, pra revisao manual.
    if (out.trapsConfiaveis === false) {
      out.obs=(out.obs||'')+' [⚠️ Traps podem estar incorretos — nao foi possivel confirmar pela imagem do card]';
    }
    return out;
  });
}

// ============================================================
// ROTAS
// ============================================================
const fs = require('fs');
const PDF_PATH = process.env.PDF_PATH || require('path').join(__dirname, '../../public/pdfs');

function fmtDate(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function getPdfFolder(date) {
  // Estritamente a data informada (ou hoje, por padrao) — sem fallback pra
  // ontem/amanha. Se nao existir PDF de hoje, quem chama trata como vazio
  // e a tela mostra a mensagem padrao de "sem corridas disponiveis hoje".
  // "Hoje" precisa ser BRT, nao UTC cru — Railway roda em UTC, entao entre
  // 21h e 23h59 BRT o new Date() do servidor ja virou o dia seguinte e essa
  // funcao olhava pra pasta errada (vazia), mesmo com os PDFs certos no disco.
  const base = date ? new Date(date) : new Date(Date.now() - 3 * 60 * 60 * 1000);
  return require('path').join(PDF_PATH, fmtDate(base));
}

function readFolderPdfs(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => ({
      buffer: fs.readFileSync(require('path').join(folder, f)),
      name: f,
      originalname: f
    }));
}

router.get('/pdfs/hoje/zip', (req, res) => {
  const folder = getPdfFolder();
  const files = readFolderPdfs(folder);
  if (!files.length) return res.status(404).json({ error: 'Nenhum PDF encontrado para hoje' });
  const d = new Date();
  const today = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="PDFs_${today}.zip"`);
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', e => { console.error('[ZIP]', e.message); });
  archive.pipe(res);
  for (const f of files) {
    archive.append(f.buffer, { name: f.name });
  }
  archive.finalize();
});


router.get('/pdfs/hoje', (req, res) => {
  const folder = getPdfFolder();
  const files = readFolderPdfs(folder);
  const dateFound = require('path').basename(folder);
  res.json({ count: files.length, folder, date: dateFound, files: files.map(f=>f.name) });
});



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
  // Parser determinístico — zero tokens de API
  const corridas = [];
  // Paleta calibrada do banco (cai pro DEFAULT_TRAP_COLORS do proprio
  // pdfParser.js se a tabela ainda nao tiver nada). Carregada uma vez por
  // lote e atualizada em memoria a cada card completo (6 galgos) processado
  // nesse MESMO lote, pra ja se beneficiar da calibracao mais fresca sem
  // esperar o proximo lote.
  let palette = getTrapBadgeColors() || undefined;
  for (const pdfFile of pdfFiles) {
    try {
      const buf = Buffer.from(pdfFile.buffer || pdfFile.data, pdfFile.buffer ? undefined : 'base64');
      const result = await parseRacingPostPDF(buf, palette);
      if (result) {
        corridas.push(result);
        if (!result.trapsConfiaveis) {
          console.warn('[PARSER] traps NAO confiaveis (badge nao bateu com a paleta) — usando ordem sequencial de fallback:', result.corrida, result.hora);
        }
        if (result.badgeCalibration) {
          saveTrapBadgeColors(result.badgeCalibration);
          palette = Object.assign({}, palette, result.badgeCalibration);
          console.log('[PARSER] paleta de traps recalibrada a partir de card completo:', result.corrida, result.hora);
        }
      }
      else console.warn('[PARSER] PDF sem resultado:', pdfFile.name || '?');
    } catch(e) {
      console.error('[PARSER] Erro ao parsear PDF:', pdfFile.name || '?', e.message);
    }
  }
  return corridas;
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

    // Se não vieram PDFs no upload, tenta ler da pasta do dia
    let pdfsParaAnalise = pdfFiles;
    let usandoPasta = false;
    if (!pdfFiles.length) {
      const folder = getPdfFolder();
      const folderPdfs = readFolderPdfs(folder);
      if (!folderPdfs.length) return res.status(400).json({ error: 'Nenhum PDF enviado e nenhum PDF encontrado na pasta de hoje (' + folder + ').' });
      pdfsParaAnalise = folderPdfs;
      usandoPasta = true;
    }

    // SSE: envia resultados por lote, browser recebe progressivamente
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // desativa buffer do nginx/railway

    const sendEvent = (data) => {
      try { res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch(e) {}
    };

    if (usandoPasta) sendEvent({ type:'info', msg: pdfsParaAnalise.length + ' PDFs encontrados na pasta de hoje' });

    const batches = [];
    for(let i=0;i<pdfsParaAnalise.length;i+=BATCH_SIZE) batches.push(pdfsParaAnalise.slice(i,i+BATCH_SIZE));

    sendEvent({ type:'start', total: pdfsParaAnalise.length, batches: batches.length });

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

// Analise automatica — roda sozinha no servidor, sem ninguem precisar abrir
// o navegador. Pedido do Bruno em 15/07/2026: antes so a coleta de PDF era
// automatica; quem realmente rodava o motor e criava a sessao do dia era
// sempre disparado pelo navegador (manual ou autoCheckAndAnalyze no load).
// Reaproveita a MESMA logica de /api/analyze (extrai+processa) e /api/session
// (salva), so que direto, sem precisar de requisicao HTTP nenhuma no meio.
async function rodarAnaliseAutomatica(date, userId) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, erro: 'API Key nao configurada' };

  const config = getUserConfig(userId);
  const folder = getPdfFolder(date);
  const folderPdfs = readFolderPdfs(folder);
  if (!folderPdfs.length) return { ok: false, erro: 'Nenhum PDF encontrado na pasta de ' + date };

  const dateParts = date.split('-'); // date vem como YYYY-MM-DD
  const sessionName = 'Races ' + dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0];
  const jaExiste = db.prepare('SELECT id FROM race_sessions WHERE user_id=? AND name=?').get(userId, sessionName);
  if (jaExiste) return { ok: false, erro: 'Sessao "' + sessionName + '" ja existe (id ' + jaExiste.id + ')', jaExistia: true };

  const batches = [];
  for (let i = 0; i < folderPdfs.length; i += BATCH_SIZE) batches.push(folderPdfs.slice(i, i + BATCH_SIZE));

  let allRaces = [];
  const errors = [];
  for (let i = 0; i < batches.length; i++) {
    try {
      const rawRaces = await extractBatch(batches[i], [], apiKey);
      const processadas = rawRaces.map(corridaRaw => {
        try { return processarCorrida(corridaRaw, config); }
        catch(e) { console.error('[ANALISE-AUTO] Erro motor:', corridaRaw?.hora, e.message); return null; }
      }).filter(Boolean);
      allRaces = allRaces.concat(sanitizeEliminatedTraps(processadas));
    } catch(errBatch) {
      console.error('[ANALISE-AUTO] Erro lote ' + (i+1) + ':', errBatch.message);
      errors.push('Lote ' + (i+1) + ': ' + errBatch.message);
    }
  }
  if (!allRaces.length) return { ok: false, erro: 'Nenhuma corrida processada com sucesso', errors };

  const result = db.prepare('INSERT INTO race_sessions (user_id,name,total_races,total_avbs) VALUES (?,?,?,?)').run(userId, sessionName, allRaces.length, allRaces.filter(r=>r.nivel!=='skip').length);
  const sessionId = result.lastInsertRowid;
  const ins = db.prepare(`INSERT INTO races (session_id,user_id,hora,hora_br,corrida,dist,trap_fav,name_fav,trap_und,name_und,pct,nivel,perfil_fav,perfil_und,obs,need_cap,odd,valor,resultado_1,resultado_2,resultado_3,bateu,hist_fav,hist_und,race_card,top3,avb_nao_aberto,hist_all,video_url,data_card,track_full,eliminados,post_pick,scores_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of allRaces) {
    const p = (r.hora||'').split(':');
    let h = parseInt(p[0]||0);
    if (h>=1 && h<=9) h+=12;
    h = h-4; if (h<0) h+=24;
    const horaBr = p.length>=2 ? h+':'+p[1] : '';
    const top3Str = r.top3 ? (Array.isArray(r.top3) ? r.top3.filter(x=>x>0).join('-') : String(r.top3)) : null;
    ins.run(sessionId,userId,r.hora||'',horaBr,r.corrida||'',r.dist||'',r.trapFav||0,r.nameFav||'',r.trapUnd||0,r.nameUnd||'',r.pct||0,r.nivel||'',r.perfilFav||'',r.perfilUnd||'',r.obs||'',0,null,null,null,null,null,null,r.histFav?JSON.stringify(r.histFav):null,r.histUnd?JSON.stringify(r.histUnd):null,r.raceCard?JSON.stringify(r.raceCard):null,top3Str,0,r.histAll?JSON.stringify(r.histAll):null,null,r.dataCard||null,r.trackFull||null,r.eliminados?JSON.stringify(r.eliminados):null,r.postPick||null,r.scores?JSON.stringify(r.scores):null);
  }
  db.prepare('UPDATE users SET analyses_used=analyses_used+1 WHERE id=?').run(userId);

  return { ok: true, sessionId, total: allRaces.length, avbs: allRaces.filter(r=>r.nivel!=='skip').length, errors: errors.length ? errors : undefined };
}

router.put('/race/:id', express.json(), (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Não autorizado' });
  const userId = req.user.id;
  const raceId = parseInt(req.params.id);
  if (!raceId) return res.status(400).json({ error: 'ID inválido' });
  const race = db.prepare('SELECT id FROM races WHERE id=? AND user_id=?').get(raceId, userId);
  if (!race) return res.status(404).json({ error: 'Corrida não encontrada' });

  // Update PARCIAL: so mexe nos campos que vieram no body, pra nao apagar
  // resultado_1/2/3/bateu (escritos pelo robo de resultados) quando o front
  // manda so odd/valor/avb_nao_aberto, ou vice-versa.
  const allowed = ['odd', 'valor', 'resultado_1', 'resultado_2', 'resultado_3', 'bateu', 'avb_nao_aberto', 'video_url', 'bet_entrou', 'bet_unidades', 'flag_atrasada'];
  const body = { ...req.body };
  // Se a Odd esta sendo preenchida (nao vazia) e nao veio bet_unidades junto,
  // usa o valor padrao configurado — Odd preenchida ja conta como aposta
  // feita, nao precisa mais de checkbox separado nem de unidade por corrida,
  // fica tudo configurado uma vez em Configuracoes -> Banca.
  if (Object.prototype.hasOwnProperty.call(body, 'odd') && String(body.odd || '').trim() !== '' && !Object.prototype.hasOwnProperty.call(body, 'bet_unidades')) {
    const cfg = getUserConfig(userId);
    body.bet_unidades = cfg.banca_unidade_padrao || 2.5;
  }
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      sets.push(key + '=?');
      values.push(body[key]);
    }
  }
  if (!sets.length) return res.json({ ok: true });
  values.push(raceId, userId);
  db.prepare(`UPDATE races SET ${sets.join(',')} WHERE id=? AND user_id=?`).run(...values);
  res.json({ ok: true });
});

router.post('/session', express.json(), (req, res) => {
  try {
    const user = req.user;
    const { name, races } = req.body;
    const result = db.prepare('INSERT INTO race_sessions (user_id,name,total_races,total_avbs) VALUES (?,?,?,?)').run(user.id, name||'Sessao', races.length, races.filter(r=>r.nivel!=='skip').length);
    const sessionId = result.lastInsertRowid;
    const ins = db.prepare(`INSERT INTO races (session_id,user_id,hora,hora_br,corrida,dist,trap_fav,name_fav,trap_und,name_und,pct,nivel,perfil_fav,perfil_und,obs,need_cap,odd,valor,resultado_1,resultado_2,resultado_3,bateu,hist_fav,hist_und,race_card,top3,avb_nao_aberto,hist_all,video_url,data_card,track_full,eliminados,post_pick,scores_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for(const r of races) {
      const p=(r.hora||'').split(':');
      let h=parseInt(p[0]||0);
      if(h>=1&&h<=9)h+=12; // UK 12h: 1-9 PM → 13-21
      h=h-4; if(h<0)h+=24; // UK→BRT
      const horaBr=p.length>=2?h+':'+p[1]:'';
      const top3Str = r.top3 ? (Array.isArray(r.top3) ? r.top3.filter(x=>x>0).join('-') : String(r.top3)) : null;
      ins.run(sessionId,user.id,r.hora||'',horaBr,r.corrida||'',r.dist||'',r.trapFav||0,r.nameFav||'',r.trapUnd||0,r.nameUnd||'',r.pct||0,r.nivel||'',r.perfilFav||'',r.perfilUnd||'',r.obs||'',0,r.odd||null,r.valor||null,r.r1||null,r.r2||null,r.r3||null,r.hit||null,r.histFav?JSON.stringify(r.histFav):null,r.histUnd?JSON.stringify(r.histUnd):null,r.raceCard?JSON.stringify(r.raceCard):null,top3Str,r.avbNaoAberto?1:0,r.histAll?JSON.stringify(r.histAll):null,r.videoUrl||null,r.dataCard||null,r.trackFull||null,r.eliminados?JSON.stringify(r.eliminados):null,r.postPick||null,r.scores?JSON.stringify(r.scores):null);
    }
    res.json({ ok:true, sessionId });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

router.get('/config', (req, res) => {
  try {
    const { getUserConfig } = require('../db/database');
    const config = getUserConfig(req.user.id);
    res.json({
      visibility_interval_min: config.visibility_interval_min || 120,
      auto_refresh_min: config.auto_refresh_min || 1,
      results_interval_min: config.results_interval_min || 30,
      results_window_start: config.results_window_start || '09:00',
      results_window_end: config.results_window_end || '18:30',
      pdf_cron_time: config.pdf_cron_time || '13:30',
      alerta_min_antes: config.alerta_min_antes || 3,
      tela_grace_min: config.tela_grace_min != null ? config.tela_grace_min : 0,
      som_alerta: config.som_alerta || 'sino'
    });
  } catch(e) { res.json({ visibility_interval_min: 120 }); }
});

router.get('/session/:id/races', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sess = db.prepare('SELECT id, name FROM race_sessions WHERE id=? AND user_id=?').get(id, req.user.id);
    if (!sess) return res.status(404).json({ error: 'Sessão não encontrada' });
    const races = db.prepare('SELECT * FROM races WHERE session_id=? ORDER BY hora').all(id);
    // Reconstroi 'scores' (usado pelo Relatorio de Analise) a partir da coluna
    // scores_json — o cliente sempre espera esse campo como array, nunca como
    // a string JSON crua salva no banco.
    races.forEach(r => {
      if (r.scores_json) {
        try { r.scores = JSON.parse(r.scores_json); } catch(e) { r.scores = null; }
      }
    });
    res.json({ session: sess, races });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/sessions', (req, res) => {
  try {
    const sessions = db.prepare('SELECT id, name, created_at FROM race_sessions WHERE user_id=? ORDER BY created_at DESC').all(req.user.id);
    res.json(sessions);
  } catch(err) { res.status(500).json({ error:err.message }); }
});

// Rota dedicada pro sidebar da Analisar (Sessoes recentes + Historico do dia)
// se auto-atualizar sem precisar de F5 — usa horario de Brasilia (nao o
// relogio UTC do servidor) pra decidir qual sessao e' "hoje"
// Rota leve pro alerta de corrida proxima funcionar em QUALQUER pagina do
// site (nao so na Analisar) — so os campos minimos, sem hist_all/scores_json
// pesados, pra poder ser chamada de 15 em 15s de qualquer tela sem pesar.
// Pedido do Bruno em 14/07/2026.
// Acertos do dia / do mes — pra sidebar da Analisar. Pedido do Bruno em
// 14/07/2026. 'bateu' preenchido = corrida ja resolvida (tem resultado).
router.get('/acertos-resumo', (req, res) => {
  try {
    const now = new Date();
    const todayStr = String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+now.getFullYear();
    const todayISO = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
    const yearMonth = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');

    const dia = db.prepare(
      "SELECT COUNT(*) as total, SUM(CASE WHEN r.bateu='sim' THEN 1 ELSE 0 END) as acertos " +
      "FROM races r JOIN race_sessions s ON s.id=r.session_id " +
      "WHERE date(s.created_at,'-3 hours')=? AND r.user_id=? AND r.bateu IS NOT NULL AND r.bateu!=''"
    ).get(todayISO, req.user.id);

    const mes = db.prepare(
      "SELECT COUNT(*) as total, SUM(CASE WHEN r.bateu='sim' THEN 1 ELSE 0 END) as acertos " +
      "FROM races r JOIN race_sessions s ON s.id=r.session_id " +
      "WHERE strftime('%Y-%m', s.created_at, '-3 hours')=? AND r.user_id=? AND r.bateu IS NOT NULL AND r.bateu!=''"
    ).get(yearMonth, req.user.id);

    res.json({
      dia: { total: dia.total||0, acertos: dia.acertos||0, pct: dia.total ? Math.round(dia.acertos/dia.total*100) : null },
      mes: { total: mes.total||0, acertos: mes.acertos||0, pct: mes.total ? Math.round(mes.acertos/mes.total*100) : null }
    });
  } catch(e) { res.json({ dia:{total:0,acertos:0,pct:null}, mes:{total:0,acertos:0,pct:null} }); }
});

router.get('/proxima-corrida', (req, res) => {
  try {
    const now = new Date();
    const todayLabel = String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+now.getFullYear();
    const sessionName = 'Races '+todayLabel;
    const sess = db.prepare('SELECT id FROM race_sessions WHERE user_id=? AND name=?').get(req.user.id, sessionName);
    if (!sess) return res.json({ races: [] });
    const races = db.prepare(
      "SELECT hora, hora_br, corrida, trap_fav, name_fav, trap_und, name_und FROM races WHERE session_id=? AND nivel!='skip' AND trap_fav>0"
    ).all(sess.id);
    const { getUserConfig } = require('../db/database');
    const config = getUserConfig(req.user.id);
    res.json({ races, alerta_min_antes: config.alerta_min_antes||3, som_alerta: config.som_alerta||'sino' });
  } catch(e) { res.json({ races: [] }); }
});

router.get('/sidebar-sessions', (req, res) => {
  try {
    const sessions = db.prepare('SELECT * FROM race_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 8').all(req.user.id);
    const hojeStr = (function(){ var n=new Date(Date.now() - 3*60*60*1000); return String(n.getUTCDate()).padStart(2,'0')+'/'+String(n.getUTCMonth()+1).padStart(2,'0')+'/'+n.getUTCFullYear(); })();
    const sessaoHoje = sessions.find(s => s.name === 'Races ' + hojeStr);
    res.json({
      sessions: sessions.map(s => ({ id: s.id, name: s.name, total_avbs: s.total_avbs })),
      sessaoHojeId: sessaoHoje ? sessaoHoje.id : null
    });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

router.delete('/session/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sess = db.prepare('SELECT id FROM race_sessions WHERE id=? AND user_id=?').get(id, req.user.id);
    if (!sess) return res.status(404).json({ error: 'Sessão não encontrada' });
    db.prepare('DELETE FROM races WHERE session_id=?').run(id);
    db.prepare('DELETE FROM race_sessions WHERE id=?').run(id);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

module.exports = router;
// Exportados a mais pra reaproveitar no robo de monitoramento de card (reanalise
// parcial de uma corrida so, sem duplicar a engine de pontuacao)
module.exports.processarCorrida = processarCorrida;
module.exports.mapHistLinhas = mapHistLinhas;
module.exports.rodarAnaliseAutomatica = rodarAnaliseAutomatica;