'use strict';
// src/utils/importarEntradas.js
//
// Importa entradas de aposta de um CSV para o Historico.
//
// FORMATO ESPERADO (o que o Bruno exporta hoje):
//   Data;Pista;AVB;Odd;Aposta;Bateu?
//   14/08/2026;Mullingar;5 - Revilo Luke x 4 - Clodcar Lilly;1,616;R$ 20,00;Não
//
// Separador ";" e encoding latin-1 (Excel brasileiro). Numeros com virgula
// decimal e "R$" na frente.
//
// DUAS DECISOES DE DESENHO QUE IMPORTAM:
//
// 1. A coluna "Bateu?" da planilha e' IGNORADA de proposito. O resultado e'
//    calculado por bateuPar() a partir da chegada real e do par escolhido —
//    a mesma funcao que o Historico e os KPIs usam. Importar o "bateu" da
//    planilha criaria uma segunda fonte de verdade que pode divergir da
//    chegada sem ninguem perceber.
//
// 2. Nada e' gravado na primeira passada. O fluxo e' simular -> conferir ->
//    aplicar. Importacao que grava direto e' escrever no banco de olhos
//    fechados, e uma linha casada com a corrida errada e' dificil de achar
//    depois.

const { CANONICO, salvarPessoal } = require('../db/compartilhado');

// "R$ 1.234,56" -> 1234.56 | "1,616" -> 1.616
function _num(v) {
  if (v == null) return null;
  let s = String(v).replace(/R\$/gi, '').replace(/\s/g, '');
  // Ponto como separador de milhar (padrao BR): "1.234,56". So remove o ponto
  // quando ha virgula depois — senao "1.616" (odd) viraria 1616.
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// "5 - Revilo Luke x 4 - Clodcar Lilly" -> { a:{trap:5,nome:...}, b:{...} }
function _parseAvb(txt) {
  const partes = String(txt || '').split(/\s+x\s+/i);
  if (partes.length !== 2) return null;
  const lado = (t) => {
    const m = t.trim().match(/^(\d+)\s*-\s*(.+)$/);
    return m ? { trap: parseInt(m[1], 10), nome: m[2].trim() } : null;
  };
  const a = lado(partes[0]), b = lado(partes[1]);
  return (a && b) ? { a, b } : null;
}

// "14/08/2026" -> "2026-08-14"
function _dataISO(v) {
  const m = String(v || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Normaliza nome de pista pra comparar: sem acento, minusculo, so letras.
// O banco guarda o codigo curto do Racing Post ("Mullg") e a planilha traz o
// nome por extenso ("Mullingar") — comparamos por prefixo nos dois sentidos.
function _chavePista(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z]/g, '');
}
function _pistaBate(daPlanilha, doBanco) {
  const a = _chavePista(daPlanilha), b = _chavePista(doBanco);
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}
function _chaveNome(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z]/g, '');
}

// Le o CSV e devolve as linhas ja interpretadas (sem tocar no banco).
function lerCsv(texto) {
  // Remove o BOM (\uFEFF) do inicio. O Excel grava esses 3 bytes invisiveis
  // quando salva como "CSV UTF-8", e eles grudam na PRIMEIRA coluna do
  // cabecalho: "Data" vira "\uFEFFData" e a busca por 'data' nao acha nada.
  // O arquivo parece identico ao olho e o importador le zero linhas.
  const limpo = String(texto).replace(/^\uFEFF/, '');
  const linhas = limpo.split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) return { erro: 'arquivo vazio', linhas: [] };

  const cab = linhas[0].split(';').map(x => x.trim().toLowerCase());
  const idx = {
    data:   cab.findIndex(c => c.startsWith('data')),
    pista:  cab.findIndex(c => c.startsWith('pista')),
    avb:    cab.findIndex(c => c.startsWith('avb')),
    odd:    cab.findIndex(c => c.startsWith('odd')),
    aposta: cab.findIndex(c => c.startsWith('aposta'))
  };
  const faltando = Object.keys(idx).filter(k => idx[k] === -1);
  if (faltando.length) {
    return { erro: 'colunas faltando no cabeçalho: ' + faltando.join(', '), linhas: [] };
  }

  const out = [];
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split(';');
    const par = _parseAvb(c[idx.avb]);
    out.push({
      n: i,
      dataISO: _dataISO(c[idx.data]),
      pista: (c[idx.pista] || '').trim(),
      avbTexto: (c[idx.avb] || '').trim(),
      par,
      odd: _num(c[idx.odd]),
      aposta: _num(c[idx.aposta])
    });
  }
  return { erro: null, linhas: out };
}

// Casa cada linha com uma corrida do banco e devolve o plano do que seria
// gravado. NAO grava nada.
function simular(db, linhas, userId, banca) {
  const resultado = [];
  const porCorrida = new Map();   // race_id -> linhas que caíram nela

  for (const L of linhas) {
    const base = { ...L, stake: null, raceId: null, status: null, motivo: null, corrida: null, horaBr: null };

    if (!L.dataISO)  { base.status = 'erro'; base.motivo = 'data inválida'; resultado.push(base); continue; }
    if (!L.par)      { base.status = 'erro'; base.motivo = 'não consegui ler o AvB (esperado "5 - Nome x 4 - Nome")'; resultado.push(base); continue; }
    if (L.odd == null) { base.status = 'erro'; base.motivo = 'odd inválida'; resultado.push(base); continue; }
    if (L.aposta == null) { base.status = 'erro'; base.motivo = 'valor da aposta inválido'; resultado.push(base); continue; }

    base.stake = Math.round(L.aposta / banca * 100 * 100) / 100;   // % da banca, 2 casas

    // Corridas do dia (sessao canonica), com o par de traps informado.
    const cands = db.prepare(
      "SELECT r.id, r.hora_br, r.corrida, r.name_fav, r.name_und, r.trap_fav, r.trap_und, r.track_full, r.hist_all, r.race_card " +
      "FROM races r JOIN race_sessions s ON s.id = r.session_id " +
      "WHERE s.user_id = ? AND date(s.created_at,'-3 hours') = ?"
    ).all(CANONICO, L.dataISO);

    // 1o filtro: pista
    let poss = cands.filter(c => _pistaBate(L.pista, c.corrida) || _pistaBate(L.pista, c.track_full));
    if (!poss.length) {
      base.status = 'erro'; base.motivo = 'nenhuma corrida em ' + L.pista + ' nesse dia';
      resultado.push(base); continue;
    }

    // 2o filtro: os nomes dos dois galgos aparecem na corrida. E' o criterio
    // mais forte — dois galgos especificos praticamente identificam a corrida.
    const nA = _chaveNome(L.par.a.nome), nB = _chaveNome(L.par.b.nome);
    // Compara com TODOS os galgos da corrida, nao so com o favorito e o
    // underdog. O AvB da planilha e' o que o Bruno apostou (BW), que muitas
    // vezes e' um par diferente do que o motor elegeu — comparar so com
    // name_fav/name_und fazia toda linha virar "ambiguo".
    const nomesDa = (c) => {
      const set = new Set();
      const add = (x) => { const k = _chaveNome(x); if (k) set.add(k); };
      add(c.name_fav); add(c.name_und);
      // hist_all e race_card trazem os demais galgos; varremos o texto cru
      // porque o formato varia entre analises antigas e novas.
      for (const campo of [c.hist_all, c.race_card]) {
        if (!campo) continue;
        try {
          const o = typeof campo === 'string' ? JSON.parse(campo) : campo;
          const lista = Array.isArray(o) ? o : (o && o.galgos) || [];
          for (const g of lista) add(g && (g.nome || g.name));
        } catch (e) {
          // nao e' JSON: procura o nome como substring no texto do card
        }
      }
      return set;
    };
    const contem = (set, n, textoCru) => {
      if (!n) return false;
      for (const k of set) { if (k.includes(n) || n.includes(k)) return true; }
      return textoCru ? _chaveNome(textoCru).includes(n) : false;
    };
    const temNome = (c, n) => contem(nomesDa(c), n, (c.hist_all || '') + (c.race_card || ''));
    let porNome = poss.filter(c => temNome(c, nA) && temNome(c, nB));
    if (!porNome.length) porNome = poss.filter(c => temNome(c, nA) || temNome(c, nB));

    if (porNome.length === 1) {
      poss = porNome;
    } else if (porNome.length > 1) {
      // Desempate pelo par de traps: mesma pista, mesmo dia e os MESMOS dois
      // traps e' combinacao rara o bastante pra identificar a corrida.
      const ta = L.par.a.trap, tb = L.par.b.trap;
      const porTrap = porNome.filter(c =>
        (c.trap_fav === ta && c.trap_und === tb) || (c.trap_fav === tb && c.trap_und === ta));
      if (porTrap.length === 1) { poss = porTrap; }
      else {
      base.status = 'ambiguo';
      base.motivo = porNome.length + ' corridas possíveis: ' + porNome.map(c => c.hora_br).join(', ');
      resultado.push(base); continue;
      }
    } else {
      base.status = 'erro';
      base.motivo = 'os galgos não batem com nenhuma corrida de ' + L.pista;
      resultado.push(base); continue;
    }

    const c = poss[0];
    base.raceId = c.id; base.corrida = c.corrida; base.horaBr = c.hora_br;
    base.status = 'ok';

    if (!porCorrida.has(c.id)) porCorrida.set(c.id, []);
    porCorrida.get(c.id).push(base);
    resultado.push(base);
  }

  // Linhas que caíram na mesma corrida: somam as stakes. A odd vira a media
  // PONDERADA pela stake — e' o preco medio real da entrada, e nao a de uma
  // das duas escolhida a esmo.
  for (const [raceId, grupo] of porCorrida) {
    if (grupo.length < 2) continue;
    const somaStake = grupo.reduce((s, g) => s + g.stake, 0);
    const oddMedia = grupo.reduce((s, g) => s + g.odd * g.stake, 0) / somaStake;
    grupo.forEach((g, i) => {
      if (i === 0) {
        g.stake = Math.round(somaStake * 100) / 100;
        g.odd = Math.round(oddMedia * 1000) / 1000;
        g.motivo = 'somada com mais ' + (grupo.length - 1) + ' entrada(s) na mesma corrida';
      } else {
        g.status = 'agrupada';
        g.motivo = 'somada na linha ' + grupo[0].n;
        g.raceId = null;   // nao grava sozinha
      }
    });
  }

  return resultado;
}

// Entradas que JA existem no banco naquele(s) dia(s) e NAO estao na planilha.
// A planilha e' a verdade: o que nao esta nela nao teve aposta. Sem isso, uma
// entrada lancada por engano na tela ficaria pra sempre no Historico e na
// Banca, e a importacao daria a falsa impressao de ter corrigido o dia.
function _paraLimpar(db, plano, userId) {
  const dias = [...new Set(plano.map(p => p.dataISO).filter(Boolean))];
  if (!dias.length) return [];
  const manter = new Set(plano.filter(p => p.status === 'ok' && p.raceId).map(p => p.raceId));

  const out = [];
  for (const dia of dias) {
    const rows = db.prepare(
      "SELECT r.id, r.hora_br, r.corrida, rud.odd, rud.bet_unidades " +
      "FROM races r JOIN race_sessions s ON s.id = r.session_id " +
      "JOIN race_user_data rud ON rud.race_id = r.id AND rud.user_id = ? " +
      "WHERE s.user_id = ? AND date(s.created_at,'-3 hours') = ? " +
      "  AND rud.odd IS NOT NULL AND rud.odd != ''"
    ).all(userId, CANONICO, dia);
    for (const r of rows) {
      if (manter.has(r.id)) continue;
      out.push({ raceId: r.id, dia, horaBr: r.hora_br, corrida: r.corrida, odd: r.odd, stake: r.bet_unidades });
    }
  }
  return out;
}

// Grava as linhas com status "ok". O "bateu" NAO e' gravado: ele e' derivado
// da chegada + par escolhido na hora de exibir.
function aplicar(db, plano, userId, limpar) {
  let gravadas = 0, limpas = 0;

  // Primeiro apaga as entradas que nao estao na planilha. A Banca e' derivada
  // das corridas com odd preenchida, entao limpar aqui ja corrige o saldo do
  // dia — nao ha lancamento separado pra ajustar.
  for (const L of (limpar || [])) {
    if (!L || !L.raceId) continue;
    salvarPessoal(db, L.raceId, userId, 'odd', null);
    salvarPessoal(db, L.raceId, userId, 'bet_unidades', null);
    salvarPessoal(db, L.raceId, userId, 'bet_entrou', 0);
    salvarPessoal(db, L.raceId, userId, 'avb_escolhido', null);
    limpas++;
  }
  for (const L of plano) {
    if (L.status !== 'ok' || !L.raceId) continue;
    const escolha = {
      aTrap: L.par.a.trap, aNome: L.par.a.nome,
      bTrap: L.par.b.trap, bNome: L.par.b.nome,
      odd: L.odd,
      origem: 'importacao',
      ts: Math.round(Date.now() / 1000)
    };
    salvarPessoal(db, L.raceId, userId, 'avb_escolhido', JSON.stringify(escolha));
    salvarPessoal(db, L.raceId, userId, 'odd', L.odd);
    salvarPessoal(db, L.raceId, userId, 'bet_unidades', L.stake);
    salvarPessoal(db, L.raceId, userId, 'bet_entrou', 1);
    gravadas++;
  }
  return { gravadas, limpas };
}

module.exports = { lerCsv, simular, aplicar, paraLimpar: _paraLimpar, _num, _parseAvb, _dataISO, _pistaBate };