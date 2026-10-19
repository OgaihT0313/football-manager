// Motor de partida (PLANO-FUTEBOL.md, seção 5, itens 1 a 4):
// força por setor -> gols esperados (λ) -> placar Poisson (com ajuste Dixon-Coles opcional)
// -> autores de gols, assistências, cartões, lesões e notas.

import { FORMATIONS } from '../domain/positions';
import type { Club, Fixture, MatchEvent, MatchResult, Player, Position, Tactic } from '../domain/types';
import type { Lineup, LineupSlot } from './lineup';
import { chance, gaussian, int, poisson, weightedIndex, type Rng } from './rng';

export interface EngineParams {
  /** Gols esperados do mandante/visitante num jogo entre times médios. */
  muHome: number;
  muAway: number;
  /** Expoente da razão de forças (ataque/defesa). Quanto maior, mais a força decide. */
  k: number;
  /** Expoente do goleiro. */
  kGk: number;
  /** Peso do meio-campo no poder ofensivo e defensivo (0-1). */
  midWeight: number;
  /** Expoente do fator de quantidade (formação com mais gente num setor). */
  formationExp: number;
  /** ρ de Dixon-Coles. 0 = Poisson independente. Negativo aumenta 0-0 e 1-1. */
  rho: number;
  assistRate: number;
  yellowsPerTeam: number;
  redsPerTeam: number;
  injuriesPerTeam: number;
}

/** Calibrado na Fase 0 com scripts/backtest_league.ts (500 temporadas). Ver ROADMAP.md. */
export const DEFAULT_PARAMS: EngineParams = {
  muHome: 1.5,
  muAway: 1.13,
  k: 2.2,
  kGk: 1.5,
  midWeight: 0.35,
  formationExp: 0.3,
  rho: -0.08,
  assistRate: 0.75,
  yellowsPerTeam: 1.9,
  redsPerTeam: 0.07,
  injuriesPerTeam: 0.12,
};

type Sector = 'attack' | 'midfield' | 'defense';

/** Quanto cada vaga contribui para cada setor. */
const SECTOR_WEIGHTS: Record<Position, Record<Sector, number>> = {
  GK: { attack: 0, midfield: 0, defense: 0 },
  CB: { attack: 0, midfield: 0, defense: 1 },
  LB: { attack: 0.15, midfield: 0.2, defense: 0.8 },
  RB: { attack: 0.15, midfield: 0.2, defense: 0.8 },
  DM: { attack: 0, midfield: 0.8, defense: 0.6 },
  CM: { attack: 0.25, midfield: 1, defense: 0.2 },
  AM: { attack: 0.6, midfield: 0.8, defense: 0 },
  LW: { attack: 0.8, midfield: 0.3, defense: 0 },
  RW: { attack: 0.8, midfield: 0.3, defense: 0 },
  ST: { attack: 1, midfield: 0, defense: 0 },
};

/** Soma de pesos de um 4-3-3, usada como "quantidade normal" de gente em cada setor. */
const SECTOR_NORM: Record<Sector, number> = { attack: 3.15, midfield: 3.5, defense: 4.2 };

/** Rendimento atribuído a uma vaga vazia (time com menos de 11 disponíveis). */
const EMPTY_SLOT_RATING = 20;

export interface TeamStrength {
  attack: number;
  midfield: number;
  defense: number;
  goalkeeper: number;
  /** Poder ofensivo = ataque misturado com meio. */
  offense: number;
  /** Poder defensivo de linha = defesa misturada com meio (goleiro à parte). */
  defenseLine: number;
}

/** Referência da liga: força média, usada para normalizar os λ. */
export interface MatchContext {
  offense: number;
  defenseLine: number;
  goalkeeper: number;
}

export const DEFAULT_CONTEXT: MatchContext = { offense: 72, defenseLine: 72, goalkeeper: 72 };

export function teamStrength(lineup: Lineup, positions: readonly Position[], params: EngineParams = DEFAULT_PARAMS): TeamStrength {
  // `positions` é a formação completa; vagas sem jogador entram com rendimento baixo.
  const filled: LineupSlot[] = lineup.slots;
  const remaining = filled.slice();
  const ratings: { pos: Position; rating: number }[] = positions.map((pos) => {
    const idx = remaining.findIndex((s) => s.pos === pos);
    if (idx < 0) return { pos, rating: EMPTY_SLOT_RATING };
    const [slot] = remaining.splice(idx, 1);
    return { pos, rating: (slot as LineupSlot).rating };
  });

  const sector = (s: Sector): number => {
    let sum = 0;
    let wsum = 0;
    for (const r of ratings) {
      const w = SECTOR_WEIGHTS[r.pos][s];
      sum += w * r.rating;
      wsum += w;
    }
    if (wsum === 0) return EMPTY_SLOT_RATING;
    return (sum / wsum) * Math.pow(wsum / SECTOR_NORM[s], params.formationExp);
  };

  const attack = sector('attack');
  const midfield = sector('midfield');
  const defense = sector('defense');
  const gk = ratings.find((r) => r.pos === 'GK')?.rating ?? EMPTY_SLOT_RATING;
  const m = params.midWeight;
  return {
    attack,
    midfield,
    defense,
    goalkeeper: gk,
    offense: (1 - m) * attack + m * midfield,
    defenseLine: (1 - m) * defense + m * midfield,
  };
}

/** Média das forças dos times da liga, para servir de referência. */
export function buildContext(strengths: TeamStrength[]): MatchContext {
  if (strengths.length === 0) return DEFAULT_CONTEXT;
  const avg = (f: (s: TeamStrength) => number) => strengths.reduce((a, s) => a + f(s), 0) / strengths.length;
  return { offense: avg((s) => s.offense), defenseLine: avg((s) => s.defenseLine), goalkeeper: avg((s) => s.goalkeeper) };
}

/**
 * Efeito da tática no λ. Ritmo e pressão altos aumentam os gols a favor; linha alta e ritmo
 * alto também expõem o time (aumentam os gols contra). Efeitos pequenos de propósito.
 */
export function tacticFactors(t: Tactic): { forOwn: number; againstOwn: number } {
  return {
    forOwn: 1 + 0.02 * (t.tempo - 3) + 0.015 * (t.pressing - 3),
    againstOwn: 1 + 0.02 * (t.lineHeight - 3) + 0.01 * (t.tempo - 3),
  };
}

export function expectedGoals(
  home: TeamStrength,
  away: TeamStrength,
  homeTactic: Tactic,
  awayTactic: Tactic,
  ctx: MatchContext,
  params: EngineParams = DEFAULT_PARAMS,
): { home: number; away: number } {
  const th = tacticFactors(homeTactic);
  const ta = tacticFactors(awayTactic);
  const lambda = (mu: number, att: TeamStrength, def: TeamStrength, forF: number, againstF: number) =>
    mu *
    Math.pow(att.offense / ctx.offense, params.k) *
    Math.pow(ctx.defenseLine / def.defenseLine, params.k) *
    Math.pow(ctx.goalkeeper / def.goalkeeper, params.kGk) *
    forF *
    againstF;
  return {
    home: lambda(params.muHome, home, away, th.forOwn, ta.againstOwn),
    away: lambda(params.muAway, away, home, ta.forOwn, th.againstOwn),
  };
}

const MAX_GOALS = 10;

function poissonPmf(lambda: number): number[] {
  const out: number[] = [];
  let p = Math.exp(-lambda);
  for (let k = 0; k <= MAX_GOALS; k++) {
    out.push(p);
    p = (p * lambda) / (k + 1);
  }
  return out;
}

/** Sorteia o placar. Com ρ = 0 são duas Poisson independentes; senão usa Dixon-Coles. */
export function sampleScore(rng: Rng, lh: number, la: number, rho: number): [number, number] {
  if (rho === 0) return [poisson(rng, lh), poisson(rng, la)];
  const ph = poissonPmf(lh);
  const pa = poissonPmf(la);
  const tau = (x: number, y: number) => {
    if (x === 0 && y === 0) return 1 - lh * la * rho;
    if (x === 0 && y === 1) return 1 + lh * rho;
    if (x === 1 && y === 0) return 1 + la * rho;
    if (x === 1 && y === 1) return 1 - rho;
    return 1;
  };
  let total = 0;
  const cells: number[] = [];
  for (let x = 0; x <= MAX_GOALS; x++) {
    for (let y = 0; y <= MAX_GOALS; y++) {
      const v = Math.max(0, (ph[x] as number) * (pa[y] as number) * tau(x, y));
      cells.push(v);
      total += v;
    }
  }
  let r = rng.next() * total;
  for (let i = 0; i < cells.length; i++) {
    r -= cells[i] as number;
    if (r < 0) return [Math.floor(i / (MAX_GOALS + 1)), i % (MAX_GOALS + 1)];
  }
  return [MAX_GOALS, MAX_GOALS];
}

/** Peso de cada posição para marcar gol, dar assistência e levar cartão. */
const SCORE_W: Record<Position, number> = { GK: 0, CB: 0.12, LB: 0.08, RB: 0.08, DM: 0.1, CM: 0.25, AM: 0.5, LW: 0.6, RW: 0.6, ST: 1 };
const ASSIST_W: Record<Position, number> = { GK: 0.02, CB: 0.1, LB: 0.4, RB: 0.4, DM: 0.3, CM: 0.7, AM: 1, LW: 0.8, RW: 0.8, ST: 0.5 };
const CARD_W: Record<Position, number> = { GK: 0.15, CB: 1.2, LB: 1, RB: 1, DM: 1.3, CM: 1, AM: 0.6, LW: 0.6, RW: 0.6, ST: 0.7 };
const DEFENSIVE: ReadonlySet<Position> = new Set(['GK', 'CB', 'LB', 'RB', 'DM']);

function randomMinute(rng: Rng): number {
  return chance(rng, 0.04) ? int(rng, 91, 95) : int(rng, 1, 90);
}

function injuryLength(rng: Rng): number {
  const r = rng.next();
  if (r < 0.6) return int(rng, 1, 2);
  if (r < 0.9) return int(rng, 3, 6);
  return int(rng, 8, 20);
}

export interface SimulateMatchInput {
  fixture: Fixture;
  home: Club;
  away: Club;
  homeLineup: Lineup;
  awayLineup: Lineup;
  players: Record<string, Player>;
  ctx: MatchContext;
  rng: Rng;
  params?: EngineParams;
}

export function simulateMatch(input: SimulateMatchInput): MatchResult {
  const { fixture, home, away, homeLineup, awayLineup, players, ctx, rng } = input;
  const params = input.params ?? DEFAULT_PARAMS;
  const homePositions = slotsOfFormation(homeLineup);
  const awayPositions = slotsOfFormation(awayLineup);
  const hs = teamStrength(homeLineup, homePositions, params);
  const as = teamStrength(awayLineup, awayPositions, params);
  const xg = expectedGoals(hs, as, home.tactic, away.tactic, ctx, params);
  const [homeGoals, awayGoals] = sampleScore(rng, xg.home, xg.away, params.rho);

  const events: MatchEvent[] = [];
  const side = [
    { club: home, lineup: homeLineup, goals: homeGoals, conceded: awayGoals },
    { club: away, lineup: awayLineup, goals: awayGoals, conceded: homeGoals },
  ];

  for (const s of side) {
    const xi = s.lineup.slots;
    if (xi.length === 0) continue;
    const scoreW = xi.map((sl) => SCORE_W[sl.pos] * Math.pow((players[sl.playerId]?.attack ?? 50) / 70, 2));
    const assistW = xi.map((sl) => ASSIST_W[sl.pos] * Math.pow((players[sl.playerId]?.creation ?? 50) / 70, 2));
    for (let g = 0; g < s.goals; g++) {
      const si = weightedIndex(rng, scoreW);
      const scorer = (xi[si] as LineupSlot).playerId;
      const ev: MatchEvent = { type: 'goal', minute: randomMinute(rng), clubId: s.club.id, playerId: scorer };
      if (chance(rng, params.assistRate)) {
        const w = assistW.map((v, i) => (i === si ? 0 : v));
        ev.assistId = (xi[weightedIndex(rng, w)] as LineupSlot).playerId;
      }
      events.push(ev);
    }

    const pressing = s.club.tactic.pressing;
    const cardW = xi.map((sl) => CARD_W[sl.pos]);
    const yellows = poisson(rng, params.yellowsPerTeam * (1 + 0.08 * (pressing - 3)));
    const booked = new Set<string>();
    const sentOff = new Set<string>();
    for (let y = 0; y < yellows; y++) {
      const pid = (xi[weightedIndex(rng, cardW)] as LineupSlot).playerId;
      if (sentOff.has(pid)) continue;
      const minute = randomMinute(rng);
      if (booked.has(pid)) {
        // Segundo amarelo vira vermelho.
        events.push({ type: 'red', minute, clubId: s.club.id, playerId: pid });
        sentOff.add(pid);
      } else {
        events.push({ type: 'yellow', minute, clubId: s.club.id, playerId: pid });
        booked.add(pid);
      }
    }
    const reds = poisson(rng, params.redsPerTeam);
    for (let r = 0; r < reds; r++) {
      const pid = (xi[weightedIndex(rng, cardW)] as LineupSlot).playerId;
      if (sentOff.has(pid)) continue;
      events.push({ type: 'red', minute: randomMinute(rng), clubId: s.club.id, playerId: pid });
      sentOff.add(pid);
    }

    const injuries = poisson(rng, params.injuriesPerTeam);
    for (let i = 0; i < injuries; i++) {
      const injW = xi.map((sl) => 1.5 - (players[sl.playerId]?.physical ?? 50) / 100);
      const pid = (xi[weightedIndex(rng, injW)] as LineupSlot).playerId;
      if (events.some((e) => e.type === 'injury' && e.playerId === pid)) continue;
      events.push({ type: 'injury', minute: randomMinute(rng), clubId: s.club.id, playerId: pid, matchesOut: injuryLength(rng) });
    }
  }

  events.sort((a, b) => a.minute - b.minute);

  // Notas 1-10.
  const ratings: Record<string, number> = {};
  for (const s of side) {
    const resultBonus = s.goals > s.conceded ? 0.4 : s.goals < s.conceded ? -0.4 : 0;
    for (const sl of s.lineup.slots) {
      let r = 6.3 + resultBonus + gaussian(rng, 0, 0.45);
      if (DEFENSIVE.has(sl.pos)) r += s.conceded === 0 ? 0.5 : -0.25 * s.conceded;
      for (const e of events) {
        if (e.playerId === sl.playerId) {
          if (e.type === 'goal') r += 0.9;
          else if (e.type === 'yellow') r -= 0.2;
          else if (e.type === 'red') r -= 1.5;
        }
        if (e.assistId === sl.playerId) r += 0.5;
      }
      ratings[sl.playerId] = Math.round(Math.max(1, Math.min(10, r)) * 10) / 10;
    }
  }

  return {
    fixtureId: fixture.id,
    homeId: home.id,
    awayId: away.id,
    homeGoals,
    awayGoals,
    homeXg: xg.home,
    awayXg: xg.away,
    events,
    ratings,
    homeXI: homeLineup.slots.map((s) => s.playerId),
    awayXI: awayLineup.slots.map((s) => s.playerId),
  };
}

/** Posições completas da formação da escalação (inclusive vagas que ficaram vazias). */
function slotsOfFormation(lineup: Lineup): readonly Position[] {
  return FORMATIONS[lineup.formation];
}
