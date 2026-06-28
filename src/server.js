require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db/database');

const app = express();
const BASE = process.env.BASE_PATH || '/greyhound';
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'greyhound-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Static files
app.use(BASE + '/static', express.static(path.join(__dirname, '../public')));

// Routes
app.use(BASE, require('./routes/main'));
app.use(BASE + '/api', require('./routes/api'));
app.use(BASE + '/config', require('./routes/config'));

// Redirect root to base
app.get('/', (req, res) => res.redirect(BASE));

app.listen(PORT, () => {
  console.log(`Greyhound Validator rodando em http://localhost:${PORT}${BASE}`);
});
