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
  também `scripts/check_save.ts`. Mudança em mercado, finanças, IA ou evolução roda
  `scripts/check_market.ts` e `scripts/diagnose_league.ts --carreiras 5`. Mudança em calendário,
  copas ou Europa roda `scripts/check_europe.ts --temporadas 10`.
  Mudança na diretoria, empregos, staff, imprensa ou prêmios (`src/manager/`,
  `src/career/managerCareer.ts`) roda `scripts/check_career.ts`. Mudança nas ligas de fundo,
  vitrine (`src/market/abroad.ts`) ou eras roda `scripts/check_world.ts`; na visão 2D
  (`src/engine/watchDirector.ts`), `scripts/check_watch.ts`.
- Interface "Mesa de Comando": use os tokens de `components/theme.ts` (classes `bg-bg`, `bg-s1`,
  `text-ink`, `text-mute`, `border-line`, `bg-acc`...) e as famílias `font-sans*`, `font-disp*`,
  `font-mono*` (uma por peso; não use `font-bold`). Telas têm layout de celular e de PC
  (`useWide()`, a partir de 1024 px). Nada de importar `components/Pitch2D.tsx` fora de
  `PitchCanvas*` (no web quebra o Skia).
- Visão 2D em Skia (`@shopify/react-native-skia`). No web o CanvasKit vem de
  `public/canvaskit.wasm` (`npm run setup:skia`, fora do git); `components/PitchCanvas.web.tsx`
  o carrega antes de importar o desenho.
- O jogo roda num **mundo** (`src/competitions/world.ts`): ligas, copas e supercopas num
  calendário de datas. Clubes sem elenco jogam "por força" (`Club.strength`). Dados em
  `data/world/` (`npm run gen:world`); a liga única de `data/` é só a base do backtest.
- Mudou o formato de `CareerState`? Suba `CURRENT_SAVE_VERSION` (`src/career/career.ts`) e
  escreva a migração em `src/save/saveService.ts`.
