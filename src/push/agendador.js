'use strict';
// src/push/agendador.js
//
// Dispara a notificacao push quando a corrida entra em TOP, HIGH ou GOOD.
//
// MUDOU EM 16/09/2026. Antes: toda corrida do dia com trap_fav, X minutos antes
// da largada. O criterio era "a corrida vai largar", nao "da pra apostar nela".
// Agora e a camada que decide, e o aviso sai no MOMENTO em que ela aparece —
// quando a BW abre as odds e a regua classifica. E' o mesmo instante em que a
// corrida aparece pra voce na tela Analisar; a diferenca e' que agora aparece
// tambem no bolso.
//
// POR QUE NO SERVIDOR: o alarme da tela depende do site estar aberto e do
// aparelho acordado — no celular bloqueado o navegador congela os timers e
// nada toca. Aqui quem decide e envia e' o servidor, entao a notificacao chega
// com o celular no bolso, o app fechado, a tela apagada.
//
// COMO FUNCIONA
//   1. a cada minuto, pergunta ao baseDoDia() do api.js as corridas do dia ja
//      classificadas — a MESMA conta e o MESMO cache da tela Analisar
//   2. fica so com as que alcancaram TOP, HIGH ou GOOD
//   3. para cada usuario inscrito, aplica o filtro DELE por cima
//      (turno/pista/classe, configurado na aba Alarme)
//   4. marca o que ja avisou, com a forca da camada, pra nao repetir
//
// O filtro espelha o matchAlarme() do public/js/alertaGlobal.js. Se um dia a
// regra mudar la, tem que mudar aqui — sao dois lugares de proposito: um
// decide na tela aberta, outro decide sem tela nenhuma.

const store = require('./store');
const sender = require('./sender');

const INTERVALO_MS = 60 * 1000;   // varre de minuto em minuto
const MEMORIA_MS = 6 * 60 * 60 * 1000;  // esquece o que avisou depois de 6h

// Guarda "usuario|corrida" ja avisado, pra nao mandar duas vezes. Em memoria
// mesmo: se o servidor reiniciar, no maximo repete um aviso — bem menos ruim
// que gravar no banco a cada minuto.
//
// O valor guarda a FORCA da camada avisada, nao so o carimbo: e' o que permite
// avisar de novo quando a corrida SOBE (um GOOD que vira TOP e outra decisao) e
// ficar calado quando ela desce (voce ja sabe da corrida; dizer que piorou so
// gera ruido).
const jaAvisado = new Map();

function limparMemoria() {
  const agora = Date.now();
  for (const [k, v] of jaAvisado) if (agora - (v && v.ts || 0) > MEMORIA_MS) jaAvisado.delete(k);
}

// "14:32" -> minutos ate a corrida (negativo se ja passou). Usa o relogio BRT,
// mesma referencia do hora_br gravado no banco.
//
// `agora` entra por parametro (ms) pelo mesmo motivo do camadasDoDia: o ciclo
// precisa de UM relogio so — usar `new Date()` aqui e Date.now() no expirou()
// deixa as duas contas discordarem por milissegundos, e um teste com relogio
// congelado nao consegue congelar as duas. Sem o parametro, segue no relogio
// do sistema, entao chamador antigo nao muda de comportamento.
function minutosAte(horaBr, agora) {
  if (!horaBr) return null;
  const p = String(horaBr).split(':');
  const h = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  const d = new Date(agora == null ? Date.now() : agora);
  const agoraMin = ((d.getUTCHours() - 3 + 24) % 24) * 60 + d.getUTCMinutes();
  return (h * 60 + m) - agoraMin;
}

function classeDaCorrida(corrida) {
  const m = String(corrida || '').trim().match(/([A-Z]\d+)$/i);
  return m ? m[1].toUpperCase() : '';
}
function pistaDaCorrida(corrida) {
  // Corta no primeiro espaco, igual ao alertaGlobal.js. Pista de nome composto
  // ("Central Park A10") vira "Central" — o filtro guarda o codigo no MESMO
  // formato, entao os dois lados casam. Se um dia o filtro passar a guardar o
  // nome completo, esta funcao e a do alertaGlobal.js mudam juntas.
  return String(corrida || '').trim().split(' ')[0];
}
function turnoDaCorrida(horaBr) {
  const h = parseInt(String(horaBr || '').split(':')[0], 10);
  if (isNaN(h)) return '';
  return h < 13 ? 'manha' : 'tarde';
}

// Espelha o matchAlarme() do alertaGlobal.js. Filtro vazio = qualquer valor.
// Casa contra a LISTA de regras (mesma logica do app.js e do alertaGlobal.js).
// Cada regra e' fechada: turno + pista + classes juntos. Lista vazia devolve
// null, e o codigo cai no filtro antigo.
function casaRegras(regras, turnoCorrida, pista, classe) {
  if (!regras || !regras.length) return null;
  for (const g of regras) {
    if (g.turno && g.turno !== turnoCorrida) continue;
    if (g.pista && g.pista !== pista) continue;
    const cs = (g.classes || []).map(c => String(c).toUpperCase());
    if (cs.length && cs.indexOf(classe) < 0) continue;
    return true;
  }
  return false;
}

function casaFiltro(cfg, race) {
  if (!cfg.alarme_filtro_ativo) return false;

  let regras = [];
  try { regras = cfg.alarme_filtro_regras ? JSON.parse(cfg.alarme_filtro_regras) : []; } catch (e) { regras = []; }
  const porRegra = casaRegras(regras, turnoDaCorrida(race.hora_br),
                              pistaDaCorrida(race.corrida), classeDaCorrida(race.corrida));
  if (porRegra !== null) return porRegra;

  if (cfg.alarme_filtro_turno && turnoDaCorrida(race.hora_br) !== cfg.alarme_filtro_turno) return false;

  const pistas = String(cfg.alarme_filtro_pistas || '').split(',').map(s => s.trim()).filter(Boolean);
  const classes = String(cfg.alarme_filtro_classes || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

  if (pistas.length && pistas.indexOf(pistaDaCorrida(race.corrida)) < 0) return false;
  if (classes.length && classes.indexOf(classeDaCorrida(race.corrida)) < 0) return false;
  return true;
}

// ── QUAL CAMADA A CORRIDA ALCANCOU ─────────────────────────────────────────
//
// OPORTUNIDADE nao conta: e' o par que o motor da manha achou e a BW ainda NAO
// abriu. Nao da pra apostar nele, entao avisar seria chamar voce pra uma tela
// onde nao ha o que fazer.
//
// A camada NAO e calculada aqui. Ela vem do baseDoDia() do api.js, a mesma
// conta e o mesmo cache que a tela Analisar usa. Refazer a regua neste arquivo
// seria criar um segundo lugar respondendo "isto e TOP?" — e dois lugares
// divergem em silencio no dia em que alguem afina um corte.
const FORCA = { GOOD: 1, HIGH: 2, TOP: 3 };

function camadaDaCorrida(c) {
  let melhor = null, forca = 0;
  for (const cf of (c && c.confrontos) || []) {
    const f = FORCA[cf && cf.camada] || 0;
    if (f > forca) { forca = f; melhor = cf.camada; }
  }
  return melhor;
}

async function ciclo() {
  if (!sender.disponivel()) return;
  try {
    const { getUserConfig } = require('../db/database');
    // require aqui dentro e nao no topo do arquivo: o api.js monta rotas ao ser
    // carregado, e exigi-lo na subida deste modulo amarraria a ordem de boot
    // sem nenhuma necessidade.
    const api = require('../routes/api');
    const cd = require('../utils/camadasDoDia');

    const inscricoes = store.listarTodas();
    if (!inscricoes.length) return;

    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    let base = [];
    try { base = api.baseDoDia(hoje) || []; }
    catch (e) { console.error('[push/agendador] baseDoDia falhou:', e.message); return; }
    if (!base.length) return;

    limparMemoria();

    // Agrupa por usuario: o filtro e' dele, nao do aparelho.
    const porUsuario = new Map();
    for (const s of inscricoes) {
      if (!porUsuario.has(s.user_id)) porUsuario.set(s.user_id, []);
      porUsuario.get(s.user_id).push(s);
    }

    for (const [userId] of porUsuario) {
      let cfg;
      try { cfg = getUserConfig(userId, false); } catch (e) { continue; }
      if (!cfg || !cfg.alarme_filtro_ativo) continue;   // usuario nao quer alarme

      // UM relogio pro ciclo inteiro: as duas contas de largada abaixo tem que
      // responder sobre o mesmo instante.
      const agora = Date.now();

      for (const c of base) {
        const camada = camadaDaCorrida(c);
        if (!camada) continue;                          // nenhuma camada aberta

        // Corrida que ja largou nao avisa. Dois caminhos, e precisa dos dois:
        // `ja_correu` e' a chegada gravada (definitivo, mas so chega quando o
        // robo de resultados passa) e `expirou` e' o relogio (antecipado e
        // sempre disponivel). E' a mesma dupla que a tela usa.
        if (c.ja_correu || cd.expirou(c.hora, agora)) continue;
        const mins = minutosAte(c.hora_br, agora);
        if (mins === null || mins < 0) continue;

        // O filtro de turno/pista/classe da aba Alarme continua valendo POR
        // CIMA da camada: ele nao escolhe mais quais corridas avisam, so corta
        // as que voce nao quer ver.
        if (!casaFiltro(cfg, { hora_br: c.hora_br, corrida: c.corrida })) continue;

        const chave = userId + '|' + c.race_id;
        const antes = jaAvisado.get(chave);
        if (antes && antes.forca >= FORCA[camada]) continue;
        jaAvisado.set(chave, { forca: FORCA[camada], ts: Date.now() });

        const payload = sender.montarPayloadCorrida({
          horaBr: c.hora_br,
          pista: c.pista || pistaDaCorrida(c.corrida),
          classe: classeDaCorrida(c.corrida),
          minutos: mins,
          tag: 'corrida-' + c.race_id
        }, { negrito: true });

        const r = await sender.enviarParaUsuario(userId, payload);
        console.log('[push/agendador] ' + c.hora_br + ' ' + c.corrida + ' ' + camada +
          ' -> user ' + userId + ': ' + (r.enviados || 0) + '/' + (r.total || 0) + ' aparelho(s)');
      }
    }
  } catch (e) {
    console.error('[push/agendador] erro no ciclo:', e.message);
  }
}

function iniciar() {
  if (!sender.disponivel()) {
    console.log('[push/agendador] nao iniciado: push inativo (faltam as chaves VAPID)');
    return;
  }
  console.log('[push/agendador] ativo, varrendo a cada 60s');
  setInterval(() => { ciclo().catch(e => console.error('[push/agendador]', e.message)); }, INTERVALO_MS);
}

module.exports = { iniciar, ciclo, casaFiltro, casaRegras, minutosAte, classeDaCorrida, pistaDaCorrida, turnoDaCorrida, camadaDaCorrida, FORCA };