// Consultas derivadas do estado da carreira, usadas pelas telas.

import { isAvailableIn, type SeasonState } from '../competitions/season';
import { FORMATIONS } from '../domain/positions';
import type { Club, Fixture, MatchResult, Player } from '../domain/types';
import { chooseLineup } from '../engine/lineup';
import { teamStrength, type TeamStrength } from '../engine/matchEngine';
import type { CareerState } from './career';

export function nextFixtureOf(season: SeasonState, clubId: string): Fixture | null {
  for (let r = season.nextRound; r <= season.totalRounds; r++) {
    const f = season.fixtures.find((x) => x.round === r && (x.homeId === clubId || x.awayId === clubId));
    if (f) return f;
  }
  return null;
}

export function resultsOf(season: SeasonState, clubId: string): MatchResult[] {
  return season.results.filter((r) => r.homeId === clubId || r.awayId === clubId);
}

/** 'V', 'E' ou 'D' do ponto de vista do clube. */
export function outcomeFor(r: MatchResult, clubId: string): 'V' | 'E' | 'D' {
  const mine = r.homeId === clubId ? r.homeGoals : r.awayGoals;
  const theirs = r.homeId === clubId ? r.awayGoals : r.homeGoals;
  return mine > theirs ? 'V' : mine < theirs ? 'D' : 'E';
}

export function positionOf(season: SeasonState, clubId: string): number {
  return season.table.findIndex((r) => r.clubId === clubId) + 1;
}

/** Força do XI que o clube usaria agora (com lesões, suspensões e cansaço). */
export function currentStrength(club: Club, players: Record<string, Player>, season: SeasonState): TeamStrength {
  const l = chooseLineup(club, players, isAvailableIn(season));
  return teamStrength(l, FORMATIONS[l.formation]);
}

/** Nota de força 0-100 para exibir: média de ofensivo, defensivo e goleiro. */
export function strengthScore(s: TeamStrength): number {
  return Math.round((s.offense + s.defenseLine + s.goalkeeper) / 3);
}

export interface PlayerSeasonStats {
  apps: number;
  goals: number;
  assists: number;
  yellows: number;
  reds: number;
  avgRating: number | null;
}

/** Estatísticas da temporada atual por jogador. */
export function playerStats(season: SeasonState): Record<string, PlayerSeasonStats> {
  const out: Record<string, PlayerSeasonStats> = {};
  const get = (id: string) => (out[id] ??= { apps: 0, goals: 0, assists: 0, yellows: 0, reds: 0, avgRating: null });
  const ratingSum: Record<string, number> = {};
  for (const r of season.results) {
    for (const id of [...r.homeXI, ...r.awayXI]) {
      get(id).apps++;
      ratingSum[id] = (ratingSum[id] ?? 0) + (r.ratings[id] ?? 0);
    }
    for (const e of r.events) {
      if (e.type === 'goal') {
        get(e.playerId).goals++;
        if (e.assistId) get(e.assistId).assists++;
      } else if (e.type === 'yellow') get(e.playerId).yellows++;
      else if (e.type === 'red') get(e.playerId).reds++;
    }
  }
  for (const [id, s] of Object.entries(out)) if (s.apps > 0) s.avgRating = Math.round(((ratingSum[id] ?? 0) / s.apps) * 10) / 10;
  return out;
}

export function userClub(c: CareerState): Club {
  return c.clubs[c.userClubId] as Club;
}
