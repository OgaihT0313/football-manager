# PLANO-MERCADO — decisões da Fase 2

Contratos, transferências, empréstimos, finanças e evolução. Números medidos em `ROADMAP.md`.

## Tempo

A temporada não tem datas, só rodadas. Mercado por rodada (`src/market/calendar.ts`):

- **Verão:** pré-temporada até antes da rodada 3.
- **Inverno:** antes das rodadas 20 a 22.
- **Pré-contrato:** do inverno até a virada, para quem tem contrato terminando na temporada.
- **Goleiro de emergência:** sem nenhum goleiro disponível, o clube da IA contrata agente livre
  fora da janela. O usuário vê os desfalques e decide.

Contrato com `expires = Y` vale até o fim da temporada Y.

## Mundo fechado

Uma liga de 20 clubes, mais agentes livres e base. Não existe "exterior": o dinheiro de
transferência só circula entre os clubes. A entrada de jogadores vem da base (1 por clube por
ano, 2 se o elenco estiver curto) e dos agentes livres. Na Fase 6 as ligas de fundo podem virar
comprador e vendedor externos.

## Finanças (`src/club/finance.ts`)

A receita-base R de cada clube **sai da folha inicial** (salários = 60% de R). Assim liga
fictícia e dados importados ficam coerentes sem tabela de receitas por clube.

| Item | Valor anual |
|---|---|
| TV, bilheteria e comercial | 0,9·R, pagos rodada a rodada |
| Premiação | 0 a 0,2·R pela colocação, no fim da temporada |
| Salários | ≈ 0,6·R; teto da diretoria 0,65·R, até +10 pts com caixa sobrando |
| Custos operacionais | 0,3·R |

- **Orçamento de transferências:** 60% do caixa, limitado a 60% de R. Metade do que entra com
  vendas volta para o orçamento.
- **Limite de gasto (fair play simplificado):** uma compra não pode deixar o caixa abaixo de
  −15% de R.
- **Desempenho:** a posição esperada é o ranking por R. Terminar acima dela aumenta R (até
  +6%/ano) e a reputação; terminar abaixo diminui.
- **Caixa inicial:** 40% de R. Com 25%, um clube médio não comprava nem um reserva.

## Valor e salário (`src/market/valuation.ts`)

- **Valor:** `1 mi · e^((OVR−60)/5,5)`, ajustado por idade, potencial (para quem tem até 24
  anos), posição (atacante vale mais, goleiro menos) e contrato (último ano vale metade).
- **Salário pedido:** `1.500 · e^((OVR−55)/6)` por semana. Jovem pede menos.
- **Preço do clube vendedor:** valor × 1,5 para titular, × 1,1 para reserva e × 0,85 para
  excedente ou jogador de 31+. Clube com caixa negativo vende 15% mais barato. A multa
  rescisória, quando existe, é o teto.
- **Resposta do vendedor:** aceita no preço, contrapropõe a partir de 70% e recusa abaixo
  disso. Não vende se o elenco cair abaixo de 18 ou se ficar com menos de 2 goleiros.
- **Resposta do jogador:** aceita se o salário cobre o pedido e a duração cabe na faixa da
  idade. Ir para um clube de reputação menor exige ágio de 1,2% por ponto.

## IA (`src/ai/transferAI.ts`)

Em cada dia de janela, em ordem sorteada, cada clube:

1. Dispensa o pior jogador se o elenco passou de 28 e a multa for barata.
2. No verão, empresta um jovem (até 21 anos, não titular) para um clube onde ele seria titular.
   Só se o clube tiver mais de 24 jogadores, e nunca deixando menos de 2 goleiros.
3. Compra:
   - **Reforço:** o maior ganho (≥ 2 pontos) para a vaga mais fraca do XI, dentro do orçamento
     e do teto salarial.
   - **Reposição:** com elenco abaixo de 22, contrata o mais barato que sirva (nível do clube
     − 12, idade a partir de 21).
   - Se o jogador desejado for do usuário, a IA manda uma proposta para a caixa dele em vez de
     comprar direto.

No fim da temporada a IA renova:

- titulares, os 2 melhores goleiros e os 20 melhores do elenco (até 32 anos; titulares até 34);
- jovens promissores (potencial acima do nível do clube);
- outros, se preciso, para manter 22 jogadores, sempre dentro do teto salarial.

Jovem que não evoluiu não é renovado. Na virada, clubes com menos de 20 jogadores contratam
agentes livres, e todos terminam com pelo menos 2 goleiros.

## Evolução (`src/club/development.ts`)

Variação anual de OVR por idade, onde `gap` = potencial − OVR:

| Idade | Variação |
|---|---|
| até 18 | +30% do `gap` |
| até 21 | +25% |
| até 23 | +18% |
| até 26 | +10% |
| 27–29 | −0,3 |
| 30–31 | −1,5 |
| 32–33 | −2,5 |
| 34+ | −3,5 |

- **Ajustes:** o treino do clube (1 a 5) multiplica o ganho entre 0,9 e 1,3. Jovem sem minutos
  evolui metade. Há ruído normal com desvio de 1,2.
- **Aposentadoria:** chance crescente a partir dos 33; certa aos 38.
- **Base:** jogadores de 16 a 18 anos, nível do clube − 17, com potencial em média ~4 abaixo do
  nível do clube. Com o potencial do gerador original, todo garoto virava titular e o OVR da
  liga inflava.

## Save

`CURRENT_SAVE_VERSION = 2`. A migração v1 → v2 cria as finanças pela folha atual, o treino pela
reputação e listas vazias de transferências, propostas e pré-contratos. Foi testada no Node
(`check_save`) e no navegador, com um save rebaixado para v1. O histórico de transferências
guarda 3 temporadas.

## Problemas encontrados no diagnóstico (e a correção)

- **Elencos encolhendo até 12:** a IA só renovava os 16 melhores e não repunha. Correção:
  piso de 22 nas renovações, reposição barata e preenchimento com agentes livres na virada.
- **Folha em 179% da receita:** as renovações do piso ignoravam o teto. Correção: piso dentro
  do teto, com no máximo 5% de folga.
- **Clubes sem goleiro sofrendo 360 gols:** a renovação ordenava pelo OVR do elenco inteiro e
  o goleiro reserva saía. Correção: renovação por posição, mínimo de 2 goleiros, contratação
  de emergência e limite no motor (fator do goleiro até 2× e λ até 6).
- **Mais da metade do elenco com até 21 anos:** base demais e com potencial alto demais.
  Correção: 1 a 2 jovens por ano, potencial menor e não renovação de quem não evoluiu.
