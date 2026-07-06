// src/state/atrStreamCache.js
// Cache em memoria compartilhado entre a rota publica (push, usada pela extensao
// Chrome) e a rota protegida (status, usada pela pagina /live ja logada).

let cache = { url: null, ts: 0 };

module.exports = {
  get() {
    return cache;
  },
  set(url, ts) {
    cache = { url, ts: ts || Date.now() };
  }
};