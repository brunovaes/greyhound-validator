'use strict';
// tools/valida-templates.js
//
// POR QUE ISTO EXISTE
// O node --check e o tools/valida.js so pegam ERRO DE SINTAXE. Nenhum dos dois
// percebe uma funcao que sumiu do arquivo mas continua sendo chamada dentro de
// um template literal — pra eles, aquilo ali e' texto.
//
// O sintoma e' 500 na abertura da tela, sem nenhum aviso antes do deploy. Ja
// aconteceu duas vezes: a coluna Motor e a cssCardGalgo, as duas removidas por
// engano junto com um bloco vizinho.
//
// Uso:  node tools/valida-templates.js src/routes/main.js
const fs = require('fs');
const arq = process.argv[2];
if (!arq) { console.error('uso: node tools/valida-templates.js <arquivo.js>'); process.exit(1); }
const src = fs.readFileSync(arq, 'utf8');

const chamadas = [...new Set([...src.matchAll(/\$\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)].map(m => m[1]))];
const nativas = ['String','Number','Boolean','JSON','Math','Date','Array','Object',
                 'parseInt','parseFloat','encodeURIComponent','decodeURIComponent'];
const alvo = chamadas.filter(f => nativas.indexOf(f) < 0);

const definidas = new Set([...src.matchAll(/function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)].map(m => m[1]));
[...src.matchAll(/(?:const|let|var)\s+\{([^}]*)\}\s*=\s*require/g)].forEach(m => {
  m[1].split(',').forEach(n => definidas.add(n.trim().split(':').pop().trim()));
});
[...src.matchAll(/(?:const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:function|\()/g)]
  .forEach(m => definidas.add(m[1]));

const faltando = alvo.filter(f => !definidas.has(f));
if (faltando.length) {
  console.error('\nFUNCAO CHAMADA E NAO DEFINIDA (a tela estoura 500 ao abrir):\n');
  faltando.forEach(f => {
    const i = src.indexOf('${' + f + '(');
    console.error('  ' + f + '  (usada na linha ' + (src.slice(0, i).split('\n').length) + ')');
  });
  console.error('');
  process.exit(1);
}
console.log(alvo.length + ' funcao(oes) chamada(s) em template, todas definidas.');