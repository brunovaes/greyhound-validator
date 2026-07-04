// URL do seu app no Railway — mude aqui se o dominio mudar
const APP_URL = 'https://greyhound-validator-production.up.railway.app/greyhound';
const BASE_PATH = '/greyhound';

let lastStreamUrl = null;
let lastSentAt = 0;

// Intercepta todas as requisicoes de rede buscando o m3u8 do ATR
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    const url = details.url;
    if (url.includes('.m3u8') && url.includes('vermantiagaming.com')) {
      const now = Date.now();
      // Evita mandar a mesma URL multiplas vezes (chunks chegam a cada poucos segundos)
      if (url !== lastStreamUrl || (now - lastSentAt) > 60000) {
        lastStreamUrl = url;
        lastSentAt = now;
        sendToApp(url);
      }
    }
  },
  { urls: ['<all_urls>'] }
);

function sendToApp(streamUrl) {
  fetch(APP_URL + '/api/atr-stream-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: streamUrl, ts: Date.now() })
  })
  .then(r => r.json())
  .then(data => {
    console.log('[ATR Extension] Stream enviado:', streamUrl.slice(0, 80));
    // Salva localmente tambem pra mostrar no popup
    chrome.storage.local.set({ streamUrl, sentAt: Date.now(), ok: true });
  })
  .catch(err => {
    console.warn('[ATR Extension] Erro ao enviar:', err.message);
    chrome.storage.local.set({ streamUrl, sentAt: Date.now(), ok: false, error: err.message });
  });
}
