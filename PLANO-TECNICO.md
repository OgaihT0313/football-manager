# PLANO-TECNICO — decisões da Fase 5

Camada de técnico: diretoria, demissão, empregos, imprensa, decisões, moral, staff, olheiros,
prêmios e conquistas. Números medidos em `ROADMAP.md`.

## Diretoria (`src/manager/board.ts`)

A ideia vem da referência (NBA GM, `ownerService`): a confiança é uma **projeção da campanha**
contra a meta, que se corrige sozinha, em vez de somar deltas a cada jogo.

- **Mandato:** sai do ranking de força do elenco do usuário na liga, no início da temporada.

  | Ranking | Mandato | Meta |
  |---|---|---|
  | 1º–2º | Título | até 2º |
  | até as vagas de Champions | Champions | até a última vaga de Champions |
  | até as vagas europeias | Vaga europeia | até a última vaga europeia (+1) |
  | metade de cima | Meio da tabela | até 55% da tabela |
  | o resto | Permanência | fora do rebaixamento |

  Na 2ª divisão: Acesso (entre os mais fortes) ou meio da tabela.

- **Confiança (0–100):**
  - Até a 6ª rodada, vale a de largada: 60, ou 0,6·60 + 0,4·a da temporada anterior.
  - Depois, entra a campanha: 60 + 6·(meta − posição), misturada com a largada até a 20ª rodada.
  - Soma-se um saldo de copas: +1 por fase passada na copa, +1,5 na Europa; −4 por eliminação com
    mandato de título ou Champions, −1 nos outros mandatos.
  - As respostas a coletivas e decisões também entram nesse saldo.
- **Demissão:**
  - No meio da temporada: a partir da 19ª rodada, com confiança ≤ 12.
  - No fim: confiança abaixo da linha do mandato (título 32, Champions 26, europa 20, meio 14,
    permanência 8, acesso 20), ou rebaixamento.
  - Título na temporada sempre salva o emprego.

## Empregos (`src/manager/jobs.ts`)

- **Vagas da IA:**
  - Nos fins de semana a partir da 10ª rodada, clube na metade de baixo e 4+ posições abaixo do
    esperado (ordem da receita) tem 6% de chance por semana de demitir. A vaga fica aberta 8 datas.
  - No fim da temporada, quem ficou 6+ posições abaixo do esperado demite com 50% de chance; essa
    vaga fica para a pré-temporada seguinte.
  - Vale para as ligas jogadas com elenco, inclusive 2ª divisão com rebaixados.
- **Alcance do técnico:** reputação + 8 + 2 a cada 2 datas desempregado. Empregado, só aparecem
  clubes maiores que o atual (propostas).
- **Reputação do técnico:** começa na reputação do primeiro clube − 10. No fim da temporada
  muda 0,8 por posição acima/abaixo da meta, +4 por título, +8 pela Champions e +4 pelo acesso,
  limitado a −8…+15. Demissão custa 5.
- **Desempregado:** o clube antigo passa para a IA, e o Início mostra as vagas e "Avançar uma
  data". As abas de elenco, escalação, mercado e clube ficam bloqueadas.

## Imprensa, decisões e moral (`src/manager/press.ts`)

- **Coletiva:** antes do próximo jogo, criada logo depois de um jogo do usuário; sempre em
  mata-mata e finais, 30% de chance nos outros. As perguntas mudam conforme o time é favorito,
  azarão ou o jogo é grande. Cada resposta mexe na moral do elenco, na confiança e na reputação.
- **Jogador insatisfeito:** a cada 4 fins de semana a partir da 10ª rodada, um dos 14 melhores
  do elenco com moral < 45 e pouco tempo de jogo pede conversa.
- **Sem resposta até o prazo**, vale a opção padrão.
- **Moral** (já entrava no rendimento, ±5%), agora com dinâmica: ±3 para o elenco inteiro por
  vitória ou derrota, +1 para quem jogou, e volta 10% para 50 a cada fim de semana. Vale para
  todos os clubes. O backtest mostra campeão +1,4 pt e último −1,5 pt, ainda dentro das faixas.

## Staff e olheiros (`src/manager/staff.ts`)

- **Cargos e efeitos (nível 3 = neutro):**
  - Preparador físico: recuperação ×(1 + 0,06·(n−3)).
  - Auxiliar técnico: treino efetivo + 0,5·(n−3).
  - Olheiro: base +1 de nível por ponto acima de 3, prospectos melhores, potencial dos outros
    mostrado como faixa (±8 com nível 1, exato com nível 5).
  - Analista: gols esperados a favor ×(1 + 0,015·(n−3)).
- **Só o clube do usuário tem staff detalhado.** Os da IA são neutros, para a calibração do
  motor não mudar.
- **Custos:** salário 1.500·n² por semana, pago do caixa com orçamento próprio de 6% da
  receita, fora do teto da folha de jogadores. O mercado de staff tem 3 opções por cargo a cada
  temporada.
- **Missão do olheiro:** 6 regiões; traz 3 jovens de 16 a 18 anos, que aparecem como agentes
  livres só para o usuário (a IA não os vê). Uma missão a cada 8 datas. É o "draft" do futebol.

## Prêmios e conquistas (`src/manager/awards.ts`)

- **Prêmios:** em cada 1ª divisão com elenco, artilheiro, melhor jogador (maior nota média,
  mínimo 20 jogos) e revelação (até 21 anos, mínimo 15 jogos); em cada copa europeia,
  artilheiro e melhor jogador. São guardados os prêmios de 30 temporadas.
- **Conquistas:** 11, de "Primeira taça" a "Rei da Europa", incluindo "Faz parte" (ser
  demitido) e "Rodado" (3 clubes).
- **Histórico:** passagens com jogos, V/E/D e títulos, e campeões de todas as competições por
  temporada.

## Save

`CURRENT_SAVE_VERSION = 5`. A migração v4 → v5 cria técnico, diretoria, staff, mercado de
staff e listas vazias. Foi testada com um save v4 real no navegador.

## O que não entrou

- Tom da imprensa e decisões com consequência atrasada (ex.: prometer minutos e não cumprir).
- Proposta formal de renovação ou de outro clube com prazo (hoje é a lista de vagas).
- Staff da IA detalhado e roubo de staff.
- Treinos por foco (físico, tático) e conversa individual com jogadores fora das decisões.
