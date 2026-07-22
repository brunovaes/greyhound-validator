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
app.use(BASE + '/static/pdfs', require('express').static(require('path').join(__dirname, '../public/pdfs')));

// Landing pública na raiz (fora do BASE, sem login)
app.use('/', require('./routes/landing'));

app.listen(PORT, () => {
  console.log(`Greyhound Validator em http://localhost:${PORT}${BASE}`);
});