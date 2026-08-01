'use strict';
// src/routes/push.js
// Endpoints de Web Push. Montado em server.js sob BASE + '/api/push', atras
// do requireLogin — cada inscricao fica amarrada ao usuario logado.
//
// Fica em arquivo proprio de proposito: nao encosta no api.js (que e' do motor
// de analise) nem no main.js.

const express = require('express');
const router = express.Router();
const store = require('../push/store');
const sender = require('../push/sender');
const BASE = process.env.BASE_PATH || '/greyhound';

// Estado do push pro cliente decidir o que mostrar na tela.
router.get('/status', (req, res) => {
  const subs = store.listarPorUsuario(req.user.id);
  res.json({
    ativo: sender.disponivel(),
    motivo: sender.disponivel() ? null : sender.motivoInativo(),
    chavePublica: sender.chavePublica(),
    aparelhos: subs.length,
    totalSistema: store.listarTodas().length,   // ajuda a detectar "inscrevi com outro login"
    lista: subs.map(s => ({
      id: s.endpoint.slice(-12),          // so o final, pra identificar sem expor
      userAgent: s.user_agent || '',
      criadoEm: s.criado_em,
      ultimoOk: s.ultimo_ok,
      falhas: s.falhas
    }))
  });
});

// Registra o aparelho. O corpo vem do PushManager.subscribe() do navegador.
router.post('/subscrever', express.json(), (req, res) => {
  try {
    const sub = req.body && req.body.subscription;
    store.salvar(req.user.id, sub, req.headers['user-agent']);
    console.log('[push] aparelho inscrito — user ' + req.user.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[push] erro ao inscrever:', e.message);
    res.status(400).json({ error: e.message });
  }
});

router.post('/desinscrever', express.json(), (req, res) => {
  try {
    const ep = req.body && req.body.endpoint;
    if (!ep) return res.status(400).json({ error: 'endpoint ausente' });
    store.remover(ep);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Dispara um push de teste pros aparelhos do proprio usuario. E' o que valida
// a ponta a ponta: se este chegar com o celular BLOQUEADO, o caminho da Apple
// esta funcionando e o agendador (etapa B) e' so consequencia.
// Dispara DUAS notificacoes de teste com o formato real de corrida: uma sem
// negrito e outra com. Servem pra escolher olhando no aparelho, que e' o unico
// juiz confiavel de como o iOS renderiza os caracteres Unicode de negrito.
router.post('/testar', express.json(), async (req, res) => {
  console.log('[push] /testar recebido — user ' + req.user.id);
  if (!sender.disponivel()) {
    return res.status(503).json({ error: 'push inativo: ' + sender.motivoInativo() });
  }

  const exemplo = {
    horaBr: '10:24', pista: 'Kinsley', classe: 'A6',
    trapFav: 5, trapUnd: 3, nivel: 'Alta', pct: 72,
    dist: 480, minutos: 3, url: BASE
  };

  const r1 = await sender.enviarParaUsuario(req.user.id,
    sender.montarPayloadCorrida(Object.assign({}, exemplo, { tag: 'teste-normal' }), { negrito: false }));
  if (r1.semInscricao) return res.status(400).json({ error: 'nenhum aparelho inscrito neste login' });

  // Pequena pausa pra as duas nao chegarem coladas e o iOS nao agrupar.
  await new Promise(r => setTimeout(r, 1500));
  const r2 = await sender.enviarParaUsuario(req.user.id,
    sender.montarPayloadCorrida(Object.assign({}, exemplo, { tag: 'teste-negrito' }), { negrito: true }));

  const out = { normal: r1, negrito: r2 };
  console.log('[push] /testar resultado: ' + JSON.stringify(out));
  res.json({ enviados: (r1.enviados || 0) + (r2.enviados || 0), total: (r1.total || 0) + (r2.total || 0), detalhe: out });
});

// Apaga TODAS as inscricoes do usuario logado. Serve pra limpar duplicatas:
// cada reinstalacao do icone na Tela de Inicio cria uma inscricao nova, e as
// antigas so somem sozinhas quando a Apple responde 410 num envio futuro —
// ate la o mesmo aviso chega varias vezes. Depois de limpar, basta ativar as
// notificacoes uma vez no aparelho que voce realmente usa.
router.post('/limpar', express.json(), (req, res) => {
  try {
    const antes = store.listarPorUsuario(req.user.id).length;
    for (const s of store.listarPorUsuario(req.user.id)) store.remover(s.endpoint);
    console.log('[push] inscricoes limpas — user ' + req.user.id + ': ' + antes + ' removida(s)');
    res.json({ ok: true, removidas: antes });
  } catch (e) {
    console.error('[push] erro ao limpar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;