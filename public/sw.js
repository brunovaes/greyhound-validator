/* Greyhound Factory — Service Worker de push.
 *
 * Este arquivo roda FORA da pagina, num processo proprio do navegador. E' o
 * que permite a notificacao chegar com o celular bloqueado ou o app fechado:
 * quem acorda ele e' o servidor de push (Apple/Google), nao um timer nosso.
 *
 * IMPORTANTE — escopo: um service worker so controla paginas ABAIXO do
 * caminho de onde ele foi servido. Como o app vive em /greyhound, este arquivo
 * PRECISA ser servido em /greyhound/sw.js (ha uma rota pra isso no main.js).
 * Se fosse servido de /greyhound/static/js/sw.js, o escopo seria
 * /greyhound/static/ e ele nao controlaria nenhuma tela do sistema.
 *
 * Nao tem dependencia nenhuma e nao deve ganhar nenhuma: service worker nao
 * enxerga o DOM, nem window, nem localStorage.
 */
'use strict';

// Assume o controle das abas ja abertas sem esperar recarregamento.
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

// ─── Push recebido ─────────────────────────────────────────────────────────
// O servidor manda um JSON com { titulo, corpo, url, tag }. Se vier vazio ou
// quebrado, mostra um aviso generico: no iOS, um push que NAO resulta em
// notificacao visivel pode fazer o sistema revogar a inscricao do aparelho.
// Por isso o fallback nunca sai silencioso.
self.addEventListener('push', function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = {}; }

  var titulo = d.titulo || 'Corrida chegando';
  var opts = {
    body: d.corpo || 'Uma corrida esta perto de largar.',
    tag: d.tag || 'corrida',          // mesma tag = substitui, nao empilha
    renotify: true,
    requireInteraction: false,
    data: { url: d.url || '/' }
  };
  if (d.icone) { opts.icon = d.icone; opts.badge = d.icone; }

  event.waitUntil(self.registration.showNotification(titulo, opts));
});

// ─── Clique na notificacao ─────────────────────────────────────────────────
// Se ja houver uma aba do sistema aberta, foca nela em vez de abrir outra.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var alvo = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
      for (var i = 0; i < lista.length; i++) {
        var c = lista[i];
        if (c.url.indexOf(alvo) !== -1 && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(alvo);
    })
  );
});

// ─── Inscricao trocada pelo navegador ──────────────────────────────────────
// O navegador pode rotacionar a inscricao sozinho. Quando isso acontece, a
// antiga para de funcionar em silencio. Aqui reenviamos a nova pro servidor.
self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey })
      .then(function (nova) {
        return fetch('/greyhound/api/push/subscrever', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: nova })
        });
      }).catch(function () {})
  );
});