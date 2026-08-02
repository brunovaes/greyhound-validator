// tools/valida.js
//
// Valida o JavaScript que vive DENTRO dos blocos <script> das telas.
//
// Por que existe: as telas sao HTML montado dentro de template literals no
// servidor (res.send(`...`)). Rodar "node --check arquivo.js" valida so o
// backend — o conteudo do <script> e' apenas texto pro Node, entao um erro de
// sintaxe ali passa despercebido, vai pro ar, e derruba a tela inteira no
// navegador (o menu para de funcionar junto).
//
// A pegadinha: nao basta ler o texto do <script>. O template literal RESOLVE
// os escapes antes de o navegador receber. No fonte voce escreve \\' e o
// navegador recebe \' ; voce escreve \n e ele recebe uma quebra de linha de
// verdade, que pode partir uma string ao meio. Por isso este script AVALIA o
// template literal (deixa o Node resolver) e so entao confere a sintaxe.
//
// Uso:
//   node tools/valida.js src/routes/config.js
//   node tools/valida.js src/routes/config.js src/routes/main.js
//
// Sai com codigo 1 se achar erro, entao da pra usar em pre-commit.

const fs = require('fs');

const arquivos = process.argv.slice(2);
if (!arquivos.length) {
  console.log('uso: node tools/valida.js <arquivo.js> [outro.js ...]');
  process.exit(2);
}

let falhasTotais = 0;

for (const arq of arquivos) {
  let src;
  try { src = fs.readFileSync(arq, 'utf8'); }
  catch (e) { console.log(`${arq}: NAO CONSEGUI LER (${e.message})`); falhasTotais++; continue; }

  const re = /<script>([\s\S]*?)<\/script>/g;
  let m, n = 0, falhas = 0;

  while ((m = re.exec(src))) {
    // Neutraliza as interpolacoes ${...}, preservando todo o resto exatamente.
    const corpo = m[1].replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, 'X');

    let real;
    try {
      // Avalia como template literal: aqui o Node resolve \\' -> \' , \n -> quebra.
      real = new Function('return `' + corpo.replace(/`/g, '\\`') + '`;')();
    } catch (e) {
      console.log(`  ${arq} [bloco ${n}]: nao consegui avaliar o template: ${e.message}`);
      falhas++; n++; continue;
    }

    try {
      new Function(real);   // e' aqui que o erro de sintaxe aparece
      console.log(`  ${arq} [bloco ${n}]: OK (${real.length} chars)`);
    } catch (e) {
      falhas++;
      console.log(`  ${arq} [bloco ${n}]: *** ERRO DE SINTAXE: ${e.message}`);
      // Mostra as linhas mais provaveis: as que ainda tem escape ou onclick.
      real.split('\n').forEach((l, i) => {
        if (/onclick=|\\'|\\"/.test(l)) console.log(`      linha ${i + 1}: ${l.trim().slice(0, 140)}`);
      });
    }
    n++;
  }

  if (n === 0) console.log(`  ${arq}: nenhum bloco <script> encontrado`);
  falhasTotais += falhas;
}

if (falhasTotais) { console.log(`\n${falhasTotais} bloco(s) com erro.`); process.exit(1); }
console.log('\nTudo certo.');