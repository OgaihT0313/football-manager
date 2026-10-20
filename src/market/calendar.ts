// Calendário do mercado em rodadas (a temporada não tem datas, só rodadas).
//   verão:   pré-temporada até antes da rodada 3 (fecha ~fim de agosto)
//   inverno: antes das rodadas 20 a 22 (janeiro)
//   pré-contrato: a partir do inverno, para quem tem contrato terminando nesta temporada

import { isSeasonOver, type SeasonState } from '../competitions/season';

export type TransferWindow = 'verao' | 'inverno';

export const SUMMER_LAST_ROUND = 3;
export const WINTER_FIRST_ROUND = 20;
export const WINTER_LAST_ROUND = 22;

/** Janela aberta antes da próxima rodada a jogar, ou null. */
export function openWindow(s: SeasonState): TransferWindow | null {
  if (isSeasonOver(s)) return null;
  if (s.nextRound <= SUMMER_LAST_ROUND) return 'verao';
  if (s.nextRound >= WINTER_FIRST_ROUND && s.nextRound <= WINTER_LAST_ROUND) return 'inverno';
  return null;
}

/** Última rodada antes da qual a janela atual ainda está aberta. */
export function windowLastRound(w: TransferWindow): number {
  return w === 'verao' ? SUMMER_LAST_ROUND : WINTER_LAST_ROUND;
}

/** Texto curto para a interface. */
export function windowLabel(s: SeasonState): string {
  const w = openWindow(s);
  if (w === 'verao') return `Janela de verão aberta até a rodada ${SUMMER_LAST_ROUND}`;
  if (w === 'inverno') return `Janela de inverno aberta até a rodada ${WINTER_LAST_ROUND}`;
  if (isSeasonOver(s)) return 'Janela de verão abre na próxima temporada';
  if (s.nextRound < WINTER_FIRST_ROUND) return `Janela fechada; inverno abre na rodada ${WINTER_FIRST_ROUND}`;
  return 'Janela fechada até a próxima temporada';
}

/** Pré-contratos: do inverno até a virada da temporada. */
export function preContractsOpen(s: SeasonState): boolean {
  return isSeasonOver(s) || s.nextRound >= WINTER_FIRST_ROUND;
}
