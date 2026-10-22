// Vitrine das ligas de fundo (Fase 6). Clubes "por força" da 1ª divisão de fundo (Portugal,
// Holanda, Brasil...) não têm elenco, mas a cada temporada mostram alguns jogadores ao mercado:
// um destaque, uma joia e uma oportunidade. Eles são gerados na virada (sorteio estável pela
// seed, pelo ano e pelo clube), podem ser comprados pela IA e pelo usuário, e quem não for
// vendido some na virada seguinte ("ficou no exterior"). O save só guarda a vitrine do ano.

import type { Club, LeagueConfig, Player, Position } from '../domain/types';
import { createRng, deriveSeed, int, pick } from '../engine/rng';
import { makePlayer } from '../data/fictionalLeague';
import { BACKGROUND } from '../data/fictionalWorld';
import { REAL_BACKGROUND } from '../data/realWorld';
import { marketValue } from './valuation';

/** Ids das ligas de fundo e a nacionalidade dos seus jogadores. */
const NAT_BY_LEAGUE: Record<string, string> = Object.fromEntries([...BACKGROUND, ...REAL_BACKGROUND].map((b) => [`${b.code}1`, b.nat]));

/** Ligas de fora da Europa mostram mais jovens (fonte clássica de talento). */
const YOUTH_HEAVY = new Set(['bra1', 'arg1']);

const FIELD: Position[] = ['CB', 'CB', 'LB', 'RB', 'DM', 'CM', 'CM', 'AM', 'LW', 'RW', 'ST', 'ST'];

/** O clube é de uma liga de fundo (1ª divisão "por força", sem elenco)? */
export function isAbroadClub(club: Club, leagues: Record<string, LeagueConfig>): boolean {
  const l = leagues[club.leagueId];
  return !!l && !club.squad.length && (l.tier ?? 1) === 1 && l.mode === 'strength';
}

/** Jogadores da vitrine de um clube de fundo numa temporada. */
export function generateShowcase(club: Club, year: number, seed: number): Player[] {
  const rng = createRng(deriveSeed(seed, 'vitrine', year, club.id));
  const s = club.strength ?? 65;
  const nat = NAT_BY_LEAGUE[club.leagueId];
  const youthHeavy = YOUTH_HEAVY.has(club.leagueId);
  const plan: { level: number; ages: [number, number]; growth?: [number, number] }[] = [
    // Destaque: o melhor do clube, no auge, acima da força média.
    { level: s + 2 + rng.next() * 4, ages: [21, 27] },
    // Joia: jovem abaixo do nível, com potencial alto.
    { level: s - 9 + rng.next() * 5, ages: [17, 20], growth: [1.5, 3] },
    // Oportunidade: titular comum, barato.
    { level: s - 2 + rng.next() * 3, ages: [23, 30] },
  ];
  if (youthHeavy) plan.push({ level: s - 10 + rng.next() * 5, ages: [17, 19], growth: [1.5, 3.3] });
  return plan.map((x, i) => {
    const pos = pick(rng, i === 0 && rng.next() < 0.1 ? (['GK'] as Position[]) : FIELD);
    const p = makePlayer(rng, `${club.id}-v${year}-${i + 1}`, club.id, pos, x.level, year, x.ages, x.growth);
    const contract = { ...p.contract, expires: year + int(rng, 1, 3) };
    return { ...p, ...(nat ? { nationality: nat } : {}), contract, value: marketValue({ ...p, contract }, year) };
  });
}

/**
 * Troca as vitrines: apaga quem não foi vendido e gera as do ano `year`. ALTERA `clubs` e
 * `players` (use cópias).
 */
export function refreshShowcases(
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  leagues: Record<string, LeagueConfig>,
  year: number,
  seed: number,
  /** Mantém a vitrine que o clube já trouxe dos dados (jogadores reais, na 1ª temporada). */
  keepExisting = false,
): void {
  if (!keepExisting) clearShowcases(clubs, players);
  for (const club of Object.values(clubs)) {
    if (!isAbroadClub(club, leagues) || (keepExisting && club.showcase?.length)) continue;
    const list = generateShowcase(club, year, seed);
    for (const p of list) players[p.id] = p;
    clubs[club.id] = { ...club, showcase: list.map((p) => p.id) };
  }
}

/** Apaga os jogadores que sobraram nas vitrines. ALTERA `clubs` e `players`. */
export function clearShowcases(clubs: Record<string, Club>, players: Record<string, Player>): void {
  for (const club of Object.values(clubs)) {
    if (!club.showcase) continue;
    for (const id of club.showcase) if (players[id]?.clubId === club.id) delete players[id];
    const { showcase: _s, ...rest } = club;
    clubs[club.id] = rest;
  }
}

/** Jogadores à venda nas vitrines (para o mercado do usuário). */
export function showcasePlayers(clubs: Record<string, Club>, players: Record<string, Player>): Player[] {
  const out: Player[] = [];
  for (const club of Object.values(clubs)) for (const id of club.showcase ?? []) if (players[id]?.clubId === club.id) out.push(players[id]!);
  return out;
}
