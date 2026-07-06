// src/state/atrStreamCache.js
// Cache em memoria compartilhado, agora com um slot por FONTE (atr, sisracing)
// pra um stream nao sobrescrever o outro.

let cache = {}; // { atr: {url,ts}, sisracing: {url,ts} }

module.exports = {
  get(source) {
    return cache[source] || { url: null, ts: 0 };
  },
  set(source, url, ts) {
    cache[source] = { url, ts: ts || Date.now() };
  }
};