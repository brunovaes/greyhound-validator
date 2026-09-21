'use strict';
// src/utils/encerrarBrowser.js — FECHAR, NAO SO DESCONECTAR (Bruno, 21/09/2026)
//
// Os robos terminavam com browser.disconnect(): o Node larga a conexao, mas o
// navegador e as abas continuam vivos dentro do servico chromium. O mesmo nas
// reconexoes ("Sessao expirada, reconectando"): a sessao velha ficava aberta e
// uma nova nascia do lado. O chromium passou a semana entre 700 MB e 1 GB sem
// fazer nada, 24h, e memoria parada e' ~80% da conta do Railway.
//
// Aqui: fecha cada aba, fecha o navegador e so desconecta se o fechamento
// falhar (sessao que ja caiu nao responde ao close). Cada passo tem prazo,
// porque isto roda no finally dos robos e nao pode pendurar o fim da volta.
// Nunca lanca erro: quem chama esta encerrando, nao tem o que fazer com ele.

function comPrazo(promessa, ms) {
  return Promise.race([
    promessa,
    new Promise((_, rej) => setTimeout(() => rej(new Error('prazo')), ms))
  ]);
}

async function encerrarBrowser(browser) {
  if (!browser) return;
  try {
    const abas = await comPrazo(browser.pages(), 5000);
    for (const aba of abas) {
      try { await comPrazo(aba.close(), 5000); } catch (e) { /* aba ja morta */ }
    }
  } catch (e) { /* conexao ja caiu: o close abaixo tambem falha e cai no disconnect */ }
  try { await comPrazo(browser.close(), 8000); return; } catch (e) { /* segue pro disconnect */ }
  try { browser.disconnect(); } catch (e) { /* nada a fazer */ }
}

module.exports = { encerrarBrowser };
