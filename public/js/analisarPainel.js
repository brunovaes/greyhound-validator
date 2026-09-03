'use strict';
// ── Analisar — standby que acorda pra entrada ────────────────────────────────
//
// A tela fica dormindo ("AGUARDANDO OPORTUNIDADE") e acorda quando o robô
// promove um confronto. Mostra até 4, no mesmo card de sempre (galgos e
// gauges, mesma grade), e é aqui que a aposta é registrada.
//
// Regra que manda em tudo: UMA APOSTA POR CORRIDA. Mesmo com 4 confrontos da
// mesma prova na tela, um só recebe o ENTREI — e depois disso os outros dela
// somem, porque não há mais o que fazer com eles.

(function (glob) {

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ── casamento com a sessão carregada ──────────────────────────────────────
  // O payload traz o par e os NOMES (pick_nome/outro_nome), mas não o
  // histórico dos galgos — e sem histórico não há gauges. A corrida já está
  // carregada na Analisar (results), com histAll: casamos por hora+corrida e
  // reaproveitamos só para os gauges.
  //
  // Os nomes NÃO dependem mais deste casamento: vêm prontos do payload, então
  // o snapshot da aposta sai completo mesmo para corrida que não esteja
  // carregada. Sem o casamento o card ainda aparece, só que sem gauges.
  function corridaDaSessao(x) {
    var lista = glob.results || [];
    for (var i = 0; i < lista.length; i++) {
      var r = lista[i];
      if (!r) continue;
      var mesmaCorrida = String(r.corrida || '').trim().toLowerCase()
                      === String(x.corrida || '').trim().toLowerCase();
      if (mesmaCorrida && String(r.hora || '') === String(x.hora || '')) return r;
    }
    return null;
  }

  // ── tile ──────────────────────────────────────────────────────────────────
  function tile(x, piscando) {
    var cam = glob.PainelDia.camadaDe(x);
    var r = corridaDaSessao(x);

    var miolo;
    if (r && typeof glob._cardAvb === 'function') {
      // O MESMO card da tela de sempre: galgos, gauges, botões. Reimplementar
      // aqui daria dois cards parecidos que divergiriam na primeira mudança.
      miolo = glob._cardAvb(r, {
        aTrap: x.pick_trap, bTrap: x.outro_trap,
        aNome: x.pick_nome, bNome: x.outro_nome, odd: x.odd_bw
      }, { rotulo: cam.rotulo, corRotulo: cam.cor, escolhido: null });
    } else {
      miolo = '<div class="ap-sem-card">'
        + '<div class="ap-par">T' + esc(x.pick_trap) + ' <span class="ap-mut">×</span> T' + esc(x.outro_trap) + '</div>'
        + (x.odd_bw != null ? '<div class="ap-odd">odd <strong>' + esc(x.odd_bw) + '</strong></div>' : '')
        + '<div class="ap-mut">sem histórico carregado para esta corrida</div>'
        + '</div>';
    }

    return '<div class="ap-tile' + (piscando ? ' ap-pisca' : '') + '"'
      + ' data-id="' + esc(x.id) + '" data-race="' + esc(x.race_id) + '"'
      + ' style="--ap-cor:' + cam.cor + '">'
      + '<div class="ap-tile-hd">'
      +   '<span class="ap-cam" style="background:' + cam.cor + '">' + esc(cam.rotulo) + '</span>'
      +   '<span class="ap-hora">' + esc(x.hora_br || x.hora || '') + '</span>'
      +   '<span class="ap-corrida">' + esc(x.corrida || '') + '</span>'
      +   (x.pct != null ? '<span class="ap-pct">' + esc(x.pct) + '%</span>' : '')
      + '</div>'
      + miolo
      + '<div class="ap-entrada">'
      +   '<label>Odd <input type="number" step="0.01" class="ap-odd-inp" value="'
      +     (x.odd_bw != null ? esc(x.odd_bw) : '') + '"></label>'
      +   '<label>Stake <input type="number" step="0.5" class="ap-stake-inp" value="'
      +     esc(glob.STAKE_PADRAO != null ? glob.STAKE_PADRAO : 2.5) + '"></label>'
      +   '<button type="button" class="ap-entrei" onclick="AnalisarPainel.entrar(\'' + esc(x.id) + '\')">Entrei !</button>'
      + '</div>'
      + '</div>';
  }

  // ── render ────────────────────────────────────────────────────────────────
  var ultimos = [];

  function render(alvoId, dados) {
    var el = document.getElementById(alvoId);
    if (!el) return;

    var itens = glob.PainelDia.paraEntrar(dados);
    ultimos = itens;

    if (!itens.length) {
      // Standby. A ampola girando diz "estou vivo e olhando" — tela parada e
      // tela quebrada são indistinguíveis sem ela.
      el.innerHTML = '<div class="ap-standby">'
        + '<div class="ap-spin"></div>'
        + '<div class="ap-standby-txt">AGUARDANDO OPORTUNIDADE</div>'
        + '<div class="ap-standby-sub">O robô avisa aqui quando um confronto abrir na BW.</div>'
        + '</div>';
      return;
    }

    var agora = glob.PainelDia.promovidosAgora();
    el.className = 'ap-grid ap-g' + Math.min(itens.length, 4);
    el.innerHTML = itens.map(function (x) {
      return tile(x, agora.indexOf(x.id) >= 0);
    }).join('');
  }

  // ── entrada ───────────────────────────────────────────────────────────────
  // UMA por corrida, pelo PUT que já existe. O snapshot guarda a odd e os
  // percentuais DO MOMENTO: daqui a uma hora o mercado mudou e não dá pra
  // reconstruir o que você viu na hora de decidir.
  function entrar(id) {
    var x = ultimos.filter(function (y) { return String(y.id) === String(id); })[0];
    if (!x) return;
    var tileEl = document.querySelector('.ap-tile[data-id="' + id + '"]');
    if (!tileEl) return;

    var odd = parseFloat((tileEl.querySelector('.ap-odd-inp') || {}).value);
    var stake = parseFloat((tileEl.querySelector('.ap-stake-inp') || {}).value);
    if (isNaN(odd)) { aviso(tileEl, 'informe a odd'); return; }
    if (!x.race_id) { aviso(tileEl, 'sem race_id: não dá pra registrar'); return; }

    var r = corridaDaSessao(x);
    var snap = {
      aTrap: x.pick_trap,
      aNome: x.pick_nome || (r && typeof glob._nomeDoTrap === 'function' ? glob._nomeDoTrap(r, x.pick_trap) : '') || '',
      bTrap: x.outro_trap,
      bNome: x.outro_nome || (r && typeof glob._nomeDoTrap === 'function' ? glob._nomeDoTrap(r, x.outro_trap) : '') || '',
      odd: odd,
      pct: x.pct,
      // A camada VIRA a origem: é assim que a Banca e a taxa passam a ser
      // quebradas por TOP/HIGH/GOOD.
      origem: String(x.camada || '').toUpperCase(),
      id_confronto: x.id,
      market_pct: x.market_pct,
      razao_mercado: x.razao_mercado,
      ts: Math.floor(Date.now() / 1000)
    };

    var btn = tileEl.querySelector('.ap-entrei');
    if (btn) { btn.disabled = true; btn.textContent = 'registrando…'; }

    var corpo = { odd: odd, avb_escolhido: JSON.stringify(snap) };
    if (!isNaN(stake)) corpo.bet_unidades = stake;

    fetch((glob.BASE || '') + '/api/race/' + encodeURIComponent(x.race_id), {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      // Não some com o tile por conta própria: o painel é a fonte da verdade,
      // e ele traz a corrida com entrada preenchida na volta seguinte. Sumir
      // antes e a gravação falhar deixaria você achando que apostou.
      if (btn) { btn.textContent = '✓ registrado'; btn.classList.add('ok'); }
      return glob.PainelDia.buscar();
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Entrei !'; }
      aviso(tileEl, 'não registrou: ' + e.message);
    });
  }

  function aviso(tileEl, msg) {
    var el = tileEl.querySelector('.ap-aviso');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ap-aviso';
      tileEl.appendChild(el);
    }
    el.textContent = msg;
  }

  glob.AnalisarPainel = { render: render, entrar: entrar, tile: tile, corridaDaSessao: corridaDaSessao };

})(typeof window !== 'undefined' ? window : this);