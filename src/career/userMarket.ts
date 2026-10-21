// Ações de mercado do usuário. Cada uma devolve a carreira nova (ou a mesma, se nada mudou) e
// um resultado para a interface explicar o que aconteceu.

import { wageRoom } from '../club/finance';
import type { Club, Player, Position } from '../domain/types';
import { autoLineup, slotRating } from '../engine/lineup';
import { openWindow, preContractsOpen } from '../market/calendar';
import {
  canAfford, executeLoan, executeRelease, executeRenewal, executeTransfer, MAX_SQUAD, MIN_SQUAD, playerResponse,
  renewalResponse, sellerResponse, startersOf, wageAsk,
} from '../market/transfers';
import { cloneForStep, marketWorld, type CareerState } from './career';

export type MarketResult =
  | { ok: true; message: string }
  | { ok: false; message: string; counterFee?: number; wage?: number; years?: [number, number] };

type Outcome = { career: CareerState; result: MarketResult };

const fail = (career: CareerState, message: string, extra: Partial<Extract<MarketResult, { ok: false }>> = {}): Outcome => ({
  career,
  result: { ok: false, message, ...extra },
});

function userClub(c: CareerState): Club {
  return c.clubs[c.userClubId]!;
}

/** Proposta de compra (ou contratação de agente livre, com taxa 0). */
export function bidForPlayer(c: CareerState, playerId: string, fee: number, wage: number, years: number, releaseClause?: number): Outcome {
  const p = c.players[playerId];
  if (!p) return fail(c, 'Jogador não encontrado.');
  if (p.clubId === c.userClubId) return fail(c, 'O jogador já é seu.');
  if (!openWindow(c.season)) return fail(c, 'A janela de transferências está fechada.');
  if (p.loan) return fail(c, 'O jogador está emprestado; negocie quando ele voltar.');
  const buyer = userClub(c);
  const seller = p.clubId ? c.clubs[p.clubId]! : null;
  const afford = canAfford(buyer, c.players, fee, wage);
  if (!afford.ok) return fail(c, afford.reason);
  if (seller) {
    const answer = sellerResponse(p, seller, c.players, c.season.year, fee);
    if (answer.kind === 'counter') return fail(c, `${seller.name} pede ${answer.fee}.`, { counterFee: answer.fee });
    if (answer.kind === 'reject') return fail(c, answer.reason);
  }
  const pAnswer = playerResponse(p, buyer, seller, wage, years);
  if (pAnswer.kind === 'refuse') {
    return fail(c, 'O jogador não aceitou os termos pessoais.', { wage: pAnswer.wage, years: pAnswer.years });
  }
  const next = cloneForStep(c);
  executeTransfer(marketWorld(next), playerId, c.userClubId, { fee, wage, years, releaseClause });
  return { career: next, result: { ok: true, message: `${p.name} é reforço do ${buyer.name}!` } };
}

/** Pedido de empréstimo até o fim da temporada. O dono só libera quem não é titular. */
export function requestLoan(c: CareerState, playerId: string, wageShare: number): Outcome {
  const p = c.players[playerId];
  if (!p || !p.clubId || p.clubId === c.userClubId) return fail(c, 'Jogador indisponível para empréstimo.');
  if (!openWindow(c.season)) return fail(c, 'A janela de transferências está fechada.');
  if (p.loan) return fail(c, 'O jogador já está emprestado.');
  const owner = c.clubs[p.clubId]!;
  const buyer = userClub(c);
  if (startersOf(owner, c.players).has(p.id)) return fail(c, `${owner.name} não empresta titulares.`);
  if (owner.squad.length <= MIN_SQUAD) return fail(c, `${owner.name} não quer reduzir o elenco.`);
  if (wageShare < 0.5) return fail(c, 'O clube dono quer que você pague pelo menos metade do salário.');
  if (buyer.squad.length >= MAX_SQUAD) return fail(c, `Elenco cheio (máximo ${MAX_SQUAD}).`);
  if (p.contract.wage * wageShare > wageRoom(buyer, c.players)) return fail(c, 'A parte do salário estoura o teto da folha.');
  const next = cloneForStep(c);
  executeLoan(marketWorld(next), playerId, c.userClubId, wageShare);
  return { career: next, result: { ok: true, message: `${p.name} chega emprestado até o fim da temporada.` } };
}

/** Pré-contrato com quem tem contrato terminando nesta temporada em outro clube. */
export function signPreContract(c: CareerState, playerId: string, wage: number, years: number): Outcome {
  const p = c.players[playerId];
  if (!p || !p.clubId || p.clubId === c.userClubId) return fail(c, 'Jogador indisponível.');
  if (!preContractsOpen(c.season)) return fail(c, 'Pré-contratos só a partir da janela de inverno.');
  if (p.loan) return fail(c, 'O jogador está emprestado.');
  if (p.contract.expires !== c.season.year) return fail(c, 'O contrato dele não termina nesta temporada.');
  if (c.preContracts.some((x) => x.playerId === playerId)) return fail(c, 'Pré-contrato já assinado.');
  const buyer = userClub(c);
  const committed = c.preContracts.reduce((a, x) => a + x.wage, 0);
  if (wage + committed > wageRoom(buyer, c.players) + expiringWages(c)) return fail(c, 'O salário não cabe na folha da próxima temporada.');
  const answer = playerResponse(p, buyer, c.clubs[p.clubId] ?? null, wage, years);
  if (answer.kind === 'refuse') return fail(c, 'O jogador não aceitou os termos.', { wage: answer.wage, years: answer.years });
  return {
    career: { ...c, preContracts: [...c.preContracts, { playerId, toClubId: c.userClubId, wage, years }] },
    result: { ok: true, message: `${p.name} assinou pré-contrato e chega na próxima temporada.` },
  };
}

/** Salários do usuário que saem no fim da temporada (contratos terminando sem renovação). */
function expiringWages(c: CareerState): number {
  return userClub(c)
    .squad.map((id) => c.players[id]!)
    .filter((p) => p && !p.loan && p.contract.expires === c.season.year)
    .reduce((a, p) => a + p.contract.wage, 0);
}

export function renewPlayer(c: CareerState, playerId: string, wage: number, years: number, releaseClause?: number): Outcome {
  const p = c.players[playerId];
  if (!p || p.clubId !== c.userClubId || p.loan) return fail(c, 'Só dá para renovar com jogadores do seu elenco.');
  const answer = renewalResponse(p, wage, years);
  if (answer.kind === 'refuse') return fail(c, `${p.name} pede mais.`, { wage: answer.wage, years: answer.years });
  if (wage - p.contract.wage > wageRoom(userClub(c), c.players)) return fail(c, 'O aumento estoura o teto da folha.');
  const next = cloneForStep(c);
  executeRenewal(marketWorld(next), playerId, wage, years, releaseClause);
  return { career: next, result: { ok: true, message: `${p.name} renovou até ${c.season.year + years}.` } };
}

export function releasePlayer(c: CareerState, playerId: string): Outcome {
  const p = c.players[playerId];
  if (!p || p.clubId !== c.userClubId || p.loan) return fail(c, 'Jogador não é do seu elenco.');
  if (userClub(c).squad.length <= MIN_SQUAD) return fail(c, `O elenco não pode ficar com menos de ${MIN_SQUAD}.`);
  const next = cloneForStep(c);
  executeRelease(marketWorld(next), playerId);
  return { career: next, result: { ok: true, message: `${p.name} foi dispensado.` } };
}

/** Empresta um jogador do usuário para o clube onde ele teria mais chance de jogar. */
export function loanOut(c: CareerState, playerId: string): Outcome {
  const p = c.players[playerId];
  if (!p || p.clubId !== c.userClubId || p.loan) return fail(c, 'Jogador não é do seu elenco.');
  if (!openWindow(c.season)) return fail(c, 'A janela de transferências está fechada.');
  if (userClub(c).squad.length <= MIN_SQUAD) return fail(c, `O elenco não pode ficar com menos de ${MIN_SQUAD}.`);
  const pos = p.positions[0] as Position;
  let best: { club: Club; gain: number } | null = null;
  for (const club of Object.values(c.clubs)) {
    if (club.id === c.userClubId || !club.squad.length || club.squad.length >= MAX_SQUAD - 1 || p.contract.wage > wageRoom(club, c.players)) continue;
    const pool = club.squad.map((id) => c.players[id]!).filter(Boolean);
    const weakest = autoLineup(club.tactic.formation, pool).slots.filter((s) => s.pos === pos).sort((a, b) => a.rating - b.rating)[0];
    if (!weakest) continue;
    const gain = slotRating(p, pos) - weakest.rating;
    if (gain > 0 && (!best || gain > best.gain)) best = { club, gain };
  }
  if (!best) return fail(c, 'Nenhum clube quer o jogador emprestado agora.');
  const next = cloneForStep(c);
  executeLoan(marketWorld(next), playerId, best.club.id, 1);
  return { career: next, result: { ok: true, message: `${p.name} foi emprestado ao ${best.club.name} até o fim da temporada.` } };
}

/** Aceita ou recusa uma proposta recebida. */
export function answerOffer(c: CareerState, offerId: string, accept: boolean): Outcome {
  const offer = c.inbox.find((o) => o.id === offerId);
  if (!offer) return fail(c, 'Proposta não encontrada.');
  const rest = c.inbox.filter((o) => o.id !== offerId);
  if (!accept) return { career: { ...c, inbox: rest }, result: { ok: true, message: 'Proposta recusada.' } };
  const p = c.players[offer.playerId];
  const buyer = c.clubs[offer.fromClubId];
  if (!p || p.clubId !== c.userClubId || !buyer) return fail({ ...c, inbox: rest }, 'A proposta não vale mais.');
  if (!openWindow(c.season)) return fail({ ...c, inbox: rest }, 'A janela fechou.');
  if (userClub(c).squad.length <= MIN_SQUAD) return fail(c, `O elenco não pode ficar com menos de ${MIN_SQUAD}.`);
  const wage = wageAsk(p, buyer, userClub(c));
  if (!canAfford(buyer, c.players, offer.fee, wage).ok) return fail({ ...c, inbox: rest }, `${buyer.name} não tem mais como pagar.`);
  const next = cloneForStep({ ...c, inbox: rest });
  executeTransfer(marketWorld(next), p.id, buyer.id, { fee: offer.fee, wage, years: 3 });
  return { career: next, result: { ok: true, message: `${p.name} vendido ao ${buyer.name}.` } };
}

/** Jogadores que o usuário pode procurar no mercado (outros clubes e agentes livres). */
export function marketPool(c: CareerState): Player[] {
  // Prospectos que outro olheiro achou ficam escondidos; os nossos aparecem.
  return Object.values(c.players).filter((p) => p.clubId !== c.userClubId && (!p.scoutedFor || p.scoutedFor === c.userClubId));
}

