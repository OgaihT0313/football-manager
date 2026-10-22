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

## Mundo real (dataset do EA FC)

```bash
npm run gen:real -- --csv caminho/FC26_20250921.csv
```

`scripts/gen_real_world.ts` lê um dataset do EA FC no formato sofifa e grava em `data/world/`
o mundo inteiro com clubes e jogadores reais, mais `meta.json` com a fonte e o ajuste do
mundo. O CSV e o zip ficam fora do git (`.gitignore`). Para voltar ao mundo fictício, rode
`npm run gen:world`.

- **Ligas, pelo `league_id` do dataset.** Os nomes se repetem: há quatro "Super League" e
  duas "Bundesliga".
  - 1ª divisão dos 5 países: elencos reais, partidas completas.
  - 2ª divisão dos 5 países: elencos reais, liga jogada "por força".
  - 14 ligas de fundo "por força" (Portugal, Holanda, Bélgica, Turquia, Escócia, Áustria,
    Suíça, Dinamarca, Polônia, Noruega, Suécia, Romênia, Brasil e Argentina), com a força
    tirada do elenco real.
  - Grécia, Tchéquia, Croácia e Sérvia vêm incompletas no dataset e ficam de fora.
  - Liga com mais de 20 clubes (Championship, La Liga 2, Argentina) fica com os 20 mais fortes.
- **Jogadores.** Mesma conversão do formato `fifa` (abaixo), com estas regras:
  - id `fc-<player_id>`, estável entre versões do dataset;
  - nome "Primeiro Sobrenome" quando o `short_name` é "J. Sobrenome";
  - nacionalidade em código de 3 letras;
  - valor recalculado pela fórmula do jogo, porque o preço pedido nas negociações sai dela;
  - salário e fim de contrato do dataset (o contrato que vai "até 2027" termina no fim da
    temporada 2027 do jogo).
- **Clubes.** Formação em que o elenco rende mais; reputação pela força do XI; finanças pela
  folha real; elenco de até 30 (saem os piores).
- **Vitrine do exterior na 1ª temporada:** os jogadores reais de mais destaque de cada clube de
  fundo (o melhor e a maior promessa, mais 1–2). Nas temporadas seguintes, a vitrine é gerada.
- **Ajuste do mundo** (`meta.json`, guardado na carreira e aplicado ao motor e à base). As notas
  do EA FC deixam os clubes mais próximos que no mundo fictício, onde o motor foi calibrado, e o
  mundo começa acima do equilíbrio da evolução. Os valores foram medidos com
  `npx tsx scripts/diagnose_league.ts --mundo data/world --carreiras 5` (para testar outro
  ajuste: `--ajuste base,forças,gols`) e estão em `ROADMAP.md`.
- **Eras:** usam o mundo fictício. Só a era atual usa `data/world`.

Verificação: `npm run check:real`.

### Escudos e fotos

```bash
npm run fetch:images -- --csv caminho/FC26_20250921.csv
```

`scripts/fetch_images.ts` busca a imagem principal da página de cada clube e de cada jogador
na Wikipedia em inglês (miniatura de 120 px) e grava `data/world/images.json`, que mapeia o id
do clube ou do jogador para o caminho da imagem. Os ids são estáveis, então as carreiras já
salvas no mundo real também mostram as imagens. O app baixa as imagens pela internet; sem
imagem, ou sem conexão, mostra o círculo com a sigla do clube ou as iniciais do jogador.

- **Clubes:** o nome do dataset, variantes ("X F.C.", "X Football Club"...) e uma lista de
  títulos para nomes curtos ("Inter" → "Inter Milan"). A página precisa falar de futebol.
- **Jogadores:** a página só é aceita se a descrição diz "footballer" **e** traz o ano de
  nascimento do dataset, para não trazer a foto de um homônimo.
- **Medido (FC26):** escudos para 406 de 410 clubes; fotos para 2.571 de 5.990 jogadores, ou
  375 de 432 entre os de OVR 80+. Base e reservas costumam não ter página.
- **Licenças:** as fotos são do Wikimedia Commons, com licença livre (atribuição na página de
  cada arquivo). Os escudos são, em geral, marcas usadas sob "uso justo" na Wikipedia. O app só
  aponta para as imagens, não as copia. O jogo é de uso pessoal.

### FC27 (guardado para calibrações futuras)

`fc27 p1.zip` e `fc27 p2.zip`, na pasta do projeto e fora do git, trazem dois CSVs da API de
ratings da EA, num formato diferente do sofifa:

- `players.csv` (12/09/2026): 19.789 jogadores (17.849 homens), com overall, posições, clube,
  liga, nacionalidade, nascimento e atributos. **Sem** potencial, valor, salário, contrato e id
  de liga (a liga vem só pelo nome).
- `fc27-players-2026-10-11.csv`: 10.763 jogadores, **com** potencial e atributos, também sem
  valor, salário e contrato.

Para usar, falta um conversor desse formato. A ideia é ligar as ligas pelo nome do clube ao
FC26 (os ids de jogador batem: 13.027 jogadores estão nos dois arquivos), estimar salário, valor e contrato pelas
fórmulas do jogo (`wageDemand`, `marketValue`) e repetir a calibração do ajuste do mundo.

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
