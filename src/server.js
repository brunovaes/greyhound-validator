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

// Injeta o alerta global (alarme de corridas) em TODAS as paginas HTML
// autenticadas, pra o alarme tocar em qualquer tela (robo, historico, banca,
// configuracoes...). Na tela de analise o script fica passivo (o app.js ja
// cuida do alarme la). Nao afeta login (montado antes) nem respostas JSON.
app.use((req, res, next) => {
  const origSend = res.send.bind(res);
  res.send = function (body) {
    try {
      if (typeof body === 'string' && body.indexOf('<!DOCTYPE') !== -1 && body.indexOf('</body>') !== -1 && body.indexOf('alertaGlobal.js') === -1) {
        body = body.replace('</body>', `<script src="${BASE}/static/js/alertaGlobal.js"></script></body>`);
      }
    } catch (e) {}
    return origSend(body);
  };
  next();
});

// Rotas protegidas
const { requireLogin } = require('./middleware/auth');
app.use(BASE, requireLogin, require('./routes/main'));
app.use(BASE + '/api', requireLogin, require('./routes/api'));
app.use(BASE + '/config', requireLogin, require('./routes/config'));
app.use(BASE + '/robot', requireLogin, require('./routes/robot'));
app.use(BASE + '/banca', requireLogin, require('./routes/banca'));
app.use(BASE + '/static/pdfs', require('express').static(require('path').join(__dirname, '../public/pdfs')));

app.get('/', (req, res) => res.redirect(BASE));

app.listen(PORT, () => {
  console.log(`Greyhound Validator em http://localhost:${PORT}${BASE}`);
});