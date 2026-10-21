# PLANO-FUNDO — decisões da Fase 6

Ligas de fundo com jogadores sob demanda, visão 2D da partida em Skia e eras como pacotes de
dados. Números medidos em `ROADMAP.md`.

## Ligas de fundo e vitrine (`src/market/abroad.ts`)

- **Ligas:** as 12 da Fase 4 (Portugal, Holanda, Bélgica, Turquia, Escócia, Áustria, Suíça,
  Grécia, Tchéquia, Dinamarca, Croácia, Sérvia) e mais **Brasil (Brasileirão) e Argentina
  (Liga Profesional)**, com 20 clubes cada.
  - Todas são "por força", sem elenco.
  - Brasil e Argentina não têm vagas europeias. A liga fica sem `continental`, então os clubes
    não entram nem no preenchimento das copas europeias.
- **Vitrine:** a cada temporada, cada clube de fundo mostra 3 jogadores ao mercado (4 no Brasil
  e na Argentina):
  - Destaque: 21–27 anos, força do clube +2 a +6.
  - Joia: 17–20 anos, força −9 a −4, potencial alto.
  - Oportunidade: 23–30 anos, perto da força do clube.
  - No Brasil e na Argentina há uma segunda joia.
  - A nacionalidade é a do país; os ids são `<clube>-v<ano>-<n>`.
- **Sob demanda:** os jogadores são gerados na virada (sorteio estável por seed, ano e clube) e
  ficam ligados ao clube (`Player.clubId`), mas fora do elenco (`Club.showcase`, não `squad`).
  - Quem não é vendido some na virada seguinte ("ficou no exterior").
  - O save guarda só a vitrine do ano, uns 680 jogadores.
- **Venda:** o clube de fundo vende pelo valor ×1,2. Contraproposta a partir de 70% do pedido;
  abaixo disso, recusa. Não empresta. O dinheiro entra no caixa dele (sem efeito no jogo).
- **Quem compra:**
  - A IA, pelo mesmo `tryBuy` (o jogador é só mais um no mundo). Na prática, de 2 a 6 compras
    por temporada: a vitrine reforça pouco os clubes grandes.
  - O usuário, no Mercado › Exterior.
- **Simplificação:** a força do clube de fundo não cai quando ele vende.

## Visão 2D (`src/engine/watchDirector.ts`, `components/Pitch2D.tsx`, `screens/WatchView.tsx`)

- A partida já está decidida pelo motor (placar, xG, eventos com minuto). O diretor só monta a
  encenação, a mesma ideia do `watchDirector` do NBA GM.
- **Lances:**
  - Os gols do motor, mais chutes sem gol proporcionais ao xG (≈ 8 × xG), nos minutos
    sorteados; 45% dos chutes sem gol são defesas.
  - Entre os lances, posses "neutras" com perdas de bola; o lado que domina (pelo xG) fica mais
    com a bola.
  - Saída de bola depois de cada gol e no 2º tempo; intervalo aos 45 min.
- **Jogadores:**
  - Partem da formação do clube (o XI vai para as vagas pela posição principal).
  - O time sobe e desce com a bola, fecha na largura do lado dela e avança quando tem a posse.
  - O mais próximo da bola vai nela.
  - O mandante ataca para cima o jogo todo, sem troca de lado.
- **Tela:**
  - Detalhe da partida › "Assistir em 2D". Placar e relógio, campo em Skia, legenda do último
    evento, pausar, velocidade 1x/3x/9x (20/60/180 s de jogo por segundo), pular para o fim e
    os últimos lances.
  - Só para partidas com detalhe (as do usuário e as da liga dele).
- **Web:** o Skia precisa do CanvasKit (`canvaskit.wasm`, 8 MB).
  - `npm run setup:skia` (também no `postinstall`) copia o arquivo para `public/`; ele fica
    fora do git.
  - `PitchCanvas.web.tsx` carrega o CanvasKit com `WithSkiaWeb` e só então importa o desenho.
    No celular, `PitchCanvas.tsx` desenha direto.
- **Desenho:** re-render do React a cada quadro (≈ 50 elementos de Skia). Se ficar pesado no
  aparelho, o próximo passo é passar a bola e os jogadores para valores compartilhados do
  Reanimated, sem re-render.

## Eras (`data/eras/eras.json`, `src/data/eras.ts`)

- **O pacote** traz:
  - ano inicial;
  - multiplicador de gols do motor (`goalScale`, aplicado a μ de casa e de fora);
  - pontos por vitória, geral ou por país;
  - nomes de ligas, copas, supercopas e competições europeias.
- **Pacotes:**

  | Era | Ano | Gols | Pontos | Nomes |
  |---|---|---|---|---|
  | Atual | 2026 | ×1 | 3 | atuais |
  | Virada do milênio | 2000 | ×0,96 | 3 | Copa da UEFA, Intertoto, Division 1 |
  | Anos 90 | 1993 | ×0,93 | 2 na Espanha, Itália, Alemanha e França; 3 na Inglaterra | Copa da UEFA, Recopa |
  | Anos 70 | 1975 | ×0,90 | 2 em todo lugar | Copa dos Campeões, First Division, Charity Shield |

- **Escolha:** na tela de clube da nova carreira.
  - A era atual usa `data/world` (que pode ter dados importados).
  - As outras geram o mesmo mundo fictício com o calendário no ano da era (≈ 10 ms) e aplicam o
    pacote.
- A carreira guarda `era` (id, nome, gols e nomes europeus). O motor recebe os parâmetros da
  era em cada data, e as competições europeias são renomeadas a cada temporada.
- **O que não muda:**
  - O formato das competições continua o atual (Champions de 36 clubes, 3 copas europeias).
  - Elencos e clubes continuam fictícios; não há temporadas reais.
  - Quando o usuário trouxer dados históricos (`scripts/import_players.ts`), o pacote pode
    apontar para eles.

## Save

`CURRENT_SAVE_VERSION = 6`. A migração v5 → v6:

- Cria as ligas de fundo que faltam (Brasil e Argentina), que jogam a partir da próxima
  temporada.
- Gera as vitrines do ano.
- Saves de antes da Fase 4 (sem ligas de fundo) seguem com as ligas que tinham.
- `era` é opcional; sem era, vale a atual.
- Testada com um save v5 real no navegador.

## Medição: critério da Conference

O `check_europe` exigia o campeão de cada copa europeia, em média, entre os 9 mais fortes dos
36. Em 30 temporadas **antes** da Fase 6, o campeão da Conference ficou em 10,7º; o 8,9 da
Fase 4 veio de uma amostra de 10. Depois da Fase 6, deu 10,0º. Os 36 da Conference têm força
parecida, então o limite dela passou a 12 (terço de cima). Champions e Europa League continuam
com 9.

## O que não entrou

- Força do clube de fundo cair com as vendas e se recuperar com o tempo.
- Olheiro observar ligas de fundo especificamente; as missões do olheiro continuam por região.
- Visão 2D com troca de lado, escanteios, faltas e substituições; câmera e zoom.
- Formatos históricos das competições (Copa dos Campeões em mata-mata, Recopa de verdade) e
  pacotes com dados reais.
