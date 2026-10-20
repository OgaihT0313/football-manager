// Calendário do mercado pela "jornada" de cada data (rodada de liga de referência, 1-38).
//   verão:   pré-temporada até antes da jornada 3 (fecha ~fim de agosto)
//   inverno: antes das jornadas 20 a 22 (janeiro)
//   pré-contrato: a partir do inverno, para quem tem contrato terminando nesta temporada

import { isWorldSeasonOver, type WorldSeason } from '../competitions/world';

export type TransferWindow = 'verao' | 'inverno';

export const SUMMER_LAST_ROUND = 3;
export const WINTER_FIRST_ROUND = 20;
export const WINTER_LAST_ROUND = 22;

/** Jornada da próxima data (39 = temporada encerrada). */
export function currentMarker(s: WorldSeason): number {
  return s.slots[s.nextSlot]?.marker ?? 39;
}

/** Janela aberta antes da próxima data, ou null. */
export function openWindow(s: WorldSeason): TransferWindow | null {
  if (isWorldSeasonOver(s)) return null;
  const m = currentMarker(s);
  if (m <= SUMMER_LAST_ROUND) return 'verao';
  if (m >= WINTER_FIRST_ROUND && m <= WINTER_LAST_ROUND) return 'inverno';
  return null;
}

/** Última jornada antes da qual a janela ainda está aberta. */
export function windowLastRound(w: TransferWindow): number {
  return w === 'verao' ? SUMMER_LAST_ROUND : WINTER_LAST_ROUND;
}

/** Texto curto para a interface. */
export function windowLabel(s: WorldSeason): string {
  const w = openWindow(s);
  if (w === 'verao') return `Janela de verão aberta até a rodada ${SUMMER_LAST_ROUND}`;
  if (w === 'inverno') return `Janela de inverno aberta até a rodada ${WINTER_LAST_ROUND}`;
  if (isWorldSeasonOver(s)) return 'Janela de verão abre na próxima temporada';
  if (currentMarker(s) < WINTER_FIRST_ROUND) return `Janela fechada; inverno abre na rodada ${WINTER_FIRST_ROUND}`;
  return 'Janela fechada até a próxima temporada';
}

/** Pré-contratos: do inverno até a virada da temporada. */
export function preContractsOpen(s: WorldSeason): boolean {
  return isWorldSeasonOver(s) || currentMarker(s) >= WINTER_FIRST_ROUND;
}
