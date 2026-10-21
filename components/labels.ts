// Rótulos em português para dados do domínio.

import type { Position } from '../src/domain/types';

export const POS_LABEL: Record<Position, string> = {
  GK: 'GOL', CB: 'ZAG', LB: 'LE', RB: 'LD', DM: 'VOL', CM: 'MC', AM: 'MEI', LW: 'PE', RW: 'PD', ST: 'ATA',
};

export const POS_ORDER: Record<Position, number> = {
  GK: 0, CB: 1, LB: 2, RB: 3, DM: 4, CM: 5, AM: 6, LW: 7, RW: 8, ST: 9,
};

export const LEVEL_LABEL = {
  pressing: ['Muito baixa', 'Baixa', 'Média', 'Alta', 'Muito alta'],
  lineHeight: ['Muito recuada', 'Recuada', 'Média', 'Alta', 'Muito alta'],
  tempo: ['Muito lento', 'Lento', 'Normal', 'Rápido', 'Muito rápido'],
} as const;

export function formatMoney(v: number): string {
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}€ ${(a / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (a >= 1_000) return `${sign}€ ${Math.round(a / 1_000)} mil`;
  return `${sign}€ ${Math.round(a)}`;
}

/** Salário semanal. */
export function formatWage(v: number): string {
  return `${formatMoney(v)}/sem`;
}

export function formatDate(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/**
 * Data de exibição de uma data do calendário. O domínio só tem rodadas (fins de semana) e meios
 * de semana; aqui a rodada 1 é o 2º sábado de agosto, cada rodada é uma semana e o meio de
 * semana é a quarta-feira anterior. Só para a interface.
 */
export function slotDate(year: number, slot: { kind: 'fds' | 'meio'; marker: number } | undefined): string {
  if (!slot) return `FIM DA TEMPORADA ${year}`;
  const aug1 = new Date(Date.UTC(year, 7, 1));
  const firstSat = 1 + ((6 - aug1.getUTCDay() + 7) % 7);
  const day = firstSat + 7 + (slot.marker - 1) * 7 - (slot.kind === 'meio' ? 3 : 0);
  const d = new Date(Date.UTC(year, 7, day));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export type PosGroup = 'Todos' | 'GOL' | 'DEF' | 'MEI' | 'ATA';
export const POS_GROUPS: readonly PosGroup[] = ['Todos', 'GOL', 'DEF', 'MEI', 'ATA'];
export const POS_GROUP: Record<Position, Exclude<PosGroup, 'Todos'>> = {
  GK: 'GOL', CB: 'DEF', LB: 'DEF', RB: 'DEF', DM: 'MEI', CM: 'MEI', AM: 'MEI', LW: 'ATA', RW: 'ATA', ST: 'ATA',
};
