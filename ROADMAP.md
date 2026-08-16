# Greyhound Factory — Roadmap / TODO

Lista viva de pendências e ideias, pra nada se perder entre sessões.
Última atualização: 16/08/2026.

---

## 1. Varredura de corridas novas no dia (top-up da sessão) — PRIORIDADE

**Problema:** o coletor roda uma vez às 06:00 BRT. Se o Racing Post ainda não
publicou a lista completa nesse horário (ex.: clima ruim que melhora e libera
+20 corridas às 08:40), essas corridas nunca entram. Pior: a análise automática
(`rodarAnaliseAutomatica`, api.js) tem a trava "sessão já existe → pula", então
nem o cron nem o disparo manual conseguem completar o dia.

**O que fazer:** uma varredura periódica que compara a lista atual do RP com o
que já está na sessão do dia e, se apareceram corridas novas, **completa a sessão
existente** — insere só as que faltam (casadas por hora+corrida), analisa elas e
atualiza os dados do dia. **Sem apagar corrida, sem criar sessão histórica nova,
sem tocar nas análises e entradas já feitas.** A trava vira "sessão existe →
completa em vez de recusar".

Parâmetros a confirmar: corte do dia (~17:30 BR?) e intervalo do ping (1 min? 5
min pra pegar leve no Browserless?).

---

## 2. Carga VIP — botão na tela Analisar (handoff pro UI)

**Backend PRONTO:** endpoint `GET /api/carga-vip` (aceita `?date=`), permissão
`analisar.carga_vip` (registry, categoria "Tela Analisar", padrão liberado),
motor em `src/utils/cargaVip.js`. Preview de admin em `/robot/diag/carga-vip`.

**Falta (UI):** botão "Carga VIP" abaixo do "Carregar PDF", checando
`can(user,'analisar.carga_vip')`. Abre a lista (modal/painel). Mostrar a
`taxa_estimada_pct` por entrada e o `aviso` do topo bem visível — é filtro de
VALOR (~62% Valor / ~69% Premium), NÃO certeza. Premium destacado dos Valor.

**Lembrete de honestidade:** a etiqueta na tela tem que deixar claro que é
"entrada forte", não "impossível dar errado". O backtest fechou o teto em ~62–70%.

---

## 3. Reanálise — casos que divergem da análise do Bruno

Bruno vai anotando corridas onde a reanálise decide diferente da intuição dele
(ex.: escolheu o fumador contra o avassalador, porque tempo+pódio pesam muito e
perfil/arranque pesam pouco). Quando tiver a lista:
- puxar o `_debug` de cada par (`vantTempo`, `vantSplit`, `vantBends`, `vantPodio`,
  `net`) pra ver qual critério virou o jogo em cada caso;
- se o padrão for "perfil devia contar mais", **backtestar** a mudança de peso
  ANTES de alterar (não mexer por intuição — o backtest da Carga VIP mostrou que
  perfil não previu H2H em odds coladas).
- Nota: o "melhor BRT" hoje NÃO é critério da reanálise (ela usa média das 2
  últimas ajustada por categoria). Avaliar se deveria entrar.

## 4. Consumo Decodo — na tela Analisar (UI)

Backend já entrega tudo em `GET /robot/odds/diag/uso` (`resumo` com `consumo_gb`,
`quota_gb`, `pct_plano`, `alerta_nivel`, `medidor_inicio`). Falta o UI fixar na
Analisar o consumo + alarme (70/80/90/95/99%). Se a Analisar não for admin, abrir
um endpoint leve de usuário só com esse resumo.

## 5. Limpeza dos temporários da recuperação

Remover do repo os arquivos que sobraram da recuperação de motor
(`_robot_motor_bkp.js`, `_api_motor_bkp.js`) e o lixo na raiz (`git`, `set`,
`findstr`, `teste*.mjs`, duplicados), se ainda existirem.

## 6. Carga VIP — selos em observação (fuma / frente)

Os selos `selo_outro_fuma` e `selo_pick_frente` mostraram lift no dt=0.5 (87% /
74%) mas com amostra minúscula (8 / 23). Reavaliar com mais dias de dados: se
segurarem, virar filtro do nível Premium+; se não, remover os selos.

## 7. Deep-link betwinner pro mercado "Frente a frente"

Hoje o `bwUrl` abre a corrida inteira; o usuário ainda acha o par na página.
Investigar (em horário de corrida, inspecionando o site) se a URL do betwinner
aceita apontar direto pro mercado H2H. Se aceitar, ajustar `bwUrlCorrida` em
`liveOddsRobot.js`. Se não, manter como está.

## 8. avb_parelho — calibração do limiar

Cruzar os pares que o betwinner realmente abre (tabela `avb_abertos`, captador)
com as SPs dos PDFs (`hist_all`) pra medir a distância de odd real e calibrar o
`avb_parelho_limiar` (hoje 0.10).
