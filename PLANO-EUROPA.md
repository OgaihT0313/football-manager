# PLANO-EUROPA — decisões da Fase 4

Champions League, Europa League e Conference League. Números medidos em `ROADMAP.md`.

## Fonte do regulamento

Conferido em 2026-10-19/20, para a temporada 2026/27:

- Wikipedia: [2026–27 UEFA Champions League](https://en.wikipedia.org/wiki/2026%E2%80%9327_UEFA_Champions_League),
  [2026–27 UEFA Europa League](https://en.wikipedia.org/wiki/2026%E2%80%9327_UEFA_Europa_League),
  [2026–27 UEFA Conference League](https://en.wikipedia.org/wiki/2026%E2%80%9327_UEFA_Conference_League).
- Potes e chave: [beIN Sports, formato 2025/26](https://www.beinsports.com/en-us/soccer/uefa-champions-league/articles/how-does-the-2025-26-champions-league-format-work-everything-you-need-to-know-about-uefa-s-new-system-2025-08-01)
  e [Flashscore, Conference League 2025/26](https://www.flashscore.com/news/conference-league-2025-2026-draw-schedule-teams/UqdCaJN6).

O formato de 2026/27 é o mesmo de 2024/25 e 2025/26:

- **Fase de liga:** 36 clubes. Champions e Europa League com 8 jogos (4 potes de 9; 2
  adversários de cada pote). Conference com 6 jogos (6 potes de 6; 1 adversário de cada pote).
  Sem adversário do mesmo país e no máximo 2 do mesmo país.
- **Mata-mata:** 1º–8º direto às oitavas; 9º–24º no playoff de ida e volta, com 9–16 contra
  17–24 em pares fixos (9/10 x 23/24, 11/12 x 21/22, 13/14 x 19/20, 15/16 x 17/18). Os
  vencedores encaram 7/8, 5/6, 3/4 e 1/2 nas oitavas. A chave é fixa até a final, e o mais bem
  colocado decide em casa; quem elimina um mais bem colocado herda a posição dele.
- **Final:** jogo único em campo neutro.
- **Sem transferência** de clubes da Champions para a Europa League depois da fase de liga.

## O que foi simplificado

- **Coeficiente:** é a força do clube (XI ideal, ou a força de clube sem elenco). Não há
  ranking de 5 anos.
- **Mando na fase de liga:** cada clube joga metade em casa (orientação de Euler), mas não
  necessariamente 1 em casa e 1 fora por pote como no real.
- **Eliminatórias de verão:** não existem. As vagas que sobram depois das vagas por liga vão
  para os clubes mais fortes ainda não classificados, como se tivessem passado nas
  eliminatórias.
- **Mata-mata empatado no agregado:** vai direto aos pênaltis, sem prorrogação. Não há gol fora.
- **Vagas por liga** (`continental` em `data/world/leagues.json`): Inglaterra, Espanha, Itália
  e Alemanha 4/1/1; França 3/1/1; Portugal e Holanda 2/1/1; as outras 10 ligas de fundo 1/1/1.
  O campeão da copa nacional ganha uma vaga na Europa League; se já estiver classificado, ela
  passa para o próximo da tabela. Na primeira temporada, sem tabela anterior, vale a ordem de
  força.

## Ligas de fundo

Para ter 108 clubes nas três competições, o mundo ganhou 12 ligas "por força": Portugal,
Holanda, Bélgica, Turquia, Escócia, Áustria, Suíça, Grécia, Tchéquia, Dinamarca, Croácia e
Sérvia, com 10 a 18 clubes cada. Elas jogam a liga delas no calendário (custo baixo) e
classificam pela tabela. Isso antecipa as "ligas de fundo" da Fase 6. Falta a parte de "jogador
gerado quando um clube europeu contrata ou observa".

## Calendário

As três competições jogam na mesma semana (são grupos de clubes separados):

| Fase | Jornadas (meio de semana antes da rodada) |
|---|---|
| Fase de liga | 4, 6, 8, 10, 13, 15, 19, 21 (a Conference usa as 6 primeiras) |
| Playoff | 24 e 25 |
| Oitavas | 27 e 29 |
| Quartas | 31 e 32 |
| Semifinal | 34 e 35 |
| Final | depois da última rodada da liga (jornada 39) |

A temporada passou a ter 61 datas.

## Sorteio e datas (`src/competitions/europe.ts`)

1. **Potes:** pela força.
2. **Adversários:** ciclo dentro do pote (2 adversários) ou pares (1 adversário), e
   permutações entre potes. O sorteio é refeito até cumprir as restrições de país; depois de
   400 tentativas, sorteia sem elas (não aconteceu nos testes).
3. **Rodadas:** a escala é uma coloração das arestas do grafo k-regular com k cores, por cadeias
   de Kempe, com várias tentativas. Ninguém joga duas vezes na mesma data.
4. **Mando:** orientação de Euler, metade em casa.

O mata-mata é sorteado na data da fase, a partir da tabela ou dos vencedores anteriores.

## Premiação

Escala de receitas do jogo (o maior clube fatura ~230 M, cerca de 30% do real):

| | Participação | Vitória / empate | Playoff · oitavas · quartas · semi · final | Título |
|---|---|---|---|---|
| Champions | 6 M | 0,7 M / 0,25 M | 0,3 · 3,5 · 4 · 5 · 6 M | 2 M |
| Europa League | 1,3 M | 0,15 M / 0,05 M | 0,1 · 0,4 · 0,6 · 0,9 · 1,4 M | 0,5 M |
| Conference | 1 M | 0,1 M / 0,035 M | 0,06 · 0,25 · 0,4 · 0,6 · 1 M | 0,3 M |

- **Reputação:** +2 por jogar a Champions (+1 nas outras), +1 por fase a partir das oitavas e
  +2 pelo título. Paga no fim da temporada.

## Mundo estável

Com a Europa e os rebaixados mantendo elenco, o mundo crescia de 2.400 para 3.200 jogadores em
5 anos. Agora, um clube da IA que passa 2 temporadas na 2ª divisão sem subir volta a ser "por
força" (`Club.lowerSince`). Os jogadores dele viram agentes livres, e os emprestados por ele
ficam de vez com quem os recebeu.

## Save

`CURRENT_SAVE_VERSION = 4`. A migração v3 → v4 só garante `season.stats`; os campos novos são
opcionais. Um save antigo não tem as ligas de fundo, então a Conference (que precisa de 36
clubes) pode não ser criada nele. A temporada em andamento segue sem Europa, e a Europa entra
na próxima virada.
