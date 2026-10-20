// Consultas derivadas do estado da carreira, usadas pelas telas.

import {
  clubFixtures, isAvailableIn, leagueCompetitionOf, type CompetitionState, type WorldSeason,
} from '../competitions/world';
import { FORMATIONS } from '../domain/positions';
import type { Club, Fixture, MatchResult, Player } from '../domain/types';
import { chooseLineup } from '../engine/lineup';
import { teamStrength, type TeamStrength } from '../engine/matchEngine';
import type { CareerState } from './career';

/** Próxima partida do clube (qualquer competição) e a competição dela. */
export function nextFixtureOf(ws: WorldSeason, clubId: string): { fx: Fixture; comp: CompetitionState } | null {
  const next = clubFixtures(ws, clubId).find((x) => !x.result && (x.fx.slot ?? 0) >= ws.nextSlot);
  return next ? { fx: next.fx, comp: next.comp } : null;
}

/** Próximas partidas já sorteadas/marcadas do clube. */
export function upcomingOf(ws: WorldSeason, clubId: string, count: number): { fx: Fixture; comp: CompetitionState }[] {
  return clubFixtures(ws, clubId)
    .filter((x) => !x.result && (x.fx.slot ?? 0) >= ws.nextSlot)
    .slice(0, count)
    .map(({ fx, comp }) => ({ fx, comp }));
}

/** Resultados do clube na temporada, em ordem de data. */
export function resultsOf(ws: WorldSeason, clubId: string): { result: MatchResult; comp: CompetitionState }[] {
  return clubFixtures(ws, clubId)
    .filter((x) => x.result)
    .map((x) => ({ result: x.result!, comp: x.comp }));
}

/** 'V', 'E' ou 'D' do ponto de vista do clube (pênaltis contam como vitória/derrota). */
export function outcomeFor(r: MatchResult, clubId: string): 'V' | 'E' | 'D' {
  const mine = r.homeId === clubId ? r.homeGoals : r.awayGoals;
  const theirs = r.homeId === clubId ? r.awayGoals : r.homeGoals;
  if (mine === theirs && r.shootoutWinnerId) return r.shootoutWinnerId === clubId ? 'V' : 'D';
  return mine > theirs ? 'V' : mine < theirs ? 'D' : 'E';
}

/** Posição do clube na liga dele (0 se não estiver em liga). */
export function positionOf(ws: WorldSeason, clubId: string): number {
  const comp = leagueCompetitionOf(ws, clubId);
  return comp ? comp.table.findIndex((r) => r.clubId === clubId) + 1 : 0;
}

/** Força do XI que o clube usaria agora (com lesões, suspensões e cansaço). */
export function currentStrength(club: Club, players: Record<string, Player>, ws: WorldSeason): TeamStrength {
  const l = chooseLineup(club, players, isAvailableIn(ws));
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

/** Estatísticas da temporada atual por jogador (todas as competições). */
export function playerStats(ws: WorldSeason): Record<string, PlayerSeasonStats> {
  const out: Record<string, PlayerSeasonStats> = {};
  for (const [id, l] of Object.entries(ws.stats ?? {})) {
    out[id] = { apps: l.apps, goals: l.goals, assists: l.assists, yellows: l.yellows, reds: l.reds, avgRating: l.apps ? Math.round((l.ratingSum / l.apps) * 10) / 10 : null };
  }
  return out;
}

export function userClub(c: CareerState): Club {
  return c.clubs[c.userClubId] as Club;
}

/** Liga (competição) do usuário nesta temporada. */
export function userLeague(c: CareerState): CompetitionState | null {
  return leagueCompetitionOf(c.season, c.userClubId);
}

/** Jornada para exibir ("rodada X de 38"). */
export function roundLabel(ws: WorldSeason): string {
  const slot = ws.slots[ws.nextSlot];
  if (!slot) return 'temporada encerrada';
  return `rodada ${slot.marker}/38${slot.kind === 'meio' ? ' · meio de semana' : ''}`;
}
