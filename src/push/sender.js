'use strict';
// src/push/sender.js
// Envio de Web Push. Encapsula a lib web-push pra que o resto do sistema nao
// precise saber nada de VAPID nem de tratamento de erro do servico de push.
//
// Configuracao (variaveis de ambiente no Railway):
//   VAPID_PUBLIC_KEY   — pode aparecer no HTML, vai pro navegador de qualquer jeito
//   VAPID_PRIVATE_KEY  — SEGREDO
//   VAPID_SUBJECT      — mailto:seu@email (exigido pelo padrao)
//
// Sem as chaves, o modulo fica INERTE: disponivel() devolve false e nada
// quebra. Isso e' de proposito, pra que um deploy sem as variaveis nao derrube
// o app inteiro.

const store = require('./store');

let webpush = null;
let _ativo = false;
let _motivoInativo = 'nao inicializado';

function init() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || 'mailto:admin@greyhound.local';

  if (!pub || !priv) {
    _motivoInativo = 'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY nao configuradas';
    console.log('[push] inativo: ' + _motivoInativo);
    return;
  }
  try {
    webpush = require('web-push');
    webpush.setVapidDetails(subj, pub, priv);
    _ativo = true;
    console.log('[push] ativo (VAPID configurado)');
  } catch (e) {
    _motivoInativo = 'lib web-push indisponivel: ' + e.message;
    console.error('[push] inativo: ' + _motivoInativo);
  }
}
init();

function disponivel() { return _ativo; }
function motivoInativo() { return _motivoInativo; }
function chavePublica() { return process.env.VAPID_PUBLIC_KEY || null; }

// Envia pra UMA inscricao. Devolve {ok, removida, erro}.
// 404 e 410 do servico de push significam que aquele aparelho desinstalou o
// app ou revogou a permissao — a inscricao morreu e deve sair do banco, senao
// fica gerando erro pra sempre.
async function enviarPara(row, payload) {
  if (!_ativo) return { ok: false, erro: _motivoInativo };
  const alvo = String(row.endpoint || '').slice(-12);   // so o final, pra nao vazar o endpoint no log
  try {
    await webpush.sendNotification(store.paraWebPush(row), JSON.stringify(payload));
    store.marcarOk(row.endpoint);
    // Log de SUCESSO tambem, de proposito: sem ele, "nada no log" era
    // ambiguo entre "a requisicao nunca chegou" e "foi enviado e deu certo",
    // o que impedia qualquer diagnostico. Aceito o log mais verboso.
    console.log('[push] enviado OK -> ...' + alvo + ' | tag=' + (payload && payload.tag));
    return { ok: true };
  } catch (e) {
    const code = e && e.statusCode;
    if (code === 404 || code === 410) {
      store.remover(row.endpoint);
      console.log('[push] inscricao morta removida (' + code + ') -> ...' + alvo);
      return { ok: false, removida: true, erro: 'inscricao expirada' };
    }
    store.marcarFalha(row.endpoint);
    console.error('[push] falha ' + (code || '?') + ' -> ...' + alvo + ':', e && e.message);
    return { ok: false, erro: (e && e.message) || 'erro desconhecido' };
  }
}

// Envia pra todos os aparelhos de um usuario. Devolve o resumo.
async function enviarParaUsuario(userId, payload) {
  const subs = store.listarPorUsuario(userId);
  if (!subs.length) return { enviados: 0, falhas: 0, semInscricao: true };
  let enviados = 0, falhas = 0;
  for (const s of subs) {
    const r = await enviarPara(s, payload);
    if (r.ok) enviados++; else falhas++;
  }
  return { enviados, falhas, total: subs.length };
}

// Monta o payload no formato que o sw.js espera.
function montarPayload({ titulo, corpo, url, tag, icone }) {
  return {
    titulo: titulo || 'Greyhound Factory',
    corpo: corpo || '',
    url: url || (process.env.BASE_PATH || '/greyhound'),
    tag: tag || 'geral',
    icone: icone || ((process.env.BASE_PATH || '/greyhound') + '/static/img/icon-180.png')
  };
}

// ─── Formato da notificacao de corrida ─────────────────────────────────────
// Fica aqui, e nao no agendador, porque o botao de teste e o disparo
// automatico precisam produzir EXATAMENTE o mesmo texto. Se divergirem, o
// teste deixa de valer como teste.
//
// Layout (decidido com o Bruno):
//   titulo:  🏁 10:24 📍 Kinsley A6
//   corpo:   🐕 5v3 ⭐ Alta 72%
//            ⏰ larga em 3 min · 480m
//
// Negrito: a Notification API aceita SO texto puro no corpo, sem HTML nem
// markdown. O jeito de destacar e' trocar por caracteres Unicode de negrito
// matematico (5v3 -> 𝟱𝘃𝟯), que sao glifos proprios, nao formatacao.
// Custo: leitor de tela lê mal e fonte sem o glifo mostra quadradinho.
// Por isso e' opcional, controlado pelo parametro negrito.
function emNegrito(s) {
  let out = '';
  for (const c of String(s)) {
    const n = c.charCodeAt(0);
    if (c >= '0' && c <= '9')      out += String.fromCodePoint(0x1D7EC + (n - 48));
    else if (c >= 'a' && c <= 'z') out += String.fromCodePoint(0x1D5EE + (n - 97));
    else if (c >= 'A' && c <= 'Z') out += String.fromCodePoint(0x1D5D4 + (n - 65));
    else                           out += c;
  }
  return out;
}

// corrida: { horaBr, pista, classe, trapFav, trapUnd, nivel, pct, dist, minutos, url }
function montarPayloadCorrida(c, opts) {
  const o = opts || {};
  const destaque = o.negrito ? emNegrito : (x) => x;

  const local = [c.pista, c.classe].filter(Boolean).join(' ');
  const avb = (c.trapFav != null && c.trapUnd != null) ? destaque(c.trapFav + 'v' + c.trapUnd) : null;
  const conf = c.nivel ? destaque(c.nivel + (c.pct != null ? ' ' + Math.round(c.pct) + '%' : '')) : null;

  const linha1 = ['🐕 ' + (avb || '-'), conf ? '⭐ ' + conf : null].filter(Boolean).join(' ');
  const linha2 = [
    c.minutos != null ? '⏰ larga em ' + c.minutos + ' min' : null,
    c.dist ? c.dist + 'm' : null
  ].filter(Boolean).join(' · ');

  // "CORRIDA SELECIONADA" vai na primeira linha do CORPO, e nao no titulo, de
  // proposito: o iOS anexa "from <nome do app>" ao titulo e, quando varias
  // notificacoes empilham, so o titulo aparece. Mantendo hora e pista la em
  // cima, da pra identificar a corrida sem expandir.
  const chamada = o.chamada === false ? null : '❗CORRIDA SELECIONADA';

  return {
    titulo: '🏁 ' + (c.horaBr || '--:--') + ' 📍 ' + (local || 'corrida'),
    corpo: [chamada, linha1, linha2].filter(Boolean).join('\n'),
    url: c.url || (process.env.BASE_PATH || '/greyhound'),
    tag: c.tag || ('corrida-' + (c.horaBr || '') + '-' + (c.pista || '')),
    icone: (process.env.BASE_PATH || '/greyhound') + '/static/img/icon-180.png'
  };
}

module.exports = { disponivel, motivoInativo, chavePublica, enviarPara, enviarParaUsuario, montarPayload, montarPayloadCorrida, emNegrito };