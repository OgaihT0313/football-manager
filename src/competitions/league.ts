// Liga por pontos corridos: calendário, tabela e desempates. A simulação fica em season.ts.
//
// Critérios de desempate (ordem padrão, configurável em LeagueConfig.tiebreakers):
//   1. pontos
//   2. saldo de gols
//   3. gols pró
//   4. confronto direto entre os empatados (pontos, depois saldo, depois gols pró só nesses jogos)
//   5. vitórias
//   6. gols pró como visitante
//   7. id do clube em ordem alfabética (substitui o sorteio/jogo extra, para ser determinístico)

import type { Fixture, LeagueConfig, MatchResult, TableRow, Tiebreaker } from '../domain/types';
import { createRng, deriveSeed, shuffle } from '../engine/rng';

/**
 * Calendário todos-contra-todos pelo método do círculo (tabela de Berger). O returno repete a
 * ordem do turno com mando invertido. A ordem dos clubes é embaralhada pela seed.
 */
export function generateFixtures(league: LeagueConfig, seed: number): Fixture[] {
  const rng = createRng(deriveSeed(seed, league.id, 'calendario'));
  const ids = shuffle(rng, league.clubIds);
  if (ids.length % 2 === 1) ids.push('__folga__');
  const n = ids.length;
  const rounds: [string, string][][] = [];
  const arr = ids.slice();
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i] as string;
      const b = arr[n - 1 - i] as string;
      if (i === 0) pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
      else pairs.push(i % 2 === 1 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    // Gira todos menos o primeiro.
    arr.splice(1, 0, arr.pop() as string);
  }

  const fixtures: Fixture[] = [];
  for (let leg = 0; leg < league.legs; leg++) {
    rounds.forEach((pairs, r) => {
      const round = leg * (n - 1) + r + 1;
      for (const [h, a] of pairs) {
        if (h === '__folga__' || a === '__folga__') continue;
        const [homeId, awayId] = leg % 2 === 0 ? [h, a] : [a, h];
        fixtures.push({ id: `${league.id}-r${round}-${homeId}-${awayId}`, round, homeId, awayId });
      }
    });
  }
  return fixtures;
}

function emptyRow(clubId: string): TableRow {
  return { clubId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, awayGoalsFor: 0, points: 0 };
}

function applyResult(rows: Record<string, TableRow>, r: MatchResult, league: LeagueConfig): void {
  const h = rows[r.homeId];
  const a = rows[r.awayId];
  if (!h || !a) return;
  h.played++;
  a.played++;
  h.goalsFor += r.homeGoals;
  h.goalsAgainst += r.awayGoals;
  a.goalsFor += r.awayGoals;
  a.goalsAgainst += r.homeGoals;
  a.awayGoalsFor += r.awayGoals;
  if (r.homeGoals > r.awayGoals) {
    h.wins++;
    a.losses++;
    h.points += league.pointsForWin;
  } else if (r.homeGoals < r.awayGoals) {
    a.wins++;
    h.losses++;
    a.points += league.pointsForWin;
  } else {
    h.draws++;
    a.draws++;
    h.points += league.pointsForDraw;
    a.points += league.pointsForDraw;
  }
}

const gd = (r: TableRow) => r.goalsFor - r.goalsAgainst;

/** Tabela ordenada pelos critérios da liga. */
export function computeTable(league: LeagueConfig, results: readonly MatchResult[]): TableRow[] {
  const rows: Record<string, TableRow> = {};
  for (const id of league.clubIds) rows[id] = emptyRow(id);
  for (const r of results) applyResult(rows, r, league);
  return sortGroup(Object.values(rows), league.tiebreakers, 0, results, league);
}

function sortGroup(
  group: TableRow[],
  criteria: readonly Tiebreaker[],
  idx: number,
  results: readonly MatchResult[],
  league: LeagueConfig,
): TableRow[] {
  if (group.length <= 1) return group;
  if (idx >= criteria.length) return group.slice().sort((x, y) => (x.clubId < y.clubId ? -1 : x.clubId > y.clubId ? 1 : 0));

  const criterion = criteria[idx] as Tiebreaker;
  let key: (r: TableRow) => number[];
  if (criterion === 'headToHead') {
    const ids = new Set(group.map((r) => r.clubId));
    const mini: Record<string, TableRow> = {};
    for (const id of ids) mini[id] = emptyRow(id);
    for (const res of results) if (ids.has(res.homeId) && ids.has(res.awayId)) applyResult(mini, res, league);
    key = (r) => {
      const m = mini[r.clubId] as TableRow;
      return [m.points, gd(m), m.goalsFor];
    };
  } else {
    const single: Record<Exclude<Tiebreaker, 'headToHead'>, (r: TableRow) => number> = {
      points: (r) => r.points,
      goalDiff: gd,
      goalsFor: (r) => r.goalsFor,
      wins: (r) => r.wins,
      awayGoalsFor: (r) => r.awayGoalsFor,
    };
    const f = single[criterion];
    key = (r) => [f(r)];
  }

  const keyed = group.map((r) => ({ r, k: key(r) }));
  const cmp = (x: number[], y: number[]) => {
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return (y[i] as number) - (x[i] as number);
    return 0;
  };
  keyed.sort((x, y) => cmp(x.k, y.k));

  const out: TableRow[] = [];
  let start = 0;
  for (let i = 1; i <= keyed.length; i++) {
    if (i === keyed.length || cmp((keyed[start] as { k: number[] }).k, (keyed[i] as { k: number[] }).k) !== 0) {
      const sub = keyed.slice(start, i).map((x) => x.r);
      // Se o critério não separou ninguém, passa para o próximo com o mesmo grupo.
      out.push(...sortGroup(sub, criteria, idx + 1, results, league));
      start = i;
    }
  }
  return out;
}
