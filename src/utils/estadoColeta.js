'use strict';
// src/utils/estadoColeta.js — A COLETA DA MANHA ESTA RODANDO? (Bruno, 19/09/2026)
//
// Em 19/09 uma aba da Analisar criou o dia as 06:19 BRT, NO MEIO da coleta
// (o robo gravou PDF ate 06:23). Ela viu so os PDFs que ja existiam e gravou so
// as corridas nao skip: o dia ficou com 56 de 137 corridas. Quando a analise
// automatica terminou, a sessao ja existia e ela pulou.
//
// Este modulo e' so um sinal, na memoria do processo: o robot.js liga enquanto
// baixa os PDFs e roda a analise automatica, e o api.js conta pra tela (no
// /api/pdfs/hoje). A tela espera em vez de criar o dia pela metade.
//
// Fica em modulo proprio de proposito: o robot.js ja importa o api.js, e o
// api.js importar o robot.js de volta fecharia um ciclo de require.
const estado = { rodando: false, desde: null };

function ligar() { estado.rodando = true; estado.desde = Date.now(); }
function desligar() { estado.rodando = false; estado.desde = null; }
function rodando() { return estado.rodando; }

module.exports = { ligar, desligar, rodando };
