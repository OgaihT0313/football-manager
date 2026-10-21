// Camada de técnico dentro da carreira (Fase 5): diretoria, demissão, empregos, imprensa,
// decisões, staff, olheiros, prêmios e conquistas. Os ganchos (before/after slot, fim e começo de
// temporada) ALTERAM a carreira recebida; as ações do usuário devolvem uma carreira nova.

import { staffBudget, staffWeekly } from '../club/finance';
import { tieWinner } from '../competitions/europe';
import { isWorldSeasonOver, leagueCompetitionOf, squadRating, winnerOf, type CompetitionState } from '../competitions/world';
import type { MatchResult, Player } from '../domain/types';
import { createRng, deriveSeed } from '../engine/rng';
import { ACHIEVEMENTS, newAchievements, seasonAwards } from '../manager/awards';
import {
  cupResultBonus, MANDATE_META, newBoard, projectConfidence, reviewSeason, shouldFireMidSeason, strengthRank,
} from '../manager/board';
import { aiSackings, availableJobs, reputationDelta, seasonEndSackings, VACANCY_SLOTS } from '../manager/jobs';
import { affectedPlayers, pressBeforeMatch, unhappyPlayer } from '../manager/press';
import { initialStaff, SCOUT_COOLDOWN, scoutProspects, staffLevel, staffMarket, type ScoutRegion } from '../manager/staff';
import type {
  BoardState, CompetitionAwards, Decision, ManagerSpell, ManagerState, NewsItem, NewsKind, StaffMember, Vacancy,
} from '../manager/types';
import type { CareerState } from './career';
import type { MarketResult } from './userMarket';

/** Campos da Fase 5 no CareerState. */
export interface ManagerFields {
  manager: ManagerState;
  board: BoardState;
  decisions: Decision[];
  news: NewsItem[];
  vacancies: Vacancy[];
  /** Prêmios por temporada. */
  awards: { year: number; list: CompetitionAwards[] }[];
  staffMarket: StaffMember[];
  /** Data a partir da qual o olheiro pode sair em nova missão. */
  scoutReadySlot: number;
}

const NEWS_CAP = 80;
const AWARD_SEASONS = 30;

function ratingOf(c: Pick<CareerState, 'clubs' | 'players'>) {
  return (id: string) => {
    const club = c.clubs[id]!;
    return club.squad.length ? squadRating(club, c.players) : (club.strength ?? 50);
  };
}

function boardFor(c: Pick<CareerState, 'clubs' | 'players' | 'leagues' | 'season'>, clubId: string, prior?: BoardState): BoardState {
  const comp = leagueCompetitionOf(c.season, clubId);
  const league = c.leagues[c.clubs[clubId]!.leagueId]!;
  const { rank, n } = comp ? strengthRank(c.season, comp.id, clubId, ratingOf(c)) : { rank: 0, n: 20 };
  return newBoard(rank, league, n, prior);
}

function newSpell(clubId: string, year: number): ManagerSpell {
  return { clubId, fromYear: year, toYear: null, end: null, matches: 0, wins: 0, draws: 0, losses: 0, titles: [] };
}

export function addNews(c: Pick<ManagerFields, 'news'> & Pick<CareerState, 'season'>, kind: NewsKind, text: string): void {
  c.news = [...c.news, { year: c.season.year, slot: c.season.nextSlot, kind, text }].slice(-NEWS_CAP);
}

/** Campos iniciais para uma carreira nova (ou migrada de antes da Fase 5). */
export function initManagerFields(c: Omit<CareerState, keyof ManagerFields>, name = 'Você'): ManagerFields & { clubs: CareerState['clubs'] } {
  const club = c.clubs[c.userClubId]!;
  const clubs = { ...c.clubs, [club.id]: { ...club, staff: club.staff ?? initialStaff(club, c.seed) } };
  const base = { ...c, clubs };
  return {
    clubs,
    manager: {
      name,
      reputation: Math.max(10, Math.min(90, club.reputation - 10)),
      employed: true,
      idleSlots: 0,
      spells: [newSpell(club.id, c.season.year)],
      achievements: [],
    },
    board: boardFor(base, club.id),
    decisions: [],
    news: [],
    vacancies: [],
    awards: [],
    staffMarket: staffMarket(c.seed, c.season.year),
    scoutReadySlot: 0,
  };
}

/** Clube do usuário está sob controle da IA? (desempregado, ou o script pediu) */
export function aiRunsUser(c: CareerState, forced: boolean): boolean {
  return forced || !c.manager.employed;
}

function applyDecision(c: CareerState, d: Decision, index: number): void {
  const opt = d.options[index] ?? d.options[d.defaultOption]!;
  const club = c.clubs[c.userClubId]!;
  for (const pid of affectedPlayers(d, club)) {
    const p = c.players[pid];
    if (p && p.clubId === c.userClubId) c.players[pid] = { ...p, morale: Math.max(0, Math.min(100, (p.morale ?? 50) + opt.morale)) };
  }
  c.board = { ...c.board, cupBonus: c.board.cupBonus + opt.confidence };
  c.manager = { ...c.manager, reputation: Math.max(1, Math.min(100, c.manager.reputation + opt.reputation)) };
  c.decisions = c.decisions.filter((x) => x.id !== d.id);
  addNews(c, 'decisao', `${d.title}: “${opt.label}” ${opt.outcome}`);
}

/** Antes de uma data: decisões vencidas valem a opção padrão; conta o tempo desempregado. */
export function managerBeforeSlot(c: CareerState): void {
  for (const d of c.decisions.filter((x) => x.deadlineSlot <= c.season.nextSlot)) applyDecision(c, d, d.defaultOption);
  if (!c.manager.employed) c.manager = { ...c.manager, idleSlots: c.manager.idleSlots + 1 };
}

function currentSpell(c: CareerState): ManagerSpell | undefined {
  const s = c.manager.spells[c.manager.spells.length - 1];
  return s && s.end === null && s.clubId === c.userClubId ? s : undefined;
}

function updateSpell(c: CareerState, patch: (s: ManagerSpell) => ManagerSpell): void {
  const i = c.manager.spells.length - 1;
  const s = currentSpell(c);
  if (!s) return;
  const spells = c.manager.spells.slice();
  spells[i] = patch(s);
  c.manager = { ...c.manager, spells };
}

/** Demite o técnico do usuário: o clube passa para a IA e ele procura emprego. ALTERA `c`. */
export function fireManager(c: CareerState, message: string): void {
  updateSpell(c, (s) => ({ ...s, toYear: c.season.year, end: 'demitido' }));
  // O staff sai junto com o técnico; o clube volta a ser neutro como os da IA.
  const { staff: _st, ...club } = c.clubs[c.userClubId]!;
  c.clubs = { ...c.clubs, [club.id]: club };
  c.manager = { ...c.manager, employed: false, idleSlots: 0, reputation: Math.max(1, c.manager.reputation - 5) };
  c.decisions = [];
  addNews(c, 'emprego', message);
}

/** Resultado de copa/Europa do ponto de vista do usuário: venceu o confronto? foi eliminado? */
function koOutcome(comp: CompetitionState, r: MatchResult, user: string): { won: boolean; eliminated: boolean } | null {
  const fx = comp.fixtures.find((f) => f.id === r.fixtureId);
  if (!fx) return null;
  if (comp.kind === 'europe' && comp.stages[0]?.fixtureIds.includes(fx.id)) {
    const mine = r.homeId === user ? r.homeGoals : r.awayGoals;
    const theirs = r.homeId === user ? r.awayGoals : r.homeGoals;
    return { won: mine > theirs, eliminated: false };
  }
  if (fx.leg === 1) return null;
  if (fx.leg === 2) {
    const first = comp.results.find((x) => x.fixtureId === fx.firstLegId);
    if (!first) return null;
    const w = tieWinner(first, r);
    return { won: w === user, eliminated: w !== user };
  }
  const w = winnerOf(r);
  return { won: w === user, eliminated: w !== user };
}

/** Depois de uma data: campanha, diretoria, demissão, imprensa, insatisfeitos e vagas. ALTERA `c`. */
export function managerAfterSlot(c: CareerState, results: MatchResult[], slotIndex: number): void {
  const ws = c.season;
  const slot = ws.slots[slotIndex]!;
  const user = c.userClubId;
  const marker = slot.marker;

  if (c.manager.employed) {
    const mine = results.filter((r) => r.homeId === user || r.awayId === user);
    for (const r of mine) {
      const gf = r.homeId === user ? r.homeGoals : r.awayGoals;
      const ga = r.homeId === user ? r.awayGoals : r.homeGoals;
      updateSpell(c, (s) => ({ ...s, matches: s.matches + 1, wins: s.wins + (gf > ga ? 1 : 0), draws: s.draws + (gf === ga ? 1 : 0), losses: s.losses + (gf < ga ? 1 : 0) }));
      const comp = Object.values(ws.competitions).find((x) => x.results.some((y) => y.fixtureId === r.fixtureId));
      if (comp && comp.kind !== 'league') {
        const ko = koOutcome(comp, r, user);
        if (ko) c.board = { ...c.board, cupBonus: c.board.cupBonus + cupResultBonus(comp.kind, ko.won, ko.eliminated, c.board.mandate) };
      }
    }
    const league = leagueCompetitionOf(ws, user);
    if (league) c.board = { ...c.board, confidence: projectConfidence(c.board, league, user) };

    if (!isWorldSeasonOver(ws) && shouldFireMidSeason(c.board, marker)) {
      fireManager(c, `A diretoria do ${c.clubs[user]!.name} perdeu a paciência (confiança ${c.board.confidence}). Você foi demitido.`);
    } else if (mine.length && !isWorldSeasonOver(ws)) {
      // Coletiva antes do próximo jogo (só depois de um jogo nosso, para não repetir).
      const next = nextUserFixture(c);
      if (next) {
        const opp = c.clubs[next.fx.homeId === user ? next.fx.awayId : next.fx.homeId]!;
        const r = ratingOf(c);
        const big = next.comp.kind !== 'league' && !next.comp.stages[0]?.fixtureIds.includes(next.fx.id);
        const d = pressBeforeMatch(createRng(deriveSeed(c.seed, 'imprensa', next.fx.id)), next.fx, opp, r(user), r(opp.id), big);
        if (d && !c.decisions.some((x) => x.id === d.id)) c.decisions = [...c.decisions, d];
      }
    }

    // A cada 4 fins de semana a partir da 10ª rodada: titular em potencial encostado reclama.
    if (c.manager.employed && slot.kind === 'fds' && marker >= 10 && marker % 4 === 0) {
      const club = c.clubs[user]!;
      const played = currentSpell(c)?.matches ?? 0;
      const ranked = club.squad.map((id) => c.players[id]!).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
      const unhappy = ranked.slice(0, 14).find((p) => (p.morale ?? 50) < 45 && (ws.stats[p.id]?.apps ?? 0) < Math.max(3, played * 0.35) && !c.decisions.some((d) => d.playerId === p.id));
      if (unhappy) c.decisions = [...c.decisions, unhappyPlayer(unhappy, slotIndex + 4, ws.year)];
    }
  }

  // Vagas: demissões da IA nos fins de semana a partir da 10ª rodada; fecham depois de um tempo.
  c.vacancies = c.vacancies.filter((v) => v.year !== ws.year || v.closesSlot >= ws.nextSlot);
  if (slot.kind === 'fds' && marker >= 10 && !isWorldSeasonOver(ws)) {
    // Ligas jogadas com elenco (inclui 2ª divisão com rebaixados que têm elenco).
    const leagues = Object.values(ws.competitions).filter((x) => x.kind === 'league' && x.mode === 'full');
    const skip = new Set(c.manager.employed ? [user] : []);
    const open = new Set(c.vacancies.map((v) => v.clubId));
    for (const id of aiSackings(createRng(deriveSeed(c.seed, 'demissoes', ws.year, slotIndex)), leagues, c.clubs, skip, open)) {
      c.vacancies = [...c.vacancies, { clubId: id, year: ws.year, openedSlot: ws.nextSlot, closesSlot: ws.nextSlot + VACANCY_SLOTS }];
      addNews(c, 'emprego', `${c.clubs[id]!.name} demitiu o técnico.`);
    }
  }
}

function nextUserFixture(c: CareerState) {
  const out: { fx: CompetitionState['fixtures'][number]; comp: CompetitionState }[] = [];
  for (const comp of Object.values(c.season.competitions)) {
    const played = new Set(comp.results.map((r) => r.fixtureId));
    for (const fx of comp.fixtures) {
      if ((fx.homeId === c.userClubId || fx.awayId === c.userClubId) && !played.has(fx.id) && (fx.slot ?? 0) >= c.season.nextSlot) out.push({ fx, comp });
    }
  }
  return out.sort((a, b) => (a.fx.slot ?? 0) - (b.fx.slot ?? 0))[0] ?? null;
}

/** Fim de temporada: prêmios, balanço da diretoria, reputação, conquistas e vagas. ALTERA `c`. */
export function managerSeasonClose(c: CareerState): void {
  const ws = c.season;
  const list = seasonAwards(ws, c.leagues, c.clubs, c.players);
  c.awards = [...c.awards, { year: ws.year, list }].slice(-AWARD_SEASONS);
  for (const a of list) {
    if (a.artilheiro && c.clubs[a.artilheiro.clubId] && a.artilheiro.clubId === c.userClubId) {
      addNews(c, 'premio', `${a.artilheiro.name} é o artilheiro da ${ws.competitions[a.competitionId]?.name} com ${a.artilheiro.value} gols.`);
    }
  }

  if (c.manager.employed) {
    const user = c.userClubId;
    const league = leagueCompetitionOf(ws, user);
    const cfg = c.leagues[c.clubs[user]!.leagueId]!;
    const n = league?.table.length ?? 20;
    const pos = league ? league.table.findIndex((r) => r.clubId === user) + 1 : n;
    const titles = Object.values(ws.competitions).filter((x) => x.championId === user).map((x) => x.name);
    const tier = cfg.tier ?? 1;
    const k = cfg.relegation ?? 0;
    const relegated = tier === 1 && k > 0 && pos > n - k;
    const promoted = tier === 2 && pos <= k;
    const review = reviewSeason(c.board, pos, titles, relegated);
    c.board = { ...c.board, confidence: review.confidence };
    updateSpell(c, (s) => ({ ...s, titles: [...s.titles, ...titles.map((t) => `${t} ${ws.year}`)] }));
    const ucl = ws.competitions.ucl?.championId === user;
    c.manager = { ...c.manager, reputation: Math.max(1, Math.min(100, Math.round(c.manager.reputation + reputationDelta(c.board.targetPosition, pos, titles, ucl, promoted)))) };
    for (const t of titles) addNews(c, 'titulo', `Campeão: ${t} ${ws.year}!`);
    addNews(c, 'diretoria', review.message);
    const kinds = Object.values(ws.competitions).filter((x) => x.championId === user);
    const fresh = newAchievements({
      manager: c.manager,
      titlesByKind: {
        league: kinds.filter((x) => x.kind === 'league').length,
        cup: kinds.filter((x) => x.kind === 'cup').length,
        ucl: ucl ? 1 : 0,
        otherEurope: kinds.filter((x) => x.id === 'uel' || x.id === 'uecl').length,
      },
      promoted,
      awards: list,
      userClubId: user,
    });
    if (review.fired) fireManager(c, review.message);
    const after = newAchievements({ manager: c.manager, titlesByKind: { league: 0, cup: 0, ucl: 0, otherEurope: 0 }, promoted: false, awards: [], userClubId: user });
    const unlocked = [...new Set([...fresh, ...after])];
    if (unlocked.length) {
      c.manager = { ...c.manager, achievements: [...c.manager.achievements, ...unlocked] };
      for (const id of unlocked) addNews(c, 'premio', `Conquista: ${ACHIEVEMENTS.find((a) => a.id === id)?.label}.`);
    }
  }

  // Demissões de fim de temporada: vagas para a próxima (abrem na pré-temporada).
  const leagues = Object.values(ws.competitions).filter((x) => x.kind === 'league' && x.mode === 'full');
  const skip = new Set([...(c.manager.employed ? [c.userClubId] : []), ...c.vacancies.map((v) => v.clubId)]);
  for (const id of seasonEndSackings(createRng(deriveSeed(c.seed, 'demissoes-fim', ws.year)), leagues, c.clubs, skip)) {
    c.vacancies = [...c.vacancies, { clubId: id, year: ws.year + 1, openedSlot: 0, closesSlot: VACANCY_SLOTS }];
    addNews(c, 'emprego', `${c.clubs[id]!.name} vai trocar de técnico para a próxima temporada.`);
  }
}

/** Começo da temporada: diretoria nova, mercado de staff, olheiro liberado. ALTERA `next`. */
export function managerNewSeason(next: CareerState): void {
  next.decisions = [];
  next.staffMarket = staffMarket(next.seed, next.season.year);
  next.scoutReadySlot = 0;
  next.vacancies = next.vacancies.filter((v) => v.year === next.season.year);
  if (next.manager.employed) {
    next.board = boardFor(next, next.userClubId, next.board);
    // Orçamento de staff caiu (rebaixamento, receita menor): encerra os contratos mais caros.
    let club = next.clubs[next.userClubId]!;
    while (club.staff && staffWeekly(club) > staffBudget(club)) {
      const priciest = Object.values(club.staff).filter((m): m is StaffMember => !!m).sort((a, b) => b.wage - a.wage)[0];
      if (!priciest) break;
      const staff = { ...club.staff };
      delete staff[priciest.role];
      club = { ...club, staff };
      addNews(next, 'staff', `Corte de orçamento: ${priciest.name} (${priciest.role}) deixa o clube.`);
    }
    next.clubs = { ...next.clubs, [club.id]: club };
  }
}

/** Vagas que o usuário pode assumir agora. */
export function jobsFor(c: CareerState): Vacancy[] {
  return availableJobs(c.vacancies, c.clubs, c.manager, c.userClubId, c.manager.idleSlots);
}

type Outcome = { career: CareerState; result: MarketResult };

/** Assume o comando de um clube com vaga aberta. */
export function acceptJob(c: CareerState, clubId: string, clone: (x: CareerState) => CareerState, pickXI: (x: CareerState) => CareerState): Outcome {
  if (!jobsFor(c).some((v) => v.clubId === clubId)) return { career: c, result: { ok: false, message: 'Essa vaga não está disponível para você.' } };
  const next = clone(c);
  const leaving = next.manager.employed;
  if (leaving) {
    updateSpell(next, (s) => ({ ...s, toYear: next.season.year, end: 'saiu' }));
    addNews(next, 'emprego', `Você deixou o ${next.clubs[next.userClubId]!.name}.`);
  }
  const club = next.clubs[clubId]!;
  next.clubs[clubId] = { ...club, staff: club.staff ?? initialStaff(club, next.seed) };
  next.userClubId = clubId;
  next.manager = { ...next.manager, employed: true, idleSlots: 0, spells: [...next.manager.spells, newSpell(clubId, next.season.year)] };
  next.board = boardFor(next, clubId);
  next.vacancies = next.vacancies.filter((v) => v.clubId !== clubId);
  next.inbox = [];
  next.decisions = [];
  addNews(next, 'emprego', `Você é o novo técnico do ${club.name}. ${MANDATE_META[next.board.mandate].note}`);
  return { career: pickXI(next), result: { ok: true, message: `Bem-vindo ao ${club.name}!` } };
}

/** Responde uma decisão pendente. */
export function answerDecision(c: CareerState, decisionId: string, option: number, clone: (x: CareerState) => CareerState): CareerState {
  const d = c.decisions.find((x) => x.id === decisionId);
  if (!d) return c;
  const next = clone(c);
  applyDecision(next, d, option);
  return next;
}

/** Contrata um profissional do mercado de staff (o atual do cargo sai). */
export function hireStaff(c: CareerState, staffId: string, clone: (x: CareerState) => CareerState): Outcome {
  const m = c.staffMarket.find((s) => s.id === staffId);
  if (!m) return { career: c, result: { ok: false, message: 'Profissional não encontrado.' } };
  if (!c.manager.employed) return { career: c, result: { ok: false, message: 'Você está sem clube.' } };
  const club = c.clubs[c.userClubId]!;
  const current = club.staff?.[m.role];
  if (staffWeekly(club) - (current?.wage ?? 0) + m.wage > staffBudget(club)) {
    return { career: c, result: { ok: false, message: `O salário passa do orçamento de staff (${Math.round(staffBudget(club) / 1000)} mil/sem).` } };
  }
  const next = clone(c);
  next.clubs[club.id] = { ...club, staff: { ...club.staff, [m.role]: m } };
  next.staffMarket = next.staffMarket.filter((s) => s.id !== staffId);
  addNews(next, 'staff', `${m.name} (nível ${m.level}) contratado${current ? `; ${current.name} deixa o clube` : ''}.`);
  return { career: next, result: { ok: true, message: `${m.name} contratado.` } };
}

/** Envia o olheiro para uma região: 3 prospectos aparecem como agentes livres só para você. */
export function sendScout(c: CareerState, region: ScoutRegion, clone: (x: CareerState) => CareerState): Outcome {
  if (!c.manager.employed) return { career: c, result: { ok: false, message: 'Você está sem clube.' } };
  if (isWorldSeasonOver(c.season)) return { career: c, result: { ok: false, message: 'Espere a próxima temporada.' } };
  if (c.season.nextSlot < c.scoutReadySlot) {
    return { career: c, result: { ok: false, message: `O olheiro volta de missão em ${c.scoutReadySlot - c.season.nextSlot} data(s).` } };
  }
  const club = c.clubs[c.userClubId]!;
  const next = clone(c);
  const prospects = scoutProspects(club, staffLevel(club, 'olheiro'), region, next.seed, next.season.year, next.season.nextSlot);
  for (const p of prospects) next.players[p.id] = p;
  next.scoutReadySlot = next.season.nextSlot + SCOUT_COOLDOWN;
  addNews(next, 'olheiro', `Relatório do olheiro (${region}): ${prospects.map((p) => `${p.name} (${p.age}, pot. ~${p.potential})`).join(', ')}.`);
  return { career: next, result: { ok: true, message: `O olheiro encontrou ${prospects.length} prospectos em ${region}. Veja em Mercado › Livres.` } };
}

/** Prospectos do usuário ainda sem clube. */
export function myProspects(c: CareerState): Player[] {
  return Object.values(c.players).filter((p) => p.scoutedFor === c.userClubId && p.clubId === null);
}

