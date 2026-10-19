// Posições, formações e a tabela de afinidade entre posições.

import type { Attributes, Formation, Player, Position } from './types';

export const POSITIONS: readonly Position[] = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];

type Weights = Record<keyof Attributes, number>;

/** Peso de cada atributo no rendimento em cada posição. Cada linha soma 1. */
export const POSITION_WEIGHTS: Record<Position, Weights> = {
  GK: { attack: 0, creation: 0.05, defending: 0, physical: 0.1, goalkeeping: 0.85 },
  CB: { attack: 0, creation: 0.1, defending: 0.6, physical: 0.3, goalkeeping: 0 },
  LB: { attack: 0.1, creation: 0.2, defending: 0.4, physical: 0.3, goalkeeping: 0 },
  RB: { attack: 0.1, creation: 0.2, defending: 0.4, physical: 0.3, goalkeeping: 0 },
  DM: { attack: 0, creation: 0.3, defending: 0.45, physical: 0.25, goalkeeping: 0 },
  CM: { attack: 0.1, creation: 0.5, defending: 0.2, physical: 0.2, goalkeeping: 0 },
  AM: { attack: 0.35, creation: 0.5, defending: 0, physical: 0.15, goalkeeping: 0 },
  LW: { attack: 0.45, creation: 0.35, defending: 0, physical: 0.2, goalkeeping: 0 },
  RW: { attack: 0.45, creation: 0.35, defending: 0, physical: 0.2, goalkeeping: 0 },
  ST: { attack: 0.65, creation: 0.1, defending: 0, physical: 0.25, goalkeeping: 0 },
};

/** Rendimento "natural" dos atributos numa posição, sem considerar familiaridade. */
export function ratingAt(attrs: Attributes, pos: Position): number {
  const w = POSITION_WEIGHTS[pos];
  return (
    attrs.attack * w.attack +
    attrs.creation * w.creation +
    attrs.defending * w.defending +
    attrs.physical * w.physical +
    attrs.goalkeeping * w.goalkeeping
  );
}

/** OVR oficial = rendimento na posição principal, arredondado. */
export function computeOvr(attrs: Attributes, mainPos: Position): number {
  return Math.round(Math.max(1, Math.min(99, ratingAt(attrs, mainPos))));
}

/**
 * Afinidade entre a posição principal do jogador (linha) e a posição em que ele é escalado
 * (coluna). 1 = posição natural. Pares ausentes caem em DEFAULT_AFFINITY.
 */
const AFFINITY: Partial<Record<Position, Partial<Record<Position, number>>>> = {
  CB: { DM: 0.9, LB: 0.88, RB: 0.88 },
  LB: { RB: 0.93, CB: 0.86, LW: 0.86, DM: 0.84 },
  RB: { LB: 0.93, CB: 0.86, RW: 0.86, DM: 0.84 },
  DM: { CM: 0.95, CB: 0.88, LB: 0.84, RB: 0.84, AM: 0.85 },
  CM: { DM: 0.93, AM: 0.93, LW: 0.84, RW: 0.84 },
  AM: { CM: 0.93, LW: 0.9, RW: 0.9, ST: 0.88, DM: 0.82 },
  LW: { RW: 0.95, AM: 0.9, ST: 0.88, LB: 0.82, CM: 0.83 },
  RW: { LW: 0.95, AM: 0.9, ST: 0.88, RB: 0.82, CM: 0.83 },
  ST: { AM: 0.87, LW: 0.87, RW: 0.87 },
};
const DEFAULT_AFFINITY = 0.78;
/** Goleiro na linha, ou jogador de linha no gol. */
const GK_SWAP_AFFINITY = 0.35;
const SECONDARY_AFFINITY = 0.97;

export function familiarity(player: Pick<Player, 'positions'>, slot: Position): number {
  const idx = player.positions.indexOf(slot);
  if (idx === 0) return 1;
  if (idx > 0) return SECONDARY_AFFINITY;
  const main = player.positions[0] ?? 'CM';
  if ((main === 'GK') !== (slot === 'GK')) return GK_SWAP_AFFINITY;
  return AFFINITY[main]?.[slot] ?? DEFAULT_AFFINITY;
}

/** Rendimento efetivo de um jogador escalado numa posição (antes de fadiga e moral). */
export function effectiveAt(player: Player, slot: Position): number {
  return ratingAt(player, slot) * familiarity(player, slot);
}

/** Posições de cada formação, na ordem de exibição (goleiro, defesa, meio, ataque). */
export const FORMATIONS: Record<Formation, readonly Position[]> = {
  '4-3-3': ['GK', 'LB', 'CB', 'CB', 'RB', 'DM', 'CM', 'CM', 'LW', 'RW', 'ST'],
  '4-2-3-1': ['GK', 'LB', 'CB', 'CB', 'RB', 'DM', 'DM', 'AM', 'LW', 'RW', 'ST'],
  '4-4-2': ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'LW', 'RW', 'ST', 'ST'],
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'ST', 'ST'],
  '5-3-2': ['GK', 'LB', 'CB', 'CB', 'CB', 'RB', 'DM', 'CM', 'CM', 'ST', 'ST'],
};

export const FORMATION_LIST = Object.keys(FORMATIONS) as Formation[];
