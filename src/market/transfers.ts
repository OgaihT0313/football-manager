// Regras de negociação e execução de transferências, empréstimos, renovações e dispensas.
//
// Tudo opera sobre um MarketWorld mutável (cópia feita por quem chama). Jogadores e clubes
// são SUBSTITUÍDOS no mapa (nunca alterados por dentro), então copiar só os mapas basta.

import { MAX_DEBT_SHARE, spendableFee, wageRoom } from '../club/finance';
import type { SeasonState } from '../competitions/season';
import type { Club, Player, TransferRecord, TransferType } from '../domain/types';
import { autoLineup } from '../engine/lineup';
import { contractYearsRange, marketValue, wageDemand } from './valuation';

export const MIN_SQUAD = 18;
export const MAX_SQUAD = 30;
export const MIN_GOALKEEPERS = 2;

export interface MarketWorld {
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  season: SeasonState;
  transfers: TransferRecord[];
}

const round100 = (v: number) => Math.round(v / 100) * 100;
const round50k = (v: number) => Math.round(v / 50_000) * 50_000;

/** Jogadores do clube que hoje estariam no XI automático. */
export function startersOf(club: Club, players: Record<string, Player>): Set<string> {
  const pool = club.squad.map((id) => players[id]).filter((p): p is Player => !!p);
  return new Set(autoLineup(club.tactic.formation, pool).slots.map((s) => s.playerId));
}

/** Preço que o clube dono pede. Titular vale mais; clube no vermelho vende mais barato. */
export function askingPrice(p: Player, seller: Club, players: Record<string, Player>, season: number, starters?: Set<string>): number {
  let factor = 1.1;
  if ((starters ?? startersOf(seller, players)).has(p.id)) factor = 1.5;
  else if (seller.squad.length > MAX_SQUAD - 3 || p.age >= 31) factor = 0.85;
  if (seller.finance.balance < 0) factor *= 0.85;
  const ask = round50k(marketValue(p, season) * factor);
  return p.contract.releaseClause ? Math.min(ask, p.contract.releaseClause) : ask;
}

export type SellerAnswer = { kind: 'accept' } | { kind: 'counter'; fee: number } | { kind: 'reject'; reason: string };

export function sellerResponse(p: Player, seller: Club, players: Record<string, Player>, season: number, fee: number): SellerAnswer {
  if (p.contract.releaseClause && fee >= p.contract.releaseClause) return { kind: 'accept' };
  if (seller.squad.length <= MIN_SQUAD) return { kind: 'reject', reason: 'O clube não quer reduzir mais o elenco.' };
  if (p.positions[0] === 'GK' && goalkeepers(seller, players) <= MIN_GOALKEEPERS) {
    return { kind: 'reject', reason: 'O clube não tem outro goleiro para repor.' };
  }
  const ask = askingPrice(p, seller, players, season);
  if (fee >= ask) return { kind: 'accept' };
  if (fee >= ask * 0.7) return { kind: 'counter', fee: ask };
  return { kind: 'reject', reason: 'Proposta muito abaixo do valor.' };
}

function goalkeepers(club: Club, players: Record<string, Player>): number {
  return club.squad.filter((id) => players[id]?.positions[0] === 'GK').length;
}

/** Salário que o jogador exige para assinar com `toClub`. Clube de menor reputação paga ágio. */
export function wageAsk(p: Player, toClub: Club, fromClub: Club | null): number {
  const base = Math.max(wageDemand(p), p.clubId ? p.contract.wage : 0);
  const repGap = fromClub ? Math.max(0, fromClub.reputation - toClub.reputation) : 0;
  return round100(base * (1 + repGap * 0.012));
}

export type PlayerAnswer = { kind: 'accept' } | { kind: 'refuse'; wage: number; years: [number, number] };

export function playerResponse(p: Player, toClub: Club, fromClub: Club | null, wage: number, years: number): PlayerAnswer {
  const ask = wageAsk(p, toClub, fromClub);
  const range = contractYearsRange(p.age);
  if (wage >= ask && years >= range[0] && years <= range[1]) return { kind: 'accept' };
  return { kind: 'refuse', wage: ask, years: range };
}

export type AffordAnswer = { ok: true } | { ok: false; reason: string };

export function canAfford(buyer: Club, players: Record<string, Player>, fee: number, wage: number): AffordAnswer {
  if (fee > spendableFee(buyer)) return { ok: false, reason: 'Sem orçamento de transferências para essa taxa.' };
  if (wage > wageRoom(buyer, players)) return { ok: false, reason: 'O salário estoura o teto da folha.' };
  if (buyer.squad.length >= MAX_SQUAD) return { ok: false, reason: `Elenco cheio (máximo ${MAX_SQUAD}).` };
  return { ok: true };
}

function record(w: MarketWorld, p: Player, from: string | null, to: string | null, fee: number, wage: number, type: TransferType): void {
  w.transfers.push({
    year: w.season.year,
    round: w.season.nextRound,
    playerId: p.id,
    playerName: p.name,
    fromClubId: from,
    toClubId: to,
    fee,
    wage,
    type,
  });
}

function setClub(w: MarketWorld, club: Club): void {
  w.clubs[club.id] = club;
}

function removeFromClub(club: Club, playerId: string): Club {
  return {
    ...club,
    squad: club.squad.filter((id) => id !== playerId),
    // Vaga do XI fica vazia; a escalação preenche com o melhor reserva.
    startingXI: club.startingXI.map((id) => (id === playerId ? '' : id)),
  };
}

function addToClub(club: Club, playerId: string): Club {
  return club.squad.includes(playerId) ? club : { ...club, squad: [...club.squad, playerId] };
}

function moveMoney(w: MarketWorld, buyerId: string | null, sellerId: string | null, fee: number): void {
  if (fee <= 0) return;
  if (buyerId) {
    const b = w.clubs[buyerId]!;
    setClub(w, {
      ...b,
      budget: Math.max(0, b.budget - fee),
      finance: { ...b.finance, balance: b.finance.balance - fee, season: { ...b.finance.season, transfersIn: b.finance.season.transfersIn + fee } },
    });
  }
  if (sellerId) {
    const s = w.clubs[sellerId]!;
    // Metade do que entra com vendas volta para o orçamento de compras.
    setClub(w, {
      ...s,
      budget: s.budget + Math.round(fee * 0.5),
      finance: { ...s.finance, balance: s.finance.balance + fee, season: { ...s.finance.season, transfersOut: s.finance.season.transfersOut + fee } },
    });
  }
}

export interface DealTerms {
  fee: number;
  wage: number;
  years: number;
  releaseClause?: number;
}

/** Transferência definitiva (ou agente livre, se o jogador não tem clube). */
export function executeTransfer(w: MarketWorld, playerId: string, toClubId: string, terms: DealTerms, type?: TransferType): void {
  const p = w.players[playerId]!;
  const fromId = p.loan ? p.loan.parentClubId : p.clubId;
  if (p.clubId) setClub(w, removeFromClub(w.clubs[p.clubId]!, playerId));
  setClub(w, addToClub(w.clubs[toClubId]!, playerId));
  moveMoney(w, toClubId, fromId, terms.fee);
  const contract = { wage: terms.wage, expires: w.season.year + terms.years - 1, ...(terms.releaseClause ? { releaseClause: terms.releaseClause } : {}) };
  const { loan: _loan, ...rest } = p;
  w.players[playerId] = { ...rest, clubId: toClubId, contract, value: marketValue({ ...p, contract }, w.season.year) };
  record(w, p, fromId, toClubId, terms.fee, terms.wage, type ?? (fromId ? 'transfer' : 'free'));
}

/** Empréstimo até o fim da temporada. `wageShare` = parte do salário paga por quem recebe. */
export function executeLoan(w: MarketWorld, playerId: string, toClubId: string, wageShare: number): void {
  const p = w.players[playerId]!;
  const parentId = p.clubId!;
  setClub(w, removeFromClub(w.clubs[parentId]!, playerId));
  setClub(w, addToClub(w.clubs[toClubId]!, playerId));
  w.players[playerId] = { ...p, clubId: toClubId, loan: { parentClubId: parentId, until: w.season.year, wageShare } };
  record(w, p, parentId, toClubId, 0, round100(p.contract.wage * wageShare), 'loan');
}

/** Devolve um emprestado ao clube dono. */
export function returnLoan(w: MarketWorld, playerId: string): void {
  const p = w.players[playerId]!;
  if (!p.loan) return;
  const parentId = p.loan.parentClubId;
  if (p.clubId) setClub(w, removeFromClub(w.clubs[p.clubId]!, playerId));
  const { loan: _loan, ...rest } = p;
  if (w.clubs[parentId]) {
    setClub(w, addToClub(w.clubs[parentId]!, playerId));
    w.players[playerId] = { ...rest, clubId: parentId };
  } else {
    w.players[playerId] = { ...rest, clubId: null };
  }
  record(w, p, p.clubId, parentId, 0, p.contract.wage, 'loanReturn');
}

/** Multa por dispensar: metade dos salários que faltam até o fim do contrato. */
export function releaseCost(p: Player, season: number): number {
  const yearsLeft = Math.max(1, p.contract.expires - season + 1);
  return round100(p.contract.wage * 52 * yearsLeft * 0.5);
}

/** Dispensa: o clube paga a multa e o jogador vira agente livre. */
export function executeRelease(w: MarketWorld, playerId: string): void {
  const p = w.players[playerId]!;
  if (!p.clubId || p.loan) return;
  const club = w.clubs[p.clubId]!;
  const cost = releaseCost(p, w.season.year);
  setClub(w, {
    ...removeFromClub(club, playerId),
    finance: { ...club.finance, balance: club.finance.balance - cost, season: { ...club.finance.season, wages: club.finance.season.wages + cost } },
  });
  w.players[playerId] = { ...p, clubId: null };
  record(w, p, club.id, null, cost, 0, 'release');
}

/** Contrato que acabou: o jogador sai de graça (vira agente livre). */
export function expireContract(w: MarketWorld, playerId: string): void {
  const p = w.players[playerId]!;
  if (!p.clubId) return;
  setClub(w, removeFromClub(w.clubs[p.clubId]!, playerId));
  w.players[playerId] = { ...p, clubId: null };
  record(w, p, p.clubId, null, 0, 0, 'free');
}

/** Renovação: o jogador aceita se o salário cobre o que pede e a duração cabe na faixa. */
export function renewalResponse(p: Player, wage: number, years: number): PlayerAnswer {
  // Renovar não tem ágio de reputação; veterano aceita pequena redução.
  const ask = round100(Math.max(wageDemand(p), p.age >= 31 ? p.contract.wage * 0.9 : p.contract.wage));
  const range = contractYearsRange(p.age);
  if (wage >= ask && years >= range[0] && years <= range[1]) return { kind: 'accept' };
  return { kind: 'refuse', wage: ask, years: range };
}

export function executeRenewal(w: MarketWorld, playerId: string, wage: number, years: number, releaseClause?: number): void {
  const p = w.players[playerId]!;
  const contract = { wage, expires: w.season.year + years, ...(releaseClause ? { releaseClause } : {}) };
  w.players[playerId] = { ...p, contract, value: marketValue({ ...p, contract }, w.season.year) };
}

/** Sanidade do limite de gasto, usado nos checks. */
export function withinSpendingLimit(club: Club): boolean {
  return club.finance.balance >= -MAX_DEBT_SHARE * club.finance.revenueBase - 1;
}
