// Escolha do XI titular a partir da formação, com penalidade para jogador fora de posição.

import { effectiveAt, FORMATIONS } from '../domain/positions';
import type { Club, Formation, Player, Position } from '../domain/types';

export interface LineupSlot {
  pos: Position;
  playerId: string;
  /** Rendimento efetivo na vaga: atributos x familiaridade x condição. */
  rating: number;
}

export interface Lineup {
  formation: Formation;
  slots: LineupSlot[];
}

/** Fadiga e moral mexem no rendimento: até -15% cansado, ±5% pela moral. */
export function conditionFactor(p: Player): number {
  const fitness = p.fitness ?? 100;
  const morale = p.morale ?? 50;
  return (0.85 + 0.15 * (fitness / 100)) * (1 + (morale - 50) / 1000);
}

export function slotRating(p: Player, pos: Position): number {
  return effectiveAt(p, pos) * conditionFactor(p);
}

/**
 * Monta o XI. Se o clube definiu `startingXI` com 11 jogadores disponíveis, respeita a escolha
 * e só distribui as vagas; senão escolhe os melhores do elenco. Disponível = está no elenco e
 * `isAvailable` retorna true (lesão, suspensão).
 */
export function chooseLineup(
  club: Club,
  players: Record<string, Player>,
  isAvailable: (id: string) => boolean = () => true,
): Lineup {
  const formation = club.tactic.formation;
  const positions = FORMATIONS[formation];
  const pool = club.squad.filter((id) => players[id] && isAvailable(id)).map((id) => players[id] as Player);

  const fixed = club.startingXI.filter((id) => pool.some((p) => p.id === id));
  const candidates = fixed.length === 11 ? pool.filter((p) => fixed.includes(p.id)) : pool;
  const allowBench = fixed.length !== 11;

  // Gulosa: goleiro primeiro, depois as vagas na ordem da formação.
  const order = positions.map((pos, i) => ({ pos, i })).sort((a, b) => (a.pos === 'GK' ? -1 : b.pos === 'GK' ? 1 : a.i - b.i));
  const assigned: (Player | null)[] = positions.map(() => null);
  const used = new Set<string>();
  for (const { pos, i } of order) {
    let best: Player | null = null;
    let bestR = -Infinity;
    for (const p of candidates) {
      if (used.has(p.id)) continue;
      const r = slotRating(p, pos);
      if (r > bestR) {
        bestR = r;
        best = p;
      }
    }
    if (best) {
      assigned[i] = best;
      used.add(best.id);
    }
  }

  // Melhoria local: trocas entre titulares e entre titular e reserva enquanto houver ganho.
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (let a = 0; a < positions.length; a++) {
      for (let b = a + 1; b < positions.length; b++) {
        const pa = assigned[a];
        const pb = assigned[b];
        if (!pa || !pb) continue;
        const posA = positions[a] as Position;
        const posB = positions[b] as Position;
        const now = slotRating(pa, posA) + slotRating(pb, posB);
        const swapped = slotRating(pb, posA) + slotRating(pa, posB);
        if (swapped > now + 1e-9) {
          assigned[a] = pb;
          assigned[b] = pa;
          improved = true;
        }
      }
      if (allowBench) {
        const cur = assigned[a];
        const posA = positions[a] as Position;
        const curR = cur ? slotRating(cur, posA) : -Infinity;
        for (const p of candidates) {
          if (used.has(p.id)) continue;
          if (slotRating(p, posA) > curR + 1e-9) {
            if (cur) used.delete(cur.id);
            used.add(p.id);
            assigned[a] = p;
            improved = true;
            break;
          }
        }
      }
    }
    if (!improved) break;
  }

  const slots: LineupSlot[] = [];
  positions.forEach((pos, i) => {
    const p = assigned[i];
    if (p) slots.push({ pos, playerId: p.id, rating: slotRating(p, pos) });
  });
  return { formation, slots };
}
