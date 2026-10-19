# Football Manager mobile

Leia `PLANO-FUTEBOL.md` antes de qualquer coisa. Trabalhe **uma fase por vez** e não inicie
a próxima sem o usuário pedir.

- Domínio (`src/`) em TypeScript puro, sem React; RNG sempre com seed; estado serializável.
- Interface e comentários em português do Brasil.
- Fase 0 é só Node + TypeScript. Ao chegar na Fase 1 (Expo), **leia a doc da versão exata do
  Expo** em https://docs.expo.dev/versions/ antes de escrever código, porque a API mudou
  bastante entre versões.
- Referência de arquitetura (somente leitura, não importar código):
  `C:\Users\Usuario\Documents\Projetos\nba-gm-mobile`.
- Meça antes de afirmar: toda mudança no motor termina rodando `scripts/backtest_league.ts`
  e `scripts/check_engine.ts` e reportando os números.
