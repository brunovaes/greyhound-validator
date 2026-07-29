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
  try {
    await webpush.sendNotification(store.paraWebPush(row), JSON.stringify(payload));
    store.marcarOk(row.endpoint);
    return { ok: true };
  } catch (e) {
    const code = e && e.statusCode;
    if (code === 404 || code === 410) {
      store.remover(row.endpoint);
      console.log('[push] inscricao morta removida (' + code + ')');
      return { ok: false, removida: true, erro: 'inscricao expirada' };
    }
    store.marcarFalha(row.endpoint);
    console.error('[push] falha ' + (code || '?') + ':', e && e.message);
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
    icone: icone || ((process.env.BASE_PATH || '/greyhound') + '/static/img/logo.png')
  };
}

module.exports = { disponivel, motivoInativo, chavePublica, enviarPara, enviarParaUsuario, montarPayload };