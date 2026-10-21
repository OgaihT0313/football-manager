// Eras (Fase 6): pacotes de dados em `data/eras/eras.json` que mudam o ano inicial, os nomes de
// ligas, copas e competições europeias, os pontos por vitória e o nível de gols do motor.
// O formato das competições (Champions de 36 clubes etc.) continua o atual; ver PLANO-FUNDO.md.

import type { EuropeTier } from '../competitions/europe';
import type { LeagueConfig } from '../domain/types';
import { DEFAULT_PARAMS, type EngineParams } from '../engine/matchEngine';
import type { WorldSeason } from '../competitions/world';
import { generateFictionalWorld, type GeneratedWorld } from './fictionalWorld';

export interface EraPack {
  id: string;
  name: string;
  /** Ano da primeira temporada. */
  year: number;
  description: string;
  /** Multiplica a média de gols do motor (μ de casa e de fora). 1 = atual. */
  goalScale: number;
  /** Pontos por vitória em todas as ligas (padrão 3). */
  pointsForWin?: number;
  /** Pontos por vitória por país (vence `pointsForWin`). */
  pointsByCountry?: Record<string, number>;
  /** Nome da liga, pelo id (ing1, esp2, bra1...). */
  leagueNames?: Record<string, string>;
  /** Nome da copa e da supercopa, pelo id da 1ª divisão do país. */
  cupNames?: Record<string, string>;
  supercupNames?: Record<string, string>;
  europeNames?: Partial<Record<EuropeTier, string>>;
}

/** O que a carreira guarda da era (o resto já foi aplicado ao mundo na criação). */
export interface EraRules {
  id: string;
  name: string;
  goalScale: number;
  europeNames?: Partial<Record<EuropeTier, string>>;
}

/** Problemas de um pacote (lista vazia = válido). */
export function validateEra(pack: EraPack): string[] {
  const out: string[] = [];
  if (!pack.id || !pack.name) out.push('id e nome são obrigatórios');
  if (!Number.isInteger(pack.year) || pack.year < 1900 || pack.year > 2100) out.push(`ano inválido: ${pack.year}`);
  if (!(pack.goalScale >= 0.7 && pack.goalScale <= 1.3)) out.push(`goalScale fora de 0,7–1,3: ${pack.goalScale}`);
  const pts = [pack.pointsForWin, ...Object.values(pack.pointsByCountry ?? {})].filter((x) => x !== undefined);
  if (pts.some((x) => x !== 2 && x !== 3)) out.push('pontos por vitória devem ser 2 ou 3');
  return out;
}

export function eraRules(pack: EraPack): EraRules {
  return { id: pack.id, name: pack.name, goalScale: pack.goalScale, ...(pack.europeNames ? { europeNames: pack.europeNames } : {}) };
}

/** Parâmetros do motor na era (sem era = os padrões calibrados). */
export function eraParams(era?: EraRules): EngineParams {
  if (!era || era.goalScale === 1) return DEFAULT_PARAMS;
  return { ...DEFAULT_PARAMS, muHome: DEFAULT_PARAMS.muHome * era.goalScale, muAway: DEFAULT_PARAMS.muAway * era.goalScale };
}

/** Aplica nomes e pontos da era a um mundo gerado (devolve cópia das ligas). */
export function applyEraToWorld(world: GeneratedWorld, pack: EraPack): GeneratedWorld {
  const leagues: LeagueConfig[] = world.leagues.map((l) => {
    const pts = pack.pointsByCountry?.[l.country] ?? pack.pointsForWin ?? l.pointsForWin;
    return {
      ...l,
      clubIds: l.clubIds.slice(),
      pointsForWin: pts,
      name: pack.leagueNames?.[l.id] ?? l.name,
      ...(l.cupName ? { cupName: pack.cupNames?.[l.id] ?? l.cupName } : {}),
      ...(l.supercupName ? { supercupName: pack.supercupNames?.[l.id] ?? l.supercupName } : {}),
    };
  });
  return { ...world, leagues };
}

/** Renomeia as competições europeias da temporada conforme a era. ALTERA `season`. */
export function applyEraToSeason(season: WorldSeason, era?: EraRules): void {
  if (!era?.europeNames) return;
  for (const [tier, name] of Object.entries(era.europeNames)) {
    const comp = season.competitions[tier];
    if (comp && name) season.competitions[tier] = { ...comp, name };
  }
}

/** Seed do mundo gerado (a mesma de `npm run gen:world`). */
export const WORLD_SEED = 2026;

/** Mundo fictício de uma era: o mesmo mundo, com o calendário no ano da era, nomes e pontos dela. */
export function eraWorld(pack: EraPack): GeneratedWorld {
  return applyEraToWorld(generateFictionalWorld(WORLD_SEED, pack.year), pack);
}
