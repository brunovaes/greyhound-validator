# Resultado das 16 hipóteses

**Rodado em 15/09/2026**, sobre 26/08 a 14/09: 2.466 AvBs que a BW abriu, **2.304 com chegada
registrada**, em 927 corridas.

Par com o `ESTUDO_HIPOTESES.md`, congelado antes desta análise. Nenhuma hipótese foi
acrescentada depois de ver resultado e nenhuma foi omitida. Se alguma linha aqui discordar
do pré-registro, o pré-registro é que vale — este arquivo é o relatório, não a régua.

**Linha de base do período:** acerto 52,6% · mercado 51,4% · gap +1,2 pp · ROI −5,6%.
Tudo abaixo se compara com ela.

Método: cada hipótese é sobre a propriedade de UM galgo, mas o resultado é do PAR, então
cada uma virou um diferencial entre o pick e o rival, medindo a taxa de acerto do pick.
`gap = acerto − mercado`. Intervalos de 95% por bootstrap reamostrando **corridas**.

---

## Placar

| # | Hipótese | Previsto | n | O que deu | Veredito |
|---|---|---|---|---|---|
| A1 | venceu a última | negativa | 161 | 49,7% · gap −2,4 · ROI −11,6% | **confirmada** |
| A2 | desceu de grade | positiva | 498 | 52,4% (base 52,6%) | nula |
| A3 | venceu *e* desceu | neutra | 4 | o motor quase nunca escolhe esse perfil | sem amostra |
| B1 | margem > posição | positiva | 2.269 | gradiente 47,0% → 56,9% | **confirmada** |
| B2 | 4º+ mas colado | positiva | 141 | 62,4% · gap +10,0 · ROI +11,2% | **confirmada** |
| C1 | atrapalhado na última | positiva | 570 | 52,8% · sem efeito | nula |
| C2 | 2+ saídas lentas | negativa | 293 | 52,9% · sem efeito | nula |
| D1 | arranca melhor perde | negativa | 2.304 | 54,5% → 51,1% | **confirmada** |
| D2 | vizinhos rápidos: o de fora | o de fora | 258 | o de **dentro** foi melhor (61,0 x 55,6) | invertida |
| E1 | peso variou ≥ 1 kg | negativa | 36 | 38,9% · ROI −34,4% | sem amostra |
| E2 | descanso de 5 a 14 dias | meio melhor | 2.304 | 48,8% / 53,1% / 48,6% | **confirmada** |
| E3 | mudou de distância | negativa | 22 | 99% dos galgos repetem a distância | sem dado |
| F1 | trap diferente do usual | negativa | 2.304 | não é monotônica | falhou |
| F2 | viés de trap por pista | por pista | 597 | pistas apontam para lados opostos | garimpo |
| G1 | o regular bate o de pico | positiva | 2.304 | 52,2% contra 52,0% | nula |
| H | peso das medidas por pista | nenhuma | 1.350 | nada limpo | garimpo |

**5 confirmadas, 4 nulas, 1 invertida, 1 falhou, 3 sem amostra, 2 garimpo.**

---

## O achado

**A margem para o vencedor prevê melhor que a posição, e o mercado não a cobra.**

| quartil do diferencial de margem | n | aconteceu | mercado | gap | ROI |
|---|---|---|---|---|---|
| Q1 — pick perdeu por mais | 566 | 47,0% | 50,5% | −3,5 pp | −14,2% |
| Q2 | 568 | 53,0% | 51,4% | +1,6 pp | −5,1% |
| Q3 | 562 | 53,6% | 51,4% | +2,2 pp | −3,4% |
| Q4 — pick perdeu por menos | 573 | 56,9% | 52,5% | +4,4 pp | +0,1% |

A realidade percorre 9,9 pontos; o mercado percorre 2,0. A mesma coisa usando **posição**
percorre 6,9 pontos (49,2% → 56,1%). Por isso B1 é considerada confirmada: a margem
discrimina mais que a posição.

B2 é a ponta afiada do mesmo mecanismo, com o espelho intacto:

| última corrida | n | aconteceu | mercado | gap | ROI |
|---|---|---|---|---|---|
| **pick** 4º+ e colado (< 0,15 s) | 141 | 62,4% | 52,4% | +10,0 pp | +11,2% |
| **pick** 4º+ e longe (≥ 0,5 s) | 547 | 51,0% | 50,2% | +0,8 pp | −6,1% |
| **rival** 4º+ e colado | 104 | 49,0% | 52,6% | −3,6 pp | −13,1% |

**B1 e B2 são um achado, não dois.** Contá-las como confirmações independentes inflaria
o placar.

### D1, confirmada com dado bruto

| quartil do diferencial de split | n | aconteceu | mercado | ROI |
|---|---|---|---|---|
| Q1 — pick arranca pior | 567 | 54,5% | 50,5% | −0,3% |
| Q2 | 582 | 54,3% | 51,2% | −1,9% |
| Q3 | 578 | 50,5% | 51,9% | −10,2% |
| Q4 — pick arranca melhor | 577 | 51,1% | 52,1% | −10,1% |

Já tinha aparecido no primeiro estudo pelos quartis de `split_dif`. **Conta como
confirmação, não como descoberta** — estava marcada assim no pré-registro.

---

## As mortes que valem comentário

**G1 era a minha favorita e deu zero absoluto.** 52,2% para o pick mais regular contra
52,0% para o menos regular. No contraste puro (regular com pico pior contra irregular com
pico melhor): 49,7% contra 51,2%. A ideia de que o mercado se encanta com o tempo de pico
e deixa o regular barato não aparece nestes dados.

**C1 morreu provavelmente de definição, não de mecanismo.** O regex de atrapalho do motor
(`Bmp|Crd|Ck|Blk|Baulk|Stmb|Fll|KO|BBlk|SnBlk|BdStt`) dispara em **48% de todos os
galgos**. Nesse volume não é desculpa, é rotina, e uma marca que metade da população
carrega não separa ninguém. Merece voltar com um critério mais estreito — e isso é
hipótese NOVA, em arquivo novo, não esta.

**F1 é o falso positivo previsto.** A célula `trap_dif = 2` dá 63,5% de acerto e +12,8% de
ROI, num gradiente não-monotônico e sem mecanismo. O pré-registro dizia que com 16
hipóteses aproximadamente uma célula assim apareceria por acaso. É esta. Não vira regra.

**E3 morreu por falta de dado, não de efeito.** Só 22 picks e 11 rivais de 2.304 correram
a última em distância diferente da de hoje. Não há variação para medir.

---

## Observação pós-hoc: par desequilibrado é par ruim

Em A1 e E2 os **dois** lados ficaram abaixo da base, o que não fecha numa leitura
direcional. Fui atrás depois de ver isso — portanto **pós-hoc, sem tratamento especial**.

Marcando um galgo quando ele venceu a última, OU descansou menos de 5 dias, OU variou 1 kg:

| quem carrega alguma marca | n | aconteceu | gap | ROI |
|---|---|---|---|---|
| nenhum dos dois | 1.303 | 54,8% | +3,3 pp | −1,7% |
| só o pick | 229 | 48,5% | −3,8 pp | −14,2% |
| só o rival | 575 | 50,1% | −0,8 pp | −9,9% |
| os dois | 197 | 50,3% | −1,7 pp | −9,4% |

Não é que a marca prejudique o galgo que a tem: **o motor acerta menos quando existe
qualquer coisa fora do padrão no par, de qualquer lado.** É uma descoberta sobre o motor,
não sobre o galgo.

---

## A CANDIDATA — congelada para o teste futuro

Definição exata, para não haver deriva quando alguém (eu, daqui a três semanas) for rodar:

```
margemQ4 = (b_ult_margem - a_ult_margem) >= 0.19      // Q4 do B1
B2       = a_ult_pos >= 4 && a_ult_margem < 0.15       // 4o ou pior, colado
semSplit = (b_split_med2 - a_split_med2) < 0.01        // Q1+Q2 do D1: o pick NAO arranca melhor

CANDIDATA = (margemQ4 || B2) && semSplit
```

Resultado nos 20 dias:

| corte | n | acerto | gap | ROI | lift 1ª metade | lift 2ª metade |
|---|---|---|---|---|---|---|
| tudo que a tela mostra | 2.304 | 52,6% | +1,2 pp | −5,6% | — | — |
| B1 · margem Q4 | 573 | 56,9% | +4,4 pp | +0,1% | +6,5 pp | +5,0 pp |
| D1 · não arranca melhor | 1.180 | 54,3% | +3,5 pp | −1,3% | +2,4 pp | +7,3 pp |
| **CANDIDATA** | **335** | **58,8%** | **+6,9 pp** | **+4,8%** | **+10,8 pp** | **+10,7 pp** |

Volume: 16,8 apostas por dia, mínimo 5, máximo 47, **nenhum dia vazio**.

O que faz esta valer mais que a candidata do primeiro estudo: **o lift é praticamente
idêntico nas duas metades** (+10,8 e +10,7 sobre a base de cada uma). A candidata anterior
rendia −6,8% numa metade e +29,4% na outra, e foi por isso que o holdout cronológico dela
não significou nada.

### O que ainda não permite mexer no motor

1. **O IC do ROI é [−6%, +16%] e cruza o zero.** 335 apostas não fecham a conta.
2. **A combinação não estava pré-registrada.** B1, B2 e D1 estavam, cada uma com direção
   prevista. O `&&` entre elas é construção minha depois de ver o resultado, e combinar é
   grau de liberdade como qualquer outro.
3. **A odd de 18 dos 20 dias está congelada na abertura.** A guarda do
   `_gravarParesAbertos` só caiu em 12/09. O nível absoluto do ROI está errado nesses dias;
   a comparação entre fatias sobrevive porque o viés atinge todas igualmente.

### O teste que decide

Conforme o pré-registro: a CANDIDATA acima roda **uma única vez** nos dados de **15/09 em
diante**, com odd viva, quando houver ~2.000 AvBs novos (3 a 4 semanas). Só o que
sobreviver a essa passagem entra na configuração do motor.

Se na hora do teste alguém ajustar o corte `0.19`, o `0.15` ou o `0.01`, **o teste morreu**
e vira treino. Os números estão escritos aqui de propósito.

---

## Fonte

`/robot/diag/estudo-galgo?fmt=csv`, só-leitura. Fatos brutos de `races.hist_full` (as 5
últimas de cada galgo como constavam no card daquele dia), preço de `avb_abertos`,
resultado de `races.finishing_order_json` via `bateuPar`. "Última corrida" ignora trial.
Confrontos em que um dos galgos não aparece na chegada ficam fora — nem acerto, nem erro.
