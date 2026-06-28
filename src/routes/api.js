const express = require('express');
const router = express.Router();
const multer = require('multer');
const fetch = require('node-fetch');
const db = require('../db/database');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Gerar prompt baseado nas configurações do banco
function buildPrompt(config) {
  return `Voce e um analisador especializado de corridas de galgos para apostas AvB e previsao de vencedor.

PRE-FILTROS: Descartar OR, Maiden, HP, Final, Sprint S, Dash D, Trial, distancia menor que ${config.dist_min}m ou maior que ${config.dist_max}m. Classes aceitas: ${config.classes_aceitas}. Descartar galgos com menos de ${config.min_corridas_uteis} corridas uteis.

=== PERFIL DO GALGO - CONTAR as ultimas 5 corridas ===
Para classificar o perfil CONTE quantas corridas em cada categoria:
- Subiu posicoes (bends crescendo ex 4332 5431): contar como RECUPERADOR
- Caiu posicoes (bends decrescendo ex 1234 2345): contar como FUMADOR  
- Liderou desde inicio (bends comecam em 1 ex 1111 1112): contar como FRONTRUNNER
- Variacao pequena (ex 2222 3323): contar como ESTAVEL

Classificar pelo padrao MAJORITARIO (3 ou mais de 5 corridas).
NUNCA classificar como Recuperador galgo com maioria de bends 1111 (esse e Frontrunner).
SE HOUVER DUVIDA classificar como Estavel.

Exemplo real - bends 1111 Fin3, 2111 Fin1, 4333 Fin3, 1220 Fin3, 1111 Fin2:
Subiu: apenas 4333 (1). Liderou: 1111, 2111, 1111 (3). Resultado: FRONTRUNNER.

=== HIERARQUIA DE ANALISE ===

1. CATEGORIA peso ${config.peso_categoria}x:
Validado = ja correu E competiu na classe atual. Subindo sem historico = penalizar FORTE + needsCap=true.
Vitoria em categoria inferior NAO comprova forca na superior.

2. CalTm peso ${config.peso_caltm}x:
SEMPRE CalTm NUNCA WnTm. Media ultimos 3-5 valores. Menor e melhor.
Diferenca maior que ${config.diff_caltm_significativa}s = significativa. Menor que ${config.diff_caltm_empate}s = empate.

3. ARRANQUE BENDS CHEGADA peso ${config.peso_bends}x:
Split menor = melhor saida mesma categoria. Bends subindo = Recuperador. By Sh Hd Nk = valorizr.

4. REMARKS peso ${config.peso_remarks}x:
MUITO POSITIVOS: ${config.remarks_muito_positivos}
POSITIVOS: ${config.remarks_positivos}
ATENUAM DERROTA nao penalizar: ${config.remarks_atenuantes}
NEGATIVOS: ${config.remarks_negativos}

5. BRT peso ${config.peso_brt}x: desempate apenas mesma pista e distancia.

=== NIVEIS DE CONFIANCA ===
Alta: pct >= ${config.pct_alta}
Media: pct >= ${config.pct_media}
Baixa: pct < ${config.pct_media}

=== OBSERVACAO ===
Explicar qual criterio foi DECISIVO. Maximo 15 palavras em portugues.
Termos: CalTm=Tempo Final, BRT=Melhor Tempo, SAw=Saida Lenta, RnOn=Acelerou no Final,
FinWll=Terminou Bem, FcdCk=Forcado a Frear, Bmp=Tomou Contato, Crd=Foi Espremido,
Fdd=Cansou no Final, NvrShwd=Nunca Apareceu, QAw=Saida Rapida.

=== VENCEDOR - OPCIONAL ===
So incluir objeto vencedor quando houver CLARA vantagem. Se parelha ou mesmo galgo do AvB sem vantagem clara NAO incluir.

=== RESPOSTA - APENAS JSON PURO ===
ZERO texto antes ou depois. Comece com { e termine com }.
Para cada corrida elegivel: 1 objeto tipo=avb obrigatorio + 1 objeto tipo=vencedor opcional.
Para descartadas: 1 objeto tipo=avb nivel=skip pct=0 trapFav=0 trapUnd=0.

{"races":[{"hora":"8:24","corrida":"Kinsley A7","dist":"462m","tipo":"avb","trapFav":4,"nameFav":"Got The Ballymac","trapUnd":2,"nameUnd":"Hazelgrove Flash","pct":62,"nivel":"media","perfilFav":"Frontrunner","perfilUnd":"Recuperador","obs":"T4 Tempo Final 29.18 vs T2 29.38. Ambos validados A7.","needsCap":false}]}`;
}

// POST /api/analyze
router.post('/analyze', upload.fields([{name:'pdfs'}, {name:'caps'}]), async (req, res) => {
  try {
    const config = db.prepare('SELECT * FROM analysis_config WHERE id = 1').get();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API Key nao configurada no servidor.' });

    const pdfFiles = req.files['pdfs'] || [];
    const capFiles = req.files['caps'] || [];

    if (!pdfFiles.length) return res.status(400).json({ error: 'Nenhum PDF enviado.' });

    const content = [];

    // Adicionar PDFs de corridas
    for (const file of pdfFiles) {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: file.buffer.toString('base64') }
      });
    }

    // Adicionar capivaras
    for (const file of capFiles) {
      const isImg = /\.(jpg|jpeg|png|webp)$/i.test(file.originalname);
      if (isImg) {
        content.push({ type: 'image', source: { type: 'base64', media_type: file.mimetype, data: file.buffer.toString('base64') } });
      } else {
        content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.buffer.toString('base64') } });
      }
    }

    const capNote = capFiles.length > 0 ? ` Foram fornecidas ${capFiles.length} capivara(s). Use para validar needsCap=true.` : '';
    content.push({ type: 'text', text: `Analise os PDFs. Retorne SOMENTE o JSON com as corridas. Nenhuma palavra antes ou depois.${capNote}` });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        system: buildPrompt(config),
        messages: [{ role: 'user', content }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ error: err.error?.message || 'Erro na API Anthropic' });
    }

    const data = await response.json();
    const raw = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = raw.split('```json').join('').split('```').join('').trim();
    const s = clean.indexOf('{"races"');
    const e = clean.lastIndexOf('}');

    if (s < 0 || e < 0) {
      console.error('Resposta da API:', raw.slice(0, 500));
      return res.status(500).json({ error: 'JSON nao encontrado na resposta da API.' });
    }

    const parsed = JSON.parse(clean.slice(s, e + 1));
    res.json(parsed);

  } catch (err) {
    console.error('Erro na analise:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/session - salvar sessão
router.post('/session', express.json(), (req, res) => {
  try {
    const { name, races } = req.body;
    const stmt = db.prepare('INSERT INTO sessions (name, total_races, total_avbs) VALUES (?, ?, ?)');
    const result = stmt.run(name || 'Sessao', races.length, races.filter(r => r.nivel !== 'skip').length);
    const sessionId = result.lastInsertRowid;

    const insertRace = db.prepare(`INSERT INTO races 
      (session_id, hora, hora_br, corrida, dist, trap_fav, name_fav, trap_und, name_und, pct, nivel, perfil_fav, perfil_und, obs, need_cap, odd, valor, resultado_1, resultado_2, resultado_3, bateu)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

    for (const r of races) {
      const horaBr = r.hora ? (() => {
        const p = r.hora.split(':');
        let h = parseInt(p[0]) - 4;
        if (h < 0) h += 24;
        return h + ':' + p[1];
      })() : '';

      insertRace.run(
        sessionId, r.hora||'', horaBr, r.corrida||'', r.dist||'',
        r.trapFav||0, r.nameFav||'', r.trapUnd||0, r.nameUnd||'',
        r.pct||0, r.nivel||'', r.perfilFav||'', r.perfilUnd||'',
        r.obs||'', r.needsCap?1:0,
        r.odd||null, r.valor||null,
        r.r1||null, r.r2||null, r.r3||null, r.hit||null
      );
    }

    res.json({ ok: true, sessionId });
  } catch (err) {
    console.error('Erro ao salvar sessao:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
