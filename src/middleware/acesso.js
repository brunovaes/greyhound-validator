'use strict';
// src/middleware/acesso.js
//
// FASE 2 do controle de acesso: aplicar a permissao na ROTA, no servidor.
//
// A Fase 1 escondia itens do menu. Esconder nao e' bloquear: quem digitasse
// /greyhound/config na barra de endereco entrava do mesmo jeito. Aqui a
// verificacao acontece antes de a rota responder.
//
// TRES TRAVAS DE SEGURANCA, na ordem em que importam:
//
//   1. ADMIN SEMPRE PASSA. Sem excecao, sem depender de configuracao. E' o que
//      garante que um erro de permissao nunca tranque o dono do sistema pra
//      fora — que e' o unico estrago dificil de desfazer aqui, porque a
//      propria tela de conserto estaria bloqueada.
//
//   2. ITEM SEM REGRA = LIBERADO. Herdado do can() da Fase 1. Esquecer de
//      cadastrar uma permissao deixa a coisa aberta, nunca fechada. Dos dois
//      erros possiveis, esse e' o recuperavel.
//
//   3. FALHA DO PROPRIO CONTROLE = LIBERA. Se o store quebrar por qualquer
//      motivo, a requisicao passa e o erro vai pro log. Um bug no controle de
//      acesso nao pode derrubar o sistema inteiro.
//
// Uso:
//   const { exigirAcesso } = require('../middleware/acesso');
//   router.get('/', exigirAcesso('screen.config'), (req,res) => {...});

let store = null;
try { store = require('../access/store'); } catch (e) {
  console.error('[acesso] store indisponivel, enforcement desligado:', e.message);
}

// Telas devolvem redirecionamento (o usuario ve uma pagina, nao um JSON cru);
// rotas de API devolvem 403, que e' o que o front sabe tratar.
function ehApi(req) {
  if (req.path && req.path.indexOf('/api/') === 0) return true;
  const aceita = String(req.headers['accept'] || '');
  return aceita.indexOf('application/json') !== -1 && aceita.indexOf('text/html') === -1;
}

function exigirAcesso(chave) {
  return function (req, res, next) {
    try {
      if (!req.user) return next();              // quem cuida disso e' o requireLogin
      if (req.user.role === 'admin') return next();  // TRAVA 1
      if (!store || typeof store.can !== 'function') return next();  // TRAVA 3

      if (store.can(req.user, chave)) return next();  // TRAVA 2 mora dentro do can()

      console.log('[acesso] bloqueado: user ' + req.user.id + ' -> ' + chave);
      const BASE = process.env.BASE_PATH || '/greyhound';
      if (ehApi(req)) {
        return res.status(403).json({ error: 'Sem permissao para acessar este recurso.', chave: chave });
      }
      return res.redirect(BASE + '/?semacesso=' + encodeURIComponent(chave));
    } catch (e) {
      console.error('[acesso] erro ao verificar "' + chave + '" (liberando):', e.message);
      return next();   // TRAVA 3
    }
  };
}

// Versao para usar dentro de uma rota que ja comecou a responder.
function podeAcessar(user, chave) {
  try {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (!store || typeof store.can !== 'function') return true;
    return store.can(user, chave);
  } catch (e) { return true; }
}

module.exports = { exigirAcesso, podeAcessar };