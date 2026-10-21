// Mercado de técnicos: clubes da IA demitem quando ficam muito abaixo do esperado e abrem vaga;
// o técnico do usuário assume vagas compatíveis com a reputação dele (o limite afrouxa com o
// tempo desempregado). Funções puras sobre listas; a carreira aplica.

import type { CompetitionState } from '../competitions/world';
import type { Club, LeagueConfig } from '../domain/types';
import { chance, type Rng } from '../engine/rng';
import type { ManagerState, Vacancy } from './types';

/** Quantas datas uma vaga fica aberta antes de a IA contratar alguém. */
export const VACANCY_SLOTS = 8;

/** Posição esperada de cada clube na liga: ordem da receita (o "tamanho" do clube). */
export function expectedPositions(comp: CompetitionState, clubs: Record<string, Club>): Record<string, number> {
  const order = comp.clubIds.slice().sort((a, b) => clubs[b]!.finance.revenueBase - clubs[a]!.finance.revenueBase);
  return Object.fromEntries(order.map((id, i) => [id, i + 1]));
}

/**
 * Demissões da IA numa data de fim de semana (a partir da 10ª rodada): clube na metade de baixo
 * e 4+ posições abaixo do esperado tem 6% de chance por semana de demitir.
 */
export function aiSackings(
  rng: Rng,
  leagues: CompetitionState[],
  clubs: Record<string, Club>,
  skip: Set<string>,
  open: Set<string>,
): string[] {
  const out: string[] = [];
  for (const comp of leagues) {
    const exp = expectedPositions(comp, clubs);
    const n = comp.table.length;
    comp.table.forEach((row, i) => {
      const id = row.clubId;
      if (skip.has(id) || open.has(id) || !clubs[id]?.squad.length) return;
      const pos = i + 1;
      if (pos > n / 2 && pos - (exp[id] ?? pos) >= 4 && chance(rng, 0.06)) out.push(id);
    });
  }
  return out;
}

/** Fim de temporada: quem terminou 6+ posições abaixo do esperado tem 50% de chance de demitir. */
export function seasonEndSackings(rng: Rng, leagues: CompetitionState[], clubs: Record<string, Club>, skip: Set<string>): string[] {
  const out: string[] = [];
  for (const comp of leagues) {
    const exp = expectedPositions(comp, clubs);
    comp.table.forEach((row, i) => {
      if (skip.has(row.clubId) || !clubs[row.clubId]?.squad.length) return;
      if (i + 1 - (exp[row.clubId] ?? i + 1) >= 6 && chance(rng, 0.5)) out.push(row.clubId);
    });
  }
  return out;
}

/** Até que reputação de clube o técnico consegue emprego (cresce com o tempo parado). */
export function reachFor(manager: ManagerState, slotsUnemployed: number): number {
  return manager.reputation + 8 + Math.floor(slotsUnemployed / 2) * 2;
}

/** Vagas abertas que o técnico pode assumir agora. */
export function availableJobs(
  vacancies: Vacancy[],
  clubs: Record<string, Club>,
  manager: ManagerState,
  currentClubId: string,
  slotsUnemployed: number,
): Vacancy[] {
  const reach = reachFor(manager, slotsUnemployed);
  const current = clubs[currentClubId];
  return vacancies.filter((v) => {
    const club = clubs[v.clubId];
    if (!club?.squad.length || v.clubId === currentClubId) return false;
    if (club.reputation > reach) return false;
    // Empregado só troca para um clube maior.
    return !manager.employed || !current || club.reputation > current.reputation;
  });
}

/** Mudança de reputação do técnico no fim da temporada. */
export function reputationDelta(targetPosition: number, position: number, titles: string[], championsTitle: boolean, promoted: boolean): number {
  let d = (targetPosition - position) * 0.8;
  d += titles.length * 4 + (championsTitle ? 8 : 0) + (promoted ? 4 : 0);
  return Math.max(-8, Math.min(15, d));
}

/** Liga (configuração) do clube. */
export function leagueOfClub(club: Club, leagues: Record<string, LeagueConfig>): LeagueConfig | undefined {
  return leagues[club.leagueId];
}
