// Evolução anual dos jogadores (idade, treino, minutos jogados), aposentadorias e base.

import { computeOvr, POSITION_WEIGHTS, ratingAt } from '../domain/positions';
import type { Attributes, Club, Level, Player, Position } from '../domain/types';
import { makePlayer } from '../data/fictionalLeague';
import { chance, gaussian, int, pick, type Rng } from '../engine/rng';
import { contractYearsRange, marketValue, wageDemand } from '../market/valuation';

const clamp = (v: number, lo = 1, hi = 99) => Math.max(lo, Math.min(hi, v));

/** Variação média de OVR por idade (antes de fazer aniversário). `gap` = potencial − OVR. */
function expectedDelta(age: number, gap: number): number {
  if (age <= 18) return gap * 0.3;
  if (age <= 21) return gap * 0.25;
  if (age <= 23) return gap * 0.18;
  if (age <= 26) return gap * 0.1;
  if (age <= 29) return -0.3;
  if (age <= 31) return -1.5;
  if (age <= 33) return -2.5;
  return -3.5;
}

export function trainingFactor(training: number): number {
  return 0.8 + 0.1 * training;
}

/** Atributos que definem o nível na posição principal (goleiro: só `goalkeeping`). */
function anchorsOf(pos: Position): (keyof Attributes)[] {
  if (pos === 'GK') return ['goalkeeping'];
  const w = POSITION_WEIGHTS[pos];
  return (Object.keys(w) as (keyof Attributes)[]).filter((k) => w[k] > 0);
}

/** Desloca os atributos-âncora até o OVR mudar `delta` (aproximadamente). */
export function shiftOvr(p: Player, delta: number): Attributes {
  const pos = p.positions[0] as Position;
  const anchors = anchorsOf(pos);
  const w = POSITION_WEIGHTS[pos];
  const attrs: Attributes = { attack: p.attack, creation: p.creation, defending: p.defending, physical: p.physical, goalkeeping: p.goalkeeping };
  const target = ratingAt(attrs, pos) + delta;
  for (let i = 0; i < 3; i++) {
    const diff = target - ratingAt(attrs, pos);
    const share = anchors.reduce((a, k) => a + w[k], 0);
    for (const k of anchors) attrs[k] = clamp(attrs[k] + diff / share);
  }
  for (const k of Object.keys(attrs) as (keyof Attributes)[]) attrs[k] = Math.round(clamp(attrs[k]));
  return attrs;
}

export interface DevelopmentContext {
  /** Treino efetivo (1-5, pode ser fracionário com o auxiliar técnico). */
  training: number;
  /** Jogos como titular na temporada que terminou. */
  apps: number;
  /** Temporada que vai começar (para valor de mercado). */
  nextSeason: number;
}

/** Um ano a mais: idade, evolução/declínio, potencial e valor. */
export function developPlayer(p: Player, rng: Rng, ctx: DevelopmentContext): Player {
  const gap = Math.max(0, p.potential - p.ovr);
  let delta = expectedDelta(p.age, gap);
  if (delta > 0) {
    // Jovem precisa jogar: sem minutos evolui metade.
    const playing = p.age <= 23 ? 0.5 + 0.5 * Math.min(1, ctx.apps / 20) : 1;
    delta *= trainingFactor(ctx.training) * playing;
  } else {
    // Bom treino segura um pouco o declínio.
    delta *= 1.1 - 0.05 * ctx.training;
  }
  delta += gaussian(rng, 0, 1.2);
  const attrs = shiftOvr(p, delta);
  if (p.age >= 30 && p.positions[0] !== 'GK') attrs.physical = Math.round(clamp(attrs.physical - int(rng, 0, 2)));
  const ovr = computeOvr(attrs, p.positions[0] as Position);
  let potential = p.potential;
  if (p.age <= 23) potential = Math.round(potential + gaussian(rng, 0, 1.5));
  potential = Math.round(clamp(Math.max(potential, ovr)));
  const next: Player = { ...p, ...attrs, age: p.age + 1, ovr, potential, fitness: 100 };
  return { ...next, value: marketValue(next, ctx.nextSeason) };
}

/** Chance de se aposentar no fim da temporada (já com a idade nova). */
export function retirementChance(p: Player): number {
  if (p.age >= 38) return 1;
  if (p.age >= 35) return 0.45 + 0.15 * (p.age - 35);
  if (p.age >= 33 && p.ovr < 68) return 0.35;
  if (p.clubId === null && p.age >= 31) return 0.5;
  return 0;
}

export function shouldRetire(p: Player, rng: Rng): boolean {
  return chance(rng, retirementChance(p));
}

/** Nível do clube: média dos 11 melhores OVR do elenco. */
export function clubLevel(club: Club, players: Record<string, Player>): number {
  const ovrs = club.squad.map((id) => players[id]?.ovr ?? 0).sort((a, b) => b - a).slice(0, 11);
  return ovrs.reduce((a, b) => a + b, 0) / Math.max(1, ovrs.length);
}

const YOUTH_POSITIONS: Position[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'DM', 'CM', 'CM', 'AM', 'LW', 'RW', 'ST', 'ST'];

/**
 * Jovens da base que sobem ao profissional na virada da temporada. A qualidade acompanha o nível
 * do clube e o treino. Posições priorizam as que o elenco tem menos.
 */
export function youthIntake(
  club: Club,
  players: Record<string, Player>,
  rng: Rng,
  season: number,
  count: number,
  forcePos?: Position,
  /** Pontos de nível a mais (olheiro do usuário). */
  bonus = 0,
): Player[] {
  const level = clubLevel(club, players);
  const have: Partial<Record<Position, number>> = {};
  for (const id of club.squad) {
    const pos = players[id]?.positions[0];
    if (pos) have[pos] = (have[pos] ?? 0) + 1;
  }
  const out: Player[] = [];
  for (let k = 0; k < count; k++) {
    // Escolhe entre 3 posições sorteadas a menos povoada.
    const options = [pick(rng, YOUTH_POSITIONS), pick(rng, YOUTH_POSITIONS), pick(rng, YOUTH_POSITIONS)];
    const pos = forcePos ?? (options.sort((a, b) => (have[a] ?? 0) - (have[b] ?? 0))[0] as Position);
    have[pos] = (have[pos] ?? 0) + 1;
    const target = level - 17 + 1.5 * (club.training - 3) + bonus + gaussian(rng, 0, 4);
    const id = `${club.id}-b${season}-${forcePos ? `${forcePos.toLowerCase()}` : ''}${k + 1}`;
    // Potencial médio ~4 abaixo do nível do clube: poucos viram titulares.
    const p = makePlayer(rng, id, club.id, pos, target, season, [16, 18], [0.4, 1.8]);
    const [minY, maxY] = contractYearsRange(p.age);
    // Contrato de formação curto (2 temporadas): quem não evoluir não é renovado.
    const contract = { wage: wageDemand(p), expires: season + Math.min(maxY, Math.max(minY, 2)) - 1 };
    out.push({ ...p, contract, value: marketValue({ ...p, contract }, season) });
  }
  return out;
}
