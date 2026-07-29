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
router.post('/testar', express.json(), async (req, res) => {
  // Log na ENTRADA: separa "a requisicao nem chegou" (nenhuma linha) de
  // "chegou e o envio falhou" (esta linha + um [push] falha logo abaixo).
  console.log('[push] /testar recebido — user ' + req.user.id);
  if (!sender.disponivel()) {
    return res.status(503).json({ error: 'push inativo: ' + sender.motivoInativo() });
  }
  const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const r = await sender.enviarParaUsuario(req.user.id, sender.montarPayload({
    titulo: 'Teste do Greyhound Factory',
    corpo: 'Se voce esta lendo isto no celular bloqueado, o push esta funcionando. (' + agora + ')',
    url: BASE,
    tag: 'teste'
  }));
  console.log('[push] /testar resultado: ' + JSON.stringify(r));
  if (r.semInscricao) return res.status(400).json({ error: 'nenhum aparelho inscrito neste login' });
  res.json(r);
});

module.exports = router;