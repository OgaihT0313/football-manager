// Estado de uma carreira (o que vai para o save) e as ações sobre ele.
// Todas as funções devolvem um estado novo e não alteram o recebido (o store depende disso).

import { aiRenewals, ensureGoalkeepers, fillSquadsWithFreeAgents, runMarketDay } from '../ai/transferAI';
import { developPlayer, shouldRetire, youthIntake } from '../club/development';
import { closeSeasonFinance, emptyLedger, setBoardBudgets, settleRound } from '../club/finance';
import {
  createWorldSeason, currentSlot, isAvailableIn, isWorldSeasonOver, leagueCompetitionOf, playSlot, squadRating,
  type WorldData, type WorldSeason, type WorldSeasonOptions,
} from '../competitions/world';
import { europePrizes, europeanQualifiers } from '../competitions/europe';
import { outsideFreeAgents, populateClub, topUpSquad } from '../data/fictionalWorld';
import { FORMATIONS } from '../domain/positions';
import type {
  Club, Formation, IncomingOffer, LeagueConfig, MatchResult, Player, PreContract, Tactic, TransferRecord,
} from '../domain/types';
import { chooseLineup, type Lineup } from '../engine/lineup';
import { createRng, deriveSeed, gaussian } from '../engine/rng';
import { currentMarker, openWindow } from '../market/calendar';
import { executeTransfer, expireContract, MAX_SQUAD, returnLoan, type MarketWorld } from '../market/transfers';

export interface SeasonSummary {
  year: number;
  /** Liga do usuário naquela temporada. */
  leagueId: string;
  /** Campeão da liga do usuário. */
  championId: string;
  userPosition: number;
  userPoints: number;
  /** Campeão de cada competição (id da competição → clube). */
  winners: Record<string, string>;
}

export interface CareerState {
  /** Versão do formato. Ver src/save/saveService.ts. */
  saveVersion: number;
  seed: number;
  userClubId: string;
  /** Ligas (configuração): quem joga em cada uma muda com acesso e rebaixamento. */
  leagues: Record<string, LeagueConfig>;
  clubs: Record<string, Club>;
  /** Todos os jogadores, inclusive agentes livres (`clubId: null`). */
  players: Record<string, Player>;
  season: WorldSeason;
  history: SeasonSummary[];
  /** Transferências, empréstimos e dispensas (temporada atual e anteriores). */
  transfers: TransferRecord[];
  /** Propostas da IA pelos jogadores do usuário. */
  inbox: IncomingOffer[];
  /** Pré-contratos do usuário, executados na virada da temporada. */
  preContracts: PreContract[];
}

export const CURRENT_SAVE_VERSION = 4;

/** Quantas temporadas de transferências o save guarda. */
const TRANSFER_HISTORY_SEASONS = 3;
/** Tamanho máximo do grupo de agentes livres, por clube com elenco (os piores são descartados). */
const FREE_AGENT_POOL_PER_CLUB = 3;
/** Temporadas seguidas na 2ª divisão até o clube da IA voltar a ser "por força". */
const GHOSTIFY_AFTER = 2;
/** Distância entre a média da 1ª divisão e o alvo de força da 2ª. */
const GHOST_GAP = 11;
/** Agentes livres adultos garantidos depois da virada, por clube com elenco (o resto vem "de fora"). */
const OUTSIDE_POOL_PER_CLUB = 1.5;
/** Receita de quem cai (paraquedas) e de quem sobe com elenco próprio. */
const RELEGATION_REVENUE = 0.55;
const PROMOTION_REVENUE = 1.6;

export interface StepOptions {
  /** true = a IA também cuida do clube do usuário (diagnóstico de várias temporadas). */
  aiControlsUser?: boolean;
}

export interface NewCareerInput {
  leagues: LeagueConfig[];
  clubs: Club[];
  players: Player[];
  userClubId: string;
  seed: number;
  year: number;
}

export function worldData(c: Pick<CareerState, 'leagues' | 'clubs' | 'players'>): WorldData {
  return { leagues: c.leagues, clubs: c.clubs, players: c.players };
}

/** Força de um clube (XI ideal, ou força declarada se não tem elenco): serve de coeficiente. */
function clubRating(c: Pick<CareerState, 'clubs' | 'players'>): (id: string) => number {
  const cache = new Map<string, number>();
  return (id) => {
    let r = cache.get(id);
    if (r === undefined) {
      const club = c.clubs[id]!;
      r = club.squad.length ? squadRating(club, c.players) : (club.strength ?? 50);
      cache.set(id, r);
    }
    return r;
  };
}

export function newCareer(input: NewCareerInput): CareerState {
  const leagues: Record<string, LeagueConfig> = {};
  for (const l of input.leagues) leagues[l.id] = { ...l, clubIds: l.clubIds.slice() };
  const inWorld = new Set(input.leagues.flatMap((l) => l.clubIds));
  const clubs: Record<string, Club> = {};
  for (const c of input.clubs) if (inWorld.has(c.id)) clubs[c.id] = { ...c, startingXI: [] };
  if (!clubs[input.userClubId]?.squad.length) throw new Error(`Clube ${input.userClubId} não está no mundo ou não tem elenco`);
  const players: Record<string, Player> = {};
  for (const p of input.players) players[p.id] = { ...p, fitness: 100, morale: p.morale ?? 50 };
  const base = { leagues, clubs, players };
  // Primeira temporada: Europa pela força dos clubes (não há tabela anterior).
  const europe = europeanQualifiers(leagues, clubRating(base));
  const season = createWorldSeason(worldData(base), input.year, deriveSeed(input.seed, 'temporada', input.year), { europe });
  const career: CareerState = {
    saveVersion: CURRENT_SAVE_VERSION,
    seed: input.seed,
    userClubId: input.userClubId,
    ...base,
    season,
    history: [],
    transfers: [],
    inbox: [],
    preContracts: [],
  };
  return autoPickUserXI(career);
}

/** Cópia de tudo que um passo altera (jogadores, clubes, temporada, listas). */
export function cloneForStep(c: CareerState): CareerState {
  const players: Record<string, Player> = {};
  for (const [id, p] of Object.entries(c.players)) players[id] = { ...p };
  const clubs: Record<string, Club> = {};
  for (const [id, cl] of Object.entries(c.clubs)) clubs[id] = { ...cl, finance: { ...cl.finance, season: { ...cl.finance.season } } };
  const status: WorldSeason['status'] = {};
  for (const [id, st] of Object.entries(c.season.status)) status[id] = { ...st };
  const stats: WorldSeason['stats'] = {};
  for (const [id, st] of Object.entries(c.season.stats ?? {})) stats[id] = { ...st };
  const competitions: WorldSeason['competitions'] = {};
  for (const [id, comp] of Object.entries(c.season.competitions)) {
    competitions[id] = {
      ...comp,
      fixtures: comp.fixtures.slice(),
      results: comp.results.slice(),
      stages: comp.stages.map((st) => ({ ...st, fixtureIds: st.fixtureIds.slice() })),
    };
  }
  return {
    ...c,
    players,
    clubs,
    season: { ...c.season, status, stats, competitions },
    transfers: c.transfers.slice(),
    inbox: c.inbox.slice(),
    preContracts: c.preContracts.slice(),
  };
}

export function marketWorld(c: CareerState): MarketWorld {
  return { clubs: c.clubs, players: c.players, season: c.season, transfers: c.transfers };
}

/** Fábrica de goleiro da base para emergências (id e sorteio estáveis por clube e data). */
function youthGkFor(c: CareerState, year: number) {
  return (club: Club): Player => {
    const salt = `${year}-${c.season.nextSlot}`;
    const [kid] = youthIntake(club, c.players, createRng(deriveSeed(c.seed, 'base-gol', salt, club.id)), year, 1, 'GK');
    return { ...kid!, id: `${kid!.id}-${c.season.nextSlot}` };
  };
}

/** Mercado (janela aberta), uma data de jogos e finanças. ALTERA `c` (use uma cópia). */
function stepSlot(c: CareerState, opts: StepOptions): MatchResult[] {
  const s = c.season;
  const slot = currentSlot(s)!;
  const marker = currentMarker(s);
  c.inbox = c.inbox.filter((o) => o.year === s.year && o.expiresRound >= marker && c.players[o.playerId]?.clubId === c.userClubId);
  const aiOpts = { userClubId: c.userClubId, aiControlsUser: !!opts.aiControlsUser };
  if (openWindow(s)) {
    runMarketDay(marketWorld(c), { ...aiOpts, rng: createRng(deriveSeed(c.seed, 'mercado', s.year, s.nextSlot)), inbox: c.inbox });
  }
  // Sem nenhum goleiro disponível, a IA contrata um de emergência (fora da janela também).
  ensureGoalkeepers(marketWorld(c), aiOpts, youthGkFor(c, s.year), 1, isAvailableIn(s));
  // Detalhe completo só na liga do usuário e nos jogos dele; o resto fica resumido no save.
  const userLeagueId = leagueCompetitionOf(s, c.userClubId)?.id;
  const results = playSlot(worldData(c), s, undefined, (comp, fx) => comp.id === userLeagueId || fx.homeId === c.userClubId || fx.awayId === c.userClubId);
  // Receitas e salários correm por semana (fins de semana), para todo clube com elenco.
  if (slot.kind === 'fds') for (const club of Object.values(c.clubs)) if (club.squad.length) settleRound(club, c.players, 38);
  if (isWorldSeasonOver(s)) closeSeason(c, opts);
  return results;
}

/** Joga a próxima data do calendário. */
export function advanceRound(c: CareerState, opts: StepOptions = {}): { career: CareerState; results: MatchResult[] } {
  if (isWorldSeasonOver(c.season)) return { career: c, results: [] };
  const next = cloneForStep(c);
  const results = stepSlot(next, opts);
  return { career: next, results };
}

/** Joga datas até a próxima partida do usuário (inclusive). Devolve o resultado dela. */
export function advanceToNextMatch(c: CareerState, opts: StepOptions = {}): { career: CareerState; result: MatchResult | null } {
  if (isWorldSeasonOver(c.season)) return { career: c, result: null };
  const next = cloneForStep(c);
  while (!isWorldSeasonOver(next.season)) {
    const results = stepSlot(next, opts);
    const mine = results.find((r) => r.homeId === next.userClubId || r.awayId === next.userClubId);
    if (mine) return { career: next, result: mine };
  }
  return { career: next, result: null };
}

/** Joga até o fim da temporada (ou até terminar a jornada `untilRound`, inclusive). */
export function simulateRounds(c: CareerState, untilRound = Infinity, opts: StepOptions = {}): CareerState {
  if (isWorldSeasonOver(c.season)) return c;
  const next = cloneForStep(c);
  while (!isWorldSeasonOver(next.season) && currentMarker(next.season) <= untilRound) stepSlot(next, opts);
  return next;
}

/** Fim de temporada: renovações da IA, premiação, receita/reputação e histórico. ALTERA `c`. */
function closeSeason(c: CareerState, opts: StepOptions): void {
  if (c.history.some((h) => h.year === c.season.year)) return;
  aiRenewals(marketWorld(c), { userClubId: c.userClubId, aiControlsUser: !!opts.aiControlsUser });
  for (const comp of Object.values(c.season.competitions)) {
    if (comp.kind !== 'league') continue;
    const n = comp.clubIds.length;
    const byRevenue = comp.clubIds.slice().sort((a, b) => c.clubs[b]!.finance.revenueBase - c.clubs[a]!.finance.revenueBase);
    comp.table.forEach((row, i) => {
      const club = c.clubs[row.clubId]!;
      if (club.squad.length) c.clubs[row.clubId] = closeSeasonFinance(club, i + 1, byRevenue.indexOf(row.clubId) + 1, n);
    });
  }
  // Premiação e reputação das copas europeias.
  for (const comp of Object.values(c.season.competitions)) {
    if (comp.kind !== 'europe') continue;
    for (const [id, prize] of Object.entries(europePrizes(comp))) {
      const club = c.clubs[id];
      if (!club) continue;
      c.clubs[id] = {
        ...club,
        reputation: Math.min(100, club.reputation + prize.reputation),
        finance: {
          ...club.finance,
          balance: club.finance.balance + prize.money,
          season: { ...club.finance.season, prizes: club.finance.season.prizes + prize.money },
        },
      };
    }
  }
  const userComp = leagueCompetitionOf(c.season, c.userClubId);
  const pos = userComp ? userComp.table.findIndex((r) => r.clubId === c.userClubId) : -1;
  const winners: Record<string, string> = {};
  for (const comp of Object.values(c.season.competitions)) if (comp.championId) winners[comp.id] = comp.championId;
  c.history = [
    ...c.history,
    {
      year: c.season.year,
      leagueId: userComp?.leagueId ?? '',
      championId: userComp?.table[0]?.clubId ?? '',
      userPosition: pos + 1,
      userPoints: userComp?.table[pos]?.points ?? 0,
      winners,
    },
  ];
}

/** Jogos como titular por jogador na temporada (todas as competições). */
function appearances(s: WorldSeason): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, line] of Object.entries(s.stats ?? {})) out[id] = line.apps;
  return out;
}

/**
 * Virada de temporada: empréstimos voltam, pré-contratos, contratos vencidos, evolução e
 * envelhecimento, aposentadorias, base, acesso e rebaixamento, limpeza de agentes livres,
 * orçamentos e calendário novo.
 */
export function startNextSeason(c: CareerState, opts: StepOptions = {}): CareerState {
  if (!isWorldSeasonOver(c.season)) return c;
  const old = c.season;
  const year = old.year + 1;
  const next = cloneForStep(c);
  next.leagues = Object.fromEntries(Object.entries(next.leagues).map(([id, l]) => [id, { ...l, clubIds: l.clubIds.slice() }]));
  // Registros da virada saem com o ano novo e rodada 0.
  const w: MarketWorld = { ...marketWorld(next), season: { ...old, year }, round: 0 };

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

  for (const club of Object.values(next.clubs)) {
    if (!club.squad.length) continue;
    const count = club.squad.length <= 22 ? 2 : club.squad.length < MAX_SQUAD - 1 ? 1 : 0;
    const youth = youthIntake(club, next.players, createRng(deriveSeed(next.seed, 'base', year, club.id)), year, count);
    for (const p of youth) next.players[p.id] = p;
    next.clubs[club.id] = { ...club, squad: [...club.squad, ...youth.map((p) => p.id)] };
  }

  promoteAndRelegate(next, old, year);

  // Reposição de fora: o grupo de agentes livres adultos volta a ter pelo menos OUTSIDE_POOL.
  const adultsFree = Object.values(next.players).filter((p) => p.clubId === null && p.age >= 21 && p.age <= 31).length;
  const squadClubs = Object.values(next.clubs).filter((cl) => cl.squad.length).length;
  const needed = Math.max(0, Math.round(OUTSIDE_POOL_PER_CLUB * squadClubs) - adultsFree);
  if (needed > 0) {
    const levels = Object.values(next.leagues).filter((l) => (l.tier ?? 1) === 1).flatMap((l) => l.clubIds).map((id) => squadRating(next.clubs[id]!, next.players));
    const low = Math.min(...levels);
    for (const p of outsideFreeAgents(createRng(deriveSeed(next.seed, 'fora', year)), year, needed, low - 10, low + 4)) next.players[p.id] = p;
  }

  const aiOpts = { userClubId: next.userClubId, aiControlsUser: !!opts.aiControlsUser };
  fillSquadsWithFreeAgents(w, aiOpts);
  ensureGoalkeepers(w, aiOpts, youthGkFor(next, year));

  const free = Object.values(next.players).filter((p) => p.clubId === null).sort((a, b) => b.ovr - a.ovr);
  for (const p of free.slice(Math.round(FREE_AGENT_POOL_PER_CLUB * squadClubs))) delete next.players[p.id];

  for (const club of Object.values(next.clubs)) next.clubs[club.id] = setBoardBudgets({ ...club, finance: { ...club.finance, season: emptyLedger() } });
  for (const p of Object.values(next.players)) next.players[p.id] = { ...p, fitness: 100 };

  // Supercopa: campeão da liga contra o campeão da copa (vice da liga se for o mesmo).
  const supercups: Record<string, [string, string]> = {};
  for (const league of Object.values(next.leagues)) {
    if ((league.tier ?? 1) !== 1 || !league.supercupName) continue;
    const table = old.competitions[league.id]?.table ?? [];
    const champ = table[0]?.clubId;
    const cupWinner = old.competitions[`${league.id}-copa`]?.championId ?? table[1]?.clubId;
    // Quem caiu não disputa a supercopa da 1ª divisão.
    const inTop = (id?: string | null) => !!id && league.clubIds.includes(id);
    if (inTop(champ) && inTop(cupWinner)) supercups[league.country] = [champ!, cupWinner === champ ? table[1]!.clubId : cupWinner!];
  }

  // Europa pela tabela da temporada que acabou e pelos campeões das copas.
  const order: Record<string, string[]> = {};
  const cupWinners: Record<string, string | null> = {};
  for (const l of Object.values(next.leagues)) {
    const table = old.competitions[l.id]?.table;
    if (table) order[l.id] = table.map((r) => r.clubId);
    cupWinners[l.id] = old.competitions[`${l.id}-copa`]?.championId ?? null;
  }
  const europe = europeanQualifiers(next.leagues, clubRating(next), order, cupWinners);
  const season = createWorldSeason(worldData(next), year, deriveSeed(next.seed, 'temporada', year), { supercups, europe });
  return autoPickUserXI({
    ...next,
    season,
    inbox: [],
    preContracts: [],
    transfers: next.transfers.filter((t) => t.year > year - TRANSFER_HISTORY_SEASONS),
  });
}

/**
 * Acesso e rebaixamento entre cada 1ª divisão e a 2ª ligada a ela. Quem sobe sem elenco ganha
 * um gerado no nível da sua força. ALTERA `c`.
 */
function promoteAndRelegate(c: CareerState, old: WorldSeason, year: number): void {
  for (const top of Object.values(c.leagues)) {
    if ((top.tier ?? 1) !== 1 || !top.linkedLeagueId || !top.relegation) continue;
    const bottom = c.leagues[top.linkedLeagueId];
    const topTable = old.competitions[top.id]?.table;
    const botTable = old.competitions[bottom?.id ?? '']?.table;
    if (!bottom || !topTable?.length || !botTable?.length) continue;
    const k = top.relegation;
    const down = topTable.slice(-k).map((r) => r.clubId);
    const up = botTable.slice(0, k).map((r) => r.clubId);
    top.clubIds = [...top.clubIds.filter((id) => !down.includes(id)), ...up];
    bottom.clubIds = [...bottom.clubIds.filter((id) => !up.includes(id)), ...down];

    for (const id of down) {
      const cl = c.clubs[id]!;
      c.clubs[id] = {
        ...cl,
        leagueId: bottom.id,
        lowerSince: year,
        reputation: Math.max(1, cl.reputation - 8),
        finance: { ...cl.finance, revenueBase: Math.round((cl.finance.revenueBase * RELEGATION_REVENUE) / 100_000) * 100_000 },
      };
    }
    for (const id of up) {
      const cl = c.clubs[id]!;
      if (cl.squad.length) {
        // Elenco curto (comum depois de anos com receita de 2ª divisão) é completado até 22.
        const level = squadRating(cl, c.players);
        const extra = topUpSquad({ ...cl, strength: level }, c.players, createRng(deriveSeed(c.seed, 'acesso', year, id)), year, 22);
        for (const p of extra) c.players[p.id] = p;
        const { lowerSince: _ls, ...rest } = cl;
        c.clubs[id] = {
          ...rest,
          squad: [...cl.squad, ...extra.map((p) => p.id)],
          leagueId: top.id,
          reputation: Math.min(100, cl.reputation + 6),
          finance: { ...cl.finance, revenueBase: Math.round((cl.finance.revenueBase * PROMOTION_REVENUE) / 100_000) * 100_000 },
        };
      } else {
        const { club, players } = populateClub({ ...cl, leagueId: top.id }, createRng(deriveSeed(c.seed, 'acesso', year, id)), year);
        for (const p of players) c.players[p.id] = p;
        c.clubs[id] = club;
      }
    }
  }

  // Quem passa GHOSTIFY_AFTER temporadas na 2ª divisão sem subir volta a ser "por força": o
  // mundo não acumula elencos completos lá embaixo (custo de simulação e tamanho do save).
  for (const league of Object.values(c.leagues)) {
    if (league.tier !== 2) continue;
    for (const id of league.clubIds) {
      const cl = c.clubs[id]!;
      if (!cl.squad.length || id === c.userClubId || cl.lowerSince === undefined || year - cl.lowerSince < GHOSTIFY_AFTER) continue;
      ghostify(c, cl);
    }
  }

  // Clubes só com força oscilam um pouco e voltam devagar para um alvo que acompanha o nível
  // da 1ª divisão do país (média da 1ª − GHOST_GAP), para quem sobe não ficar cada vez mais fraco.
  for (const league of Object.values(c.leagues)) {
    const ghosts = league.clubIds.map((id) => c.clubs[id]!).filter((cl) => !cl.squad.length);
    if (!ghosts.length) continue;
    const upper = league.linkedLeagueId ? c.leagues[league.linkedLeagueId] : undefined;
    const upperAvg = upper ? upper.clubIds.reduce((a, id) => a + squadRating(c.clubs[id]!, c.players), 0) / upper.clubIds.length : NaN;
    const target = Number.isFinite(upperAvg) ? upperAvg - GHOST_GAP : ghosts.reduce((a, cl) => a + (cl.strength ?? 55), 0) / ghosts.length;
    for (const cl of ghosts) {
      const rng = createRng(deriveSeed(c.seed, 'forca', year, cl.id));
      const s = cl.strength ?? 55;
      // A ordem entre eles se mantém; só a média é puxada para o alvo.
      c.clubs[cl.id] = { ...cl, strength: Math.round((s + (target - s) * 0.15 + gaussian(rng, 0, 1.2)) * 10) / 10 };
    }
  }
}

/** Transforma um clube com elenco em clube "por força". ALTERA `c`. */
function ghostify(c: CareerState, cl: Club): void {
  const strength = Math.round(squadRating(cl, c.players) * 10) / 10;
  for (const pid of cl.squad) {
    const p = c.players[pid];
    if (!p) continue;
    if (p.loan) {
      // Emprestado a este clube: volta para o dono, se o dono ainda tiver elenco.
      const parent = c.clubs[p.loan.parentClubId];
      const { loan: _l, ...rest } = p;
      if (parent?.squad.length) {
        c.players[pid] = { ...rest, clubId: parent.id };
        c.clubs[parent.id] = { ...parent, squad: [...parent.squad, pid], loanedOut: (parent.loanedOut ?? []).filter((x) => x !== pid) };
      } else c.players[pid] = { ...rest, clubId: null };
    } else c.players[pid] = { ...p, clubId: null };
  }
  // Emprestados por este clube ficam de vez com quem os recebeu.
  for (const pid of cl.loanedOut ?? []) {
    const p = c.players[pid];
    if (p?.loan?.parentClubId === cl.id) {
      const { loan: _l, ...rest } = p;
      c.players[pid] = rest;
    }
  }
  const { loanedOut: _lo, ...rest } = cl;
  c.clubs[cl.id] = { ...rest, squad: [], startingXI: [], strength };
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
