'use strict';
// src/push/agendador.js
//
// Dispara a notificacao push X minutos antes da corrida largar.
//
// POR QUE NO SERVIDOR: o alarme da tela depende do site estar aberto e do
// aparelho acordado — no celular bloqueado o navegador congela os timers e
// nada toca. Aqui quem decide e envia e' o servidor, entao a notificacao chega
// com o celular no bolso, o app fechado, a tela apagada.
//
// COMO FUNCIONA
//   1. a cada minuto, le as corridas de hoje (sessao canonica)
//   2. para cada aparelho inscrito, aplica o filtro DAQUELE usuario
//      (turno/pista/classe, configurado na aba Alarme)
//   3. dispara pras corridas que estao dentro da janela de antecedencia
//   4. marca o que ja avisou, pra nao repetir
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
const jaAvisado = new Map();

function limparMemoria() {
  const agora = Date.now();
  for (const [k, t] of jaAvisado) if (agora - t > MEMORIA_MS) jaAvisado.delete(k);
}

// "14:32" -> minutos ate a corrida (negativo se ja passou). Usa o relogio BRT,
// mesma referencia do hora_br gravado no banco.
function minutosAte(horaBr) {
  if (!horaBr) return null;
  const p = String(horaBr).split(':');
  const h = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  const d = new Date();
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

function corridasDeHoje(db, CANONICO) {
  const hoje = new Date();
  const iso = hoje.getFullYear() + '-' +
    String(hoje.getMonth() + 1).padStart(2, '0') + '-' +
    String(hoje.getDate()).padStart(2, '0');
  // Pela sessao do dia, que e' como o resto do sistema identifica "hoje".
  return db.prepare(
    "SELECT r.id, r.hora_br, r.corrida, r.dist, r.trap_fav, r.trap_und, r.nivel, r.pct, r.track_full " +
    "FROM races r JOIN race_sessions s ON s.id = r.session_id " +
    "WHERE s.user_id = ? AND date(s.created_at,'-3 hours') = ? " +
    "AND r.nivel != 'skip' AND r.trap_fav > 0"
  ).all(CANONICO, iso);
}

async function ciclo() {
  if (!sender.disponivel()) return;
  try {
    const { db, getUserConfig } = require('../db/database');
    const { CANONICO } = require('../db/compartilhado');

    const inscricoes = store.listarTodas();
    if (!inscricoes.length) return;

    const races = corridasDeHoje(db, CANONICO);
    if (!races.length) return;

    limparMemoria();

    // Agrupa por usuario: o filtro e a antecedencia sao dele, nao do aparelho.
    const porUsuario = new Map();
    for (const s of inscricoes) {
      if (!porUsuario.has(s.user_id)) porUsuario.set(s.user_id, []);
      porUsuario.get(s.user_id).push(s);
    }

    for (const [userId, aparelhos] of porUsuario) {
      let cfg;
      try { cfg = getUserConfig(userId, false); } catch (e) { continue; }
      if (!cfg || !cfg.alarme_filtro_ativo) continue;   // usuario nao quer alarme

      const antecedencia = cfg.alerta_min_antes != null ? parseInt(cfg.alerta_min_antes) : 3;

      for (const race of races) {
        const mins = minutosAte(race.hora_br);
        // Janela: entre 0 e a antecedencia. Corrida que ja largou nao avisa.
        if (mins === null || mins < 0 || mins > antecedencia) continue;
        if (!casaFiltro(cfg, race)) continue;

        const chave = userId + '|' + race.id;
        if (jaAvisado.has(chave)) continue;
        jaAvisado.set(chave, Date.now());

        const payload = sender.montarPayloadCorrida({
          horaBr: race.hora_br,
          pista: race.track_full || pistaDaCorrida(race.corrida),
          classe: classeDaCorrida(race.corrida),
          trapFav: race.trap_fav,
          trapUnd: race.trap_und,
          nivel: race.nivel,
          pct: race.pct,
          dist: race.dist,
          minutos: mins,
          tag: 'corrida-' + race.id
        }, { negrito: true });

        const r = await sender.enviarParaUsuario(userId, payload);
        console.log('[push/agendador] ' + race.hora_br + ' ' + race.corrida +
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

module.exports = { iniciar, ciclo, casaFiltro, casaRegras, minutosAte, classeDaCorrida, pistaDaCorrida, turnoDaCorrida };