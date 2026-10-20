# PLANO-LIGAS — decisões da Fase 3

Cinco países, segunda divisão, copas e supercopas num mundo só. Números medidos em `ROADMAP.md`.

## Mundo

`src/data/fictionalWorld.ts` gera, para cada país:

| País | 1ª divisão (clubes, caem) | 2ª divisão | Copa | Supercopa | Vagas europeias (UCL/UEL/UECL) |
|---|---|---|---|---|---|
| Inglaterra | Premier League (20, 3) | Championship (20) | FA Cup | Community Shield | 4/1/1 |
| Espanha | La Liga (20, 3) | La Liga 2 (20) | Copa del Rey | Supercopa de España | 4/1/1 |
| Itália | Serie A (20, 3) | Serie B (20) | Coppa Italia | Supercoppa Italiana | 4/1/1 |
| Alemanha | Bundesliga (18, 2) | 2. Bundesliga (18) | DFB-Pokal | DFL-Supercup | 4/1/1 |
| França | Ligue 1 (18, 2) | Ligue 2 (18) | Coupe de France | Trophée des Champions | 3/1/1 |

- **Nomes:** ligas e copas usam os nomes reais (uso pessoal). Clubes e jogadores são fictícios,
  com nomes de cidade de cada país, até o usuário importar um CSV real.
- **Simplificações registradas:**
  - Championship e La Liga 2 têm 20 clubes, não 24 e 22: o calendário tem 38 fins de semana.
  - Não há playoff de acesso nem repescagem de rebaixamento: Bundesliga e Ligue 1 têm 2 descidas
    diretas.
  - As vagas europeias são aproximadas e só serão usadas na Fase 4.
- **Força por liga:** a Premier League é +1,5 sobre a base, La Liga +1, Serie A e Bundesliga 0,
  Ligue 1 −1,5. Dentro de cada liga, os gols ficam calibrados porque o λ é normalizado pela
  média da própria liga; a diferença entre ligas só aparece nos jogos entre elas (Europa, Fase 4).

## Segunda divisão "por força"

Decisão: **clubes sem elenco detalhado**, só com um número de força (`Club.strength`). O plano
deixava escolher entre isso e "clubes fantasmas que sobem"; este é o meio-termo, e é o mesmo
mecanismo que as ligas de fundo da Fase 6 vão usar.

- **Partidas:** o mesmo motor da 1ª divisão, com a força entrando como ataque, meio, defesa e
  goleiro (`strengthFromRating`). As duas divisões ficam na mesma escala.
- **Rebaixado mantém o elenco:** joga a 2ª pela escalação de verdade contra os clubes por força,
  no mesmo jogo. A receita cai para 55% e a reputação, 8 pontos.
- **Promovido sem elenco:** ganha um elenco gerado no nível da força + 1,5 (os reforços para a
  1ª divisão) e finanças pela folha nova, mantendo o caixa.
- **Promovido com elenco** (volta logo depois de cair): é completado até 22 jogadores, e a
  receita sobe 60%.
- **Força dos clubes da 2ª:** oscila ±1,2 por ano e volta 15% por ano para um alvo que acompanha
  a 1ª divisão do país (média da 1ª − 11). Sem isso, a 2ª se afastava a cada ano, os promovidos
  terminavam em 17º–18º e a diferença entre clubes aumentava os gols.

## Calendário por datas

Uma temporada tem 44 datas (`buildSlots` em `src/competitions/world.ts`):

- 38 fins de semana de liga. Ligas de 34 rodadas folgam em 4 fins de semana espalhados.
- Meios de semana: supercopa antes da 1ª rodada; copa antes das rodadas 6, 12, 21, 27 e 34.
  A Fase 4 acrescenta os da Europa (`extraMidweeks`).
- **Jornada:** cada data tem uma rodada de referência (1–38). As janelas de transferência
  seguem a jornada: verão até a 3, inverno da 20 à 22.
- **Recuperação:** 35% do que falta para 100 entre fins de semana; 22% quando há meio de semana
  no meio. Quem joga duas vezes na semana cansa de verdade.
- **Suspensões:** amarelos acumulam só na liga (5 = 1 jogo); vermelho vale para qualquer
  competição.
- **Finanças:** salários e receitas correm por fim de semana (38 por temporada), para qualquer
  clube com elenco.

## Copas e supercopas

- **Copa:** 32 clubes (a 1ª divisão inteira mais os mais fortes da 2ª), jogo único, sorteio a
  cada fase na data dela, final em campo neutro. Empate vai para os pênaltis: 50%, com leve
  vantagem para o mais forte.
- **Supercopa:** campeão da liga contra campeão da copa (o vice da liga, se for o mesmo clube),
  em campo neutro na primeira data. Na primeira temporada, os dois mais fortes.

## Desempenho e tamanho do save

- **Mercado:** era 85% do tempo de uma temporada do mundo. A folha salarial era recalculada
  percorrendo os 2.400 jogadores a cada candidato. Agora sai do elenco mais a lista
  `Club.loanedOut`, as escalações da IA ficam num cache por dia de mercado e os candidatos passam
  por um pré-filtro de OVR. A temporada caiu de ~10 s para ~1 s no Node.
- **Save:** o detalhe completo (escalações, notas e todos os lances) fica só na liga do usuário
  e nos jogos dele; os outros jogos guardam placar e gols. As estatísticas por jogador ficam
  acumuladas na temporada (`WorldSeason.stats`). O save caiu de 6,2 MB para ~4 MB e não cresce
  com os anos, porque os resultados zeram a cada temporada e as transferências guardam 3 anos.
  Fica abaixo do limite de 10 MB do plano, então não foi preciso migrar para `expo-sqlite`.
- **Web:** o save foi do `localStorage` (~5 milhões de caracteres de cota) para o IndexedDB. Um
  save antigo no `localStorage` é lido e transferido na próxima gravação.

## Reposição "de fora"

Com 98 clubes com elenco, os agentes livres se esgotavam e alguns elencos caíam para 10 a 11
jogadores. Na virada, o grupo de agentes livres adultos volta a ter 150 jogadores, completado com
gerados entre o fundo da 1ª − 10 e o fundo + 4, como se viessem de ligas menores e do exterior.

## Dados reais

`scripts/import_players.ts` agora escreve também `leagues.json`, com uma 1ª divisão por
`league_name`. Para jogar com dados reais, copie `leagues.json`, `clubs.json` e `players.json`
para `data/world/`. Segunda divisão, copa, supercopa e vagas europeias ficam por conta do
usuário nesse arquivo, ou de uma etapa futura de importação.
