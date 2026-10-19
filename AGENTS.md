# Football Manager mobile

Leia `PLANO-FUTEBOL.md` antes de qualquer coisa. Trabalhe **uma fase por vez** e não inicie
a próxima sem o usuário pedir.

- Domínio (`src/`) em TypeScript puro, sem React; RNG sempre com seed; estado serializável.
- Interface e comentários em português do Brasil.
- App em **Expo SDK 58** (React Native 0.88, React 19.3). Expo HAS CHANGED: leia a doc da
  versão exata em https://docs.expo.dev/versions/v58.0.0/ antes de escrever código de Expo.
  Ex.: `expo-file-system` usa a API nova (`File`, `Paths`) e não roda no web.
- `package.json` tem `"type": "module"`; por isso os configs são `babel.config.cjs`,
  `metro.config.cjs` e `tailwind.config.cjs`. TypeScript fica na versão que o Expo pede (~6.0).
- Lógica do jogo em `src/` (testável no Node); o app (`App.tsx`, `screens/`, `components/`,
  `store/`) só chama o domínio. Store em Zustand (`store/gameStore.ts`), com autosave.
- Referência de arquitetura (somente leitura, não importar código):
  `C:\Users\Usuario\Documents\Projetos\nba-gm-mobile`.
- Meça antes de afirmar: toda mudança no motor termina rodando `scripts/backtest_league.ts`
  e `scripts/check_engine.ts` e reportando os números. Mudança na carreira ou no save roda
  também `scripts/check_save.ts`.
- Mudou o formato de `CareerState`? Suba `CURRENT_SAVE_VERSION` (`src/career/career.ts`) e
  escreva a migração em `src/save/saveService.ts`.
