// Temporada de liga jogada rodada a rodada. O estado é JSON puro para entrar no save.
// O app (uma rodada por toque) e o backtest (temporada inteira) usam a mesma `playRound`.

import { FORMATIONS } from '../domain/positions';
import type { Club, Fixture, LeagueConfig, MatchResult, Player, TableRow } from '../domain/types';
import { chooseLineup } from '../engine/lineup';
import { buildContext, DEFAULT_PARAMS, simulateMatch, teamStrength, type EngineParams, type MatchContext } from '../engine/matchEngine';
import { createRng, deriveSeed } from '../engine/rng';
import { computeTable, generateFixtures } from './league';

export interface PlayerStatus {
  /** Partidas do clube que o jogador ainda vai perder. */
  out: number;
  reason: 'injury' | 'suspension' | null;
  /** Amarelos acumulados na temporada. */
  yellows: number;
}

export interface SeasonState {
  leagueId: string;
  year: number;
  seed: number;
  fixtures: Fixture[];
  results: MatchResult[];
  /** Próxima rodada a jogar (1 = início). Maior que `totalRounds` = temporada encerrada. */
  nextRound: number;
  totalRounds: number;
  context: MatchContext;
  status: Record<string, PlayerStatus>;
  table: TableRow[];
}

/** Liga, clubes e jogadores. `playRound` altera `players` (condição física). */
export interface World {
  league: LeagueConfig;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
}

/** Cartões amarelos acumulados que geram um jogo de suspensão. */
export const YELLOW_LIMIT = 5;

/** Desgaste de uma partida (condição 0-100). Pressão alta cansa mais. */
export function matchFitnessCost(club: Club): number {
  return 11 + 1.5 * (club.tactic.pressing - 3);
}

/** Entre uma rodada e outra o jogador recupera esta fração do que falta para 100. */
export const RECOVERY_RATE = 0.35;

export function createSeason(world: World, year: number, seed: number, params: EngineParams = DEFAULT_PARAMS): SeasonState {
  const { league, clubs, players } = world;
  // Referência da liga: força média dos XIs ideais (sem fadiga) no início da temporada.
  const rested: Record<string, Player> = {};
  for (const [id, p] of Object.entries(players)) rested[id] = { ...p, fitness: 100 };
  const strengths = league.clubIds.map((id) => {
    const l = chooseLineup({ ...(clubs[id] as Club), startingXI: [] }, rested);
    return teamStrength(l, FORMATIONS[l.formation], params);
  });
  const fixtures = generateFixtures(league, seed);
  const totalRounds = fixtures.reduce((m, f) => Math.max(m, f.round), 0);
  return {
    leagueId: league.id,
    year,
    seed,
    fixtures,
    results: [],
    nextRound: 1,
    totalRounds,
    context: buildContext(strengths),
    status: {},
    table: computeTable(league, []),
  };
}

export function isSeasonOver(s: SeasonState): boolean {
  return s.nextRound > s.totalRounds;
}

export function isAvailableIn(s: SeasonState): (id: string) => boolean {
  return (id) => !((s.status[id]?.out ?? 0) > 0);
}

export function roundFixtures(s: SeasonState, round: number): Fixture[] {
  return s.fixtures.filter((f) => f.round === round);
}

export function roundResults(s: SeasonState, round: number): MatchResult[] {
  const ids = new Set(roundFixtures(s, round).map((f) => f.id));
  return s.results.filter((r) => ids.has(r.fixtureId));
}

function statusOf(s: SeasonState, id: string): PlayerStatus {
  let st = s.status[id];
  if (!st) {
    st = { out: 0, reason: null, yellows: 0 };
    s.status[id] = st;
  }
  return st;
}

/**
 * Joga a próxima rodada. ALTERA `season` e `world.players` (quem chama decide se clona antes).
 * Devolve os resultados da rodada. Não faz nada se a temporada acabou.
 */
export function playRound(world: World, season: SeasonState, params: EngineParams = DEFAULT_PARAMS): MatchResult[] {
  if (isSeasonOver(season)) return [];
  const { league, clubs, players } = world;
  const round = season.nextRound;
  const available = isAvailableIn(season);
  const played: MatchResult[] = [];

  for (const fx of roundFixtures(season, round)) {
    const home = clubs[fx.homeId] as Club;
    const away = clubs[fx.awayId] as Club;
    const result = simulateMatch({
      fixture: fx,
      home,
      away,
      homeLineup: chooseLineup(home, players, available),
      awayLineup: chooseLineup(away, players, available),
      players,
      ctx: season.context,
      rng: createRng(deriveSeed(season.seed, fx.id)),
      params,
    });
    played.push(result);

    // Desgaste de quem jogou.
    for (const [club, xi] of [[home, result.homeXI], [away, result.awayXI]] as const) {
      const cost = matchFitnessCost(club);
      for (const pid of xi) {
        const p = players[pid];
        if (p) p.fitness = Math.max(0, (p.fitness ?? 100) - cost);
      }
    }

    // Quem estava fora cumpre um jogo; depois entram as novas ausências.
    for (const club of [home, away]) {
      for (const pid of club.squad) {
        const st = season.status[pid];
        if (st && st.out > 0) {
          st.out--;
          if (st.out === 0) st.reason = null;
        }
      }
    }
    for (const e of result.events) {
      if (e.type === 'injury') {
        const st = statusOf(season, e.playerId);
        st.out = Math.max(st.out, e.matchesOut ?? 1);
        st.reason = 'injury';
      } else if (e.type === 'red') {
        const st = statusOf(season, e.playerId);
        if (st.out < 1) {
          st.out = 1;
          st.reason = 'suspension';
        }
      } else if (e.type === 'yellow') {
        const st = statusOf(season, e.playerId);
        st.yellows++;
        if (st.yellows % YELLOW_LIMIT === 0 && st.out < 1) {
          st.out = 1;
          st.reason = 'suspension';
        }
      }
    }
  }

  // Recuperação até a próxima rodada, para todos os jogadores da liga.
  for (const clubId of league.clubIds) {
    for (const pid of (clubs[clubId] as Club).squad) {
      const p = players[pid];
      if (!p) continue;
      const f = p.fitness ?? 100;
      p.fitness = Math.round((f + (100 - f) * RECOVERY_RATE) * 10) / 10;
    }
  }

  season.results.push(...played);
  season.nextRound = round + 1;
  season.table = computeTable(league, season.results);
  return played;
}

export interface SeasonInput {
  league: LeagueConfig;
  clubs: Club[];
  players: Record<string, Player>;
  seed: number;
  year?: number;
  params?: EngineParams;
}

/** Simula a temporada inteira sem alterar os objetos recebidos. */
export function simulateSeason(input: SeasonInput): SeasonState {
  const clubs: Record<string, Club> = {};
  for (const c of input.clubs) clubs[c.id] = c;
  const players: Record<string, Player> = {};
  for (const [id, p] of Object.entries(input.players)) players[id] = { ...p, fitness: 100 };
  const world: World = { league: input.league, clubs, players };
  const season = createSeason(world, input.year ?? 2026, input.seed, input.params);
  while (!isSeasonOver(season)) playRound(world, season, input.params);
  return season;
}
