// Valor de mercado e salário pedido, a partir de OVR, idade, potencial, posição e contrato.

import type { Player, Position } from '../domain/types';

const POSITION_FACTOR: Record<Position, number> = {
  GK: 0.7, CB: 0.9, LB: 0.85, RB: 0.85, DM: 0.95, CM: 1, AM: 1.1, LW: 1.1, RW: 1.1, ST: 1.15,
};

function ageFactor(age: number): number {
  if (age <= 21) return 1.25;
  if (age <= 24) return 1.2;
  if (age <= 27) return 1.1;
  if (age <= 29) return 0.9;
  if (age <= 31) return 0.65;
  if (age <= 33) return 0.4;
  return 0.2;
}

const round50k = (v: number) => Math.max(50_000, Math.round(v / 50_000) * 50_000);

/**
 * Valor de mercado em euros. Jovem com potencial alto vale mais; contrato curto vale menos
 * (no último ano, metade). `season` = temporada atual (ano de início).
 */
export function marketValue(p: Pick<Player, 'ovr' | 'age' | 'potential' | 'positions' | 'contract'>, season?: number): number {
  const base = 1_000_000 * Math.exp((p.ovr - 60) / 5.5);
  const upside = p.age <= 24 ? 1 + Math.max(0, p.potential - p.ovr) * 0.035 * ((25 - p.age) / 7) : 1;
  const pos = POSITION_FACTOR[p.positions[0] ?? 'CM'];
  let contract = 1;
  if (season !== undefined) {
    const yearsLeft = p.contract.expires - season;
    contract = yearsLeft <= 0 ? 0.5 : yearsLeft === 1 ? 0.8 : 1;
  }
  return round50k(base * ageFactor(p.age) * upside * pos * contract);
}

/** Salário semanal que o jogador pede (sem considerar o clube). */
export function wageDemand(p: Pick<Player, 'ovr' | 'age'>): number {
  const base = 1_500 * Math.exp((p.ovr - 55) / 6);
  // Veteranos aceitam um pouco menos; jovens ainda não têm poder de barganha.
  const age = p.age <= 20 ? 0.6 : p.age <= 23 ? 0.85 : p.age >= 33 ? 0.85 : 1;
  return Math.max(500, Math.round((base * age) / 100) * 100);
}

/** Duração de contrato aceitável para o jogador, em temporadas. */
export function contractYearsRange(age: number): [number, number] {
  if (age <= 23) return [2, 5];
  if (age <= 29) return [1, 5];
  if (age <= 32) return [1, 3];
  return [1, 2];
}
