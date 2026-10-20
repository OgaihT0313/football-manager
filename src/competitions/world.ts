// Temporada do mundo: várias competições (ligas, copas, supercopas) num calendário único de
// datas ("slots"). Fins de semana são da liga; meios de semana, das copas (e da Europa, Fase 4).
// O estado é JSON puro. `playSlot` joga uma data e ALTERA o estado (quem chama clona antes).

import { FORMATIONS } from '../domain/positions';
import type { Club, Fixture, LeagueConfig, MatchResult, Player, TableRow } from '../domain/types';
import { autoLineup, chooseLineup } from '../engine/lineup';
import {
  buildContext, DEFAULT_PARAMS, simulateMatch, strengthFromRating, teamStrength,
  type EngineParams, type MatchContext, type TeamStrength,
} from '../engine/matchEngine';
import { chance, createRng, deriveSeed, shuffle } from '../engine/rng';
import { computeTable, generateFixtures } from './league';

export interface PlayerStatus {
  /** Partidas do clube que o jogador ainda vai perder. */
  out: number;
  reason: 'injury' | 'suspension' | null;
  /** Amarelos acumulados na temporada (só liga conta para suspensão). */
  yellows: number;
}

export interface CalendarSlot {
  kind: 'fds' | 'meio';
  /** Rodada de liga de referência (1-38): a do próprio fim de semana, ou a do seguinte. */
  marker: number;
}

export interface CupStage {
  name: string;
  slot: number;
  fixtureIds: string[];
  drawn: boolean;
}

export type CompetitionKind = 'league' | 'cup' | 'supercup';

export interface CompetitionState {
  id: string;
  kind: CompetitionKind;
  name: string;
  country: string;
  /** Liga (configuração) desta competição, se for liga. */
  leagueId?: string;
  mode: 'full' | 'strength';
  clubIds: string[];
  fixtures: Fixture[];
  results: MatchResult[];
  table: TableRow[];
  context: MatchContext;
  /** Força de cada clube jogando "por força" (sem elenco ou em liga por força). */
  ratings: Record<string, number>;
  stages: CupStage[];
  championId: string | null;
}

/** Linha de estatística de um jogador na temporada (todas as competições). */
export interface PlayerSeasonLine {
  apps: number;
  goals: number;
  assists: number;
  yellows: number;
  reds: number;
  /** Soma das notas (média = ratingSum / apps). */
  ratingSum: number;
}

export interface WorldSeason {
  year: number;
  seed: number;
  slots: CalendarSlot[];
  /** Próxima data a jogar; igual a slots.length = temporada encerrada. */
  nextSlot: number;
  competitions: Record<string, CompetitionState>;
  status: Record<string, PlayerStatus>;
  /** Estatísticas acumuladas por jogador (os resultados guardados podem estar resumidos). */
  stats: Record<string, PlayerSeasonLine>;
}

export interface WorldData {
  leagues: Record<string, LeagueConfig>;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
}

/** Cartões amarelos acumulados (na liga) que geram um jogo de suspensão. */
export const YELLOW_LIMIT = 5;
/** Recuperação entre datas: semana cheia ou meio de semana (menos descanso). */
export const RECOVERY_RATE = 0.35;
export const RECOVERY_RATE_MIDWEEK = 0.22;

/** Desgaste de uma partida (condição 0-100). Pressão alta cansa mais. */
export function matchFitnessCost(club: Club): number {
  return 11 + 1.5 * (club.tactic.pressing - 3);
}

/** Meios de semana das copas nacionais (antes do fim de semana com esta rodada). */
export const CUP_MARKERS = [6, 12, 21, 27, 34];
/** Meio de semana da supercopa: antes da 1ª rodada. */
export const SUPERCUP_MARKER = 1;
const CUP_STAGE_NAMES = ['Primeira fase', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'];

export function buildSlots(midweekMarkers: number[]): CalendarSlot[] {
  const slots: CalendarSlot[] = [];
  const counts: Record<number, number> = {};
  for (const m of midweekMarkers) counts[m] = (counts[m] ?? 0) + 1;
  for (let m = 1; m <= 38; m++) {
    for (let k = 0; k < (counts[m] ?? 0); k++) slots.push({ kind: 'meio', marker: m });
    slots.push({ kind: 'fds', marker: m });
  }
  return slots;
}

/** Fins de semana usados por uma liga de R rodadas (as folgas ficam espalhadas). */
export function leagueWeekends(rounds: number): number[] {
  if (rounds >= 38) return Array.from({ length: 38 }, (_, i) => i + 1);
  const skip = 38 - rounds;
  const skipped = new Set(Array.from({ length: skip }, (_, k) => Math.min(38, Math.round(((k + 0.5) * 38) / skip))));
  return Array.from({ length: 38 }, (_, i) => i + 1).filter((m) => !skipped.has(m)).slice(0, rounds);
}

function weekendSlot(slots: CalendarSlot[], marker: number): number {
  return slots.findIndex((s) => s.kind === 'fds' && s.marker === marker);
}

function midweekSlots(slots: CalendarSlot[], marker: number): number[] {
  return slots.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'meio' && s.marker === marker).map(({ i }) => i);
}

const hasSquad = (c: Club) => c.squad.length >= 11;

/** Força média do XI ideal de um clube com elenco (descansado). */
export function squadRating(club: Club, players: Record<string, Player>): number {
  const pool = club.squad.map((id) => players[id]).filter((p): p is Player => !!p).map((p) => ({ ...p, fitness: 100 }));
  const l = autoLineup(club.tactic.formation, pool);
  if (l.slots.length === 0) return club.strength ?? 50;
  return l.slots.reduce((a, s) => a + s.rating, 0) / l.slots.length;
}

function ratingOf(club: Club, players: Record<string, Player>): number {
  return hasSquad(club) ? squadRating(club, players) : (club.strength ?? 55);
}

function restedStrength(club: Club, players: Record<string, Player>, params: EngineParams): TeamStrength {
  if (!hasSquad(club)) return strengthFromRating(club.strength ?? 55);
  const rested: Record<string, Player> = {};
  for (const id of club.squad) if (players[id]) rested[id] = { ...players[id]!, fitness: 100 };
  const l = chooseLineup({ ...club, startingXI: [] }, rested);
  return teamStrength(l, FORMATIONS[l.formation], params);
}

function leagueCompetition(data: WorldData, league: LeagueConfig, slots: CalendarSlot[], seed: number, params: EngineParams): CompetitionState {
  const mode = league.mode ?? 'full';
  const fixtures = generateFixtures(league, seed);
  const rounds = fixtures.reduce((m, f) => Math.max(m, f.round), 0);
  const weekends = leagueWeekends(rounds);
  for (const f of fixtures) {
    f.slot = weekendSlot(slots, weekends[f.round - 1]!);
    f.competitionId = league.id;
  }
  const ratings: Record<string, number> = {};
  let context: MatchContext;
  if (mode === 'strength') {
    for (const id of league.clubIds) ratings[id] = ratingOf(data.clubs[id]!, data.players);
    const avg = league.clubIds.reduce((a, id) => a + ratings[id]!, 0) / Math.max(1, league.clubIds.length);
    context = { offense: avg, defenseLine: avg, goalkeeper: avg };
  } else {
    context = buildContext(league.clubIds.map((id) => restedStrength(data.clubs[id]!, data.players, params)));
  }
  return {
    id: league.id,
    kind: 'league',
    name: league.name,
    country: league.country,
    leagueId: league.id,
    mode,
    clubIds: league.clubIds.slice(),
    fixtures,
    results: [],
    table: computeTable(league, []),
    context,
    ratings,
    stages: [],
    championId: null,
  };
}

export interface WorldSeasonOptions {
  /** Cria copas e supercopas nacionais (padrão true). */
  cups?: boolean;
  /** Participantes da supercopa por país: [campeão da liga, campeão da copa]. */
  supercups?: Record<string, [string, string]>;
  params?: EngineParams;
  /** Meios de semana extras (competições da Fase 4). */
  extraMidweeks?: number[];
}

export function createWorldSeason(data: WorldData, year: number, seed: number, opts: WorldSeasonOptions = {}): WorldSeason {
  const params = opts.params ?? DEFAULT_PARAMS;
  const withCups = opts.cups ?? true;
  const tier1 = Object.values(data.leagues).filter((l) => (l.tier ?? 1) === 1);
  const hasCups = withCups && tier1.some((l) => l.cupName);
  const markers = [...(hasCups ? [SUPERCUP_MARKER, ...CUP_MARKERS] : []), ...(opts.extraMidweeks ?? [])];
  const slots = buildSlots(markers);
  const competitions: Record<string, CompetitionState> = {};

  for (const league of Object.values(data.leagues)) {
    // Uma liga só: mesma seed do Fase 0/1 (calendário e jogos idênticos no backtest).
    const s = Object.keys(data.leagues).length === 1 ? seed : deriveSeed(seed, league.id);
    competitions[league.id] = leagueCompetition(data, league, slots, s, params);
  }

  if (hasCups) {
    for (const league of tier1) {
      if (!league.cupName) continue;
      const lower = league.linkedLeagueId ? data.leagues[league.linkedLeagueId] : undefined;
      competitions[`${league.id}-copa`] = cupCompetition(data, league, lower, slots, competitions[league.id]!.context);
      if (league.supercupName) {
        const pair = opts.supercups?.[league.country] ?? defaultSupercup(data, league);
        competitions[`${league.id}-super`] = supercupCompetition(data, league, pair, slots, competitions[league.id]!.context);
      }
    }
  }
  return { year, seed, slots, nextSlot: 0, competitions, status: {}, stats: {} };
}

function defaultSupercup(data: WorldData, league: LeagueConfig): [string, string] {
  const ranked = league.clubIds.slice().sort((a, b) => ratingOf(data.clubs[b]!, data.players) - ratingOf(data.clubs[a]!, data.players));
  return [ranked[0]!, ranked[1]!];
}

function cupCompetition(data: WorldData, league: LeagueConfig, lower: LeagueConfig | undefined, slots: CalendarSlot[], context: MatchContext): CompetitionState {
  const id = `${league.id}-copa`;
  const lowerRanked = (lower?.clubIds ?? []).slice().sort((a, b) => ratingOf(data.clubs[b]!, data.players) - ratingOf(data.clubs[a]!, data.players));
  const pool = [...league.clubIds, ...lowerRanked];
  let size = 1;
  while (size * 2 <= Math.min(32, pool.length)) size *= 2;
  const clubIds = pool.slice(0, size);
  const nStages = Math.log2(size);
  const stageSlots = CUP_MARKERS.slice(-nStages).map((m) => midweekSlots(slots, m)[0]!);
  const ratings: Record<string, number> = {};
  for (const cid of clubIds) if (!hasSquad(data.clubs[cid]!)) ratings[cid] = ratingOf(data.clubs[cid]!, data.players);
  return {
    id,
    kind: 'cup',
    name: league.cupName!,
    country: league.country,
    mode: 'full',
    clubIds,
    fixtures: [],
    results: [],
    table: [],
    context,
    ratings,
    stages: stageSlots.map((slot, i) => ({ name: CUP_STAGE_NAMES[CUP_STAGE_NAMES.length - nStages + i]!, slot, fixtureIds: [], drawn: false })),
    championId: null,
  };
}

function supercupCompetition(data: WorldData, league: LeagueConfig, pair: [string, string], slots: CalendarSlot[], context: MatchContext): CompetitionState {
  const id = `${league.id}-super`;
  let [a, b] = pair;
  if (a === b) b = defaultSupercup(data, league).find((x) => x !== a) ?? b;
  const slot = midweekSlots(slots, SUPERCUP_MARKER)[0]!;
  const fx: Fixture = { id: `${id}-final`, round: 1, homeId: a, awayId: b, slot, competitionId: id, neutral: true };
  const ratings: Record<string, number> = {};
  for (const cid of [a, b]) if (!hasSquad(data.clubs[cid]!)) ratings[cid] = ratingOf(data.clubs[cid]!, data.players);
  return {
    id,
    kind: 'supercup',
    name: league.supercupName!,
    country: league.country,
    mode: 'full',
    clubIds: [a, b],
    fixtures: [fx],
    results: [],
    table: [],
    context,
    ratings,
    stages: [{ name: 'Final', slot, fixtureIds: [fx.id], drawn: true }],
    championId: null,
  };
}

export function isWorldSeasonOver(ws: WorldSeason): boolean {
  return ws.nextSlot >= ws.slots.length;
}

export function currentSlot(ws: WorldSeason): CalendarSlot | null {
  return ws.slots[ws.nextSlot] ?? null;
}

export function isAvailableIn(ws: Pick<WorldSeason, 'status'>): (id: string) => boolean {
  return (id) => !((ws.status[id]?.out ?? 0) > 0);
}

function statusOf(ws: WorldSeason, id: string): PlayerStatus {
  let st = ws.status[id];
  if (!st) {
    st = { out: 0, reason: null, yellows: 0 };
    ws.status[id] = st;
  }
  return st;
}

/** Vencedor de um jogo de mata-mata (pênaltis se empatar). */
export function winnerOf(r: MatchResult): string {
  if (r.homeGoals !== r.awayGoals) return r.homeGoals > r.awayGoals ? r.homeId : r.awayId;
  return r.shootoutWinnerId ?? r.homeId;
}

/** Sorteia os confrontos de uma fase de copa quando a data dela chega. */
function drawCupStage(ws: WorldSeason, comp: CompetitionState, stageIndex: number): void {
  const stage = comp.stages[stageIndex]!;
  let entrants: string[];
  if (stageIndex === 0) entrants = comp.clubIds.slice();
  else {
    const prev = comp.stages[stageIndex - 1]!;
    entrants = prev.fixtureIds.map((fid) => comp.results.find((r) => r.fixtureId === fid)).filter((r): r is MatchResult => !!r).map(winnerOf);
  }
  const drawn = shuffle(createRng(deriveSeed(ws.seed, comp.id, stageIndex)), entrants);
  const final = stageIndex === comp.stages.length - 1;
  for (let i = 0; i + 1 < drawn.length; i += 2) {
    const fx: Fixture = {
      id: `${comp.id}-f${stageIndex + 1}-${i / 2 + 1}`,
      round: stageIndex + 1,
      homeId: drawn[i]!,
      awayId: drawn[i + 1]!,
      slot: stage.slot,
      competitionId: comp.id,
      ...(final ? { neutral: true } : {}),
    };
    comp.fixtures.push(fx);
    stage.fixtureIds.push(fx.id);
  }
  stage.drawn = true;
}

/** Partida rápida entre dois clubes "por força" (sem eventos nem escalação). */
function strengthResult(fx: Fixture, homeR: number, awayR: number, comp: CompetitionState, clubs: Record<string, Club>, params: EngineParams, seed: number): MatchResult {
  const rng = createRng(deriveSeed(seed, fx.id));
  const hs = strengthFromRating(homeR);
  const as = strengthFromRating(awayR);
  const home = clubs[fx.homeId]!;
  const away = clubs[fx.awayId]!;
  // Mesmo λ do motor completo, para as duas divisões ficarem na mesma escala.
  const r = simulateMatch({
    fixture: fx, home, away, homeLineup: { formation: home.tactic.formation, slots: [] }, awayLineup: { formation: away.tactic.formation, slots: [] },
    players: {}, ctx: comp.context, rng, params, homeStrength: hs, awayStrength: as,
  });
  return { ...r, events: [], ratings: {} };
}

/**
 * Joga a próxima data: todas as partidas de todas as competições marcadas para ela.
 * ALTERA `ws` e `data.players` (condição). Devolve os resultados.
 */
export function playSlot(
  data: WorldData,
  ws: WorldSeason,
  params: EngineParams = DEFAULT_PARAMS,
  /** Quais partidas guardam detalhe completo (escalações, notas, todos os lances). Padrão: todas. */
  keepDetail: (comp: CompetitionState, fx: Fixture) => boolean = () => true,
): MatchResult[] {
  if (isWorldSeasonOver(ws)) return [];
  const slotIdx = ws.nextSlot;
  const slot = ws.slots[slotIdx]!;
  const { clubs, players } = data;
  const available = isAvailableIn(ws);
  const played: MatchResult[] = [];
  const touched = new Set<string>();

  for (const comp of Object.values(ws.competitions)) {
    comp.stages.forEach((st, i) => {
      if (st.slot === slotIdx && !st.drawn) drawCupStage(ws, comp, i);
    });
    const todays = comp.fixtures.filter((f) => f.slot === slotIdx);
    if (todays.length === 0) continue;
    touched.add(comp.id);

    for (const fx of todays) {
      const home = clubs[fx.homeId]!;
      const away = clubs[fx.awayId]!;
      let result: MatchResult;
      if (comp.mode === 'strength') {
        result = strengthResult(fx, comp.ratings[fx.homeId] ?? 55, comp.ratings[fx.awayId] ?? 55, comp, clubs, params, ws.seed);
      } else {
        const homeFull = hasSquad(home);
        const awayFull = hasSquad(away);
        result = simulateMatch({
          fixture: fx,
          home,
          away,
          homeLineup: homeFull ? chooseLineup(home, players, available) : { formation: home.tactic.formation, slots: [] },
          awayLineup: awayFull ? chooseLineup(away, players, available) : { formation: away.tactic.formation, slots: [] },
          players,
          ctx: comp.context,
          rng: createRng(deriveSeed(ws.seed, fx.id)),
          params,
          ...(homeFull ? {} : { homeStrength: strengthFromRating(comp.ratings[home.id] ?? home.strength ?? 55) }),
          ...(awayFull ? {} : { awayStrength: strengthFromRating(comp.ratings[away.id] ?? away.strength ?? 55) }),
        });
        applyMatchEffects(ws, result, home, away, players, comp.kind === 'league');
      }
      if (comp.kind !== 'league' && result.homeGoals === result.awayGoals) {
        result.shootoutWinnerId = shootout(ws, fx, home, away, comp, players);
      }
      accumulateStats(ws, result);
      played.push(result);
      // Resumido: só placar e gols (o resto já foi para `stats`).
      comp.results.push(
        keepDetail(comp, fx) ? result : { ...result, ratings: {}, homeXI: [], awayXI: [], events: result.events.filter((e) => e.type === 'goal') },
      );
    }
  }

  // Recuperação até a próxima data (menos descanso quando há meio de semana no meio).
  const next = ws.slots[slotIdx + 1];
  const rate = slot.kind === 'meio' || next?.kind === 'meio' ? RECOVERY_RATE_MIDWEEK : RECOVERY_RATE;
  for (const club of Object.values(clubs)) {
    if (!hasSquad(club)) continue;
    for (const pid of club.squad) {
      const p = players[pid];
      if (!p) continue;
      const f = p.fitness ?? 100;
      if (f < 100) p.fitness = Math.round((f + (100 - f) * rate) * 10) / 10;
    }
  }

  for (const id of touched) {
    const comp = ws.competitions[id]!;
    if (comp.kind === 'league') {
      const league = data.leagues[comp.leagueId!]!;
      comp.table = computeTable({ ...league, clubIds: comp.clubIds }, comp.results);
    } else {
      const last = comp.stages[comp.stages.length - 1];
      if (last && last.slot === slotIdx) {
        const final = comp.results.find((r) => r.fixtureId === last.fixtureIds[0]);
        if (final) comp.championId = winnerOf(final);
      }
    }
  }
  ws.nextSlot = slotIdx + 1;
  if (isWorldSeasonOver(ws)) {
    for (const comp of Object.values(ws.competitions)) if (comp.kind === 'league') comp.championId = comp.table[0]?.clubId ?? null;
  }
  return played;
}

function accumulateStats(ws: WorldSeason, r: MatchResult): void {
  const line = (id: string) => (ws.stats[id] ??= { apps: 0, goals: 0, assists: 0, yellows: 0, reds: 0, ratingSum: 0 });
  for (const id of [...r.homeXI, ...r.awayXI]) {
    const l = line(id);
    l.apps++;
    l.ratingSum += r.ratings[id] ?? 0;
  }
  for (const e of r.events) {
    if (e.type === 'goal') {
      line(e.playerId).goals++;
      if (e.assistId) line(e.assistId).assists++;
    } else if (e.type === 'yellow') line(e.playerId).yellows++;
    else if (e.type === 'red') line(e.playerId).reds++;
  }
}

/** Pênaltis: 50% com leve vantagem para o time mais forte. */
function shootout(ws: WorldSeason, fx: Fixture, home: Club, away: Club, comp: CompetitionState, players: Record<string, Player>): string {
  const rh = comp.ratings[home.id] ?? ratingOf(home, players);
  const ra = comp.ratings[away.id] ?? ratingOf(away, players);
  const p = 0.5 + 0.15 * Math.tanh((rh - ra) / 10);
  return chance(createRng(deriveSeed(ws.seed, fx.id, 'penaltis')), p) ? home.id : away.id;
}

/** Desgaste, cumprimento de suspensões/lesões e novas ausências de uma partida com elenco. */
function applyMatchEffects(ws: WorldSeason, result: MatchResult, home: Club, away: Club, players: Record<string, Player>, isLeague: boolean): void {
  for (const [club, xi] of [[home, result.homeXI], [away, result.awayXI]] as const) {
    const cost = matchFitnessCost(club);
    for (const pid of xi) {
      const p = players[pid];
      if (p) p.fitness = Math.max(0, (p.fitness ?? 100) - cost);
    }
  }
  for (const club of [home, away]) {
    if (!hasSquad(club)) continue;
    for (const pid of club.squad) {
      const st = ws.status[pid];
      if (st && st.out > 0) {
        st.out--;
        if (st.out === 0) st.reason = null;
      }
    }
  }
  for (const e of result.events) {
    if (e.type === 'injury') {
      const st = statusOf(ws, e.playerId);
      st.out = Math.max(st.out, e.matchesOut ?? 1);
      st.reason = 'injury';
    } else if (e.type === 'red') {
      const st = statusOf(ws, e.playerId);
      if (st.out < 1) {
        st.out = 1;
        st.reason = 'suspension';
      }
    } else if (e.type === 'yellow' && isLeague) {
      const st = statusOf(ws, e.playerId);
      st.yellows++;
      if (st.yellows % YELLOW_LIMIT === 0 && st.out < 1) {
        st.out = 1;
        st.reason = 'suspension';
      }
    }
  }
}

/** Todas as partidas (com resultado ou não) de um clube na temporada, em ordem de data. */
export function clubFixtures(ws: WorldSeason, clubId: string): { fx: Fixture; comp: CompetitionState; result?: MatchResult }[] {
  const out: { fx: Fixture; comp: CompetitionState; result?: MatchResult }[] = [];
  for (const comp of Object.values(ws.competitions)) {
    const byId = new Map(comp.results.map((r) => [r.fixtureId, r]));
    for (const fx of comp.fixtures) if (fx.homeId === clubId || fx.awayId === clubId) out.push({ fx, comp, result: byId.get(fx.id) });
  }
  return out.sort((a, b) => (a.fx.slot ?? 0) - (b.fx.slot ?? 0));
}

/** Resultado de uma partida em qualquer competição. */
export function findResult(ws: WorldSeason, fixtureId: string): { result: MatchResult; comp: CompetitionState } | null {
  for (const comp of Object.values(ws.competitions)) {
    const r = comp.results.find((x) => x.fixtureId === fixtureId);
    if (r) return { result: r, comp };
  }
  return null;
}

/** Liga (competição) em que o clube joga nesta temporada. */
export function leagueCompetitionOf(ws: WorldSeason, clubId: string): CompetitionState | null {
  return Object.values(ws.competitions).find((c) => c.kind === 'league' && c.clubIds.includes(clubId)) ?? null;
}

