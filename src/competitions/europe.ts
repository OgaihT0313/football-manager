// Competições europeias no formato 2024/25+ (vigente em 2026/27, ver PLANO-EUROPA.md):
//   fase de liga com 36 clubes (8 jogos na Champions e na Europa League, 6 na Conference),
//   1º–8º direto às oitavas, 9º–24º no playoff de ida e volta, chave fixa até a final.
// Funções puras sobre CompetitionState; world.ts chama o sorteio das fases na data de cada uma.

import type { Club, Fixture, LeagueConfig, MatchResult } from '../domain/types';
import { createRng, deriveSeed, shuffle, type Rng } from '../engine/rng';
import type { CompetitionState, CalendarSlot } from './world';

export type EuropeTier = 'ucl' | 'uel' | 'uecl';

export const EUROPE_NAMES: Record<EuropeTier, string> = {
  ucl: 'Champions League',
  uel: 'Europa League',
  uecl: 'Conference League',
};

/** Meios de semana europeus (jornada da liga de referência). As três copas jogam na mesma semana. */
export const EUROPE_LEAGUE_MARKERS = [4, 6, 8, 10, 13, 15, 19, 21];
export const EUROPE_KO_MARKERS = { playoff: [24, 25], r16: [27, 29], qf: [31, 32], sf: [34, 35], final: 39 } as const;
export const EUROPE_MARKERS = [...EUROPE_LEAGUE_MARKERS, ...Object.values(EUROPE_KO_MARKERS).flat()] as number[];

export const EUROPE_TIEBREAKERS: LeagueConfig['tiebreakers'] = ['points', 'goalDiff', 'goalsFor', 'awayGoalsFor', 'wins'];

export const MATCHES_PER_TEAM: Record<EuropeTier, number> = { ucl: 8, uel: 8, uecl: 6 };
const POTS: Record<EuropeTier, number> = { ucl: 4, uel: 4, uecl: 6 };

function slotsAt(slots: CalendarSlot[], marker: number): number[] {
  return slots.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'meio' && s.marker === marker).map(({ i }) => i);
}

/** Data europeia da semana `marker` (a primeira meio de semana dela, depois de copas nacionais). */
function europeSlot(slots: CalendarSlot[], marker: number): number {
  const all = slotsAt(slots, marker);
  return all[all.length - 1]!;
}

type Edge = { a: string; b: string };

/**
 * Sorteio dos adversários: potes pela força; na Champions/Europa League 2 adversários de cada
 * pote, na Conference 1 de cada pote. Nunca do mesmo país; no máximo 2 do mesmo país.
 */
function drawOpponents(rng: Rng, ranked: string[], tier: EuropeTier, countryOf: (id: string) => string): Edge[] | null {
  const nPots = POTS[tier];
  const size = ranked.length / nPots;
  const perPot = MATCHES_PER_TEAM[tier] / nPots;
  const pots = Array.from({ length: nPots }, (_, i) => ranked.slice(i * size, (i + 1) * size));
  for (let attempt = 0; attempt < 400; attempt++) {
    const edges: Edge[] = [];
    const shuffled = pots.map((p) => shuffle(rng, p));
    for (let i = 0; i < nPots; i++) {
      const pi = shuffled[i]!;
      // Dentro do pote: ciclo (2 adversários) ou pares (1 adversário).
      if (perPot === 2) for (let k = 0; k < size; k++) edges.push({ a: pi[k]!, b: pi[(k + 1) % size]! });
      else for (let k = 0; k + 1 < size; k += 2) edges.push({ a: pi[k]!, b: pi[k + 1]! });
      for (let j = i + 1; j < nPots; j++) {
        const pj = shuffle(rng, shuffled[j]!);
        for (let k = 0; k < size; k++) {
          edges.push({ a: pi[k]!, b: pj[k]! });
          if (perPot === 2) edges.push({ a: pi[k]!, b: pj[(k + 1) % size]! });
        }
      }
    }
    if (validOpponents(edges, countryOf)) return edges;
  }
  return null;
}

function validOpponents(edges: Edge[], countryOf: (id: string) => string): boolean {
  const seen = new Set<string>();
  const byCountry: Record<string, Record<string, number>> = {};
  for (const { a, b } of edges) {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key) || a === b) return false;
    seen.add(key);
    const ca = countryOf(a);
    const cb = countryOf(b);
    if (ca === cb) return false;
    for (const [x, c] of [[a, cb], [b, ca]] as const) {
      const m = (byCountry[x] ??= {});
      m[c] = (m[c] ?? 0) + 1;
      if (m[c]! > 2) return false;
    }
  }
  return true;
}

/**
 * Distribui os jogos em `k` rodadas sem ninguém jogar duas vezes na mesma rodada (coloração das
 * arestas de um grafo k-regular com k cores, por cadeias de Kempe). Devolve a rodada de cada jogo.
 */
function scheduleRounds(rng: Rng, edges: Edge[], k: number): number[] | null {
  for (let attempt = 0; attempt < 60; attempt++) {
    const color = new Array<number>(edges.length).fill(-1);
    const at: Record<string, (number | undefined)[]> = {};
    const slot = (v: string) => (at[v] ??= new Array(k).fill(undefined));
    const free = (v: string) => slot(v).map((x, c) => (x === undefined ? c : -1)).filter((c) => c >= 0);

    /** Troca as cores c1/c2 na cadeia que sai de `start` pela cor c1; falha se ela chega a `avoid`. */
    const kempe = (start: string, c1: number, c2: number, avoid: string): boolean => {
      const path: number[] = [];
      let v = start;
      let col = c1;
      for (;;) {
        const edge = slot(v)[col];
        if (edge === undefined) break;
        path.push(edge);
        const { a, b } = edges[edge]!;
        v = a === v ? b : a;
        if (v === avoid) return false;
        col = col === c1 ? c2 : c1;
      }
      for (const pe of path) {
        const { a, b } = edges[pe]!;
        slot(a)[color[pe]!] = undefined;
        slot(b)[color[pe]!] = undefined;
      }
      for (const pe of path) {
        color[pe] = color[pe] === c1 ? c2 : c1;
        const { a, b } = edges[pe]!;
        slot(a)[color[pe]!] = pe;
        slot(b)[color[pe]!] = pe;
      }
      return true;
    };

    let ok = true;
    for (const e of shuffle(rng, edges.map((_, i) => i))) {
      const { a, b } = edges[e]!;
      let c = free(a).find((x) => slot(b)[x] === undefined) ?? -1;
      // Nenhuma cor livre nos dois: abre uma com troca de Kempe por um dos lados.
      for (const alpha of c < 0 ? free(a) : []) {
        for (const beta of free(b)) {
          if (kempe(b, alpha, beta, a)) c = alpha;
          else if (kempe(a, beta, alpha, b)) c = beta;
          if (c >= 0 && slot(a)[c] === undefined && slot(b)[c] === undefined) break;
          c = -1;
        }
        if (c >= 0) break;
      }
      if (c < 0) {
        ok = false;
        break;
      }
      color[e] = c;
      slot(a)[c] = e;
      slot(b)[c] = e;
    }
    if (ok) return color;
  }
  return null;
}

/** Mando: cada clube joga metade em casa (orientação de Euler em grafo com graus pares). */
function orientHomeAway(edges: Edge[]): Edge[] {
  const adj: Record<string, number[]> = {};
  edges.forEach((e, i) => {
    (adj[e.a] ??= []).push(i);
    (adj[e.b] ??= []).push(i);
  });
  const used = new Array<boolean>(edges.length).fill(false);
  const out: Edge[] = edges.slice();
  for (const start of Object.keys(adj)) {
    // Hierholzer: cada aresta percorrida vira "de quem sai joga em casa".
    const stack = [start];
    while (stack.length) {
      const v = stack[stack.length - 1]!;
      const list = adj[v]!;
      while (list.length && used[list[list.length - 1]!]) list.pop();
      if (!list.length) {
        stack.pop();
        continue;
      }
      const e = list.pop()!;
      used[e] = true;
      const { a, b } = edges[e]!;
      const to = a === v ? b : a;
      out[e] = { a: v, b: to };
      stack.push(to);
    }
  }
  return out;
}

export interface EuropeEntry {
  tier: EuropeTier;
  clubIds: string[];
}

/** Cria a competição: sorteio da fase de liga, datas, e as fases de mata-mata (sorteadas depois). */
export function createEuropeCompetition(
  tier: EuropeTier,
  clubIds: string[],
  slots: CalendarSlot[],
  seed: number,
  ratingOf: (id: string) => number,
  countryOf: (id: string) => string,
  context: CompetitionState['context'],
  ratingsForGhosts: Record<string, number>,
): CompetitionState {
  const id = tier;
  const ranked = clubIds.slice().sort((a, b) => ratingOf(b) - ratingOf(a));
  const k = MATCHES_PER_TEAM[tier];
  const rng = createRng(deriveSeed(seed, id, 'sorteio'));
  let edges: Edge[] | null = null;
  let rounds: number[] | null = null;
  for (let tries = 0; tries < 20 && !rounds; tries++) {
    edges = drawOpponents(rng, ranked, tier, countryOf);
    // Sem solução com as restrições de país (raro): relaxa e sorteia sem elas.
    if (!edges) edges = drawOpponents(rng, ranked, tier, () => `${tries}-${rng.next()}`);
    if (edges) rounds = scheduleRounds(rng, edges, k);
  }
  if (!edges || !rounds) throw new Error(`Não foi possível montar a fase de liga da ${EUROPE_NAMES[tier]}`);
  const oriented = orientHomeAway(edges);
  const leagueSlots = EUROPE_LEAGUE_MARKERS.slice(0, k).map((m) => europeSlot(slots, m));
  const fixtures: Fixture[] = oriented.map((e, i) => ({
    id: `${id}-l${rounds![i]! + 1}-${e.a}-${e.b}`,
    round: rounds![i]! + 1,
    homeId: e.a,
    awayId: e.b,
    slot: leagueSlots[rounds![i]!]!,
    competitionId: id,
  }));
  const ko = EUROPE_KO_MARKERS;
  const seeds: Record<string, number> = {};
  return {
    id,
    kind: 'europe',
    name: EUROPE_NAMES[tier],
    country: 'Europa',
    mode: 'full',
    clubIds: ranked,
    fixtures,
    results: [],
    table: [],
    context,
    ratings: ratingsForGhosts,
    stages: [
      { name: 'Fase de liga', slot: leagueSlots[0]!, fixtureIds: fixtures.map((f) => f.id), drawn: true },
      { name: 'Playoff', slot: europeSlot(slots, ko.playoff[0]), slot2: europeSlot(slots, ko.playoff[1]), fixtureIds: [], drawn: false },
      { name: 'Oitavas de final', slot: europeSlot(slots, ko.r16[0]), slot2: europeSlot(slots, ko.r16[1]), fixtureIds: [], drawn: false },
      { name: 'Quartas de final', slot: europeSlot(slots, ko.qf[0]), slot2: europeSlot(slots, ko.qf[1]), fixtureIds: [], drawn: false },
      { name: 'Semifinal', slot: europeSlot(slots, ko.sf[0]), slot2: europeSlot(slots, ko.sf[1]), fixtureIds: [], drawn: false },
      { name: 'Final', slot: europeSlot(slots, ko.final), fixtureIds: [], drawn: false },
    ],
    championId: null,
    seeds,
  };
}

/** Vencedor de um confronto de ida e volta (gols somados; empate = pênaltis da volta). */
export function tieWinner(leg1: MatchResult, leg2: MatchResult): string {
  const a = leg1.homeId;
  const b = leg1.awayId;
  const goalsA = leg1.homeGoals + (leg2.homeId === a ? leg2.homeGoals : leg2.awayGoals);
  const goalsB = leg1.awayGoals + (leg2.homeId === b ? leg2.homeGoals : leg2.awayGoals);
  if (goalsA !== goalsB) return goalsA > goalsB ? a : b;
  return leg2.shootoutWinnerId ?? leg2.homeId;
}

/** Placar agregado antes da volta, para decidir se há pênaltis. */
export function aggregateTied(leg1: MatchResult, leg2: MatchResult): boolean {
  const a = leg1.homeId;
  const goalsA = leg1.homeGoals + (leg2.homeId === a ? leg2.homeGoals : leg2.awayGoals);
  const goalsB = leg1.awayGoals + (leg2.homeId === a ? leg2.awayGoals : leg2.homeGoals);
  return goalsA === goalsB;
}

/** Vencedores das partidas de uma fase, na ordem da chave. */
export function stageWinners(comp: CompetitionState, stageIndex: number): string[] {
  const stage = comp.stages[stageIndex]!;
  const byId = new Map(comp.results.map((r) => [r.fixtureId, r]));
  const out: string[] = [];
  if (stage.slot2 === undefined) {
    for (const fid of stage.fixtureIds) {
      const r = byId.get(fid);
      if (r) out.push(r.homeGoals !== r.awayGoals ? (r.homeGoals > r.awayGoals ? r.homeId : r.awayId) : (r.shootoutWinnerId ?? r.homeId));
    }
    return out;
  }
  for (let i = 0; i + 1 < stage.fixtureIds.length; i += 2) {
    const l1 = byId.get(stage.fixtureIds[i]!);
    const l2 = byId.get(stage.fixtureIds[i + 1]!);
    if (l1 && l2) out.push(tieWinner(l1, l2));
  }
  return out;
}

/** Monta um confronto de ida e volta: o melhor semeado decide em casa. */
function twoLegs(comp: CompetitionState, stageIndex: number, a: string, b: string, tieIndex: number): Fixture[] {
  const stage = comp.stages[stageIndex]!;
  const seeds = comp.seeds ?? {};
  const [better, worse] = (seeds[a] ?? 99) <= (seeds[b] ?? 99) ? [a, b] : [b, a];
  const base = `${comp.id}-f${stageIndex + 1}-${tieIndex + 1}`;
  return [
    { id: `${base}-ida`, round: stageIndex + 1, homeId: worse, awayId: better, slot: stage.slot, competitionId: comp.id, leg: 1 },
    { id: `${base}-volta`, round: stageIndex + 1, homeId: better, awayId: worse, slot: stage.slot2, competitionId: comp.id, leg: 2, firstLegId: `${base}-ida` },
  ];
}

/**
 * Sorteia uma fase do mata-mata europeu quando a data dela chega. ALTERA `comp`.
 * Playoff: (9/10 x 23/24), (11/12 x 21/22), (13/14 x 19/20), (15/16 x 17/18).
 * Oitavas: 1/2 x vencedores de 15/16–17/18; 3/4 x 13/14–19/20; 5/6 x 11/12–21/22; 7/8 x 9/10–23/24.
 * Daí em diante a chave é fixa (1 e 2 só se encontram na final).
 */
export function drawEuropeStage(comp: CompetitionState, stageIndex: number, seed: number): void {
  const rng = createRng(deriveSeed(seed, comp.id, 'fase', stageIndex));
  const stage = comp.stages[stageIndex]!;
  const seeds = (comp.seeds ??= {});
  const add = (fx: Fixture[]) => {
    comp.fixtures.push(...fx);
    stage.fixtureIds.push(...fx.map((f) => f.id));
  };
  const rank = comp.table.map((r) => r.clubId);
  if (stageIndex === 1) {
    rank.forEach((id, i) => (seeds[id] = i + 1));
    // Grupos do playoff, na ordem em que alimentam as oitavas (1/2, 3/4, 5/6, 7/8).
    const groups: [number[], number[]][] = [[[15, 16], [17, 18]], [[13, 14], [19, 20]], [[11, 12], [21, 22]], [[9, 10], [23, 24]]];
    let t = 0;
    for (const [seeded, unseeded] of groups) {
      const opp = shuffle(rng, unseeded);
      seeded.forEach((r, i) => add(twoLegs(comp, 1, rank[r - 1]!, rank[opp[i]! - 1]!, t++)));
    }
  } else if (stageIndex === 2) {
    // Vencedores do playoff na ordem dos grupos (dois por grupo).
    const winners = stageWinners(comp, 1);
    const top: [number, number][] = [[1, 2], [3, 4], [5, 6], [7, 8]];
    const ties: [string, string][] = [];
    top.forEach(([x, y], g) => {
      const pair = shuffle(rng, [winners[2 * g]!, winners[2 * g + 1]!]);
      ties.push([rank[x - 1]!, pair[0]!], [rank[y - 1]!, pair[1]!]);
    });
    // Ordem da chave por semente: 1, 8, 4, 5, 2, 7, 3, 6 (1 e 2 em lados opostos).
    const bySeed = new Map(ties.map((tie) => [Math.min(seeds[tie[0]] ?? 99, seeds[tie[1]] ?? 99), tie]));
    [1, 8, 4, 5, 2, 7, 3, 6].forEach((s, i) => {
      const tie = bySeed.get(s)!;
      add(twoLegs(comp, 2, tie[0], tie[1], i));
    });
  } else {
    const prev = stageWinners(comp, stageIndex - 1);
    const final = stage.slot2 === undefined;
    for (let i = 0; i + 1 < prev.length; i += 2) {
      const a = prev[i]!;
      const b = prev[i + 1]!;
      // Quem elimina um mais bem semeado herda a semente dele.
      if (final) {
        add([{ id: `${comp.id}-final`, round: stageIndex + 1, homeId: a, awayId: b, slot: stage.slot, competitionId: comp.id, neutral: true }]);
      } else {
        add(twoLegs(comp, stageIndex, a, b, i / 2));
      }
    }
  }
  stage.drawn = true;
}

/** Atualiza as sementes depois de uma fase: o vencedor fica com a melhor das duas. */
export function inheritSeeds(comp: CompetitionState, stageIndex: number): void {
  const stage = comp.stages[stageIndex]!;
  if (stage.slot2 === undefined || !comp.seeds) return;
  const byId = new Map(comp.results.map((r) => [r.fixtureId, r]));
  for (let i = 0; i + 1 < stage.fixtureIds.length; i += 2) {
    const l1 = byId.get(stage.fixtureIds[i]!);
    const l2 = byId.get(stage.fixtureIds[i + 1]!);
    if (!l1 || !l2) continue;
    const w = tieWinner(l1, l2);
    const best = Math.min(comp.seeds[l1.homeId] ?? 99, comp.seeds[l1.awayId] ?? 99);
    comp.seeds[w] = best;
  }
}

/** País do clube, pela liga dele. */
export function countryOfClub(clubs: Record<string, Club>, leagues: Record<string, LeagueConfig>): (id: string) => string {
  return (id) => leagues[clubs[id]?.leagueId ?? '']?.country ?? '?';
}


/**
 * Classificados para as três copas europeias. Por liga (das de maior reputação para as de menor):
 * os `ucl` primeiros vão à Champions; o campeão da copa e os `uel` seguintes à Europa League; os
 * `uecl` seguintes à Conference. Vagas que sobram até 36 vão para os mais fortes ainda não
 * classificados (como se passassem pelas eliminatórias); excesso corta os mais fracos.
 * `order[leagueId]` = clubes na ordem da tabela (sem isso, ordem de força).
 */
export function europeanQualifiers(
  leagues: Record<string, LeagueConfig>,
  ratingOf: (id: string) => number,
  order?: Record<string, string[]>,
  cupWinners?: Record<string, string | null>,
): Record<EuropeTier, string[]> {
  const out: Record<EuropeTier, string[]> = { ucl: [], uel: [], uecl: [] };
  const taken = new Set<string>();
  const take = (tier: EuropeTier, id: string | undefined | null) => {
    if (!id || taken.has(id)) return false;
    out[tier].push(id);
    taken.add(id);
    return true;
  };
  const tops = Object.values(leagues)
    .filter((l) => (l.tier ?? 1) === 1 && l.continental)
    .sort((a, b) => (b.reputation ?? 0) - (a.reputation ?? 0));
  for (const l of tops) {
    const ranked = order?.[l.id]?.filter((id) => l.clubIds.includes(id)) ?? l.clubIds.slice().sort((a, b) => ratingOf(b) - ratingOf(a));
    const spots = l.continental!;
    let i = 0;
    for (let n = 0; n < spots.ucl && i < ranked.length; i++) if (take('ucl', ranked[i])) n++;
    // Vaga do campeão da copa; se ele já se classificou pela liga, passa para o próximo da tabela.
    let uel = spots.uel;
    const cupWinner = cupWinners?.[l.id];
    const cupSpotUsed = !!cupWinner && l.clubIds.includes(cupWinner) && take('uel', cupWinner);
    if (l.cupName && !cupSpotUsed) uel += 1;
    for (let n = 0; n < uel && i < ranked.length; i++) if (take('uel', ranked[i])) n++;
    for (let n = 0; n < spots.uecl && i < ranked.length; i++) if (take('uecl', ranked[i])) n++;
  }
  const pool = tops.flatMap((l) => l.clubIds).filter((id) => !taken.has(id)).sort((a, b) => ratingOf(b) - ratingOf(a));
  for (const tier of ['ucl', 'uel', 'uecl'] as EuropeTier[]) {
    out[tier].sort((a, b) => ratingOf(b) - ratingOf(a));
    while (out[tier].length > 36) taken.delete(out[tier].pop()!);
    while (out[tier].length < 36 && pool.length) {
      const id = pool.shift()!;
      if (!taken.has(id)) take(tier, id);
    }
  }
  return out;
}

/** Premiação europeia (em €, na escala de receitas do jogo) e ganho de reputação por clube. */
const PRIZES: Record<EuropeTier, { entry: number; win: number; draw: number; rounds: number[]; title: number; rep: number }> = {
  // rounds: playoff, oitavas, quartas, semi, final
  ucl: { entry: 6_000_000, win: 700_000, draw: 250_000, rounds: [300_000, 3_500_000, 4_000_000, 5_000_000, 6_000_000], title: 2_000_000, rep: 2 },
  uel: { entry: 1_300_000, win: 150_000, draw: 50_000, rounds: [100_000, 400_000, 600_000, 900_000, 1_400_000], title: 500_000, rep: 1 },
  uecl: { entry: 1_000_000, win: 100_000, draw: 35_000, rounds: [60_000, 250_000, 400_000, 600_000, 1_000_000], title: 300_000, rep: 1 },
};

export function europePrizes(comp: CompetitionState): Record<string, { money: number; reputation: number }> {
  const tier = comp.id as EuropeTier;
  const p = PRIZES[tier];
  const out: Record<string, { money: number; reputation: number }> = {};
  const add = (id: string, money: number, rep = 0) => {
    const x = (out[id] ??= { money: 0, reputation: 0 });
    x.money += money;
    x.reputation += rep;
  };
  for (const id of comp.clubIds) add(id, p.entry, p.rep);
  const leagueIds = new Set(comp.stages[0]?.fixtureIds ?? []);
  for (const r of comp.results) {
    if (!leagueIds.has(r.fixtureId)) continue;
    if (r.homeGoals > r.awayGoals) add(r.homeId, p.win);
    else if (r.homeGoals < r.awayGoals) add(r.awayId, p.win);
    else {
      add(r.homeId, p.draw);
      add(r.awayId, p.draw);
    }
  }
  // Quem jogou cada fase de mata-mata recebe o valor dela (+1 de reputação a partir das oitavas).
  comp.stages.slice(1).forEach((st, i) => {
    const ids = new Set(comp.fixtures.filter((f) => st.fixtureIds.includes(f.id)).flatMap((f) => [f.homeId, f.awayId]));
    for (const id of ids) add(id, p.rounds[i] ?? 0, i >= 1 ? 1 : 0);
  });
  if (comp.championId) add(comp.championId, p.title, 2);
  return out;
}
