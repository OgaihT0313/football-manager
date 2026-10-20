# Formato de dados e importação

## Arquivos do jogo (`data/`)

O app usa o **mundo** em `data/world/` (gerado por `npm run gen:world`):

| Arquivo | Conteúdo |
|---|---|
| `data/world/leagues.json` | `LeagueConfig[]`: 1ª e 2ª divisões de cada país (divisão, modo `full`/`strength`, rebaixamento, liga ligada, copa, supercopa, vagas europeias) |
| `data/world/clubs.json` | `Club[]`: elenco (ids) ou, na 2ª divisão, só `strength`; tática, finanças, reputação |
| `data/world/players.json` | `Player[]`: atributos, posições, contrato, valor |

A liga única de `data/leagues/ficticia.json` + `data/clubs.json` + `data/players.json` continua
sendo a base do backtest do motor (`npm run backtest`).

Os tipos estão em `src/domain/types.ts`. Tudo é JSON puro.

## Importar jogadores reais

```bash
npx tsx scripts/import_players.ts --csv caminho.csv --formato fifa
```

Opções: `--formato nativo|fifa` (padrão `nativo`), `--saida pasta` (padrão `data/import/`),
`--temporada 2026` (usada quando falta ano de contrato), `--liga id` (liga dos clubes quando o
CSV não tem coluna de liga). A saída vai para uma pasta separada para não sobrescrever a liga
fictícia do backtest. O script para com erro e lista as colunas que faltam, ou as linhas com
dado inválido (até 20).

O separador pode ser vírgula ou ponto e vírgula (detectado pelo cabeçalho). Números aceitam
vírgula decimal. Cabeçalhos não diferenciam maiúsculas.

### Formato `nativo`

Colunas obrigatórias:

| Coluna | Tipo | Observação |
|---|---|---|
| `name` | texto | |
| `age` | inteiro | |
| `nationality` | texto | código livre (ex.: `BRA`) |
| `club_id` | texto | vazio = agente livre |
| `positions` | texto | separadas por espaço, `;` ou `,`; a primeira é a principal. Valores: GK CB LB RB DM CM AM LW RW ST |
| `foot` | `L`/`R`/`B` | |
| `attack` `creation` `defending` `physical` `goalkeeping` | 1-99 | `goalkeeping` baixo (5-20) para jogadores de linha |
| `potential` | 1-99 | |
| `wage` | número | salário semanal |
| `contract_expires` | ano | temporada de término |
| `value` | número | valor de mercado |

Opcionais: `id` (senão é gerado como `clube-nome`), `club_name`, `league_id`.
O `ovr` é sempre recalculado a partir dos atributos e da posição principal.

Exemplo: `data/exemplos/jogadores_nativo.csv`.

### Formato `fifa`

Para datasets no estilo EA FC / FIFA (os nomes de coluna dos datasets públicos mais comuns):
`short_name, age, nationality_name, club_name, player_positions, preferred_foot, overall,
potential, value_eur, wage_eur, club_contract_valid_until_year, pace, shooting, passing,
dribbling, defending, physic, goalkeeping_diving, goalkeeping_handling, goalkeeping_kicking,
goalkeeping_positioning, goalkeeping_reflexes`. Opcional: `league_name`.

Conversão:

- `attack = 0,55·shooting + 0,25·dribbling + 0,2·pace`
- `creation = 0,6·passing + 0,4·dribbling`
- `defending = defending`
- `physical = 0,5·physic + 0,5·pace`
- `goalkeeping = média dos cinco goalkeeping_*`
- Depois os atributos que pesam na posição principal são deslocados para o nosso `ovr` bater
  com o `overall` do dataset.
- Posições: CDM→DM, CAM→AM, LM/LF→LW, RM/RF→RW, LWB→LB, RWB→RB, CF→ST.
- Goleiros sem `pace`/`shooting`/... recebem valores baixos fixos nesses campos.
- `club_id` = nome do clube em slug (`Real Madrid` → `real-madrid`).

Exemplo: `data/exemplos/jogadores_fifa.csv`.

Os clubes criados pela importação vêm com 4-3-3 e tática neutra; reputação e finanças saem da
força e da folha do elenco.

### Jogar com os dados importados

A importação grava `players.json`, `clubs.json` e `leagues.json` (uma 1ª divisão por
`league_name`) na pasta de saída. Para o app usar esses dados, copie os três para `data/world/`.
O que não vem do CSV e pode ser completado à mão em `leagues.json`:

- `country`, `cupName` e `supercupName` (copa e supercopa do país);
- `continental` (vagas europeias);
- `relegation` e `linkedLeagueId` (uma 2ª divisão com clubes `"strength": 60` e `squad: []`,
  `"mode": "strength"`, `"tier": 2`).
