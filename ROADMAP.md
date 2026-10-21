# ROADMAP

Plano completo em `PLANO-FUTEBOL.md`. Aqui fica o estado de cada fase e o que foi medido.

| Fase | Estado |
|---|---|
| 0 — Spike: motor + uma liga, sem tela | **Concluída** (2026-10-18) |
| 1 — Uma liga jogável (app) | **Concluída** (2026-10-18) |
| 2 — Calendário, contratos, transferências, finanças | **Concluída** (2026-10-19) |
| 3 — Cinco ligas e copas nacionais | **Concluída** (2026-10-19) |
| 4 — Competições europeias | **Concluída** (2026-10-20) |
| 5 — Camada de técnico | **Concluída** (2026-10-20) |
| 6 — Ligas de fundo, visão 2D, eras | **Concluída** (2026-10-20) |

## Fase 6 — resultado

- **Ligas de fundo:** Brasil e Argentina entram como ligas de fundo, totalizando 14, todas
  "por força".
- **Vitrine:** a cada temporada, cada clube de fundo mostra 3 jogadores ao mercado (4 no Brasil
  e na Argentina): destaque, joia e oportunidade. A IA compra; o usuário compra em Mercado ›
  Exterior. Quem não é vendido some na virada.
- **Visão 2D em Skia:** no detalhe da partida, "Assistir em 2D" mostra 22 pontos, bola,
  placar, relógio e legenda, com velocidade 1x/3x/9x e pular para o fim. A encenação segue o
  resultado do motor.
- **Eras:** pacotes de dados em `data/eras/eras.json` (Atual, Virada do milênio, Anos 90,
  Anos 70) mudam o ano, os nomes, os pontos por vitória e o nível de gols. A era é escolhida na
  nova carreira.
- **Save:** v6, com migração da v5.
- **Decisões:** em `PLANO-FUNDO.md`.

Comandos novos:

```bash
npm run check:world   # scripts/check_world.ts (vitrine, migração v5 → v6, eras)
npm run check:watch   # scripts/check_watch.ts (encenação 2D)
npm run setup:skia    # copia o canvaskit.wasm para public/ (também roda no postinstall)
```

Medido:

- **`check_world`: 24 verdes.**
  - 212 clubes de fundo com 676 jogadores na vitrine, OVR médio 64,9. São 252 jovens de até
    20 anos, com potencial médio 79,1.
  - Brasil e Argentina jogam a temporada (380 jogos cada) e não entram na Europa.
  - O usuário compra uma joia (taxa de 3,9 mi). Proposta baixa e pedido de empréstimo são
    recusados.
  - A IA compra 6 / 3 / 2 jogadores da vitrine nas 3 primeiras temporadas, com taxa média de
    4,3 mi.
  - Na virada, quem sobrou some e quem foi comprado fica.
  - Salvar e recarregar com vitrine não muda nada. Um save v5 migra e ganha as ligas novas.
- **Eras** (uma temporada cada, IA em todos os clubes):

  | Era | Ano | Gols/jogo | Pontos por vitória (ESP) | Nome da Champions |
  |---|---|---|---|---|
  | Atual | 2026 | 2,76 | 3 | Champions League |
  | Virada do milênio | 2000 | 2,68 | 3 | Champions League |
  | Anos 90 | 1993 | 2,60 | 2 | Champions League |
  | Anos 70 | 1975 | 2,54 | 2 | Copa dos Campeões |

  Gerar o mundo de uma era leva de 9 a 14 ms.
- **`check_watch`: 9 verdes** (690 partidas).
  - A linha do tempo vai em ordem de 0 a 90 min; bola e jogadores sempre dentro do campo.
  - **O placar da encenação é igual ao do motor em todas.** Todo gol aparece na tela, e 96%
    caem no minuto do motor (±1,5 min).
  - 21,9 chutes por jogo; mesma partida, mesma encenação.
  - Montar a encenação leva 0,35 ms (1.315 quadros por jogo).
- **Mundo:**
  - `diagnose_league` (5 carreiras × 10 temporadas): 9 de 9. OVR dos titulares 73,1 → 72,5;
    gols 2,87; promovido termina em 16,7º; pelo menos 40 transferências pagas; 2,6 s por
    temporada.
  - Liga única: 8 de 8. Backtest de 500 temporadas sem mudança (gols 2,75, campeão 85,0,
    último 23,5).
- **Europa** (`check_europe --temporadas 10`): verde, com 2,1–3,0 s por temporada e save de
  6,7 MB. O limite do campeão da Conference passou de 9 para 12: em 30 temporadas **antes**
  desta fase ele já ficava em 10,7º (agora 10,0º). Detalhes em `PLANO-FUNDO.md`.
- **Outros:** `check_career` verde (pior ano 3,3 s, save de 6,87 MB em 15 temporadas);
  `check_engine` 32, `check_save` 35 e `check_market` 48, verdes.
- **No navegador:**
  - Um save v5 real migrou: o Mercado › Exterior lista jogadores de Portugal, Holanda, Brasil e
    Argentina.
  - Uma partida jogada e assistida em 2D: o campo carrega o CanvasKit e desenha os 22 jogadores
    na formação. "Pular para o fim" mostra o placar da partida (1 x 3). Sem erros no console.
  - Na nova carreira, a era 1975 mostra "First Division · Inglaterra" e a descrição da era.
    A carreira não foi iniciada, para não substituir o save.
  - O painel do navegador limita qualquer página a 1–2 quadros por segundo, então **a fluidez
    da animação não foi medida**.
- **Android:** o bundle compila (1338 módulos, com o Skia). **Não testado em aparelho.**

O que observar:

- A IA quase não usa a vitrine (2 a 6 compras por temporada). Ela só compra quando o jogador é
  o melhor reforço da vaga, e os clubes de fundo cobram ×1,2.
- No aparelho, se a animação ficar pesada, passar a bola e os jogadores para valores
  compartilhados do Reanimated, sem re-render do React.
- Eras usam o mesmo mundo fictício e o formato atual das competições. Dados históricos reais
  dependem do usuário importar.

## Fase 5 — resultado

Camada de técnico: diretoria com mandato, meta e confiança (projeção da campanha contra a meta);
demissão no meio ou no fim da temporada; mercado de empregos com vagas da IA e propostas de
clubes maiores conforme a reputação; técnico desempregado avançando o calendário. Coletivas e
decisões com prazo (vale a opção padrão), jogador insatisfeito, moral que muda com os
resultados. Staff do usuário (preparador, auxiliar, olheiro, analista) pago de um orçamento
próprio de 6% da receita, missões do olheiro trazendo jovens só para o usuário, potencial em
faixa conforme o olheiro. Prêmios por liga e copa europeia, 11 conquistas, passagens e campeões
na aba Clube › Carreira. Save v5 com migração da v4. Decisões em `PLANO-TECNICO.md`.

Comando novo: `npm run check:career` (`scripts/check_career.ts`, `--temporadas 15`).

Medido:

- **Aceite da fase** (`check_career`, 15 temporadas com o "técnico automático"): tudo verde.
  - Carreira 2026–2040 completa, jogada duas vezes: direto e com 12 recargas de save em pontos
    sorteados. **O estado final é idêntico.**
  - 5 passagens: OL1 2026–2027 (demitido), ST3 2028–2036 (saiu), VAL 2036–2038 (demitido),
    HEX 2039 (saiu), GLE 2039–2040 (demitido no balanço final). Toda demissão anterior foi
    seguida de novo emprego.
  - Demissão forçada: o clube passa para a IA, aparecem vagas e o novo clube vem com diretoria
    e staff. Decisões aplicam o efeito; moral muda; contratar staff, missão do olheiro (3
    prospectos só do usuário) e intervalo entre missões funcionam.
  - Prêmios em todas as temporadas (5 ligas + 3 copas europeias). Pior temporada 4,1 s no Node;
    save de 6,22 MB depois de 15 temporadas.
- `diagnose_league` no mundo (3 carreiras × 10 temporadas): 9 de 9. OVR dos titulares
  73,1 → 72,3; gols por jogo 2,87; promovido termina em 16,6º; ~2,2 s por temporada.
- Backtest de 500 temporadas (com a moral dinâmica): gols/jogo 2,75, mandante 44,9%, empate
  25,1%, campeão 85,0 pts, último 23,5, mais forte campeão 37,0%; tudo dentro das faixas.
- `check_engine`, `check_save`, `check_market` e `check_europe --temporadas 10`: verdes.
  Liga única: 8 de 8.
- **No navegador:** save v4 real migrado para v5, cartão da diretoria, decisões, aba Staff
  (contratar, missão do olheiro), aba Carreira, balanço e notícias de fim de temporada. Sem
  erros no console. Bundle Android compila (1072 módulos). **Não testado em aparelho.**

O que observar:

- Staff caro depois de rebaixamento apertava o caixa; agora o staff sai com o técnico demitido e
  é cortado na virada se passar do orçamento.
- A moral dinâmica afasta um pouco os extremos (campeão +1,4 pt, último −1,5 pt).
- Vagas dependem da IA demitir: com reputação baixa, o técnico pode ficar várias datas parado.

## Fase 4 — resultado

Champions League, Europa League e Conference League no formato vigente (2026/27): fase de liga
com 36 clubes (8/8/6 jogos, potes, restrições de país), playoff 9º–24º de ida e volta, chave fixa
e final em campo neutro. 12 ligas de fundo "por força" completam os participantes. A
classificação sai da tabela anterior e da copa, e há premiação e reputação. Na aba Liga, "Europa"
mostra a fase de liga, os jogos e o mata-mata (ida, volta, agregado, pênaltis). Save v4 com
migração da v3. Fontes, decisões e simplificações em `PLANO-EUROPA.md`.

Comando novo: `npm run check:europe` (`scripts/check_europe.ts`, `--temporadas 10`).

Medido:

- **Aceite da fase** (`check_europe`, 10 temporadas completas com todas as competições): tudo
  verde.
  - Formato 36 clubes e 8/8/6 jogos; mando 4/4/3; mata-mata 16/16/8/4/1.
  - **Nenhuma partida duplicada** e **nenhum clube em dois jogos na mesma data**, em todas as
    competições; nenhum clube em duas copas europeias.
  - Premiação paga a todos os participantes da Champions.
  - **Campeão coerente com a força:** posição média do campeão no ranking de força dos 36 —
    Champions 4,9 (sempre entre os 13 primeiros), Europa League 8,5, Conference 8,9.
  - Tempo: 0,9 → ~3,3 s por temporada no Node, estabilizando a partir do 4º ano. Save: até
    6,0 MB.
- `diagnose_league` no mundo com Europa (3 carreiras × 10 temporadas): 9 de 9 critérios.
  - OVR dos titulares 73,1 → 72,2; elencos 18–29; nenhum clube quebrado.
  - Folha/receita 63%–73%; idade 25,2–26,0; pelo menos 47 transferências pagas.
  - Gols por jogo 2,83 (PL 2,89 · La Liga 2,82 · Serie A 2,82 · Bundesliga 2,80 · Ligue 1 2,83).
  - Promovido termina em média em 16,8º.
- Liga única: 8 de 8. Backtest de 500 temporadas: igual (gols/jogo 2,76 / 2,79).
  `check_engine` 32, `check_save` 35 (inclui migração de save v3), `check_market` 48: verdes.
- **No navegador:** carreira nova com Europa desde a 1ª temporada ("Champions League" na agenda
  do Início). A temporada inteira com Europa terminou em até 4 s. A aba Liga mostra os chips de
  país (Europa + 17 países), a tabela da fase de liga com as faixas, e o mata-mata com playoff
  15/16 x 17/18, agregados e pênaltis, oitavas contra 1º/2º e campeão. Save v3 antigo carregou.
  Sem erros no console. Bundle Android compila (1064 módulos). **Não testado em aparelho.**

O que observar:

- O dinheiro europeu vai aos grandes: o caixa mediano da 1ª divisão chega a 1,2× a receita em 10
  anos, e a folha a 72–73% (o teto sobe com caixa sobrando). Os critérios passam, mas perto do
  limite de 75%.
- O tempo de simulação dobra entre a 1ª e a 4ª temporada (mais clubes com elenco na 2ª
  divisão) e depois se estabiliza. No celular, estimando 3 a 6 vezes mais lento que o Node,
  daria 10 a 20 s para simular uma temporada inteira.
- Siglas curtas de clube às vezes saem feias ("AT3", "UN5") quando há colisão.

## Fase 3 — resultado

Mundo com 5 países: 1ª divisão com elencos, 2ª divisão "por força", copa nacional (32 clubes,
mata-mata) e supercopa. Acesso e rebaixamento, calendário único de 44 datas, aba Liga com
qualquer competição, escolha de clube por país e "Jogar próxima partida" em qualquer
competição. Save v3 com migração da v2. Decisões em `PLANO-LIGAS.md`.

Comandos:

```bash
npm run gen:world    # data/world/ (5 países, 192 clubes, 2.400 jogadores)
npm run diagnose     # mundo; --liga-unica para a liga de data/
```

Medido:

- **Temporada completa das cinco ligas** (10 ligas, 5 copas e 5 supercopas, 3.664 jogos): 1,3 s
  no Node (`check_save`) e **1,56 s no navegador** (build de desenvolvimento, medido do clique em
  "Simular resto" até a tela de fim de temporada). A virada leva ~0,13 s. No celular não foi
  medido; estimando 3 a 6 vezes mais lento que o navegador do PC, daria uns 5 a 9 s para simular
  uma temporada inteira, e dezenas de milissegundos por partida jogada.
- **Save:** 4,0 MB no fim da temporada do mundo, abaixo do limite de 10 MB, então não foi preciso
  `expo-sqlite`. No web, o save foi para o IndexedDB: com 4,3 milhões de caracteres, chegava
  perto da cota do `localStorage`.
- `diagnose_league` no mundo (3 carreiras × 10 temporadas, IA em todos os clubes): **9 de 9
  critérios OK**.

| Critério | Medido |
|---|---|
| OVR médio dos titulares estável | 73,1 → 72,2 |
| Elencos entre 18 e 30 | 19–29 |
| Nenhum clube quebrado | 0 |
| Folha/receita | 63%–70% |
| Idade média | 25,2–26,0 |
| Transferências pagas por temporada | mínimo 56 |
| Gols por jogo (média) | 2,85 |
| Gols por jogo por liga | PL 2,88 · La Liga 2,85 · Serie A 2,85 · Bundesliga 2,83 · Ligue 1 2,84 |
| Posição média do promovido no 1º ano | 16,9 |

- Liga única (5 carreiras): 8 de 8 OK (transferências pagas: mínimo 11).
- Backtest de 500 temporadas: igual ao da Fase 2 (gols/jogo 2,76 / 2,79).
- `check_save`: 34 verdes. Inclui mundo interrompido na rodada 21 e retomado idêntico, acesso
  e rebaixamento, e migração de saves v1 e v2. `check_market`: 48. `check_engine`: 32.
- No navegador: migração de um save v2 real, carreira nova na Espanha, aba Liga com
  tabela (faixas de vaga), copa (fases e pênaltis) e 2ª divisão, temporada inteira simulada,
  virada para 2027 e 2028, e save no IndexedDB lido depois de recarregar. Bundle Android
  compila (1063 módulos). **Não testado em aparelho.**

O que observar:

- Os gols por jogo no mundo (2,85) ficam acima da liga única (2,79). As datas de meio de semana
  cansam mais, e a diferença entre ricos e pobres cresce um pouco com os anos (pior clube 64 → 61).
- O promovido termina perto do 17º lugar, o que é realista, mas fica no limite do critério.
- Nenhuma copa foi ganha por clube da 2ª divisão na média (houve 1 em 30 temporadas).

## Fase 2 — resultado

Mercado com janelas (verão até a rodada 3; inverno nas rodadas 20 a 22), transferências com
contraproposta, multa rescisória, empréstimos com divisão de salário, pré-contratos a partir do
inverno, renovações e dispensas. A IA compra, vende, empresta e renova, e faz propostas pelos
jogadores do usuário. Finanças com receita, folha, custos, premiação, orçamento da diretoria e
limite de dívida. Evolução e declínio por idade, treino e minutos; aposentadorias e base.
Abas novas: Mercado e Clube; Tabela e Rodadas viraram a aba Liga. Decisões e porquês em
`PLANO-MERCADO.md`.

Comandos:

```bash
npm run diagnose       # scripts/diagnose_league.ts (10 temporadas x 3 carreiras; --carreiras 5)
npm run check:market   # scripts/check_market.ts
```

Medido:

- `diagnose_league` (5 carreiras × 10 temporadas, IA em todos os clubes): **os 8 critérios de
  "não degenerou" passaram**.

| Critério | Medido |
|---|---|
| OVR médio dos titulares estável (Δ ≤ 3) | 72,9 → 72,4 |
| Elencos entre 18 e 30 | 18–28 |
| Nenhum clube com caixa < −50% da receita | 0 |
| Folha/receita média entre 45% e 75% | 62%–71% |
| Idade média entre 24 e 28 | 24,7–26,1 |
| ≥ 10 transferências pagas por temporada | mínimo 11 (média ~25) |
| Gols por jogo, média das 50 temporadas | 2,81 |
| Gols por jogo, cada temporada (±4 desvios) | 2,61–3,05 |

Médias das 5 carreiras, temporada a temporada:

| Temp. | Titulares | Todos | Idade | ≤ 21 | Folha/R | Caixa méd./R | Transf. | Taxas (mi) | Campeão | Gols/j |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026 | 72,9 | 68,8 | 25,8 | 23% | 62% | 0,44 | 33 | 325 | 83 | 2,75 |
| 2028 | 74,3 | 68,6 | 25,9 | 22% | 65% | 0,50 | 27 | 398 | 83 | 2,81 |
| 2030 | 74,4 | 67,9 | 25,6 | 27% | 69% | 0,74 | 21 | 374 | 84 | 2,81 |
| 2032 | 73,2 | 65,9 | 25,1 | 35% | 69% | 0,82 | 22 | 191 | 88 | 2,77 |
| 2035 | 72,4 | 64,9 | 24,8 | 36% | 69% | 0,95 | 25 | 214 | 87 | 2,83 |

- Tempo: 514 ms por temporada com mercado (25,7 s para 50 temporadas).
- `check_market`: 48 verificações verdes (valor, negociação, compra/empréstimo/pré-contrato/
  renovação/dispensa do usuário, propostas da IA, evolução, invariantes de 3 temporadas e
  determinismo com mercado).
- `check_save`: 29 verdes, incluindo save v1 → v2 jogável. `check_engine`: 32 verdes.
- Backtest de 500 temporadas: os mesmos números da Fase 1 (gols/jogo 2,76 / 2,79; campeão
  83,7 / 83,3). Os limites novos do motor (λ ≤ 6, fator do goleiro ≤ 2×) não mudam uma
  temporada normal.
- Save: 527 KB na rodada 17, 884 KB no fim da temporada.
- No navegador: migração de um save v1 real, aba Clube com finanças migradas, filtro "cabem
  no orçamento", recusas explicadas (orçamento, teto salarial), empréstimo pagando 50%, janela
  de verão com transferências e empréstimos da IA, renovação, virada para 2027 (emprestado
  voltou, 4 contratos saíram de graça) e recarga da página. Corrigido um erro de botão dentro
  de botão no Elenco (web). Bundle Android compila (1062 módulos). **Não testado em aparelho.**

O que observar:

- A fatia de jogadores com até 21 anos sobe de 23% para ~36% em 10 anos, e o OVR médio do
  elenco inteiro cai de 68,8 para 64,9. Os titulares ficam estáveis; quem enfraquece é o
  banco. Vale rever na Fase 5 (base e olheiros).
- O caixa mediano sobe devagar (0,44 → 0,95 da receita): os clubes guardam mais do que gastam.
  Sem comprador externo, o dinheiro só circula entre eles.
- Empréstimos quase somem depois do 4º ano (de 16 para ~2 por temporada).

## Fase 1 — resultado

App em Expo SDK 58 (RN 0.88, React 19.3) + NativeWind 4.2.7 + Zustand 5, tema
claro/escuro/sistema e abas Início, Elenco, Escalação, Tabela e Rodadas. Também há menu
inicial (continuar, nova carreira, apagar), escolha de clube e detalhe da partida.

Comandos:

```bash
npm run web          # abre no navegador (porta 3000)
npm run android      # Expo no Android (Expo Go ou dev build)
npm run check:save   # scripts/check_save.ts
```

O que entrou no domínio:

- `src/competitions/season.ts`: temporada rodada a rodada (`playRound`), com estado JSON. O
  backtest usa a mesma função que o app.
- Fadiga: cada jogo custa `11 + 1,5·(pressão − 3)` de condição; entre rodadas o jogador
  recupera 35% do que falta para 100. Titular fixo estabiliza perto de 80. A escalação
  automática poupa os cansados.
- Lesões e suspensões (vermelho = 1 jogo, 5 amarelos = 1 jogo).
- O XI do usuário é respeitado vaga a vaga; só a vaga de quem está fora vai para o melhor
  reserva da posição.
- `src/career/career.ts`: `CareerState` (o save) e ações imutáveis. `src/save/saveService.ts`:
  envelope `{ saveVersion, savedAt, data }` e migrações. O armazenamento é um arquivo em
  `Paths.document` no celular (grava em `.tmp` e depois move) e `localStorage` no web.
- Temporada seguinte com os mesmos elencos; o histórico guarda campeão, posição e pontos.

Medido:

- `check_save`: 27 verificações verdes. Inclui: jogar rodada a rodada dá o mesmo resultado
  que simular tudo; **salvar na rodada 17, recarregar e terminar dá uma temporada idêntica à
  jogada sem interrupção**; migrações em ordem; erros claros para save corrompido, sem
  migração ou mais novo que o app.
- Tamanho do save: 514 KB na rodada 17, 871 KB no fim da temporada.
- `check_engine`: 32 verificações verdes (as da Fase 0, atualizadas para o XI fixo, mais
  fadiga e rodízio).
- No navegador (viewport de celular): carreira nova, rodada jogada, troca de jogador no XI,
  recarga da página no meio (save mantido, inclusive a escalação), simulação até o fim,
  temporada 2027 e tema escuro. Sem erros no console.
- Android: o `expo export -p android` gera o bundle Hermes (1047 módulos). **O app não foi
  testado num aparelho ou emulador.**

Métricas depois da Fase 1 (500 temporadas, com fadiga e rodízio; `μ` e o topo da liga
recalibrados):

| Métrica | Alvo | Liga de `data/` | Liga nova por temporada |
|---|---|---|---|
| Gols por jogo | 2,6 – 2,9 | 2,76 | 2,79 |
| Vitória do mandante | 42 – 47% | 44,9% | 45,4% |
| Empate | 22 – 28% | 25,3% | 24,7% |
| Vitória do visitante | 27 – 32% | 29,7% | 29,9% |
| Pontos do campeão | 80 – 92 | 83,7 | 83,3 |
| Pontos do último | 22 – 35 | 25,2 | 25,3 |
| Mais forte é campeão | 30 – 50% | 39,0% | 36,8% |
| Tempo total | — | 26,7 s (53 ms/temporada) | 29,2 s (58 ms/temporada) |

Mudanças de calibração na Fase 1 e por quê:

- Com a fadiga, os gols subiram para 2,85–2,89 (a variação de força entre jogos aumenta os λ
  pela convexidade). Correção: `μ_casa` 1,5 → 1,44 e `μ_fora` 1,13 → 1,09.
- "Pontos do campeão" (perto do piso) e "mais forte é campeão" (perto do teto) estavam em
  conflito: a liga gerada tinha um favorito isolado. O topo de `STRENGTH_TIERS` passou a ter
  três candidatos ao título. `k` ficou em 2,2.
- O gerador agora mantém o nível do goleiro só em `goalkeeping`; antes um goleiro podia sair
  com criação 92.

## Fase 0 — resultado

Comandos:

```bash
npm run gen        # gera data/ (seed 2026)
npm run check      # scripts/check_engine.ts
npm run backtest   # scripts/backtest_league.ts (500 temporadas; --novas-ligas gera liga nova por temporada)
npm run lint       # tsc --noEmit
```

Métricas medidas (500 temporadas × 380 jogos, parâmetros padrão, Node 24, Windows 11):

| Métrica | Alvo | Liga de `data/` | Liga nova por temporada |
|---|---|---|---|
| Gols por jogo | 2,6 – 2,9 | 2,75 | 2,78 |
| Vitória do mandante | 42 – 47% | 45,1% | 45,6% |
| Empate | 22 – 28% | 25,5% | 24,9% |
| Vitória do visitante | 27 – 32% | 29,4% | 29,6% |
| Pontos do campeão | 80 – 92 | 82,0 | 82,5 |
| Pontos do último | 22 – 35 | 25,2 | 25,6 |
| Mais forte é campeão | 30 – 50% | 47,8% | 46,2% |
| Tempo total | — | 23,9 s (48 ms/temporada) | 27,0 s (54 ms/temporada) |

Placares mais comuns (sem mando, liga de `data/`): 1-0 16,1%, 2-1 14,7%, 2-0 12,9%,
1-1 12,1%, 0-0 7,8%. Nenhum λ inválido.

`check_engine`: 27 verificações verdes (determinismo, fora de posição, goleiro, calendário,
desempate, coerência de eventos, lesões, JSON puro, domínio sem React/`Math.random`).

**As faixas-alvo são estimativas**, não dados reais. Observações para quando houver dados:

- Pontos do campeão ficaram no terço de baixo da faixa (82). Se a referência real for ~88-90,
  aumentar a distância entre os clubes de topo em `STRENGTH_TIERS` ou subir `k`.
- "Mais forte é campeão" está perto do teto (46-48%) e depende muito da distância entre o 1º e
  o 2º elenco, que é propriedade dos dados, não do motor.
- A variância por temporada é grande (campeão de 68 a 103 pontos). Conferir com séries reais.

Parâmetros calibrados na Fase 0 (`DEFAULT_PARAMS` em `src/engine/matchEngine.ts`):
`μ_casa = 1,5`, `μ_fora = 1,13`, `k = 2,2`, `kGk = 1,5`, peso do meio-campo 0,35, Dixon-Coles
`ρ = -0,08`. Os `μ` foram ajustados na Fase 1 (ver acima).

## Pendências para fases seguintes

- Testar num aparelho Android/iOS de verdade (salvar com `expo-file-system`, fechar e reabrir).
- Vermelho não muda o placar (λ é calculado antes); entra com o modo ao vivo.
- Dados reais: o usuário fornece o CSV; ver `FORMATO-DADOS.md`.
