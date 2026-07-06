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

// Rota publica (protegida por token proprio) que recebe o stream .m3u8
// enviado pela extensao Chrome — precisa vir ANTES do requireLogin
app.use(BASE, require('./routes/atrPush'));

// Rotas protegidas
const { requireLogin } = require('./middleware/auth');
app.use(BASE, requireLogin, require('./routes/main'));
app.use(BASE + '/api', requireLogin, require('./routes/api'));
app.use(BASE + '/config', requireLogin, require('./routes/config'));
app.use(BASE + '/robot', requireLogin, require('./routes/robot'));
app.use(BASE + '/static/pdfs', require('express').static(require('path').join(__dirname, '../public/pdfs')));

app.get('/', (req, res) => res.redirect(BASE));

app.listen(PORT, () => {
  console.log(`Greyhound Validator em http://localhost:${PORT}${BASE}`);
});