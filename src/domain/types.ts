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
  /** Temporada (ano de início) em que o contrato termina. */
  expires: number;
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
  budget: number;
  wageBudget: number;
  /** 1-100. */
  reputation: number;
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
