// src/routes/atrPush.js
// Rota PUBLICA (sem requireLogin) que recebe a URL do stream .m3u8 capturada
// pela extensao Chrome. Nao pode ficar atras de login porque a extensao nao
// tem cookie de sessao (e o cookie SameSite=Lax nao seria enviado numa
// chamada cross-origin vinda de uma extensao mesmo que tivesse).
// Protegida por token simples, no mesmo padrao do BROWSERLESS_TOKEN.

const express = require('express');
const router = express.Router();
const atrCache = require('../state/atrStreamCache');

const ATR_PUSH_TOKEN = process.env.ATR_PUSH_TOKEN || 'greyhound2024';
const VALID_SOURCES = ['atr', 'sisracing'];

router.post('/api/atr-stream-push', express.json(), (req, res) => {
  const token = req.headers['x-atr-token'] || req.query.token;
  if (token !== ATR_PUSH_TOKEN) {
    return res.status(401).json({ error: 'Token invalido' });
  }
  const { url, ts, source } = req.body || {};
  const src = VALID_SOURCES.indexOf(source) !== -1 ? source : 'atr'; // default legado
  if (url && url.indexOf('.m3u8') !== -1) {
    atrCache.set(src, url, ts);
    console.log('[ATR Extension] Stream recebido (' + src + '):', url.slice(0, 80));
    return res.json({ ok: true, source: src });
  }
  res.status(400).json({ error: 'URL invalida' });
});

module.exports = router;