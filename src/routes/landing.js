'use strict';
// src/routes/landing.js
// Serve a landing pública em "/" e a vitrine em "/conheca" (ambas fora do
// BASE, sem login). O HTML fica em public/landing/*.html com o token {{BASE}},
// trocado aqui pelo BASE_PATH real. Assets em public/landing/ via /static.
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const BASE = process.env.BASE_PATH || '/greyhound';

function load(name) {
  try {
    return fs.readFileSync(path.join(__dirname, '../../public/landing/' + name), 'utf8')
             .split('{{BASE}}').join(BASE);
  } catch (e) {
    console.error('[landing] erro lendo ' + name + ':', e.message);
    return '';
  }
}
const INDEX = load('index.html');
const CONHECA = load('conheca.html');

router.get('/', (req, res) => INDEX ? res.type('html').send(INDEX) : res.redirect(BASE));
router.get('/conheca', (req, res) => CONHECA ? res.type('html').send(CONHECA) : res.redirect(BASE));

module.exports = router;