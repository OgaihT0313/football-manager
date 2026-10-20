// Finanças dos clubes: receita, folha salarial, custos, orçamento da diretoria e limite de gasto.
//
// Modelo anual (receita-base R):
//   receitas  = 0,9·R ao longo das rodadas + premiação 0..0,2·R pela colocação (média 0,1·R)
//   salários  ≈ 0,6·R (teto da diretoria: 0,65·R)
//   operação  = 0,3·R (estrutura, staff, estádio)
// Sobra ~0,1·R por ano para um clube médio; transferências só movem dinheiro entre clubes.

import type { Club, ClubFinance, Level, Player, SeasonLedger } from '../domain/types';

export const WAGE_SHARE = 0.6;
export const WAGE_CAP_SHARE = 0.65;
export const OPERATING_SHARE = 0.3;
export const ROUND_INCOME_SHARE = 0.9;
export const PRIZE_SHARE = 0.2;
/** Limite de gasto: o caixa não pode ficar abaixo de -15% da receita-base por compras. */
export const MAX_DEBT_SHARE = 0.15;

export function emptyLedger(): SeasonLedger {
  return { income: 0, prizes: 0, wages: 0, operating: 0, transfersIn: 0, transfersOut: 0 };
}

/** Custo salarial semanal de um clube, considerando empréstimos nos dois sentidos. */
export function weeklyWageBill(clubId: string, players: Record<string, Player>): number {
  let total = 0;
  for (const p of Object.values(players)) {
    if (p.clubId === clubId) total += p.loan ? p.contract.wage * p.loan.wageShare : p.contract.wage;
    else if (p.loan?.parentClubId === clubId) total += p.contract.wage * (1 - p.loan.wageShare);
  }
  return total;
}

export function trainingFromReputation(rep: number): Level {
  if (rep >= 80) return 5;
  if (rep >= 65) return 4;
  if (rep >= 45) return 3;
  if (rep >= 30) return 2;
  return 1;
}

/** Cria as finanças iniciais a partir da folha atual (a receita sustenta a folha a 60%). */
export function initFinance(club: Omit<Club, 'finance' | 'training'> & Partial<Pick<Club, 'finance' | 'training'>>, players: Record<string, Player>): Club {
  const bill = weeklyWageBill(club.id, players);
  const revenueBase = Math.max(5_000_000, Math.round((bill * 52) / WAGE_SHARE / 100_000) * 100_000);
  const finance: ClubFinance = club.finance ?? { balance: Math.round(revenueBase * 0.4), revenueBase, season: emptyLedger() };
  const full: Club = { ...club, finance, training: club.training ?? trainingFromReputation(club.reputation) };
  return setBoardBudgets(full);
}

/** Diretoria define orçamento de transferências e teto salarial para a temporada. */
export function setBoardBudgets(club: Club): Club {
  const R = club.finance.revenueBase;
  // Caixa sobrando (acima de 30% da receita) libera até 10 pontos a mais de folha.
  const cash = club.finance.balance / R;
  const share = WAGE_CAP_SHARE + Math.max(0, Math.min(0.1, (cash - 0.3) * 0.1));
  const wageBudget = Math.round((R * share) / 52 / 100) * 100;
  // 60% do caixa, limitado a 60% da receita; caixa negativo = sem orçamento.
  const budget = Math.max(0, Math.round(Math.min(club.finance.balance * 0.6, R * 0.6) / 50_000) * 50_000);
  return { ...club, wageBudget, budget };
}

/** Quanto o clube ainda pode gastar em taxa de transferência agora. */
export function spendableFee(club: Club): number {
  const debtFloor = -MAX_DEBT_SHARE * club.finance.revenueBase;
  return Math.max(0, Math.min(club.budget, club.finance.balance - debtFloor));
}

/** Folga semanal no teto salarial. */
export function wageRoom(club: Club, players: Record<string, Player>): number {
  return club.wageBudget - weeklyWageBill(club.id, players);
}

/** Receitas e despesas de uma rodada. ALTERA `club.finance`. */
export function settleRound(club: Club, players: Record<string, Player>, totalRounds: number): void {
  const R = club.finance.revenueBase;
  const income = (R * ROUND_INCOME_SHARE) / totalRounds;
  const wages = (weeklyWageBill(club.id, players) * 52) / totalRounds;
  const operating = (R * OPERATING_SHARE) / totalRounds;
  const f = club.finance;
  f.balance += income - wages - operating;
  f.season.income += income;
  f.season.wages += wages;
  f.season.operating += operating;
}

/**
 * Fim de temporada: premiação pela colocação, ajuste da receita-base e da reputação conforme o
 * desempenho em relação ao esperado (posição pela receita). Devolve o clube novo.
 */
export function closeSeasonFinance(club: Club, position: number, expectedPosition: number, nClubs: number): Club {
  const R = club.finance.revenueBase;
  const merit = (nClubs - position) / (nClubs - 1);
  const prizes = R * PRIZE_SHARE * merit;
  const delta = expectedPosition - position;
  const growth = Math.max(-0.06, Math.min(0.06, delta * 0.006));
  const reputation = Math.max(1, Math.min(100, Math.round(club.reputation + Math.max(-4, Math.min(4, delta * 0.6)))));
  return {
    ...club,
    reputation,
    finance: {
      balance: club.finance.balance + prizes,
      revenueBase: Math.round((R * (1 + growth)) / 100_000) * 100_000,
      season: { ...club.finance.season, prizes: club.finance.season.prizes + prizes },
    },
  };
}
