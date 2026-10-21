// Prêmios da temporada (artilheiro, melhor jogador e revelação por liga; artilheiro e melhor
// das copas europeias) e conquistas do técnico.

import type { WorldSeason } from '../competitions/world';
import type { Club, LeagueConfig, Player } from '../domain/types';
import type { AwardWinner, CompetitionAwards, ManagerState } from './types';

/** Mínimo de jogos para disputar melhor jogador e revelação. */
const MIN_APPS = 20;
const MIN_APPS_YOUNG = 15;

function winner(p: Player | undefined, clubId: string, value: number): AwardWinner | undefined {
  return p ? { playerId: p.id, name: p.name, clubId, value: Math.round(value * 10) / 10 } : undefined;
}

/** Gols de cada jogador numa competição (os resultados resumidos guardam os gols). */
function goalsIn(ws: WorldSeason, compId: string): Record<string, { goals: number; clubId: string }> {
  const out: Record<string, { goals: number; clubId: string }> = {};
  for (const r of ws.competitions[compId]?.results ?? []) {
    for (const e of r.events) if (e.type === 'goal') (out[e.playerId] ??= { goals: 0, clubId: e.clubId }).goals++;
  }
  return out;
}

/**
 * Prêmios da temporada: para cada 1ª divisão com elenco, artilheiro, melhor jogador (maior nota
 * média, mínimo 20 jogos) e revelação (até 21 anos, mínimo 15 jogos); para cada copa europeia,
 * artilheiro e melhor jogador entre os participantes.
 */
export function seasonAwards(ws: WorldSeason, leagues: Record<string, LeagueConfig>, clubs: Record<string, Club>, players: Record<string, Player>): CompetitionAwards[] {
  const out: CompetitionAwards[] = [];
  const avg = (id: string) => {
    const s = ws.stats[id];
    return s && s.apps ? s.ratingSum / s.apps : 0;
  };
  for (const comp of Object.values(ws.competitions)) {
    const isTopLeague = comp.kind === 'league' && (leagues[comp.leagueId!]?.tier ?? 1) === 1 && (leagues[comp.leagueId!]?.mode ?? 'full') === 'full';
    if (!isTopLeague && comp.kind !== 'europe') continue;
    const goals = goalsIn(ws, comp.id);
    const top = Object.entries(goals).sort((a, b) => b[1].goals - a[1].goals)[0];
    const award: CompetitionAwards = { competitionId: comp.id };
    if (top) award.artilheiro = winner(players[top[0]], top[1].clubId, top[1].goals);
    const pool = comp.clubIds.flatMap((cid) => clubs[cid]?.squad ?? []).map((id) => players[id]).filter((p): p is Player => !!p);
    const minApps = comp.kind === 'europe' ? 6 : MIN_APPS;
    const best = pool.filter((p) => (ws.stats[p.id]?.apps ?? 0) >= minApps).sort((a, b) => avg(b.id) - avg(a.id))[0];
    if (best) award.melhor = winner(best, best.clubId ?? '', avg(best.id));
    if (isTopLeague) {
      const young = pool.filter((p) => p.age <= 21 && (ws.stats[p.id]?.apps ?? 0) >= MIN_APPS_YOUNG).sort((a, b) => avg(b.id) - avg(a.id))[0];
      if (young) award.revelacao = winner(young, young.clubId ?? '', avg(young.id));
    }
    out.push(award);
  }
  return out;
}

export interface Achievement {
  id: string;
  label: string;
  description: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'primeiro-titulo', label: 'Primeira taça', description: 'Ganhar o primeiro título como técnico.' },
  { id: 'campeao-liga', label: 'Campeão nacional', description: 'Ganhar uma liga nacional.' },
  { id: 'campeao-copa', label: 'Copeiro', description: 'Ganhar uma copa nacional.' },
  { id: 'campeao-champions', label: 'Rei da Europa', description: 'Ganhar a Champions League.' },
  { id: 'campeao-europeu', label: 'Taça continental', description: 'Ganhar a Europa League ou a Conference League.' },
  { id: 'acesso', label: 'De volta à elite', description: 'Subir da 2ª divisão.' },
  { id: 'cem-jogos', label: 'Cem jogos', description: 'Comandar 100 partidas.' },
  { id: 'tres-clubes', label: 'Rodado', description: 'Treinar 3 clubes diferentes.' },
  { id: 'demitido', label: 'Faz parte', description: 'Ser demitido pela primeira vez.' },
  { id: 'revelou', label: 'Formador', description: 'Ter a revelação de uma liga no elenco.' },
  { id: 'artilheiro', label: 'Ataque afiado', description: 'Ter o artilheiro de uma liga no elenco.' },
];

export interface AchievementContext {
  manager: ManagerState;
  titlesByKind: { league: number; cup: number; ucl: number; otherEurope: number };
  promoted: boolean;
  awards: CompetitionAwards[];
  userClubId: string;
}

/** Conquistas novas desbloqueadas agora (ids que o técnico ainda não tinha). */
export function newAchievements(ctx: AchievementContext): string[] {
  const has = new Set(ctx.manager.achievements);
  const got: string[] = [];
  const add = (id: string, cond: boolean) => {
    if (cond && !has.has(id)) got.push(id);
  };
  const t = ctx.titlesByKind;
  const totalTitles = ctx.manager.spells.reduce((a, s) => a + s.titles.length, 0);
  add('primeiro-titulo', totalTitles > 0);
  add('campeao-liga', t.league > 0);
  add('campeao-copa', t.cup > 0);
  add('campeao-champions', t.ucl > 0);
  add('campeao-europeu', t.otherEurope > 0);
  add('acesso', ctx.promoted);
  add('cem-jogos', ctx.manager.spells.reduce((a, s) => a + s.matches, 0) >= 100);
  add('tres-clubes', new Set(ctx.manager.spells.map((s) => s.clubId)).size >= 3);
  add('demitido', ctx.manager.spells.some((s) => s.end === 'demitido'));
  add('revelou', ctx.awards.some((a) => a.revelacao?.clubId === ctx.userClubId));
  const europe = new Set(['ucl', 'uel', 'uecl']);
  add('artilheiro', ctx.awards.some((a) => a.artilheiro?.clubId === ctx.userClubId && !europe.has(a.competitionId)));
  return got;
}
