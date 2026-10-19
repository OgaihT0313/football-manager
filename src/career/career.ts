// Estado de uma carreira (o que vai para o save) e as ações sobre ele.
// Todas as funções devolvem um estado novo e não alteram o recebido (o store depende disso).

import { createSeason, isAvailableIn, isSeasonOver, playRound, type SeasonState, type World } from '../competitions/season';
import { FORMATIONS } from '../domain/positions';
import type { Club, Formation, LeagueConfig, MatchResult, Player, Tactic } from '../domain/types';
import { chooseLineup, type Lineup } from '../engine/lineup';
import { deriveSeed } from '../engine/rng';

export interface SeasonSummary {
  year: number;
  championId: string;
  userPosition: number;
  userPoints: number;
}

export interface CareerState {
  /** Versão do formato. Ver src/save/saveService.ts. */
  saveVersion: number;
  seed: number;
  userClubId: string;
  league: LeagueConfig;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  season: SeasonState;
  history: SeasonSummary[];
}

export const CURRENT_SAVE_VERSION = 1;

export interface NewCareerInput {
  league: LeagueConfig;
  clubs: Club[];
  players: Player[];
  userClubId: string;
  seed: number;
  year: number;
}

export function newCareer(input: NewCareerInput): CareerState {
  const clubs: Record<string, Club> = {};
  for (const c of input.clubs) if (input.league.clubIds.includes(c.id)) clubs[c.id] = { ...c, startingXI: [] };
  if (!clubs[input.userClubId]) throw new Error(`Clube ${input.userClubId} não está na liga ${input.league.id}`);
  const players: Record<string, Player> = {};
  for (const p of input.players) players[p.id] = { ...p, fitness: 100, morale: p.morale ?? 50 };
  const world: World = { league: input.league, clubs, players };
  const season = createSeason(world, input.year, deriveSeed(input.seed, 'temporada', input.year));
  const career: CareerState = {
    saveVersion: CURRENT_SAVE_VERSION,
    seed: input.seed,
    userClubId: input.userClubId,
    league: input.league,
    clubs,
    players,
    season,
    history: [],
  };
  // O usuário começa com a escalação automática fixada, para poder editá-la vaga a vaga.
  return autoPickUserXI(career);
}

/** Cópia do que `playRound` altera: jogadores (condição) e a temporada. */
function cloneForRound(c: CareerState): CareerState {
  const players: Record<string, Player> = {};
  for (const [id, p] of Object.entries(c.players)) players[id] = { ...p };
  const status: SeasonState['status'] = {};
  for (const [id, st] of Object.entries(c.season.status)) status[id] = { ...st };
  return { ...c, players, season: { ...c.season, results: c.season.results.slice(), status } };
}

/** Joga a próxima rodada. Devolve o estado novo e os resultados da rodada. */
export function advanceRound(c: CareerState): { career: CareerState; results: MatchResult[] } {
  if (isSeasonOver(c.season)) return { career: c, results: [] };
  const next = cloneForRound(c);
  const results = playRound({ league: next.league, clubs: next.clubs, players: next.players }, next.season);
  return { career: closeSeasonIfOver(next), results };
}

/** Joga até o fim da temporada (ou até `untilRound`, inclusive). */
export function simulateRounds(c: CareerState, untilRound = Infinity): CareerState {
  if (isSeasonOver(c.season)) return c;
  const next = cloneForRound(c);
  const world: World = { league: next.league, clubs: next.clubs, players: next.players };
  while (!isSeasonOver(next.season) && next.season.nextRound <= untilRound) playRound(world, next.season);
  return closeSeasonIfOver(next);
}

function closeSeasonIfOver(c: CareerState): CareerState {
  if (!isSeasonOver(c.season) || c.history.some((h) => h.year === c.season.year)) return c;
  const pos = c.season.table.findIndex((r) => r.clubId === c.userClubId);
  return {
    ...c,
    history: [
      ...c.history,
      {
        year: c.season.year,
        championId: c.season.table[0]?.clubId ?? '',
        userPosition: pos + 1,
        userPoints: c.season.table[pos]?.points ?? 0,
      },
    ],
  };
}

/** Começa a temporada seguinte com os mesmos elencos (evolução de jogadores é Fase 2). */
export function startNextSeason(c: CareerState): CareerState {
  if (!isSeasonOver(c.season)) return c;
  const year = c.season.year + 1;
  const players: Record<string, Player> = {};
  for (const [id, p] of Object.entries(c.players)) players[id] = { ...p, fitness: 100 };
  const world: World = { league: c.league, clubs: c.clubs, players };
  return { ...c, players, season: createSeason(world, year, deriveSeed(c.seed, 'temporada', year)) };
}

function updateUserClub(c: CareerState, patch: Partial<Club>): CareerState {
  const club = c.clubs[c.userClubId] as Club;
  return { ...c, clubs: { ...c.clubs, [club.id]: { ...club, ...patch } } };
}

export function setUserTactic(c: CareerState, tactic: Partial<Omit<Tactic, 'formation'>>): CareerState {
  const club = c.clubs[c.userClubId] as Club;
  return updateUserClub(c, { tactic: { ...club.tactic, ...tactic } });
}

/** Troca a formação e refaz o XI automaticamente para a nova formação. */
export function setUserFormation(c: CareerState, formation: Formation): CareerState {
  const club = c.clubs[c.userClubId] as Club;
  return autoPickUserXI(updateUserClub(c, { tactic: { ...club.tactic, formation } }));
}

/** Escolhe o XI automaticamente (considerando lesões, suspensões e cansaço) e fixa. */
export function autoPickUserXI(c: CareerState): CareerState {
  const club = c.clubs[c.userClubId] as Club;
  const lineup = chooseLineup({ ...club, startingXI: [] }, c.players, isAvailableIn(c.season));
  return updateUserClub(c, { startingXI: lineupToXI(lineup) });
}

/** Coloca `playerId` na vaga `slot`; se ele já estava em outra vaga, os dois trocam. */
export function setUserSlot(c: CareerState, slot: number, playerId: string): CareerState {
  const club = c.clubs[c.userClubId] as Club;
  if (!club.squad.includes(playerId)) return c;
  const size = FORMATIONS[club.tactic.formation].length;
  const xi = club.startingXI.length === size ? club.startingXI.slice() : lineupToXI(userLineup(c));
  const prev = xi.indexOf(playerId);
  const current = xi[slot] as string;
  xi[slot] = playerId;
  if (prev >= 0 && prev !== slot) xi[prev] = current;
  return updateUserClub(c, { startingXI: xi });
}

/** Escalação que o clube do usuário usaria agora (com os reservas nas vagas de quem está fora). */
export function userLineup(c: CareerState): Lineup {
  return chooseLineup(c.clubs[c.userClubId] as Club, c.players, isAvailableIn(c.season));
}

function lineupToXI(lineup: Lineup): string[] {
  const positions = FORMATIONS[lineup.formation];
  const remaining = lineup.slots.slice();
  return positions.map((pos) => {
    const i = remaining.findIndex((s) => s.pos === pos);
    if (i < 0) return '';
    const [s] = remaining.splice(i, 1);
    return s!.playerId;
  });
}
