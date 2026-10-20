// Temporada de UMA liga, sem copas: invólucro do mundo (world.ts) usado pelo backtest e pelos
// checks do motor. Usa exatamente o mesmo código que o jogo.

import type { Club, Fixture, LeagueConfig, MatchResult, Player, TableRow } from '../domain/types';
import { DEFAULT_PARAMS, type EngineParams, type MatchContext } from '../engine/matchEngine';
import { createWorldSeason, isWorldSeasonOver, playSlot, type PlayerStatus, type WorldData } from './world';

export { isAvailableIn, matchFitnessCost, RECOVERY_RATE, YELLOW_LIMIT, type PlayerStatus } from './world';

export interface SeasonState {
  leagueId: string;
  year: number;
  seed: number;
  fixtures: Fixture[];
  results: MatchResult[];
  context: MatchContext;
  status: Record<string, PlayerStatus>;
  table: TableRow[];
}

export interface SeasonInput {
  league: LeagueConfig;
  clubs: Club[];
  players: Record<string, Player>;
  seed: number;
  year?: number;
  params?: EngineParams;
}

/** Simula a temporada inteira da liga sem alterar os objetos recebidos. */
export function simulateSeason(input: SeasonInput): SeasonState {
  const clubs: Record<string, Club> = {};
  for (const c of input.clubs) clubs[c.id] = c;
  const players: Record<string, Player> = {};
  for (const [id, p] of Object.entries(input.players)) players[id] = { ...p, fitness: 100 };
  const data: WorldData = { leagues: { [input.league.id]: input.league }, clubs, players };
  const params = input.params ?? DEFAULT_PARAMS;
  const ws = createWorldSeason(data, input.year ?? 2026, input.seed, { cups: false, params });
  while (!isWorldSeasonOver(ws)) playSlot(data, ws, params);
  const comp = ws.competitions[input.league.id]!;
  return {
    leagueId: input.league.id,
    year: ws.year,
    seed: ws.seed,
    fixtures: comp.fixtures,
    results: comp.results,
    context: comp.context,
    status: ws.status,
    table: comp.table,
  };
}
