# ROADMAP

Plano completo em `PLANO-FUTEBOL.md`. Aqui fica o estado de cada fase e o que foi medido.

| Fase | Estado |
|---|---|
| 0 — Spike: motor + uma liga, sem tela | **Concluída** (2026-10-18) |
| 1 — Uma liga jogável (app) | **Concluída** (2026-10-18) |
| 2 — Calendário, contratos, transferências, finanças | **Concluída** (2026-10-19) |
| 3 — Cinco ligas e copas nacionais | Não iniciada |
| 4 — Competições europeias | Não iniciada |
| 5 — Camada de técnico | Não iniciada |
| 6 — Ligas de fundo, visão 2D, eras | Não iniciada |

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

- Moral existe no tipo (`morale`, entra em `conditionFactor`) mas ainda não muda com os
  resultados.
- Zonas da tabela (4 primeiros, 3 últimos) são só visuais; vagas reais e rebaixamento na
  Fase 3.
- Testar num aparelho Android/iOS de verdade (salvar com `expo-file-system`, fechar e reabrir).
- Vermelho não muda o placar (λ é calculado antes); entra com o modo ao vivo.
- Dados reais: o usuário fornece o CSV; ver `FORMATO-DADOS.md`.
