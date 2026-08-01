require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const BASE = process.env.BASE_PATH || '/greyhound';
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'greyhound-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(BASE + '/static', express.static(path.join(__dirname, '../public')));

// Auth routes (sem login necessario)
app.use(BASE, require('./routes/auth'));

// Rotas protegidas
const { requireLogin } = require('./middleware/auth');
app.use(BASE, requireLogin, require('./routes/main'));
app.use(BASE + '/api', requireLogin, require('./routes/api'));
app.use(BASE + '/config', requireLogin, require('./routes/config'));
app.use(BASE + '/robot', requireLogin, require('./routes/robot'));
app.use(BASE + '/banca', requireLogin, require('./routes/banca'));
app.use(BASE + '/acessos', requireLogin, require('./routes/acessos'));
// Web Push: inscricao de aparelhos e envio. Fica atras do requireLogin pra que
// cada inscricao nasca amarrada ao usuario logado.
app.use(BASE + '/api/push', requireLogin, require('./routes/push'));
app.use(BASE + '/static/pdfs', require('express').static(require('path').join(__dirname, '../public/pdfs')));

// Landing publica: "/" e "/conheca", fora do BASE e sem login. Precisa vir
// depois das rotas do BASE (nao ha conflito de caminho) e substitui o antigo
// redirect direto pro login. O proprio landing.js ja cai no redirect pro BASE
// se o HTML nao for encontrado, entao nao ha risco de rota morta.
app.use('/', require('./routes/landing'));

// Agendador do push: varre as corridas do dia e notifica X minutos antes da
// largada, respeitando o filtro (turno/pista/classe) de cada inscrito. Fica
// inerte se as chaves VAPID nao estiverem configuradas.
try { require('./push/agendador').iniciar(); } catch (e) { console.error('[push/agendador] nao iniciou:', e.message); }

app.listen(PORT, () => {
  console.log(`Greyhound Validator em http://localhost:${PORT}${BASE}`);
});