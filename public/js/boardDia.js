'use strict';
// ── Board do dia (tela Histórico) ────────────────────────────────────────────
//
// O radar persistente: nasce de manhã com os TOP que o robô achou e vai se
// atualizando conforme a BW abre. Acumula — não troca nem apaga o que já
// registrou. É o journal do dia.
//
// Só TOP vive aqui. HIGH e GOOD são eventos ao vivo da Analisar.
//
// Uma corrida pode ter mais de uma linha: o robô pode mapear outro AvB TOP na
// mesma corrida, ou somar um segundo. Todos aparecem; só um leva a marca de
// ENTREI, porque a aposta é uma por corrida.

(function (glob) {

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function n2(v, casas) {
    return v == null ? '' : (typeof v === 'number' ? v.toFixed(casas == null ? 2 : casas) : v);
  }

  // ── chips ──────────────────────────────────────────────────────────────────
  function chipCamada(c) {
    var cam = glob.PainelDia.camadaDe(c);
    return '<span class="bd-chip" style="border-color:' + cam.cor + ';color:' + cam.cor + '">'
      + esc(cam.rotulo) + '</span>';
  }

  // bateu: true / false / null. O null NÃO é "não bateu" — é "ainda não correu".
  // Juntar os dois faria a corrida que ainda vai acontecer parecer derrota.
  function chipResultado(x) {
    if (x.bateu === true)  return '<span class="bd-chip bd-ok">bateu</span>';
    if (x.bateu === false) return '<span class="bd-chip bd-ko">não</span>';
    return '<span class="bd-chip bd-wait">aguarda</span>';
  }

  // A marca de ENTREI: mostra a odd e a stake registradas. Sem ela, olhando o
  // board depois não dá pra saber em qual dos AvBs da corrida você entrou — e
  // é justamente isso que a Banca conta.
  //
  // A entrada é da CORRIDA; o confronto que a recebeu é o que vem com
  // escolhido:true. Marcar todos os confrontos da corrida faria parecer 4
  // apostas onde há uma.
  function chipEntrada(x) {
    if (!x.entradaCorrida || !x.escolhido) return '';
    var e = x.entradaCorrida;
    return '<span class="bd-chip bd-entrei" title="aposta registrada">ENTREI'
      + (e.odd != null ? ' &middot; ' + n2(e.odd) : '')
      + (e.stake != null ? ' &middot; ' + n2(e.stake, 1) + 'u' : '')
      + '</span>';
  }

  // ── linha ──────────────────────────────────────────────────────────────────
  function linha(x, piscando) {
    var cam = glob.PainelDia.camadaDe(x);
    var abriu = x.odd_bw != null;
    // "A BW abriu, mas abriu LARGA": odd preenchida com a camada ainda em
    // OPORTUNIDADE (razao > 1.5). Nao apita, e nao promoveu.
    //
    // Mostramos assim mesmo, marcada. Esconder a odd faria voce se perguntar
    // por que ela sumiu; mostrar limpa daria a impressao de que qualificou. O
    // mercado discordou da leitura da manha, e isso e' informacao.
    var abriuLarga = abriu && String(x.camada || '').toUpperCase() === 'OPORTUNIDADE';
    return '<tr class="bd-linha' + (piscando ? ' bd-pisca' : '') + (x.escolhido && x.entradaCorrida ? ' bd-com-entrada' : '') + '"'
      + ' data-id="' + esc(x.id) + '" style="--bd-cor:' + cam.cor + '">'
      + '<td class="bd-hora">' + esc(x.hora_br || x.hora || '') + '</td>'
      + '<td class="bd-corrida">' + esc(x.corrida || '') + '</td>'
      + '<td class="bd-par"><strong>T' + esc(x.pick_trap) + '</strong>'
      +   ' <span class="bd-mut">×</span> T' + esc(x.outro_trap) + '</td>'
      + '<td class="bd-num">' + (x.pct != null ? x.pct + '%' : '') + '</td>'
      // Odd e razão só existem depois que a BW abriu. Antes disso a célula fica
      // vazia, e não com zero: zero seria um número, e número errado é pior que
      // ausência.
      + '<td class="bd-num' + (abriuLarga ? ' bd-larga' : '') + '">'
      +   (abriu ? n2(x.odd_bw) : '<span class="bd-mut">—</span>') + '</td>'
      + '<td class="bd-num' + (abriuLarga ? ' bd-larga' : '') + '">'
      +   (x.razao_mercado != null ? n2(x.razao_mercado, 3) : '<span class="bd-mut">—</span>') + '</td>'
      + '<td>' + chipCamada(x)
      +   (abriuLarga ? '<span class="bd-chip bd-larga-chip" title="a BW abriu este par, mas com odds distantes: não colou, então não virou TOP">abriu, não colou</span>' : '')
      +   chipEntrada(x) + '</td>'
      + '<td>' + chipResultado(x) + '</td>'
      + '</tr>';
  }

  // ── render ─────────────────────────────────────────────────────────────────
  // Ordena por hora BR. O contrato deixa a critério; hora é a ordem em que as
  // corridas acontecem, e é como você acompanha o dia.
  function minutos(h) {
    var p = String(h || '').split(':');
    var hh = parseInt(p[0], 10), mm = parseInt(p[1], 10);
    return (isNaN(hh) || isNaN(mm)) ? 1e9 : hh * 60 + mm;
  }

  function render(alvo, dados, erro) {
    var el = (typeof alvo === 'string') ? document.getElementById(alvo) : alvo;
    if (!el) return;

    // Erro NÃO limpa o board: o dado de antes continua útil, e sumir com tudo
    // por uma falha de rede seria pior que mostrar dado de um minuto atrás.
    if (erro) {
      var av = el.querySelector('.bd-erro');
      if (!av) {
        av = document.createElement('div');
        av.className = 'bd-erro';
        el.insertBefore(av, el.firstChild);
      }
      av.textContent = 'sem atualizar (' + erro + ') — os dados abaixo podem estar defasados';
      if (!dados) return;
    } else {
      var velho = el.querySelector('.bd-erro');
      if (velho) velho.remove();
    }

    var itens = glob.PainelDia.doBoard(dados).sort(function (a, b) {
      return minutos(a.hora_br || a.hora) - minutos(b.hora_br || b.hora);
    });

    var agora = glob.PainelDia.promovidosAgora();
    var corpo = el.querySelector('.bd-corpo');
    if (!corpo) {
      el.innerHTML = (el.querySelector('.bd-erro') ? el.querySelector('.bd-erro').outerHTML : '')
        + '<table class="bd-tbl"><thead><tr>'
        + '<th>Hora BR</th><th>Corrida</th><th>Par</th><th>pct</th>'
        + '<th>Odd BW</th><th>Razão mkt</th><th>Estado</th><th>Resultado</th>'
        + '</tr></thead><tbody class="bd-corpo"></tbody></table>';
      corpo = el.querySelector('.bd-corpo');
    }

    corpo.innerHTML = itens.length
      ? itens.map(function (x) { return linha(x, agora.indexOf(x.id) >= 0); }).join('')
      : '<tr><td colspan="8" class="bd-vazio">nenhuma oportunidade no dia ainda.</td></tr>';
  }

  glob.BoardDia = { render: render, linha: linha, minutos: minutos };

})(typeof window !== 'undefined' ? window : this);