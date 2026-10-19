# ROADMAP

Plano completo em `PLANO-FUTEBOL.md`. Aqui fica o estado de cada fase e o que foi medido.

| Fase | Estado |
|---|---|
| 0 — Spike: motor + uma liga, sem tela | **Concluída** (2026-10-18) |
| 1 — Uma liga jogável (app) | Não iniciada |
| 2 — Calendário, contratos, transferências, finanças | Não iniciada |
| 3 — Cinco ligas e copas nacionais | Não iniciada |
| 4 — Competições europeias | Não iniciada |
| 5 — Camada de técnico | Não iniciada |
| 6 — Ligas de fundo, visão 2D, eras | Não iniciada |

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

Parâmetros calibrados (`DEFAULT_PARAMS` em `src/engine/matchEngine.ts`): `μ_casa = 1,5`,
`μ_fora = 1,13`, `k = 2,2`, `kGk = 1,5`, peso do meio-campo 0,35, Dixon-Coles `ρ = -0,08`.

## Pendências para fases seguintes

- Fadiga e rodízio (Fase 1): `fitness` já existe no tipo e entra em `conditionFactor`, mas a
  temporada não altera o valor.
- Vermelho não muda o placar (λ é calculado antes); entra com o modo ao vivo.
- Dados reais: o usuário fornece o CSV; ver `FORMATO-DADOS.md`.
