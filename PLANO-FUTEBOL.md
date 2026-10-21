# PLANO-FUTEBOL — Football Manager mobile

Plano de ação para o Claude Code. Projeto novo, inspirado no `nba-gm-mobile`
(`C:\Users\Usuario\Documents\Projetos\nba-gm-mobile`), que serve de **referência de
arquitetura, não de código a importar**. Uso pessoal (sem publicação em loja), então nomes
e escudos reais não são um problema por ora.

> **Regra de trabalho:** uma fase por vez. Não iniciar a fase N+1 sem o usuário pedir.
> Ao fim de cada fase: rodar os scripts de verificação, reportar os números medidos,
> commitar. Nada de "parece certo": medir.

---

## 1. Visão

Jogo de futebol estilo Football Manager. O jogador é o **técnico e também cuida do
mercado** (diretoria acima dele): escala, define tática, negocia transferências e contratos,
responde à diretoria, pode ser demitido e contratado por outro clube.

Competições: Premier League, La Liga, Serie A, Bundesliga, Ligue 1 (e, mais tarde, outras
ligas do exterior), copas nacionais, Champions League, Europa League e Conference League.

Decisões já tomadas com o usuário:
- Modo único "técnico + mercado" (estilo FM). Sem modo GM puro.
- Uso pessoal.
- **Spike primeiro** (Fase 0): dados de uma liga + motor em script, sem tela.
- Visão da partida em **2D (Skia)**, não 3D. 3D só se o usuário pedir no fim.

## 2. Stack e convenções

- TypeScript. App em Expo + React Native + NativeWind + Skia (mesma linha do NBA GM).
- **Antes de escrever qualquer código de Expo, ler a doc da versão exata** (o `AGENTS.md`
  do NBA GM diz: "Expo HAS CHANGED — read https://docs.expo.dev/versions/v57.0.0/"). Conferir
  a versão atual do Expo ao iniciar a Fase 1 e ajustar esse link no `AGENTS.md` daqui.
- **Fase 0 não usa Expo**: só Node + TypeScript (`tsx` para rodar scripts). O Expo entra na
  Fase 1.
- **Domínio em TS puro, sem React**, em `src/`. Nada em `src/domain`, `src/engine`,
  `src/competitions`, `src/market` etc. pode importar `react` ou `react-native`. Isso permite
  testar tudo por scripts no Node (como os `check_*.ts` do NBA GM).
- **RNG com seed** (ex.: mulberry32) injetado em toda função que sorteia. Mesma seed = mesmo
  resultado. Proibido `Math.random()` no domínio.
- **Estado serializável** (JSON puro, sem classes, sem `Map`/`Set` no estado salvo).
- **Save versionado desde o início** (`saveVersion` + migrações). No NBA GM isso foi feito
  tarde; aqui entra na Fase 1.
- **Estado do app em store com seletores** (Zustand ou reducer), não um `useState` gigante no
  `App.tsx` (o do NBA GM chegou a ~50 KB).
- Idioma da interface e dos comentários: **português do Brasil**.
- Cada fase tem um doc curto de decisões em `PLANO-*.md` se surgirem decisões grandes
  (padrão do NBA GM).

## 3. Estrutura de pastas (alvo)

```
football-manager/
  AGENTS.md  CLAUDE.md  PLANO-FUTEBOL.md  ROADMAP.md
  data/
    leagues/            # um JSON por liga/competição (config, não código)
    clubs.json
    players.json
  src/
    domain/             # types.ts (Player, Club, Contract, Tactic, Fixture...)
    engine/             # rng, lineup, matchEngine, fatigue, injuries
    competitions/       # league, cup, championsLeague, calendar, tiebreakers
    market/             # transfers, contracts, loans, valuation
    club/               # finance, board, staff, youth
    manager/            # jobs (contratação/demissão), press, decisions
    ai/                 # transferAI, lineupAI
    save/               # saveService, migrações, storage
  screens/  components/ # só a partir da Fase 1
  scripts/              # gen_fictional_league, backtest_league, check_*.ts
```

## 4. Modelo de dados (rascunho, ajustar na Fase 0)

```ts
type Position = 'GK'|'CB'|'LB'|'RB'|'DM'|'CM'|'AM'|'LW'|'RW'|'ST';

interface Player {
  id: string; name: string; age: number; nationality: string;
  positions: Position[];          // a primeira é a principal
  foot: 'L'|'R'|'B';
  ovr: number;                    // 1-99
  // atributos por grupo, escala 1-99
  attack: number; creation: number; defending: number; physical: number; // jogadores de linha
  goalkeeping?: number;           // só GK
  potential: number;              // teto de evolução
  contract: { wage: number; expires: number }; // temporada de término
  value: number;                  // valor de mercado
  clubId: string | null;
  morale?: number; fitness?: number; // 0-100
}

interface Tactic {
  formation: '4-3-3'|'4-2-3-1'|'4-4-2'|'3-5-2'|'5-3-2'; // ampliar depois
  pressing: 1|2|3|4|5; lineHeight: 1|2|3|4|5; tempo: 1|2|3|4|5;
}

interface Club {
  id: string; name: string; leagueId: string;
  squad: string[]; startingXI: string[]; tactic: Tactic;
  budget: number; wageBudget: number; reputation: number;
}
```

Posição importa: jogador fora de posição leva penalidade (tabela de afinidade entre
posições). Goleiro tem atributo próprio.

## 5. Motor de partida (desenho)

1. **Força por setor** a partir da escalação e da formação: `ataque`, `meio`, `defesa`,
   `goleiro`, cada um média ponderada dos jogadores certos (com penalidade fora de posição,
   fadiga e moral).
2. **Gols esperados** de cada lado:
   `λ_casa = μ_casa · (ataque_casa / média_liga)^k · (média_liga / defesa_fora)^k · ajuste_tática`
   (e simétrico para o visitante), com `μ_casa ≈ 1,5` e `μ_fora ≈ 1,2` como ponto de partida.
   `k` e os `μ` são **parâmetros a calibrar**, não verdade.
3. **Gols = Poisson(λ)** com RNG seedado. Considerar Dixon-Coles se a distribuição de placares
   baixos (0-0, 1-0, 1-1) sair torta.
4. **Autores**: distribuir cada gol por jogador com peso por posição e atributos de ataque;
   assistências, cartões, lesões e nota (1-10) por jogador.
5. **Modo ao vivo (Fase 1+)**: gerar lances minuto a minuto *a partir do mesmo λ*, de modo que
   o placar assistido e o placar simulado nunca divergem. Substituições (5) e mudança de
   tática alteram o λ dali pra frente.

---

## FASE 0 — Spike: motor + uma liga, sem tela

**Objetivo:** provar que o motor gera campeonatos realistas e fixar o formato dos dados.

**Tarefas**
1. Inicializar o projeto Node + TS (`package.json`, `tsconfig.json`, `tsx`). Sem Expo.
2. `src/domain/types.ts` conforme a seção 4.
3. `src/engine/rng.ts` (mulberry32 + helpers: `poisson`, `pick`, `weightedPick`).
4. `scripts/gen_fictional_league.ts`: gera uma liga de 20 clubes com 25 jogadores cada, com
   distribuição de força realista (poucos clubes fortes, maioria média, alguns fracos),
   formações e posições coerentes. Saída em `data/leagues/` e `data/`.
5. `src/engine/lineup.ts`: escolher XI a partir da formação, com penalidade fora de posição.
6. `src/engine/matchEngine.ts`: a seção 5, itens 1 a 4.
7. `src/competitions/league.ts`: calendário todos-contra-todos em dois turnos (38 rodadas
   para 20 clubes), tabela e critérios de desempate (pontos, saldo, gols pró, confronto
   direto — definir a ordem e documentá-la).
8. `scripts/backtest_league.ts`: simula N temporadas (padrão 500) com seeds diferentes e
   imprime as métricas abaixo.
9. `scripts/check_engine.ts`: verificações automáticas (mesma seed = mesmo resultado; jogador
   fora de posição rende menos; time com goleiro melhor sofre menos; sem NaN).
10. `ROADMAP.md` e `PLANO-FUTEBOL.md` atualizados com o que foi medido.

**Metas de calibração** (pontos de partida; **o usuário vai fornecer dados reais** para
refinar — se não houver dados reais ainda, usar estas faixas e dizer que são estimativas):
| Métrica (médias sobre 500 temporadas) | Faixa-alvo inicial |
|---|---|
| Gols por jogo | 2,6 – 2,9 |
| Vitória do mandante | 42 – 47% |
| Empate | 22 – 28% |
| Vitória do visitante | 27 – 32% |
| Pontos do campeão | 80 – 92 |
| Pontos do último colocado | 22 – 35 |
| Time de maior força inicial é campeão | 30 – 50% (palpite, calibrar com dados) |

**Critério de aceite:** todas as métricas dentro da faixa, `check_engine` verde, 500
temporadas de 380 jogos rodam em tempo razoável (medir e reportar), nenhuma dependência de
React no domínio. Reportar a tabela com os valores medidos.

**Entregável extra:** definir o **formato de importação de dados reais** (CSV/JSON com as
colunas necessárias) e um `scripts/import_players.ts` que converte um CSV de ratings para o
`players.json`. O usuário vai baixar o dataset (o ambiente da IA não alcança sites de
dados); o script deve falhar com mensagem clara se faltar coluna.

**Resultado (medido em 2026-10-18) — Fase 0 concluída.** Todas as métricas dentro da faixa
nos dois modos do backtest (liga fixa de `data/` e liga nova por temporada): gols/jogo 2,75 /
2,78; mandante 45,1% / 45,6%; empate 25,5% / 24,9%; visitante 29,4% / 29,6%; campeão 82,0 /
82,5 pts; último 25,2 / 25,6 pts; mais forte campeão 47,8% / 46,2%. 500 temporadas em 24-27 s
(~50 ms por temporada). `check_engine` com 27 verificações verdes. Detalhes, parâmetros e
observações de calibração em `ROADMAP.md`; formato de importação em `FORMATO-DADOS.md`.

Ajustes ao modelo da seção 4 feitos na Fase 0:
- `goalkeeping` é obrigatório em todos os jogadores (baixo, 5-20, para jogadores de linha),
  porque goleiro improvisado e jogador de linha no gol também precisam de valor.
- `ovr` é derivado: média ponderada dos atributos com os pesos da posição principal
  (`src/domain/positions.ts`). Fora de posição = pesos da vaga × tabela de afinidade.
- `Club` ganhou `shortName`; `LeagueConfig` guarda pontos, turnos e a ordem de desempate.
- Desempate: pontos, saldo, gols pró, confronto direto (pontos, saldo e gols pró entre os
  empatados), vitórias, gols pró fora, id do clube (no lugar de sorteio, para ser
  determinístico).
- O motor usa força ofensiva = 65% ataque + 35% meio e defensiva = 65% defesa + 35% meio, com o
  goleiro como fator separado (`kGk`). `k` calibrado = 2,2 (bem abaixo do que a fórmula com
  razões sugeria, porque o expoente atua duas vezes: ataque de um e defesa do outro).
- Dixon-Coles entrou (`ρ = -0,08`): sem ele o empate ficava em ~23,5% com o visitante alto.

---

## FASE 1 — Uma liga jogável (app)

- Inicializar o Expo (ler a doc da versão exata antes), NativeWind, tema claro/escuro,
  navegação por abas.
- Telas: escolher clube, elenco, escalação e formação, rodada, tabela, resultado da partida.
- Store com seletores; **saveService versionado** com salvar/continuar (celular: arquivo via
  `expo-file-system`; web: `localStorage`, como no NBA GM).
- Simular rodada a rodada e temporada inteira. Fadiga, lesões e suspensões simples.
- **Aceite:** jogar uma temporada completa, fechar e reabrir o app no meio sem perder nada,
  e as métricas da Fase 0 continuam valendo.

**Resultado (medido em 2026-10-18) — Fase 1 concluída.** Expo SDK 58 + NativeWind 4.2.7 +
Zustand. Temporada jogável rodada a rodada, com fadiga, lesões e suspensões, e save versionado
com autosave. `check_save` (27 verificações) prova que salvar no meio, recarregar e terminar dá
a mesma temporada que jogar direto. Testado no navegador em viewport de celular; o Android só
foi validado pelo bundle, não num aparelho. As métricas continuam na faixa nos dois modos do
backtest (gols/jogo 2,76 / 2,79; campeão 83,7 / 83,3 pts; último 25,2 / 25,3; mais forte
campeão 39,0% / 36,8%), depois de recalibrar `μ` e o topo da liga gerada por causa da fadiga.
Detalhes em `ROADMAP.md`.

Decisões da Fase 1:
- Navegação por abas própria (estado no store), sem React Navigation/Expo Router: menos
  dependências e o mesmo código no web e no celular.
- A lógica de carreira e save fica em `src/` (testável no Node); o store só chama o domínio.
- XI do usuário é fixo por vaga (como no FM); a IA escala automaticamente e poupa cansados.
- O save guarda a temporada inteira (resultados com eventos e notas): ~0,9 MB no fim da
  temporada de uma liga. Revisar na Fase 3 (cinco ligas), possivelmente guardando só o resumo
  das temporadas antigas e das partidas de outras ligas.

## FASE 2 — Calendário, contratos, transferências e finanças

- Janelas de transferência (verão e inverno). Negociação: valor, salário, duração, cláusula
  de rescisão. Empréstimos. Fim de contrato (a partir de 6 meses o jogador pode assinar com
  outro clube).
- `valuation`: valor de mercado por idade, ovr, potencial e posição. IA dos clubes compra,
  vende e renova com critério (`transferAI`).
- Finanças: orçamento de transferências e de salários, receita de bilheteria/TV/prêmios,
  limite de gasto (algo no espírito do fair play financeiro, simplificado).
- Evolução e declínio de jogadores por idade, com o efeito de treino/staff.
- **Aceite:** simular 10 temporadas seguidas sem a liga degenerar (todos os clubes quebrados,
  elencos vazios, ovr médio disparando ou caindo). Criar `scripts/diagnose_league.ts` que
  mede ovr médio, folhas salariais e distribuição de idade ao longo do tempo.

**Resultado (medido em 2026-10-19) — Fase 2 concluída.** Mercado com janelas, negociação,
empréstimos, pré-contratos, renovações e dispensas; IA de transferências; finanças com limite
de dívida; evolução, aposentadorias e base. O `scripts/diagnose_league.ts` (5 carreiras × 10
temporadas) passa nos 8 critérios: OVR dos titulares 72,9 → 72,4, elencos 18–28, nenhum clube
quebrado, folha 62%–71% da receita, idade 24,7–26,1, ≥ 11 transferências por temporada e 2,81
gols por jogo. Save v2 com migração da v1. Decisões em `PLANO-MERCADO.md`, números em
`ROADMAP.md`. Observações abertas: o banco envelhece pior (mais jovens, OVR geral caindo) e o
caixa dos clubes cresce devagar.

## FASE 3 — As cinco ligas e as copas nacionais

- Premier League, La Liga, Serie A (20 clubes), Bundesliga e Ligue 1 (18 clubes) como
  **configurações em JSON** (número de clubes, rebaixamento, vagas continentais).
- Copas nacionais (mata-mata) e supercopas simples. Promoção/rebaixamento: modelar pelo menos
  uma segunda divisão simplificada por liga (ou clubes "fantasmas" que sobem), decidir e
  registrar em `PLANO-LIGAS.md`.
- Dados reais importados pelo `import_players.ts` (usuário fornece o CSV).
- **Aceite:** temporada completa das cinco ligas com tempo de simulação aceitável no celular
  (medir). Se o JSON de save passar de ~10 MB, migrar o armazenamento para `expo-sqlite`
  antes de seguir.

**Resultado (medido em 2026-10-19) — Fase 3 concluída.** Mundo com 5 países, 2ª divisão "por
força", copas, supercopas, acesso e rebaixamento num calendário de 44 datas. Uma temporada
completa das cinco ligas leva 1,3 s no Node e 1,56 s no navegador; o save fica em 4,0 MB (abaixo
de 10 MB, sem SQLite; no web foi para o IndexedDB). O diagnóstico de 10 temporadas passa nos 9
critérios. Decisões em `PLANO-LIGAS.md`, números em `ROADMAP.md`.

## FASE 4 — Competições europeias

- Champions League no formato atual (fase de liga de 36 clubes com 8 jogos por clube,
  playoff e mata-mata), Europa League e Conference League. **Conferir o regulamento vigente**
  numa fonte atual antes de implementar, e documentar a fonte.
- Classificação continental a partir das posições nas ligas; calendário que intercala
  liga/copa/Europa; fadiga e rotação por congestionamento.
- **Aceite:** 5 temporadas completas com todas as competições, sem partida duplicada, sem
  clube em dois jogos no mesmo dia, campeão europeu coerente com a força dos clubes.

**Resultado (medido em 2026-10-20) — Fase 4 concluída.** Champions, Europa League e Conference
no formato 2026/27 (fonte e simplificações em `PLANO-EUROPA.md`), com 12 ligas de fundo "por
força" completando os participantes. Em 10 temporadas completas não houve partida duplicada nem
clube em dois jogos no mesmo dia, e o campeão da Champions ficou em média em 4,9º no ranking de
força dos 36. O diagnóstico do mundo com Europa passa nos 9 critérios. Números em `ROADMAP.md`.

## FASE 5 — Camada de técnico

- Diretoria com metas por temporada (modelo do `ownerService`/mandatos do NBA GM), confiança
  da diretoria, **demissão** e mercado de empregos (propostas de outros clubes conforme
  reputação).
- Coletivas de imprensa e fila de decisões (modelo do `pressService`/`decisionService`).
- Staff (preparador físico, olheiro, analista, auxiliar), base/categorias de base e olheiros
  no lugar do draft.
- Objetivos e conquistas de carreira; histórico de temporadas e prêmios (artilheiro, melhor
  jogador, etc.).
- **Aceite:** carreira de 15 temporadas jogável do início ao fim, incluindo demissão e novo
  emprego, com save/continuar em todos os pontos.

**Resultado (medido em 2026-10-20) — Fase 5 concluída.** Diretoria com mandato e confiança,
demissão, vagas e propostas, coletivas e decisões, moral dinâmica, staff com orçamento próprio,
missões do olheiro, prêmios e conquistas. Uma carreira de 15 temporadas com 5 passagens (3
demissões) termina idêntica jogada direto ou com 12 recargas de save no meio. Decisões em
`PLANO-TECNICO.md`, números em `ROADMAP.md`.

## FASE 6 — Ligas de fundo, visão 2D e eras

- **Ligas de fundo** (Portugal, Holanda, Brasil etc.): simuladas só por força do clube, sem
  elenco completo, com jogadores gerados quando um clube europeu os contrata/observa.
- **Visão 2D da partida em Skia** (jogadores como pontos, bola, eventos), alimentada pelos
  eventos do motor (mesmo conceito do `watchDirector` do NBA GM).
- Eras históricas (ex.: temporadas clássicas) como pacotes de dados, depois que o resto
  estiver estável.

**Resultado (medido em 2026-10-20) — Fase 6 concluída.**

- 14 ligas de fundo, com Brasil e Argentina.
- Vitrine de jogadores gerados sob demanda, que a IA e o usuário compram.
- Visão 2D da partida em Skia, cuja encenação segue o placar e os minutos do motor em todas as
  690 partidas medidas.
- Quatro eras como pacotes de dados (2026, 2000, 1993 e 1975), com nomes, pontos por vitória e
  gols da época.
- Save v6.

Decisões em `PLANO-FUNDO.md`, números em `ROADMAP.md`.

---

## 6. Riscos e pendências

1. **Dados reais de jogadores.** É o maior risco. O ambiente da IA só acessa registros de
   pacotes e GitHub; o usuário precisa baixar um dataset (CSV/JSON de ratings e valores) e
   colocá-lo na pasta. Antes disso, usar a liga fictícia da Fase 0.
2. **Escala de dados.** Estimativa pelo save do NBA GM (~0,55 MB para ~530 jogadores): cinco
   ligas cabem em JSON; dezenas de milhares de jogadores exigem SQLite. Medir na Fase 3.
3. **Calibração.** As faixas da seção da Fase 0 são palpites. Refinar com tabelas reais
   (pontos de campeão, gols/jogo etc.) quando o usuário fornecer os dados.
4. **Escopo.** Cada fase tem aceite próprio. Se uma fase crescer demais, quebrar em duas em
   vez de acumular.
