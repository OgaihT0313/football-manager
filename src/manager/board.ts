// Diretoria: mandato da temporada pela força do elenco na liga, confiança projetada pela
// campanha (posição atual contra a meta, mais copas e Europa) e demissão.
// Ideia da referência (NBA GM, ownerService): confiança como projeção da campanha, que se
// corrige sozinha, em vez de somar deltas a cada jogo.

import type { CompetitionState, WorldSeason } from '../competitions/world';
import type { LeagueConfig } from '../domain/types';
import type { BoardState, Mandate } from './types';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const MANDATE_META: Record<Mandate, { label: string; note: string; fireLine: number }> = {
  titulo: { label: 'Título', note: 'Este elenco foi montado para ser campeão. A diretoria espera a taça.', fireLine: 32 },
  champions: { label: 'Vaga na Champions', note: 'Um dos melhores elencos do país: a diretoria quer a Champions na próxima temporada.', fireLine: 26 },
  europa: { label: 'Vaga europeia', note: 'A diretoria espera uma campanha que leve o clube à Europa.', fireLine: 20 },
  meio: { label: 'Meio da tabela', note: 'Temporada de estabilidade: terminar na metade de cima já agrada.', fireLine: 14 },
  permanencia: { label: 'Permanência', note: 'O objetivo é não cair. Paciência com os resultados, mas sem rebaixamento.', fireLine: 8 },
  acesso: { label: 'Acesso', note: 'O clube quer voltar à 1ª divisão já nesta temporada.', fireLine: 20 },
};

/**
 * Mandato e meta de posição pela força do elenco do usuário na liga dele (0 = mais forte).
 * `rank` vem da ordem de força no início da temporada.
 */
export function deriveMandate(rank: number, league: LeagueConfig, n: number): { mandate: Mandate; targetPosition: number } {
  if ((league.tier ?? 1) === 2) {
    const k = league.relegation ?? 3;
    return rank < k + 2 ? { mandate: 'acesso', targetPosition: Math.max(1, k) } : { mandate: 'meio', targetPosition: Math.ceil(n * 0.5) };
  }
  const ucl = league.continental?.ucl ?? 4;
  const europe = ucl + (league.continental?.uel ?? 1) + (league.continental?.uecl ?? 1) + 1;
  const relegation = league.relegation ?? 3;
  if (rank <= 1) return { mandate: 'titulo', targetPosition: 2 };
  if (rank < ucl + 1) return { mandate: 'champions', targetPosition: ucl };
  if (rank < europe + 1) return { mandate: 'europa', targetPosition: europe };
  if (rank < n - relegation - 3) return { mandate: 'meio', targetPosition: Math.ceil(n * 0.55) };
  return { mandate: 'permanencia', targetPosition: n - relegation };
}

/** Diretoria nova para a temporada (a confiança herda parte da anterior). */
export function newBoard(rank: number, league: LeagueConfig, n: number, prior?: BoardState): BoardState {
  const { mandate, targetPosition } = deriveMandate(rank, league, n);
  const start = prior ? Math.round(0.6 * 60 + 0.4 * prior.confidence) : 60;
  return { mandate, targetPosition, confidence: start, startConfidence: start, cupBonus: 0, note: MANDATE_META[mandate].note };
}

/** Pontos por posição acima (+) ou abaixo (−) da meta. */
const PER_POSITION = 6;

/**
 * Confiança projetada: começo da temporada até a 6ª rodada; depois, posição atual contra a meta
 * (cada posição vale ±6), mais o saldo de copas e Europa. Centrada em 60 quando está na meta.
 */
export function projectConfidence(board: BoardState, league: CompetitionState, clubId: string): number {
  const row = league.table.find((r) => r.clubId === clubId);
  const pos = league.table.findIndex((r) => r.clubId === clubId) + 1;
  if (!row || row.played < 6) return clamp(board.startConfidence + board.cupBonus, 0, 100);
  // Mistura a largada com a campanha conforme a temporada anda.
  const weight = Math.min(1, row.played / 20);
  const campaign = 60 + (board.targetPosition - pos) * PER_POSITION;
  return clamp(Math.round((1 - weight) * board.startConfidence + weight * campaign + board.cupBonus), 0, 100);
}

/** Saldo de copa por resultado: avançar em mata-mata ou ganhar na fase de liga europeia. */
export function cupResultBonus(kind: CompetitionState['kind'], won: boolean, eliminated: boolean, mandate: Mandate): number {
  if (kind === 'league') return 0;
  if (eliminated) return mandate === 'titulo' || mandate === 'champions' ? -4 : -1;
  return won ? (kind === 'europe' ? 1.5 : 1) : 0;
}

/** Demissão no meio da temporada: só a partir da metade e com a confiança no chão. */
export function shouldFireMidSeason(board: BoardState, marker: number): boolean {
  return marker >= 19 && board.confidence <= 12;
}

export interface SeasonReview {
  confidence: number;
  fired: boolean;
  message: string;
}

/** Julgamento do fim da temporada: posição final, títulos e linha de demissão do mandato. */
export function reviewSeason(board: BoardState, position: number, titles: string[], relegated: boolean): SeasonReview {
  let c = clamp(Math.round(60 + (board.targetPosition - position) * PER_POSITION + board.cupBonus), 0, 100);
  if (titles.length) c = clamp(c + 20 * titles.length, 0, 100);
  if (relegated) c = Math.min(c, 5);
  const fired = !titles.length && (relegated || c < MANDATE_META[board.mandate].fireLine);
  const meta = MANDATE_META[board.mandate];
  let message: string;
  if (titles.length) message = `Temporada vitoriosa (${titles.join(', ')}). A diretoria está encantada.`;
  else if (fired) message = `${position}º lugar, abaixo da meta (${meta.label}: até o ${board.targetPosition}º). A diretoria decidiu trocar de técnico.`;
  else if (position <= board.targetPosition) message = `Meta cumprida: ${position}º lugar (${meta.label}). A diretoria confia no trabalho.`;
  else message = `${position}º lugar, abaixo da meta (${board.targetPosition}º). A cadeira esquentou para a próxima temporada.`;
  return { confidence: c, fired, message };
}

export type ConfidenceZone = 'estavel' | 'pressionado' | 'demissao';

export function confidenceZone(c: number): ConfidenceZone {
  return c >= 50 ? 'estavel' : c >= 25 ? 'pressionado' : 'demissao';
}

export const ZONE_LABEL: Record<ConfidenceZone, string> = {
  estavel: 'Estável',
  pressionado: 'Pressionado',
  demissao: 'Beira da demissão',
};

/** Ranking de força (0 = mais forte) de um clube na sua liga. */
export function strengthRank(ws: WorldSeason, leagueId: string, clubId: string, ratingOf: (id: string) => number): { rank: number; n: number } {
  const ids = ws.competitions[leagueId]?.clubIds ?? [];
  const mine = ratingOf(clubId);
  return { rank: ids.filter((id) => id !== clubId && ratingOf(id) > mine).length, n: ids.length };
}
