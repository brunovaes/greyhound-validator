# Pré-registro — 16 hipóteses sobre o que decide um AvB

**Congelado em 15/09/2026, antes de qualquer análise no nível do galgo.**

Este arquivo existe para responder uma pergunta que ninguém consegue responder depois:
*a hipótese foi escrita antes ou depois de ver o resultado?* O commit carimba a data.
Nada aqui pode ser editado depois que a análise rodar — se uma hipótese nova aparecer,
ela entra num arquivo novo, com a data nova.

---

## Por que isto é necessário

O primeiro estudo (26/08 a 14/09, 2.304 AvBs resolvidos) mostrou três coisas que mudam
como qualquer análise seguinte tem que ser feita:

1. **O sistema hoje rende −5,6% de ROI**, e o overround da BW é 8,8%. A seleção atual
   está perto demais do acaso para se distinguir dele.
2. **O `market_pct` da BW é quase perfeitamente calibrado** (erro máximo de 2,5 pp em
   qualquer faixa com amostra). O `pct` do motor não é: diz 94%, acontece 59%.
3. **Das dez regras que eu testei lá, três desabaram no holdout** — inclusive a que
   parecia melhor no treino (+25,9% virou −7,0%).

A consequência de (2) é a mais importante e vale para tudo o que vem abaixo:

> **Um padrão verdadeiro que o mercado também conhece vale zero.** Já está na odd.
> O dinheiro está só na diferença entre o que acontece e o que o mercado cobra.

Por isso cada hipótese leva **duas** perguntas, não uma:
- *acontece mais?* (taxa de acerto)
- *o mercado já paga por isso?* (`market_pct` na mesma fatia)

E a métrica de decisão é **ROI**, nunca taxa de acerto sozinha.

---

## As 16 hipóteses

A coluna **Direção** é a aposta feita ANTES do teste. Isso importa: prever a direção e
acertar vale muito mais do que "testar e ver no que dá", onde qualquer resultado serve.

A coluna **Vista** marca as hipóteses contaminadas — aquelas em que eu já olhei os dados
agregados no primeiro estudo. Elas contam como **confirmação**, nunca como descoberta.

### Bloco A — a última corrida, decomposta

O Bruno formulou "ganhou a última **e** desceu de categoria". São dois efeitos
diferentes e eu suspeito que puxem para lados opostos; juntos, se cancelariam sem que
a gente percebesse.

| # | Hipótese | Direção | Vista |
|---|---|---|---|
| A1 | Galgo que **venceu a última** corrida | **negativa** | não |
| A2 | Galgo que **desceu de grade** (nível de hoje mais fraco que o da última) | **positiva** | não |
| A3 | As duas condições **juntas**, como originalmente formulado | neutra | não |

Raciocínio de A1: vitória recente é a informação mais visível que existe num card.
Se o mercado é calibrado, ela já está no preço — e provavelmente cara demais, porque o
público superestima o que aconteceu por último.

### Bloco B — margem em vez de posição

O público lê **em que lugar chegou**. Quase ninguém lê **por quanto perdeu**.
`margem = caltm − vencedorTm` (segundos atrás do vencedor; ~0,08 s por corpo).

| # | Hipótese | Direção | Vista |
|---|---|---|---|
| B1 | A margem para o vencedor na última prevê melhor que a posição | **positiva** | não |
| B2 | Galgo que chegou em 4º ou pior **mas colado** está subvalorizado | **positiva** | não |

### Bloco C — desculpa na última

Linha de forma feia, preço baixo, e o galgo não fez nada de errado.
Regex de atrapalho já existente no motor: `Bmp|Crd|Ck|Blk|Baulk|Stmb|Fll|KO|BBlk|SnBlk|BdStt`.

| # | Hipótese | Direção | Vista |
|---|---|---|---|
| C1 | Remark de interferência na última → subvalorizado | **positiva** | não |
| C2 | `SAw` (saída lenta) em 2 ou mais das 5 últimas → é defeito, não azar | **negativa** | não |

### Bloco D — arranque

| # | Hipótese | Direção | Vista |
|---|---|---|---|
| D1 | Split superior na mesma grade **perde** o AvB | **negativa** | **SIM** |
| D2 | Os dois com arranque forte e traps vizinhos → confusão na 1ª curva | **positiva p/ o de fora** | não |

D1 já foi medida no primeiro estudo, pelos quartis de `split_dif`: o quartil com maior
vantagem de arranque fez −13,3% de ROI, o com menor fez +0,8%, enquanto o mercado só
variou de 50,4% a 52,1% ao longo dos quatro. **Re-teste com o dado bruto conta como
confirmação.**

### Bloco E — condição e rotina

Nada disto foi olhado nenhuma vez.

| # | Hipótese | Direção | Vista |
|---|---|---|---|
| E1 | Variação de peso ≥ 1 kg entre as duas últimas | **negativa** | não |
| E2 | Descanso curto (< 5 dias) prejudica; 5 a 14 dias é o ideal | **positiva na faixa do meio** | não |
| E3 | Mudança de distância na última → forma menos confiável | **negativa** | não |

### Bloco F — trap

| # | Hipótese | Direção | Vista |
|---|---|---|---|
| F1 | Trap de hoje muito diferente do que o galgo vem correndo | **negativa** | não |
| F2 | Viés de trap por pista (1/2 contra 5/6) | direção **por pista** | não |

### Bloco G — regularidade contra pico

| # | Hipótese | Direção | Vista |
|---|---|---|---|
| G1 | O regular bate o de pico: menor desvio de `caltm` nas 5 últimas ganha de quem tem o melhor tempo isolado | **positiva** | não |

Raciocínio: o mercado ama o tempo mais rápido, e tempo rápido isolado costuma ser uma
corrida com piso rápido ou ritmo atípico — não é o galgo, foi a corrida.

### Bloco H — pista (garimpo declarado, não teste)

| # | Hipótese | Direção | Vista |
|---|---|---|---|
| H | O peso relativo de `split` e `caltm` varia por pista | **nenhuma** | não |

Testada apenas nas 7 pistas com 100+ AvBs resolvidos: Newcastle (355), Harlow (229),
Hove (202), Yarmouth (155), Sunderland (149), Monmore (131), Dundalk (129).

**Sem direção prevista, isto não é teste — é garimpo.** São 7 pistas × 2 medidas = 14
comparações; alguma vai destoar por acaso. O que sair daqui **não confirma nada**: entra
na fila para ser validado nos dados futuros, e no relatório vai marcado como hipótese de
segunda classe.

*(Registro honesto: Hove e Romford apareceram na conversa como exemplo de formato de
padrão, não como crença do Bruno. Eu escrevi "crença dele" numa primeira versão desta
lista e ele corrigiu. Por isso H não tem direção.)*

---

## Como as 16 serão testadas

**Todas as 16 são reportadas, inclusive — e sobretudo — as que falharem.** Hipótese que
morre é informação sobre o motor tão boa quanto hipótese que vive. Nenhuma hipótese nova
entra nesta lista depois de ver resultado.

**Com 16 testes a 5%, aproximadamente uma vai parecer boa por acaso.** Nenhum resultado
isolado é tratado como achado por si só. Intervalos de confiança de 95% por bootstrap
**reamostrando corridas**, não linhas — pares da mesma corrida não são observações
independentes.

**Cada hipótese sai com quatro números**: n, taxa de acerto, `market_pct` médio da fatia,
e ROI. A distância entre a taxa de acerto e o `market_pct` é o que interessa.

### O holdout é o futuro

No primeiro estudo eu cortei o holdout cronologicamente e ele falhou: a regra campeã
rendia −6,8% até 03/09 e +29,4% depois, e os 5 dias congelados caíram inteiros dentro da
metade boa. O teste confirmou a regra dentro do mesmo regime que a produziu.

Desta vez:

1. As 16 rodam nos 20 dias de 26/08 a 14/09. O que passar vira **candidata**, não regra.
2. As candidatas ficam **congeladas neste repo**, com a data do commit.
3. Daqui a 3 ou 4 semanas — ~2.000 AvBs novos, **com odd viva** (a odd só parou de
   congelar em 12/09) e atravessando regimes — as candidatas rodam **uma vez** nesses
   dados novos.
4. Só o que sobreviver a essa passagem entra na configuração do motor.

Não existe teste mais limpo que dado que ainda não foi coletado.

---

## Expectativa de resultado

O alvo realista **não** é "muito melhor". É virar os 8,8% de comissão da BW e sobrar
alguma coisa.

- Uma regra sustentada de **+2% a +5% de ROI** é um resultado excelente.
- Uma regra que apareça com **+25%** é quase certamente sorte — foi exatamente o que
  aconteceu com `bw_provavel + pct ≥ 90` no primeiro estudo, e ela desabou.

Se ao fim das 16 nenhuma sobreviver, isso também é resultado: significa que o ganho não
está nos fatos do card, e sim em outro lugar (no preço, no horário da entrada, na
cobertura). Saber disso vale mais do que inventar uma regra.

---

## Fonte dos dados

`/robot/diag/estudo-galgo?fmt=csv` — uma linha por AvB que a BW abriu, com os fatos
brutos dos dois galgos lado a lado, extraídos de `races.hist_full` (as 5 últimas de cada
um, como constavam no card daquele dia), cruzados com o preço de `avb_abertos` e o
resultado de `races.finishing_order_json` via `bateuPar`.

Rota só-leitura. Não grava nada.
