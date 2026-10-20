// Estado de uma carreira (o que vai para o save) e as ações sobre ele.
// Todas as funções devolvem um estado novo e não alteram o recebido (o store depende disso).

import { aiRenewals, ensureGoalkeepers, fillSquadsWithFreeAgents, runMarketDay } from '../ai/transferAI';
import { developPlayer, shouldRetire, youthIntake } from '../club/development';
import { closeSeasonFinance, emptyLedger, setBoardBudgets, settleRound } from '../club/finance';
import { createSeason, isAvailableIn, isSeasonOver, playRound, type SeasonState, type World } from '../competitions/season';
import { FORMATIONS } from '../domain/positions';
import type {
  Club, Formation, IncomingOffer, LeagueConfig, MatchResult, Player, PreContract, Tactic, TransferRecord,
} from '../domain/types';
import { chooseLineup, type Lineup } from '../engine/lineup';
import { createRng, deriveSeed } from '../engine/rng';
import { openWindow } from '../market/calendar';
import { executeTransfer, expireContract, MAX_SQUAD, returnLoan, type MarketWorld } from '../market/transfers';

export interface SeasonSummary {
  year: number;
  championId: string;
  userPosition: number;
  userPoints: number;
}

export interface CareerState {
  /** Versão do formato. Ver src/save/saveService.ts. */
  saveVersion: number;
  seed: number;
  userClubId: string;
  league: LeagueConfig;
  clubs: Record<string, Club>;
  /** Todos os jogadores, inclusive agentes livres (`clubId: null`). */
  players: Record<string, Player>;
  season: SeasonState;
  history: SeasonSummary[];
  /** Transferências, empréstimos e dispensas (temporada atual e anteriores). */
  transfers: TransferRecord[];
  /** Propostas da IA pelos jogadores do usuário. */
  inbox: IncomingOffer[];
  /** Pré-contratos do usuário, executados na virada da temporada. */
  preContracts: PreContract[];
}

export const CURRENT_SAVE_VERSION = 2;

/** Quantas temporadas de transferências o save guarda. */
const TRANSFER_HISTORY_SEASONS = 3;
/** Tamanho máximo do grupo de agentes livres (os piores são descartados). */
const FREE_AGENT_POOL = 120;

export interface StepOptions {
  /** true = a IA também cuida do clube do usuário (diagnóstico de várias temporadas). */
  aiControlsUser?: boolean;
}

export interface NewCareerInput {
  league: LeagueConfig;
  clubs: Club[];
  players: Player[];
  userClubId: string;
  seed: number;
  year: number;
}

export function newCareer(input: NewCareerInput): CareerState {
  const clubs: Record<string, Club> = {};
  for (const c of input.clubs) if (input.league.clubIds.includes(c.id)) clubs[c.id] = { ...c, startingXI: [] };
  if (!clubs[input.userClubId]) throw new Error(`Clube ${input.userClubId} não está na liga ${input.league.id}`);
  const players: Record<string, Player> = {};
  for (const p of input.players) players[p.id] = { ...p, fitness: 100, morale: p.morale ?? 50 };
  const world: World = { league: input.league, clubs, players };
  const season = createSeason(world, input.year, deriveSeed(input.seed, 'temporada', input.year));
  const career: CareerState = {
    saveVersion: CURRENT_SAVE_VERSION,
    seed: input.seed,
    userClubId: input.userClubId,
    league: input.league,
    clubs,
    players,
    season,
    history: [],
    transfers: [],
    inbox: [],
    preContracts: [],
  };
  // O usuário começa com a escalação automática fixada, para poder editá-la vaga a vaga.
  return autoPickUserXI(career);
}

/** Cópia de tudo que um passo de rodada altera (jogadores, clubes, temporada, listas). */
export function cloneForStep(c: CareerState): CareerState {
  const players: Record<string, Player> = {};
  for (const [id, p] of Object.entries(c.players)) players[id] = { ...p };
  const clubs: Record<string, Club> = {};
  for (const [id, cl] of Object.entries(c.clubs)) {
    clubs[id] = { ...cl, finance: { ...cl.finance, season: { ...cl.finance.season } } };
  }
  const status: SeasonState['status'] = {};
  for (const [id, st] of Object.entries(c.season.status)) status[id] = { ...st };
  return {
    ...c,
    players,
    clubs,
    season: { ...c.season, results: c.season.results.slice(), status },
    transfers: c.transfers.slice(),
    inbox: c.inbox.slice(),
    preContracts: c.preContracts.slice(),
  };
}

export function marketWorld(c: CareerState): MarketWorld {
  return { clubs: c.clubs, players: c.players, season: c.season, transfers: c.transfers };
}

/** Mercado (se a janela estiver aberta), rodada e finanças. ALTERA `c` (use uma cópia). */
function stepRound(c: CareerState, opts: StepOptions): MatchResult[] {
  const s = c.season;
  c.inbox = c.inbox.filter((o) => o.year === s.year && o.expiresRound >= s.nextRound && c.players[o.playerId]?.clubId === c.userClubId);
  if (openWindow(s)) {
    runMarketDay(marketWorld(c), {
      userClubId: c.userClubId,
      aiControlsUser: !!opts.aiControlsUser,
      rng: createRng(deriveSeed(c.seed, 'mercado', s.year, s.nextRound)),
      inbox: c.inbox,
    });
  }
  // Sem nenhum goleiro disponível, a IA contrata um de emergência (fora da janela também).
  ensureGoalkeepers(marketWorld(c), { userClubId: c.userClubId, aiControlsUser: !!opts.aiControlsUser }, youthGkFor(c, s.year), 1, isAvailableIn(s));
  const results = playRound({ league: c.league, clubs: c.clubs, players: c.players }, s);
  for (const id of c.league.clubIds) settleRound(c.clubs[id]!, c.players, s.totalRounds);
  if (isSeasonOver(s)) closeSeason(c, opts);
  return results;
}

/** Joga a próxima rodada. Devolve o estado novo e os resultados da rodada. */
export function advanceRound(c: CareerState, opts: StepOptions = {}): { career: CareerState; results: MatchResult[] } {
  if (isSeasonOver(c.season)) return { career: c, results: [] };
  const next = cloneForStep(c);
  const results = stepRound(next, opts);
  return { career: next, results };
}

/** Joga até o fim da temporada (ou até `untilRound`, inclusive). */
export function simulateRounds(c: CareerState, untilRound = Infinity, opts: StepOptions = {}): CareerState {
  if (isSeasonOver(c.season)) return c;
  const next = cloneForStep(c);
  while (!isSeasonOver(next.season) && next.season.nextRound <= untilRound) stepRound(next, opts);
  return next;
}

/** Fim de temporada: renovações da IA, premiação, receita/reputação e histórico. ALTERA `c`. */
function closeSeason(c: CareerState, opts: StepOptions): void {
  if (c.history.some((h) => h.year === c.season.year)) return;
  aiRenewals(marketWorld(c), { userClubId: c.userClubId, aiControlsUser: !!opts.aiControlsUser });
  const n = c.league.clubIds.length;
  const byRevenue = c.league.clubIds.slice().sort((a, b) => c.clubs[b]!.finance.revenueBase - c.clubs[a]!.finance.revenueBase);
  c.season.table.forEach((row, i) => {
    c.clubs[row.clubId] = closeSeasonFinance(c.clubs[row.clubId]!, i + 1, byRevenue.indexOf(row.clubId) + 1, n);
  });
  const pos = c.season.table.findIndex((r) => r.clubId === c.userClubId);
  c.history = [
    ...c.history,
    {
      year: c.season.year,
      championId: c.season.table[0]?.clubId ?? '',
      userPosition: pos + 1,
      userPoints: c.season.table[pos]?.points ?? 0,
    },
  ];
}

/** Fábrica de goleiro da base para emergências (id e sorteio estáveis por clube e rodada). */
function youthGkFor(c: CareerState, year: number) {
  return (club: Club): Player => {
    const salt = `${year}-${c.season.nextRound}`;
    const [kid] = youthIntake(club, c.players, createRng(deriveSeed(c.seed, 'base-gol', salt, club.id)), year, 1, 'GK');
    return { ...kid!, id: `${kid!.id}-${c.season.nextRound}` };
  };
}

/** Jogos como titular por jogador na temporada. */
function appearances(s: SeasonState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of s.results) for (const id of [...r.homeXI, ...r.awayXI]) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/**
 * Virada de temporada: empréstimos voltam, pré-contratos, contratos vencidos, evolução e
 * envelhecimento, aposentadorias, base, limpeza de agentes livres, orçamentos e calendário.
 */
export function startNextSeason(c: CareerState, opts: StepOptions = {}): CareerState {
  if (!isSeasonOver(c.season)) return c;
  const old = c.season;
  const year = old.year + 1;
  const next = cloneForStep(c);
  // Registros da virada saem com o ano novo e rodada 0.
  const w: MarketWorld = { ...marketWorld(next), season: { ...old, year, nextRound: 0 } };

  for (const p of Object.values(next.players)) if (p.loan && p.loan.until < year) returnLoan(w, p.id);
  for (const pc of next.preContracts) {
    const p = next.players[pc.playerId];
    if (p && next.clubs[pc.toClubId]) executeTransfer(w, p.id, pc.toClubId, { fee: 0, wage: pc.wage, years: pc.years }, 'free');
  }
  for (const p of Object.values(next.players)) if (p.clubId && !p.loan && p.contract.expires < year) expireContract(w, p.id);

  const apps = appearances(old);
  for (const p of Object.values(next.players)) {
    const club = p.clubId ? next.clubs[p.clubId] : undefined;
    const rng = createRng(deriveSeed(next.seed, 'evolucao', year, p.id));
    const grown = developPlayer(p, rng, { training: club?.training ?? 2, apps: apps[p.id] ?? 0, nextSeason: year });
    if (shouldRetire(grown, rng)) {
      if (grown.clubId) {
        const cl = next.clubs[grown.clubId]!;
        next.clubs[cl.id] = { ...cl, squad: cl.squad.filter((id) => id !== p.id), startingXI: cl.startingXI.map((id) => (id === p.id ? '' : id)) };
      }
      delete next.players[p.id];
    } else {
      next.players[p.id] = grown;
    }
  }

  for (const id of next.league.clubIds) {
    const club = next.clubs[id]!;
    const count = club.squad.length <= 22 ? 2 : club.squad.length < MAX_SQUAD - 1 ? 1 : 0;
    const youth = youthIntake(club, next.players, createRng(deriveSeed(next.seed, 'base', year, id)), year, count);
    for (const p of youth) next.players[p.id] = p;
    next.clubs[id] = setBoardBudgets({
      ...club,
      squad: [...club.squad, ...youth.map((p) => p.id)],
      finance: { ...club.finance, season: emptyLedger() },
    });
  }

  const turnover: MarketWorld = { ...marketWorld(next), season: { ...old, year, nextRound: 0 } };
  const aiOpts = { userClubId: next.userClubId, aiControlsUser: !!opts.aiControlsUser };
  fillSquadsWithFreeAgents(turnover, aiOpts);
  ensureGoalkeepers(turnover, aiOpts, youthGkFor(next, year));

  const free = Object.values(next.players).filter((p) => p.clubId === null).sort((a, b) => b.ovr - a.ovr);
  for (const p of free.slice(FREE_AGENT_POOL)) delete next.players[p.id];

  for (const p of Object.values(next.players)) next.players[p.id] = { ...p, fitness: 100 };
  const world: World = { league: next.league, clubs: next.clubs, players: next.players };
  const season = createSeason(world, year, deriveSeed(next.seed, 'temporada', year));
  return autoPickUserXI({
    ...next,
    season,
    inbox: [],
    preContracts: [],
    transfers: next.transfers.filter((t) => t.year > year - TRANSFER_HISTORY_SEASONS),
  });
}

export function updateUserClub(c: CareerState, patch: Partial<Club>): CareerState {
  const club = c.clubs[c.userClubId] as Club;
  return { ...c, clubs: { ...c.clubs, [club.id]: { ...club, ...patch } } };
}

export function setUserTactic(c: CareerState, tactic: Partial<Omit<Tactic, 'formation'>>): CareerState {
  const club = c.clubs[c.userClubId] as Club;
  return updateUserClub(c, { tactic: { ...club.tactic, ...tactic } });
}

/** Troca a formação e refaz o XI automaticamente para a nova formação. */
export function setUserFormation(c: CareerState, formation: Formation): CareerState {
  const club = c.clubs[c.userClubId] as Club;
  return autoPickUserXI(updateUserClub(c, { tactic: { ...club.tactic, formation } }));
}

/** Escolhe o XI automaticamente (considerando lesões, suspensões e cansaço) e fixa. */
export function autoPickUserXI(c: CareerState): CareerState {
  const club = c.clubs[c.userClubId] as Club;
  const lineup = chooseLineup({ ...club, startingXI: [] }, c.players, isAvailableIn(c.season));
  return updateUserClub(c, { startingXI: lineupToXI(lineup) });
}

/** Coloca `playerId` na vaga `slot`; se ele já estava em outra vaga, os dois trocam. */
export function setUserSlot(c: CareerState, slot: number, playerId: string): CareerState {
  const club = c.clubs[c.userClubId] as Club;
  if (!club.squad.includes(playerId)) return c;
  const size = FORMATIONS[club.tactic.formation].length;
  const xi = club.startingXI.length === size ? club.startingXI.slice() : lineupToXI(userLineup(c));
  const prev = xi.indexOf(playerId);
  const current = xi[slot] as string;
  xi[slot] = playerId;
  if (prev >= 0 && prev !== slot) xi[prev] = current;
  return updateUserClub(c, { startingXI: xi });
}

/** Escalação que o clube do usuário usaria agora (com os reservas nas vagas de quem está fora). */
export function userLineup(c: CareerState): Lineup {
  return chooseLineup(c.clubs[c.userClubId] as Club, c.players, isAvailableIn(c.season));
}

function lineupToXI(lineup: Lineup): string[] {
  const positions = FORMATIONS[lineup.formation];
  const remaining = lineup.slots.slice();
  return positions.map((pos) => {
    const i = remaining.findIndex((s) => s.pos === pos);
    if (i < 0) return '';
    const [s] = remaining.splice(i, 1);
    return s!.playerId;
  });
}
