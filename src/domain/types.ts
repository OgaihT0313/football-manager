// Tipos do domínio. Tudo aqui precisa ser JSON puro: sem classes, sem Map/Set, sem Date.

export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'DM' | 'CM' | 'AM' | 'LW' | 'RW' | 'ST';

export type Foot = 'L' | 'R' | 'B';

/** Atributos agrupados, escala 1-99. `goalkeeping` só tem valor relevante para goleiros. */
export interface Attributes {
  attack: number;
  creation: number;
  defending: number;
  physical: number;
  goalkeeping: number;
}

export interface Contract {
  /** Salário semanal, em unidades monetárias do jogo. */
  wage: number;
  /** Temporada (ano de início) em cujo fim o contrato termina. */
  expires: number;
  /** Multa rescisória: proposta igual ou maior obriga o clube a vender. */
  releaseClause?: number;
}

/** Jogador emprestado: `clubId` é o clube que recebeu; o contrato continua com o dono. */
export interface Loan {
  parentClubId: string;
  /** Volta ao clube dono no fim desta temporada. */
  until: number;
  /** Fração do salário paga pelo clube que recebeu (0-1). */
  wageShare: number;
}

export interface Player extends Attributes {
  id: string;
  name: string;
  age: number;
  nationality: string;
  /** A primeira posição é a principal; as demais são secundárias. */
  positions: Position[];
  foot: Foot;
  /** Calculado a partir dos atributos e da posição principal (ver `positions.ts`). */
  ovr: number;
  /** Teto de evolução, 1-99. */
  potential: number;
  contract: Contract;
  value: number;
  clubId: string | null;
  /** 0-100, 50 é neutro. */
  morale?: number;
  /** 0-100, 100 é totalmente descansado. */
  fitness?: number;
  loan?: Loan;
}

export type Formation = '4-3-3' | '4-2-3-1' | '4-4-2' | '3-5-2' | '5-3-2';

export type Level = 1 | 2 | 3 | 4 | 5;

export interface Tactic {
  formation: Formation;
  pressing: Level;
  lineHeight: Level;
  tempo: Level;
}

export interface Club {
  id: string;
  name: string;
  shortName: string;
  leagueId: string;
  squad: string[];
  /** Vazio = deixar a IA escolher. */
  startingXI: string[];
  tactic: Tactic;
  /** Orçamento de transferências da temporada, definido pela diretoria. */
  budget: number;
  /** Teto da folha salarial semanal. */
  wageBudget: number;
  /** 1-100. */
  reputation: number;
  /** Qualidade do treino/estrutura (1-5): acelera a evolução dos jogadores. */
  training: Level;
  finance: ClubFinance;
}

export interface SeasonLedger {
  /** Receitas de TV, bilheteria e comerciais acumuladas na temporada. */
  income: number;
  /** Premiação por colocação, paga no fim da temporada. */
  prizes: number;
  wages: number;
  /** Custos fixos (estrutura, staff, estádio). */
  operating: number;
  transfersIn: number;
  transfersOut: number;
}

export interface ClubFinance {
  /** Caixa do clube. */
  balance: number;
  /** Receita anual de referência (TV + bilheteria + comercial), muda com desempenho. */
  revenueBase: number;
  season: SeasonLedger;
}

export type TransferType = 'transfer' | 'loan' | 'free' | 'release' | 'loanReturn';

export interface TransferRecord {
  year: number;
  /** Rodada antes da qual a transferência aconteceu (0 = virada de temporada). */
  round: number;
  playerId: string;
  playerName: string;
  fromClubId: string | null;
  toClubId: string | null;
  fee: number;
  wage: number;
  type: TransferType;
}

/** Proposta de um clube da IA por um jogador do usuário. */
export interface IncomingOffer {
  id: string;
  playerId: string;
  fromClubId: string;
  fee: number;
  /** Rodada em que a proposta expira (fecha com a janela). */
  expiresRound: number;
  year: number;
}

/** Pré-contrato: o jogador muda de clube de graça na virada da temporada. */
export interface PreContract {
  playerId: string;
  toClubId: string;
  wage: number;
  years: number;
}

export interface LeagueConfig {
  id: string;
  name: string;
  country: string;
  clubIds: string[];
  pointsForWin: number;
  pointsForDraw: number;
  /** Quantas vezes cada par se enfrenta (2 = ida e volta). */
  legs: number;
  /** Ordem dos critérios de desempate, aplicada da esquerda para a direita. */
  tiebreakers: Tiebreaker[];
}

export type Tiebreaker = 'points' | 'goalDiff' | 'goalsFor' | 'headToHead' | 'wins' | 'awayGoalsFor';

export interface Fixture {
  id: string;
  round: number;
  homeId: string;
  awayId: string;
}

export type MatchEventType = 'goal' | 'yellow' | 'red' | 'injury';

export interface MatchEvent {
  type: MatchEventType;
  minute: number;
  clubId: string;
  playerId: string;
  /** Só em gols. */
  assistId?: string;
  /** Só em lesões: quantas partidas o jogador fica fora. */
  matchesOut?: number;
}

export interface MatchResult {
  fixtureId: string;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  /** Gols esperados (λ) usados no sorteio. */
  homeXg: number;
  awayXg: number;
  events: MatchEvent[];
  /** Nota 1-10 por jogador que entrou em campo. */
  ratings: Record<string, number>;
  homeXI: string[];
  awayXI: string[];
}

export interface TableRow {
  clubId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  awayGoalsFor: number;
  points: number;
}
