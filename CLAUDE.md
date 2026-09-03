# CLAUDE.md - Greyhound Factory

Regras permanentes deste repositorio. Leia antes de tocar em qualquer arquivo.

---

## 1. O projeto

App de analise de corridas de galgos do Reino Unido. Node.js + Express + SQLite
(better-sqlite3), deploy no Railway. Robo coleta PDFs de race card via
Browserless.io; motor deterministico pontua e monta confrontos AvB.

Dono: Bruno. Ambiente: **Windows**. Comandos sao `findstr`, `copy`, `dir`,
`type` - nao `grep`, `cp`, `ls`, `cat`.

Filosofia do produto: **"menos e mais"**. Poucas apostas por dia, de alta
conviccao. Qualquer feature que aumente volume as custas de conviccao vai contra
o desenho.

---

## 2. Regras de entrega

- Arquivos **completos**, nunca trechos. Se o arquivo e grande, entregue inteiro
  mesmo assim.
- Bloco de comandos git no fim, copiavel na tela, com o mapa de destino.
  **Nunca** como arquivo anexo.
- **CRLF** em todos os arquivos.
- **Sem em-dash** em texto que aparece na tela.
- Comentar o **porque** no codigo, principalmente onde a decisao nao e obvia.
  Comentario que mente e pior que comentario ausente.
- Levantar consequencia **antes** de implementar. Dizer quando discorda.
- Quando errar, dizer que errou e o que causou, sem rodeio.
- O Bruno decide o produto. Levante o trade-off, recomende, mas a escolha e dele.

### Nomes iguais em pastas diferentes

Se dois arquivos de destino diferente tiverem nome parecido, **renomeie um** na
entrega. O `app.js` ja foi copiado por cima do `main.js` e derrubou o servidor em
producao. Desde entao o `src/routes/main.js` e entregue como `main-servidor.js`.

**Estado atual do repo:** existe um `liveOddsRobot.js` solto na raiz (untracked)
e o real em `src/routes/liveOddsRobot.js`. Mesma armadilha, armada. Tambem ha
`_api_motor_bkp.js` e `_robot_motor_bkp.js` na raiz. Resolver antes de editar
qualquer um desses.

---

## 3. Validadores e testes - rodar SEMPRE antes de commitar

```
node --check <arquivo>                    sintaxe
node tools/valida.js <arquivo>            blocos <script> embutidos
node tools/valida-templates.js <arquivo>  funcao chamada em template mas ausente
```

O `node --check` **nao** valida JS dentro de `<script>` em template literal. O
`valida-templates.js` nasceu depois de um erro 500 na abertura de tela que passou
limpo pelo `node --check`.

### Testes existentes (raiz, Node, rodam contra o codigo real)

```
teste_painel_dia.js       distribuicao e alarme por transicao
teste_board_dia.js        board, marca ENTREI, "abriu nao colou", piscar
teste_analisar_painel.js  standby, tiles, snapshot da entrada
teste_plug.js             telas ligadas, ordem dos scripts
teste_painel_filhos.js    roda o painel e confere os 5 filhos (pega truncamento)
teste_render_hist.js      funcao ausente + cabecalho x linha alinhados
teste_abas_config.js      botao <-> painel 1 pra 1
teste_save_preserva.js    save nao apaga campo fora da tela
teste_cascata*.js         funil, pistas, filtros, aviso de nao aplicado
teste_alarme_top.js       4 campos + disparo, data e fire-once
teste_so_top.js           origens TOP/SECUNDARIA/SURPRESA
teste_bateu_fonte_unica.js  bateu gravado x bateuPar, proibe chute (ver 9.4-i)
```

**Ao mexer no Historico, o `teste_render_hist.js` e a rede minima.**
Todo teste novo roda contra o codigo real (extrai a funcao do arquivo e executa),
nunca contra suposicao.

**ATENCAO (03/09/2026):** dos testes acima, so o `teste_bateu_fonte_unica.js`
existe no disco hoje. Os outros nunca foram commitados (eram untracked na raiz) e
sumiram. A lista fica aqui como registro do que ja teve rede e precisa voltar a
ter, mas **nao conte com eles**: rodar `node teste_painel_dia.js` hoje da "arquivo
nao encontrado", nao "passou".

---

## 4. Armadilhas ja pagas - nao repita

**Concatenacao truncada.** Ao trocar um bloco no `renderFocusPanel`, o `+` que
ligava a proxima parte foi removido junto. O JS encerrou a atribuicao ali e
tratou o resto como expressao solta. **Nao da erro de sintaxe, nenhum validador
pega, e a tela abre pela metade.** Rede: `teste_painel_filhos.js`.

**Abas quebradas.** Remover secoes do `config.js` levou junto as tags de abertura
de tres abas. Botoes apontando para paineis inexistentes, tela vazia, sem erro.
Rede: `teste_abas_config.js`.

**Save que apaga em silencio.** O `POST /save` do `config.js` gravava uma lista
fixa de colunas; campo removido da tela chegava `undefined` e gravava o padrao
por cima do banco. Salvar a config uma vez zerava todos os pesos. Corrigido: o
save le a linha atual e aplica o formulario por cima. Vale para qualquer remocao
futura de campo. Rede: `teste_save_preserva.js`.

**Altura em grid.** A barra de Odd sumia do painel. Tres tentativas em CSS dentro
da coluna; a causa era a **linha do grid pai** ser `auto`. `min-height:0` no item
nao resolve, quem manda e a linha.

**Troca de regua sobrescrevendo a outra.** Na Cascata, trocar o seletor mudava so
o rotulo e mantinha os numeros; o save seguinte gravava os valores da regua
anterior com a etiqueta da nova. O Bruno perdeu uma calibragem. Hoje existe uma
regua so e o seletor foi removido.

**Edicao sobre copia velha.** Trabalho do motor foi perdido **duas vezes** por
edicao em cima de copia desatualizada de arquivo compartilhado. Com acesso ao
disco isso nao deveria acontecer: **sempre leia o arquivo do disco antes de
editar**, nunca de memoria ou de conversa anterior.

### Convencoes de codigo herdadas

- Usar `CANONICO` em vez de `req.user.id`.
- Nunca usar `onclick="fn('texto')"` inline dentro de template literal.
- Nunca usar sintaxe `/regex/` dentro de blocos script de detalhe de sessao
  (causa SyntaxError no browser).

---

## 5. Mapa de arquivos

```
src/app.js                      extraido para evitar erro de template string
src/routes/main.js              telas (entregar como main-servidor.js)
src/routes/api.js               API principal + GET /api/painel-dia
src/routes/robot.js             robo de coleta + endpoints /diag + painel admin
src/routes/liveOddsRobot.js     robo de odds ao vivo da BetWinner
src/routes/resultsRobot.js      scraping de resultados (Racing Post)
src/routes/cardMonitorRobot.js  monitor de race cards
src/routes/banca.js             banca e curva de capital
src/routes/config.js            tela de configuracoes
src/routes/auth.js              autenticacao
src/db/database.js              schema e migracoes
src/db/compartilhado.js         helpers de dados compartilhados
src/utils/motorManha.js         precalcDaCorrida, watchlist da manha
src/utils/pdfParser.js          parser dos race cards
src/utils/designTokens.js       tokens visuais
src/utils/icons.js              icones
src/utils/auditLog.js           log de auditoria
src/utils/exportDerrotas.js     exportacao de derrotas
src/utils/avbResultado.js       FONTE UNICA do "bateu" (bateuPar, vereditoAvB,
                                recalcularBateu, motivoDoRecalculo)
src/utils/recalcBateuDia.js     recalculo do bateu de um dia (planejar/aplicar)
public/js/painelDia.js          camada compartilhada (polling + alarme)
public/js/boardDia.js           board do dia (Historico)
public/js/analisarPainel.js     Analisar: standby + tiles
public/js/cascata.js            painel admin "Cascata de Cortes"
tools/valida.js                 validador de script embutido
tools/valida-templates.js       validador de funcao em template
tools/recalc-bateu.js           regrava o bateu de um dia (shell, --aplicar)
```

Historicamente o repo era dividido entre dois chats (UI e MOTOR) com donos por
arquivo. **Desde 03/09/2026 e um chat so**, front e back juntos. A divisao de
donos nao vale mais, mas a regra de ler do disco antes de editar continua valendo
com forca total.

---

## 6. Modelo atual do motor (contrato Rev.4 - Painel do Dia)

O PDF da manha virou lista de espera. Quem confirma e a BetWinner: a colagem e
medida na **odd individual de cada galgo na BW**, nao mais na SP do PDF.

### Camadas (aposentaram VIP / Secundaria / Surpresa)

| Camada | Cor | Regra | Apita |
|---|---|---|---|
| OPORTUNIDADE | cinza | achado da manha (regua + pct > 70 + SP <= 1.8), aguardando a BW | nao |
| TOP | `#22e08a` | era OPORTUNIDADE e abriu **colada** na BW (razao <= 1.5) | sim |
| HIGH | `#ff8c1a` | mesma qualidade + colada, mas nao estava na lista da manha | sim |
| GOOD | `#4aa8ff` | colada + pct > 70, com a regua de qualidade afrouxada (tier null) | sim |

**Colagem:** razao entre as probabilidades implicitas das odds individuais na BW,
sem margem da casa. `razao = maior_prob / menor_prob`. Colada = razao <= 1.5.
1.0 = 50/50.

A promocao e **derivada a cada leitura**, nao ha pipeline nem tabela de promocao.

### Endpoint de producao

`GET /greyhound/api/painel-dia?date=YYYY-MM-DD` - autenticado, cache 12s,
polling de 15 a 20s.

```
{ date, atualizado_em, corridas:[ {
    race_id, hora, hora_br, corrida, pista, dist,
    entrada: {odd, stake, em, id_confronto} | null,
    confrontos: [ {
      id, par, pick_trap, outro_trap, pick_nome, outro_nome,
      pct, sp_ratio, camada, no_board_top,
      odd_bw, razao_mercado, market_pct,
      promovido_em, aguardando_entrada, escolhido, bateu
    } ]
} ] }
```

Derivacao das telas:
- Historico (board) = `no_board_top = true`
- Analisar (tiles) = `aguardando_entrada = true`, max 4, mais novos primeiro
- ENTREI = corrida com `entrada != null`, confronto com `escolhido = true`

### Entrada da aposta

`PUT /greyhound/api/race/{race_id}` com `{ odd, bet_unidades, avb_escolhido }`.
E **por corrida**. **Uma aposta por corrida**, cravado. O `avb_escolhido` e
snapshot em string JSON com traps, nomes, odd, pct e `origem` = a **camada**.
Guardar a odd e os % do momento: o mercado muda e nao da pra reconstruir.

### Duas nuances que nao sao bug

- **`promovido_em` e aproximado** (se move enquanto o mercado enche). **Nao serve
  pra deduplicar alarme.** O gatilho e a **transicao de camada** entre polls.
- Confronto pode vir com `camada: OPORTUNIDADE` e `odd_bw` preenchido: e "a BW
  abriu mas abriu larga, nao colou". **Nao apita.**

### Diagnosticos (admin, so-leitura)

```
/greyhound/robot/diag/oportunidades?date=&faixa=1.8
/greyhound/robot/diag/oportunidades-bw?date=&teto=1.5
/greyhound/robot/diag/oportunidades-bw-resultado?date=&teto=1.5&faixa=1.8
```

O terceiro e a fonte do painel admin **"Placar Camadas"**.

### Tabelas relevantes

```
races               corridas e hist_full / hist_all dos PDFs
avb_abertos         pares frente-a-frente que a BW abriu (pares_json)
odds_vencedor       odds individuais do mercado "Vencedor" (valida a colagem)
race_user_data      odd, bet_unidades, avb_escolhido (JSON com origem = camada)
analysis_config     cortes da regua, filtro de pistas, alarme_top_*
```

---

## 7. Decisoes de UI que tem motivo (nao desfazer sem pensar)

- **Uma fonte so de polling** (`painelDia.js`) alimenta as duas telas. Duas
  copias tocariam o alarme duas vezes.
- **Primeira volta de cada aba so registra.** Abrir a tela com 3 confrontos ja
  promovidos dispararia 3 alarmes de promocoes que ninguem viu acontecer.
- **Corrida ja apostada nao apita** em nenhum confronto dela (uma aposta por
  corrida; apitar chamaria para uma aposta impossivel).
- Alarme toca **uma vez por volta**, prioridade TOP > HIGH > GOOD.
- **Falha de busca fica visivel.** Painel silenciosamente parado, numa tela onde
  o alarme e o produto, e pior que painel vazio.
- `bateu` null vira **"aguarda"**, nunca "nao". Corrida que ainda vai acontecer
  nao e derrota.
- Odd e razao ficam **vazias** antes de abrir, nunca zero.
- O tile **nao some sozinho** apos o "Entrei!": espera a volta do painel. Sumir e
  a gravacao falhar deixaria o Bruno achando que apostou.
- Os scripts de `public/js` carregam **depois do `app.js`**, porque o tile usa o
  `_cardAvb` de la.
- Comparacao de par e **insensivel a ordem** (2x3 = 3x2), senao o botao de
  inverter quebra o casamento com o ENTREI.

---

## 8. Estado atual (03/09/2026)

Confirmado no ar e em `origin/main` (HEAD `d8c3c6b`):

- `GET /api/painel-dia` validado, com `pick_nome`/`outro_nome` em 100% dos
  confrontos.
- Diagnosticos `/diag/oportunidades*` no ar.
- Entrada `PUT /api/race/:id` com `origem` = camada.
- Painel admin **Placar Camadas** no ar.
- Captura de `odds_vencedor` (callback `onDogs`) gravando em producao.

### Numeros do dia 03/09 (fechado, fonte `-resultado`)

| Camada | n | acerto | ROI (stake fixa) |
|---|---|---|---|
| TOP | 4 | 75% | +31,5% |
| HIGH | 2 | 50% | -21,5% |
| GOOD | 28 | 60,7% | +14,6% |

A ordem TOP > HIGH > GOOD **nao** se confirmou no dia fechado. A ordem real foi
TOP > GOOD > HIGH. Amostra minima em TOP e HIGH: **nao calibrar nada nisso.**

---

## 9. Pendencias

### 9.1 Placar por corrida (prioridade)

O ROI do Placar hoje e ficticio: assume aposta em todas as linhas, mas a regra e
**uma aposta por corrida**. As 29 linhas GOOD de 03/09 estao em 21 corridas, e
clusters inflam o numero (DunPk A2 tinha 3 GOOD e as 3 bateram). Camadas tambem
competem pela mesma corrida (Newc A7 9:28: o TOP perdeu, um GOOD ganhou).

Adicionar um segundo placar: **acerto e ROI por corrida**, escolhendo uma linha
por corrida na prioridade TOP > HIGH > GOOD. O atual mede a qualidade do sinal; o
novo mede o rendimento da operacao. Manter os dois.

### 9.2 Historico com uma linha por AvB (trabalho principal)

Hoje a tabela tem uma linha por **corrida**. Passa a ter uma linha por **AvB**
(ate 4 por corrida), com TOP, HIGH e GOOD todos aparecendo.

1. Linhas **soltas**, ordenadas por hora, sem agrupar.
2. **Uma tabela so**, nao criar outra tela nem outra lista.
3. Coluna nova **ENTREI**, filtravel (todas / entrei / nao entrei).
4. **Observacoes encolhe** bastante para dar espaco.
5. Primeira carga = oportunidades da manha; novos AvBs entram durante o dia.
6. Filtro padrao ao abrir: so o contabilizavel (TOP + o que ele entrou). As
   demais a um clique. **O filtro nao e lembrado entre visitas.**

**Contabilizacao (regra do Bruno):** denominador = **todos os TOP + qualquer AvB
de outra camada em que ele ENTROU**. HIGH e GOOD sem entrada nao contam. TOP sem
aposta **conta** (se contasse so o apostado, entrar em 2 de 5 TOP e acertar os 2
daria 100%, a inflacao que ele quer evitar). Mostrar tres valores no card:
*Motor (TOP)*, *Minhas fora do TOP*, *Total*. A Banca continua 1 aposta por
corrida.

**Cuidados:** com uma linha por AvB, campos da **corrida** (Resultado,
Observacoes, AvB na BW) repetem nas linhas. Os KPIs hoje contam **linhas
visiveis** e precisam passar a contar pela regra acima. Entrada em par fora da
lista de confrontos (inverteu, ou o painel nao listou) vira **linha extra marcada
ENTREI**: a aposta nao pode sumir do Historico.

**Divergencia com o contrato:** o backend marca HIGH e GOOD com
`no_board_top: false`. O Bruno quer **todos** na lista. Ajustar a leitura.

### 9.3 Respondido lendo o codigo (03/09/2026)

**1. O `/api/painel-dia` responde para data passada? SIM.** E os confrontos **nao
ficam gravados em lugar nenhum**: sao recalculados a cada chamada.

- `api.js:1600` aceita `?date=YYYY-MM-DD`; hoje e so o default.
- As duas fontes sao filtradas por essa data e ambas persistem: `races` via
  `date(s.created_at,'-3 hours')=?` e `avb_abertos WHERE data=?`
  (`api.js:1625-1628`). O overlay pessoal sai de `race_user_data`.
- **Nao existe purge** de `avb_abertos` (nenhum DELETE no repo) nem de
  `races` / `race_sessions`. Os unicos deletes sao manuais, por sessao:
  `api.js:1583` e `main.js:1911`.

Logo, a camada de cada AvB e **derivada na hora**, de `races.hist_full/hist_all/
race_card` (motor) cruzado com `avb_abertos.pares_json` (mercado). Sessao antiga
tem de onde tirar TOP/HIGH/GOOD: o Historico nao precisa de dois comportamentos.

**2. O `bateu` do confronto e derivado no servidor a cada leitura.** Nao e
backfill nem ao vivo: nao existe coluna de `bateu` por confronto. `api.js:1660`
chama `bateuPar(row.finishing_order_json, pick_trap, outro_trap)`. A alternativa
que estava proposta aqui **ja e a implementacao atual**.

Consequencia boa: HIGH e GOOD **nao** nascem com a coluna vazia para sempre.
Quando o resultsRobot gravar o `finishing_order_json` da corrida, todas as linhas
AvB daquela corrida resolvem juntas, inclusive de dias passados. Quem preenche o
`finishing_order_json` e so o resultsRobot (`resultsRobot.js:194`, UPDATE unico),
por cron em janela BRT (`robot.js:260-280`) ou manual via
`POST /robot/results/run` com `date` no body (`robot.js:2700`) - o backfill por
data arbitraria existe e funciona.

**Ponto de atencao (nao verificado em producao):** corrida com `nivel='skip'`
nunca recebe resultado, porque o resultsRobot filtra
`(r.nivel!='skip' OR r.card_suspect=1)` (`resultsRobot.js:185-189`), enquanto o
painel-dia so exige `hist_full IS NOT NULL` (`api.js:1623-1626`). Um GOOD numa
corrida skip ficaria `bateu: null` para sempre, virando "aguarda" eterno.
Conferir no Railway antes de implantar a tabela por AvB:

```sql
SELECT nivel, COUNT(*) n, SUM(hist_full IS NOT NULL) comhist FROM races GROUP BY nivel;
```

Se `comhist` for maior que zero na linha `skip`, e bug garantido no Historico
novo. Outro ponto: o `finishing_order_json` pode ser **parcial** e falha em
silencio - o loop de 1 a 6 (`resultsRobot.js:361-370`) so empurra a posicao
quando consegue mapear nome para trap, e trap nao mapeado some da lista.

### 9.4 Divergencias e armadilhas do modelo derivado

**(i) `races.bateu` heuristico x `bateuPar` - CORRIGIDO em 03/09/2026.** O
resultsRobot decidia o `bateu` por **nome** e chutava quando nao achava o
underdog na chegada: `bateu = posFav <= 3 ? 'sim' : 'nao'`
(`resultsRobot.js`), com `'nao'` como valor inicial quando nao achava nenhum dos
dois. O `recalcularBateu` do `robot.js` repetia o mesmo chute. No mesmo caso o
`bateuPar` devolve `null` (indefinido), entao existia linha em que a coluna do
banco dizia "sim" e a tela dizia "aguarda" - a tela do Historico ja
sobrescrevia com `bateuPar` (`main.js:2226-2243`), mas os KPIs globais
(`main.js:514` e `main.js:1845`) liam a coluna crua.

Hoje os dois escritores derivam de `bateuPar` sobre a chegada, caem para
comparacao por nome **so quando os dois galgos foram achados**, e gravam `''`
(indefinido) em vez de chutar. Rede: `teste_bateu_fonte_unica.js`. **Nao
reintroduzir chute:** um `'nao'` inventado vira derrota no placar.

O `recalcularBateu` saiu do `robot.js` e mora no `avbResultado.js`, junto do
`bateuPar`: sao tres consumidores (o reprocessamento do dia, o
`tools/recalc-bateu.js` e a rota abaixo) e copia divergente da regra de "bateu" e
o erro que esta secao inteira existe pra impedir.

**A correcao so vale para escrita nova.** As linhas gravadas antes de 03/09/2026
seguem com o veredito chutado ate serem regravadas. Duas formas, mesmo modulo
(`src/utils/recalcBateuDia.js`), mesma resposta:

```
POST /greyhound/robot/bateu/recalc  {"date":"2026-09-03"}                 simula
POST /greyhound/robot/bateu/recalc  {"date":"2026-09-03","aplicar":true}  grava
node tools/recalc-bateu.js --date=2026-09-03 [--aplicar] [--db=/data/greyhound.db]
```

**Simulacao e o padrao, e e mais que uma conveniencia:** a rota so grava com
`aplicar === true` booleano. Corpo vazio, ausente, JSON quebrado, `"true"` como
string, `1`, `"sim"` - tudo isso simula. Rota que regrava coluna de resultado em
producao nao pode gravar por acidente de digitacao. Os dois caminhos devolvem a
**lista das linhas com o motivo de cada uma**, nao so a contagem: quem manda
regravar precisa poder auditar antes de aplicar. Nenhum dos dois apaga nada; a
unica escrita e `UPDATE races SET bateu=? WHERE id=?`.

**Os numeros da secao 8 foram medidos com a coluna envenenada dentro.** Depois de
regravar, o "preenchido" CAI (chute vira indefinido) e as taxas se movem.
Remedir antes de decidir qualquer coisa em cima deles.

**(ii) A camada e recalculada com a regua de HOJE.** `_aplicaConfigMotor` le
`analysis_config WHERE user_id=1` corrente, sem snapshot por data
(`motorManha.js:237-239`). Recalibrar a cascata **reescreve retroativamente** a
camada dos dias passados: um TOP de 03/09 pode virar GOOD amanha. Hoje so a linha
em que o Bruno entrou tem camada congelada (o `origem` dentro do
`avb_escolhido`). **Decidir antes da 9.2:** ou aceita "camada e sempre a leitura
de agora", ou grava snapshot da camada por AvB. Se o Historico e registro, o
registro nao pode se mover sozinho.

**(iii) A chave do dia e o `created_at` da SESSAO, nao a data da corrida.**
`date(race_sessions.created_at,'-3 hours')`, nao `races.data_card`. Sessao
reimportada em outro dia cai no dia errado, e a mesma armadilha ja mordeu o robo
de resultados (nota de fuso em `resultsRobot.js:181-186`).

**(iv) O painel-dia ignora o filtro de pistas.** `_aplicaConfigMotor` preenche
`opts.pistasInc/pistasExc`, mas quem aplica e o `_pistaPassa`, chamado no
`motorManha.js:329` e **nao** no handler do painel. Com o filtro ligado, painel e
diags mostram conjuntos diferentes.

**(v) `odd_bw` e `razao_mercado` sao a ultima foto, nao a da promocao.** O upsert
de `avb_abertos` so grava quando aparecem mais pares (`robot.js:521`), entao num
dia fechado o `pares_json` e o estado final do mercado.

### 9.5 Menores

- **Board do dia continua?** Recomendacao: manter **reduzido a uma faixa fina**
  com as promocoes recentes e o contador. A tabela e registro, o board e radar
  (pisca na promocao). Tirar perde o aviso visual.
- **KPI segue o filtro?** Recomendacao: **nao**. KPI sempre sobre o conjunto
  contabilizavel. O placar do dia mudar ao filtrar por pista da dois numeros para
  a mesma coisa.
- Banca e taxa quebradas por camada: o dado ja e gravado, falta exibir.
- Seletor de data no board (nao bloqueia).
- Validacao multi-dia: empilhar dias anteriores no `-resultado`. Fazer **depois**
  do placar por corrida, senao empilha numero inflado.
- Refino de thresholds de HIGH e GOOD: **depois** de implantar. O contrato de
  dados nao muda, so muda quantas linhas caem em cada camada.
- Limpar a raiz: `liveOddsRobot.js` solto, `_api_motor_bkp.js`,
  `_robot_motor_bkp.js`, `Claude outputs/`, `teste*.mjs`. Criar `.gitignore`.
  Hoje o `git status` tem 12 linhas de ruido; a 13a que importar vai passar
  batido.

---

## 10. Glossario

- **AvB / confronto** - aposta "galgo A vence galgo B" (frente a frente).
- **pick / outro** - no par, o pick e o favorito apontado pelo motor.
- **colagem / colada** - as duas odds individuais estao proximas. Medida na BW,
  razao <= 1.5.
- **SP** - Starting Price do PDF. Hoje so informativa (provou ser ruido: par com
  SP 9,1 no PDF que a BW abriu 50/50 e bateu).
- **regua de qualidade** - filtros CalTm / split / podio que definem o `tier`.
- **watchlist da manha** - os TOP que o motor achou no PDF, aguardando a BW.
