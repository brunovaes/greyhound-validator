'use strict';
// src/routes/landing.js
// Landing pública servida na raiz "/" (fora do BASE, sem exigir login).
// O HTML fica em public/landing/index.html com o token {{BASE}}, trocado
// aqui pelo BASE_PATH real (ex.: /greyhound) — assim os assets e o link de
// login continuam corretos mesmo se o BASE mudar.
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const BASE = process.env.BASE_PATH || '/greyhound';

const HTML_PATH = path.join(__dirname, '../../public/landing/index.html');
// Lê uma vez no boot e injeta o BASE (arquivo estático, não muda em runtime).
let HTML = '';
try {
  HTML = fs.readFileSync(HTML_PATH, 'utf8').split('{{BASE}}').join(BASE);
} catch (e) {
  console.error('[landing] não consegui ler index.html:', e.message);
}

router.get('/', (req, res) => {
  if (!HTML) return res.redirect(BASE); // fallback: se faltar o arquivo, vai pro app
  res.type('html').send(HTML);
});

module.exports = router;
