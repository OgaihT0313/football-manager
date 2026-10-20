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
