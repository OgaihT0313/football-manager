// IA de mercado dos clubes: compra para cobrir a vaga mais fraca do XI, empresta jovens sem
// espaço, libera excedente, renova quem quer manter e faz propostas pelos jogadores do usuário.

import { wageRoom } from '../club/finance';
import { FORMATIONS } from '../domain/positions';
import type { Club, IncomingOffer, Player, Position } from '../domain/types';
import { autoLineup, slotRating, type Lineup } from '../engine/lineup';
import { chance, shuffle, type Rng } from '../engine/rng';
import { openWindow, windowLastRound } from '../market/calendar';
import {
  askingPrice, canAfford, executeLoan, executeRelease, executeRenewal, executeTransfer, MAX_SQUAD, MIN_GOALKEEPERS,
  releaseCost, renewalResponse, sellerResponse, startersOf, wageAsk, type MarketWorld,
} from '../market/transfers';
import { contractYearsRange } from '../market/valuation';

export interface MarketDayOptions {
  userClubId: string;
  /** true = a IA também cuida do clube do usuário (scripts de diagnóstico). */
  aiControlsUser: boolean;
  rng: Rng;
  /** Propostas novas pelos jogadores do usuário entram aqui. */
  inbox: IncomingOffer[];
}

/** Mínimo de ganho (no rendimento da vaga) para valer uma compra. */
const MIN_UPGRADE = 2;
const BUYS_PER_WINDOW = { verao: 5, inverno: 2 } as const;
/** Abaixo disso a IA contrata reposição mesmo sem ganho no XI. */
const DEPTH_TARGET = 22;
const ACT_CHANCE = { verao: 0.85, inverno: 0.6 } as const;

function isAI(clubId: string, opts: Pick<MarketDayOptions, 'userClubId' | 'aiControlsUser'>): boolean {
  return opts.aiControlsUser || clubId !== opts.userClubId;
}

function buysThisWindow(w: MarketWorld, clubId: string, firstRound: number): number {
  return w.transfers.filter(
    (t) => t.year === w.season.year && t.round >= firstRound && t.toClubId === clubId && (t.type === 'transfer' || t.type === 'free'),
  ).length;
}

/** Um dia de mercado (antes de uma rodada com janela aberta). ALTERA `w`. */
export function runMarketDay(w: MarketWorld, opts: MarketDayOptions): void {
  const window = openWindow(w.season);
  if (!window) return;
  const firstRound = window === 'verao' ? 1 : windowLastRound('inverno') - 2;
  // Escalação automática por clube no dia. Clubes são substituídos quando mudam (compra,
  // venda, empréstimo), então o cache por objeto se invalida sozinho.
  const lineups = new WeakMap<Club, Lineup>();
  const lineupOf = (club: Club): Lineup => {
    let l = lineups.get(club);
    if (!l) {
      l = autoLineup(club.tactic.formation, club.squad.map((id) => w.players[id]).filter((p): p is Player => !!p));
      lineups.set(club, l);
    }
    return l;
  };
  const startersFor = (club: Club) => new Set(lineupOf(club).slots.map((s) => s.playerId));

  for (const clubId of shuffle(opts.rng, Object.keys(w.clubs))) {
    // Clubes só com força (sem elenco) não entram no mercado.
    if (!w.clubs[clubId]!.squad.length || !isAI(clubId, opts) || !chance(opts.rng, ACT_CHANCE[window])) continue;
    trimSquad(w, clubId);
    if (window === 'verao') loanOutYoungster(w, clubId, startersFor, lineupOf);
    if (buysThisWindow(w, clubId, firstRound) < BUYS_PER_WINDOW[window]) {
      const depth = w.clubs[clubId]!.squad.length < DEPTH_TARGET;
      tryBuy(w, clubId, opts, startersFor, lineupOf, windowLastRound(window), depth);
    }
  }
}

/** Elenco inchado: dispensa o pior jogador se a multa for barata. */
function trimSquad(w: MarketWorld, clubId: string): void {
  const club = w.clubs[clubId]!;
  if (club.squad.length <= MAX_SQUAD - 2) return;
  const worst = club.squad
    .map((id) => w.players[id]!)
    .filter((p) => p && !p.loan && p.age > 21)
    .sort((a, b) => a.ovr - b.ovr)[0];
  if (worst && releaseCost(worst, w.season.year) < club.finance.revenueBase * 0.02) executeRelease(w, worst.id);
}

/** Jovem (≤ 21) sem espaço vai emprestado para um clube onde seria titular. */
function loanOutYoungster(w: MarketWorld, clubId: string, startersFor: (c: Club) => Set<string>, lineupOf: (c: Club) => Lineup): void {
  const club = w.clubs[clubId]!;
  if (club.squad.length <= 24) return;
  const starters = startersFor(club);
  const young = club.squad
    .map((id) => w.players[id]!)
    .filter((p) => p && !p.loan && p.age <= 21 && !starters.has(p.id))
    .sort((a, b) => b.potential - a.potential)[0];
  if (!young) return;
  const pos = young.positions[0] as Position;
  if (pos === 'GK' && club.squad.filter((id) => w.players[id]?.positions[0] === 'GK').length <= 2) return;
  for (const other of Object.values(w.clubs)) {
    if (other.id === clubId || !other.squad.length || other.squad.length >= MAX_SQUAD - 2) continue;
    if (young.contract.wage > wageRoom(other, w.players)) continue;
    const weakest = lineupOf(other).slots.filter((s) => s.pos === pos).sort((a, b) => a.rating - b.rating)[0];
    if (weakest && slotRating(young, pos) >= weakest.rating + 1) {
      executeLoan(w, young.id, other.id, 1);
      return;
    }
  }
}

/** Procura o maior reforço possível para a vaga mais fraca. Devolve os clubes que mudaram. */
function tryBuy(
  w: MarketWorld,
  clubId: string,
  opts: MarketDayOptions,
  startersFor: (c: Club) => Set<string>,
  lineupOf: (c: Club) => Lineup,
  lastRound: number,
  depth: boolean,
): string[] {
  const club = w.clubs[clubId]!;
  const pool = club.squad.map((id) => w.players[id]!).filter(Boolean);
  const lineup = lineupOf(club);
  const positions = FORMATIONS[club.tactic.formation];

  // Vaga alvo: a de menor rendimento; vaga vazia ou falta de goleiro reserva vêm antes.
  const gks = pool.filter((p) => p.positions[0] === 'GK').length;
  let targetPos: Position;
  let floor: number;
  if (lineup.slots.length < positions.length) {
    const count = (list: readonly Position[], pos: Position) => list.filter((x) => x === pos).length;
    const filled = lineup.slots.map((s) => s.pos);
    targetPos = positions.find((pos) => count(filled, pos) < count(positions, pos)) ?? 'CM';
    floor = 0;
  } else if (gks < 2) {
    targetPos = 'GK';
    floor = 0;
  } else if (depth) {
    // Reposição: a posição da formação com menos gente no elenco, nível de reserva.
    const count = (pos: Position) => pool.filter((p) => p.positions[0] === pos).length;
    targetPos = positions.slice(1).sort((a, b) => count(a) / positions.filter((x) => x === a).length - count(b) / positions.filter((x) => x === b).length)[0]!;
    const avg = lineup.slots.reduce((a, s) => a + s.rating, 0) / lineup.slots.length;
    floor = avg - 12;
  } else {
    const weakest = lineup.slots.slice().sort((a, b) => a.rating - b.rating)[0]!;
    targetPos = weakest.pos;
    floor = weakest.rating + MIN_UPGRADE;
  }
  if (club.squad.length >= MAX_SQUAD) return [];

  let best: { p: Player; fee: number; wage: number; gain: number } | null = null;
  for (const p of Object.values(w.players)) {
    if (p.clubId === clubId || p.loan || p.age > 32 || (depth && p.age < 21)) continue;
    // Pré-filtro barato: o rendimento numa vaga raramente passa o OVR por mais de alguns pontos.
    if (p.ovr + 6 < floor) continue;
    const r = slotRating({ ...p, fitness: 100 }, targetPos);
    if (r < floor) continue;
    const seller = p.clubId ? w.clubs[p.clubId] : undefined;
    if (p.clubId && !seller) continue;
    const fee = seller ? askingPrice(p, seller, w.players, w.season.year, startersFor(seller)) : 0;
    const wage = wageAsk(p, club, seller ?? null);
    if (!canAfford(club, w.players, fee, wage).ok) continue;
    const gain = r - floor;
    if (depth) {
      // Reposição: o mais barato que serve.
      const cost = fee + wage * 52;
      if (!best || cost < best.fee + best.wage * 52) best = { p, fee, wage, gain };
    } else if (!best || gain > best.gain + 1 || (gain >= best.gain - 1 && fee < best.fee)) {
      best = { p, fee, wage, gain };
    }
  }
  if (!best) return [];

  const { p, fee, wage } = best;
  const sellerId = p.clubId;
  // Jogador do usuário: vira proposta para ele decidir.
  if (sellerId && !isAI(sellerId, opts)) {
    const pending = opts.inbox.some((o) => o.playerId === p.id && o.fromClubId === clubId);
    if (!pending) {
      opts.inbox.push({
        id: `${w.season.year}-${w.season.nextSlot}-${clubId}-${p.id}`,
        playerId: p.id,
        fromClubId: clubId,
        fee,
        expiresRound: lastRound,
        year: w.season.year,
      });
    }
    return [];
  }
  if (sellerId && sellerResponse(p, w.clubs[sellerId]!, w.players, w.season.year, fee).kind !== 'accept') return [];
  const [minY, maxY] = contractYearsRange(p.age);
  executeTransfer(w, p.id, clubId, { fee, wage, years: Math.round((minY + maxY) / 2) });
  return sellerId ? [clubId, sellerId] : [clubId];
}

/**
 * Renovações da IA no fim da temporada: mantém quem está entre os 16 melhores do elenco e tem
 * até 32 anos, se couber na folha. Os outros saem de graça na virada.
 */
export function aiRenewals(w: MarketWorld, opts: Pick<MarketDayOptions, 'userClubId' | 'aiControlsUser'>): void {
  const year = w.season.year;
  for (const club of Object.values(w.clubs)) {
    if (!isAI(club.id, opts)) continue;
    const ranked = club.squad.map((id) => w.players[id]!).filter((p) => p && !p.loan).sort((a, b) => b.ovr - a.ovr);
    const level = ranked.slice(0, 11).reduce((a, p) => a + p.ovr, 0) / Math.max(1, Math.min(11, ranked.length));
    // "Titulares" por posição (XI automático) e os dois melhores goleiros sempre contam.
    const top11 = startersOf(club, w.players);
    for (const gk of ranked.filter((p) => p.positions[0] === 'GK').slice(0, 2)) top11.add(gk.id);
    const keep = new Set(ranked.slice(0, 20).map((p) => p.id));
    for (const p of ranked) {
      if (p.contract.expires !== year) continue;
      // Jovem promissor fica; veterano só se for titular.
      const promising = p.age <= 23 && p.potential >= level;
      // Jovem que não é promissor nem titular não é renovado (abre espaço no elenco).
      const stalled = p.age <= 23 && !promising && !top11.has(p.id);
      const wanted = !stalled && ((keep.has(p.id) && p.age <= 32) || (top11.has(p.id) && p.age <= 34) || promising);
      if (!wanted) continue;
      const [minY, maxY] = contractYearsRange(p.age + 1);
      const years = Math.round((minY + maxY) / 2);
      const answer = renewalResponse(p, 0, years);
      const wage = answer.kind === 'refuse' ? answer.wage : p.contract.wage;
      if (wage - p.contract.wage > wageRoom(w.clubs[club.id]!, w.players)) continue;
      executeRenewal(w, p.id, wage, years);
    }
    // Garante elenco mínimo para a próxima temporada renovando os melhores restantes.
    const staying = () => w.clubs[club.id]!.squad.filter((id) => (w.players[id]?.contract.expires ?? 0) > year && !w.players[id]?.loan).length;
    for (const p of ranked) {
      if (staying() >= RENEW_FLOOR) break;
      const cur = w.players[p.id]!;
      if (cur.contract.expires !== year || cur.age > 34) continue;
      const answer = renewalResponse(cur, 0, 1);
      const wage = answer.kind === 'refuse' ? answer.wage : cur.contract.wage;
      const club2 = w.clubs[club.id]!;
      if (wage - cur.contract.wage > wageRoom(club2, w.players) + club2.wageBudget * WAGE_SLACK) continue;
      executeRenewal(w, cur.id, wage, 1);
    }
  }
}

/** Elenco mínimo que a IA garante na virada (renovações + agentes livres). */
const RENEW_FLOOR = 22;
const EMERGENCY_FLOOR = 20;
/** Quanto do teto salarial a IA aceita ultrapassar para não ficar sem elenco. */
const WAGE_SLACK = 0.05;

/**
 * Clubes da IA abaixo do mínimo contratam agentes livres (o melhor custo-benefício), aceitando
 * passar um pouco do teto salarial. Usado na virada da temporada.
 */
export function fillSquadsWithFreeAgents(w: MarketWorld, opts: Pick<MarketDayOptions, 'userClubId' | 'aiControlsUser'>): void {
  for (const club of Object.values(w.clubs)) {
    if (!club.squad.length || !isAI(club.id, opts)) continue;
    while (w.clubs[club.id]!.squad.length < EMERGENCY_FLOOR) {
      const cur = w.clubs[club.id]!;
      const slack = wageRoom(cur, w.players) + cur.wageBudget * WAGE_SLACK;
      const pool = cur.squad.map((id) => w.players[id]!).filter(Boolean);
      const count = (pos: Position) => pool.filter((p) => p.positions[0] === pos).length;
      const positions = FORMATIONS[cur.tactic.formation];
      const need = positions.slice().sort((a, b) => count(a) - count(b))[0]!;
      const candidates = Object.values(w.players)
        .filter((p) => p.clubId === null && p.age >= 21 && p.age <= 33)
        .map((p) => ({ p, wage: wageAsk(p, cur, null), r: slotRating({ ...p, fitness: 100 }, need) }))
        .filter((x) => x.wage <= slack)
        .sort((a, b) => b.r / Math.sqrt(b.wage) - a.r / Math.sqrt(a.wage));
      const pick = candidates[0];
      if (!pick) break;
      const [minY, maxY] = contractYearsRange(pick.p.age);
      executeTransfer(w, pick.p.id, cur.id, { fee: 0, wage: pick.wage, years: Math.min(maxY, Math.max(minY, 2)) });
    }
  }
}

/**
 * Garante `min` goleiros disponíveis em cada clube da IA: agente livre se houver, senão sobe um
 * goleiro da base. Na virada usa 2; durante a temporada (contratação emergencial, permitida
 * fora da janela) usa 1, contando só quem não está lesionado ou suspenso.
 */
export function ensureGoalkeepers(
  w: MarketWorld,
  opts: Pick<MarketDayOptions, 'userClubId' | 'aiControlsUser'>,
  youthGk: (club: Club) => Player,
  min = MIN_GOALKEEPERS,
  isAvailable: (id: string) => boolean = () => true,
): void {
  for (const club of Object.values(w.clubs)) {
    if (!club.squad.length || !isAI(club.id, opts)) continue;
    let guard = 0;
    while (guard++ < 3) {
      const cur = w.clubs[club.id]!;
      const gks = cur.squad.filter((id) => w.players[id]?.positions[0] === 'GK' && isAvailable(id)).length;
      if (gks >= min) break;
      const slack = wageRoom(cur, w.players) + cur.wageBudget * WAGE_SLACK;
      const options = Object.values(w.players)
        .filter((p) => p.clubId === null && p.positions[0] === 'GK' && p.age <= 35)
        .map((p) => ({ p, wage: wageAsk(p, cur, null) }))
        .filter((x) => x.wage <= slack)
        .sort((a, b) => b.p.ovr - a.p.ovr);
      const pick = options[0];
      if (pick) {
        executeTransfer(w, pick.p.id, cur.id, { fee: 0, wage: pick.wage, years: 2 });
      } else {
        const kid = youthGk(cur);
        w.players[kid.id] = kid;
        w.clubs[cur.id] = { ...cur, squad: [...cur.squad, kid.id] };
      }
    }
  }
}
