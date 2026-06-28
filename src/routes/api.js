const express = require('express');
const router = express.Router();
const multer = require('multer');
const fetch = require('node-fetch');
const { db, getUserConfig } = require('../db/database');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function buildPrompt(config) {
  return `Voce e um analisador especializado de corridas de galgos para apostas AvB e previsao de vencedor.

PRE-FILTROS: Descartar OR, Maiden, HP, Final, Sprint S, Dash D, Trial, distancia menor que ${config.dist_min}m ou maior que ${config.dist_max}m. Classes aceitas: ${config.classes_aceitas}. Descartar galgos com menos de ${config.min_corridas_uteis} corridas uteis.

PERFIL DO GALGO - CONTAR as ultimas 5 corridas:
RECUPERADOR: maioria subindo posicoes nos bends (ex: 4332, 5431). Ideal para AvB.
FUMADOR: maioria caindo nos bends (ex: 1234, 2345). Risco.
FRONTRUNNER: maioria liderando desde inicio (bends 1111, 1112). NAO e Recuperador.
ESTAVEL: variacao pequena (ex: 2222, 3323). Se houver duvida, classificar como Estavel.
EXEMPLO: bends 1111, 2111, 4333, 1220, 1111 = 3 corridas liderando = FRONTRUNNER.

HIERARQUIA (ordem obrigatoria):
1. CATEGORIA vs CalTm - REGRA PRINCIPAL:
- Diferenca de ${config.max_cat_diff_caltm||1} nivel(is) de categoria: CalTm pode decidir. Ex: A5 vs A6 com 1 nivel de diferenca = se A6 tem CalTm claramente melhor (>${config.diff_caltm_significativa}s), ele pode ser favorito.
- Diferenca de 2+ niveis: CATEGORIA DECIDE SEMPRE, independente do CalTm. Ex: A5 vs A7 = A7 nao pode ser favorito sobre A5 mesmo com tempo melhor.
- Galgo nunca correu na classe atual E diferenca > ${config.max_cat_diff_caltm||1} nivel = penalizar FORTE + needsCap.
- Vitoria em categoria 2+ niveis inferior NAO comprova forca na superior.
2. CalTm peso ${config.peso_caltm}x: SEMPRE CalTm NUNCA WnTm. Media 3-5 valores. Menor = melhor. Dif >${config.diff_caltm_significativa}s = significativa.
3. BENDS/ARRANQUE peso ${config.peso_bends}x: Split menor = melhor saida. Bends subindo = Recuperador. By Sh/Hd/Nk = valorizar.
4. REMARKS peso ${config.peso_remarks}x:
   MUITO POSITIVOS: ${config.remarks_muito_positivos}
   POSITIVOS: ${config.remarks_positivos}
   ATENUAM: ${config.remarks_atenuantes}
   NEGATIVOS: ${config.remarks_negativos}
5. BRT peso ${config.peso_brt}x: desempate apenas.

OBSERVACAO: explicar o criterio DECISIVO. Max 15 palavras em portugues.
Termos: CalTm=Tempo Final, BRT=Melhor Tempo, SAw=Saida Lenta, RnOn=Acelerou no Final, FinWll=Terminou Bem, FcdCk=Forcado a Frear, Bmp=Tomou Contato, Fdd=Cansou no Final, NvrShwd=Nunca Apareceu.

VENCEDOR: so incluir quando houver CLARA vantagem. Se parelha NAO incluir.

RESPOSTA: APENAS JSON PURO. Comece com { e termine com }. Zero texto antes ou depois.
Para cada corrida: 1 objeto tipo=avb + 1 objeto tipo=vencedor (opcional).
Descartadas: tipo=avb, nivel=skip, pct=0, trapFav=0, trapUnd=0.

{"races":[{"hora":"8:24","corrida":"Kinsley A7","dist":"462m","tipo":"avb","trapFav":4,"nameFav":"Got The Ballymac","trapUnd":2,"nameUnd":"Hazelgrove Flash","pct":62,"nivel":"media","perfilFav":"Frontrunner","perfilUnd":"Recuperador","obs":"T4 Tempo Final 29.18 vs T2 29.38. Ambos validados A7.","needsCap":false}]}`;
}

router.post('/analyze', upload.fields([{name:'pdfs'},{name:'caps'}]), async (req, res) => {
  try {
    const user = req.user;
    
    // Verificar limite
    if (user.analyses_limit !== 999999 && user.analyses_used >= user.analyses_limit) {
      return res.json({ limitReached: true, races: [] });
    }

    const config = getUserConfig(user.id);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API Key nao configurada.' });

    const pdfFiles = req.files['pdfs'] || [];
    const capFiles = req.files['caps'] || [];
    if (!pdfFiles.length) return res.status(400).json({ error: 'Nenhum PDF enviado.' });

    const content = [];
    for (const file of pdfFiles) {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.buffer.toString('base64') } });
    }
    for (const file of capFiles) {
      const isImg = /\.(jpg|jpeg|png|webp)$/i.test(file.originalname);
      if (isImg) content.push({ type: 'image', source: { type: 'base64', media_type: file.mimetype, data: file.buffer.toString('base64') } });
      else content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.buffer.toString('base64') } });
    }
    content.push({ type: 'text', text: 'Analise os PDFs. Retorne SOMENTE o JSON. Zero texto antes ou depois.' + (capFiles.length ? ` ${capFiles.length} capivara(s) fornecida(s).` : '') });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 6000, system: buildPrompt(config), messages: [{ role: 'user', content }] })
    });

    if (!response.ok) { const e = await response.json(); return res.status(500).json({ error: e.error?.message || 'Erro API' }); }

    const data = await response.json();
    const raw = data.content.filter(b=>b.type==='text').map(b=>b.text).join('');
    const clean = raw.split('```json').join('').split('```').join('').trim();
    const s = clean.indexOf('{"races"');
    const e = clean.lastIndexOf('}');
    if (s < 0 || e < 0) return res.status(500).json({ error: 'JSON nao encontrado na resposta.' });

    const parsed = JSON.parse(clean.slice(s, e+1));
    
    // Incrementar contador de análises
    db.prepare('UPDATE users SET analyses_used=analyses_used+1 WHERE id=?').run(user.id);

    res.json(parsed);
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/session', express.json(), (req, res) => {
  try {
    const user = req.user;
    const { name, races } = req.body;
    const result = db.prepare('INSERT INTO race_sessions (user_id, name, total_races, total_avbs) VALUES (?,?,?,?)').run(user.id, name||'Sessao', races.length, races.filter(r=>r.nivel!=='skip').length);
    const sessionId = result.lastInsertRowid;

    const ins = db.prepare(`INSERT INTO races (session_id,user_id,hora,hora_br,corrida,dist,trap_fav,name_fav,trap_und,name_und,pct,nivel,perfil_fav,perfil_und,obs,need_cap,odd,valor,resultado_1,resultado_2,resultado_3,bateu) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

    for (const r of races) {
      const p = (r.hora||'').split(':');
      let h = parseInt(p[0]||0) - 4; if(h<0) h+=24;
      const horaBr = p.length>=2 ? h+':'+p[1] : '';
      ins.run(sessionId, user.id, r.hora||'', horaBr, r.corrida||'', r.dist||'', r.trapFav||0, r.nameFav||'', r.trapUnd||0, r.nameUnd||'', r.pct||0, r.nivel||'', r.perfilFav||'', r.perfilUnd||'', r.obs||'', r.needsCap?1:0, r.odd||null, r.valor||null, r.r1||null, r.r2||null, r.r3||null, r.hit||null);
    }
    res.json({ ok: true, sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
