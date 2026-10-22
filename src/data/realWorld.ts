// Mundo real a partir de um dataset do EA FC (formato sofifa, ex.: FC26). Mesma estrutura do
// mundo fictício (src/data/fictionalWorld.ts):
//   - 5 países com 1ª divisão (elencos reais, partidas completas) e 2ª divisão (elencos reais,
//     jogada "por força", como já acontece com quem cai);
//   - ligas de fundo "por força" com os clubes reais e força tirada dos elencos reais; os
//     jogadores reais delas não entram no mundo, só a vitrine da 1ª temporada (os 3–4 de mais
//     destaque de cada clube, à venda).
// Ligas com mais clubes do que cabem em 38 rodadas ficam com os 20 mais fortes.
// Sem fs: o script (scripts/gen_real_world.ts) faz o I/O.

import { initFinance } from '../club/finance';
import { FORMATION_LIST } from '../domain/positions';
import type { Club, Formation, LeagueConfig, Player } from '../domain/types';
import { autoLineup } from '../engine/lineup';
import { marketValue } from '../market/valuation';
import { COUNTRIES, ghostClub, type GeneratedWorld } from './fictionalWorld';
import type { WorldTuning } from './eras';
import { importPlayersCsv, slugify } from './importPlayers';

/**
 * Ajuste do mundo real, medido com scripts/diagnose_league.ts --mundo data/world --carreiras 5
 * (FC26, ver ROADMAP.md):
 *   - base +8: o mundo começa acima do equilíbrio da evolução (o XI médio caía 3,4 em 10 anos;
 *     com +8, cai 1,2);
 *   - forças ×1,3: as notas do EA FC são próximas (o campeão fazia ~76 pts; com ×1,3, ~80). Com
 *     ×1,45 ou ×1,6 o campeão passa de 82, mas os fracos quebram e os gols passam de 2,9.
 */
export const REAL_TUNING: WorldTuning = { youthBonus: 8, strengthScale: 1.3 };

/** Descrição do mundo gerado (data/world/meta.json). */
export interface WorldMeta {
  source: string;
  tuning?: WorldTuning;
}

/** Liga de fundo do mundo real: id da liga no dataset → código do jogo. */
interface RealBackground {
  fifaId: string;
  code: string;
  country: string;
  league: string;
  reputation: number;
  continental?: { ucl: number; uel: number; uecl: number };
  /** Nacionalidade (código) dos jovens gerados na vitrine das temporadas seguintes. */
  nat: string;
}

/** 1ª e 2ª divisões dos 5 países, pelo id da liga no dataset. */
const FULL_IDS: Record<string, { first: string; second: string }> = {
  ing: { first: '13', second: '14' },
  esp: { first: '53', second: '54' },
  ita: { first: '31', second: '32' },
  ale: { first: '19', second: '20' },
  fra: { first: '16', second: '17' },
};

/** Ligas de fundo com clubes suficientes no dataset (Grécia, Tchéquia, Croácia e Sérvia vêm incompletas). */
export const REAL_BACKGROUND: RealBackground[] = [
  { fifaId: '308', code: 'por', country: 'Portugal', league: 'Liga Portugal', reputation: 68, continental: { ucl: 2, uel: 1, uecl: 1 }, nat: 'POR' },
  { fifaId: '10', code: 'hol', country: 'Holanda', league: 'Eredivisie', reputation: 66, continental: { ucl: 2, uel: 1, uecl: 1 }, nat: 'NED' },
  { fifaId: '4', code: 'bel', country: 'Bélgica', league: 'Pro League', reputation: 60, continental: { ucl: 1, uel: 1, uecl: 1 }, nat: 'BEL' },
  { fifaId: '68', code: 'tur', country: 'Turquia', league: 'Süper Lig', reputation: 60, continental: { ucl: 1, uel: 1, uecl: 1 }, nat: 'TUR' },
  { fifaId: '50', code: 'esc', country: 'Escócia', league: 'Premiership', reputation: 56, continental: { ucl: 1, uel: 1, uecl: 1 }, nat: 'SCO' },
  { fifaId: '80', code: 'aut', country: 'Áustria', league: 'Bundesliga (AUT)', reputation: 55, continental: { ucl: 1, uel: 1, uecl: 1 }, nat: 'AUT' },
  { fifaId: '189', code: 'sui', country: 'Suíça', league: 'Super League', reputation: 54, continental: { ucl: 1, uel: 1, uecl: 1 }, nat: 'SUI' },
  { fifaId: '1', code: 'din', country: 'Dinamarca', league: 'Superliga', reputation: 50, continental: { ucl: 1, uel: 1, uecl: 1 }, nat: 'DEN' },
  { fifaId: '66', code: 'pol', country: 'Polônia', league: 'Ekstraklasa', reputation: 50, continental: { ucl: 1, uel: 1, uecl: 1 }, nat: 'POL' },
  { fifaId: '41', code: 'nor', country: 'Noruega', league: 'Eliteserien', reputation: 50, continental: { ucl: 1, uel: 1, uecl: 1 }, nat: 'NOR' },
  { fifaId: '56', code: 'sue', country: 'Suécia', league: 'Allsvenskan', reputation: 48, continental: { ucl: 1, uel: 1, uecl: 1 }, nat: 'SWE' },
  { fifaId: '330', code: 'rom', country: 'Romênia', league: 'Liga I', reputation: 48, continental: { ucl: 1, uel: 1, uecl: 1 }, nat: 'ROU' },
  { fifaId: '7', code: 'bra', country: 'Brasil', league: 'Brasileirão', reputation: 62, nat: 'BRA' },
  { fifaId: '353', code: 'arg', country: 'Argentina', league: 'Liga Profesional', reputation: 58, nat: 'ARG' },
];

/** Nacionalidade do dataset (nome em inglês) → código de 3 letras do jogo. */
const NAT_CODES: Record<string, string> = {
  England: 'ENG', Spain: 'ESP', Italy: 'ITA', Germany: 'GER', France: 'FRA', Brazil: 'BRA', Argentina: 'ARG',
  Portugal: 'POR', Netherlands: 'NED', Belgium: 'BEL', Türkiye: 'TUR', Scotland: 'SCO', Austria: 'AUT', Switzerland: 'SUI',
  Denmark: 'DEN', Poland: 'POL', Norway: 'NOR', Sweden: 'SWE', Romania: 'ROU', Croatia: 'CRO', Serbia: 'SRB',
  Uruguay: 'URU', Colombia: 'COL', Chile: 'CHI', Paraguay: 'PAR', Ecuador: 'ECU', Peru: 'PER', Venezuela: 'VEN',
  Mexico: 'MEX', 'United States': 'USA', Canada: 'CAN', Senegal: 'SEN', Nigeria: 'NGA', Ghana: 'GHA',
  "Côte d'Ivoire": 'CIV', Cameroon: 'CMR', Morocco: 'MAR', Algeria: 'ALG', Tunisia: 'TUN', Egypt: 'EGY', Mali: 'MLI',
  Guinea: 'GUI', 'Republic of Ireland': 'IRL', Wales: 'WAL', 'Northern Ireland': 'NIR', Ukraine: 'UKR', Czechia: 'CZE',
  Slovakia: 'SVK', Slovenia: 'SVN', Hungary: 'HUN', Greece: 'GRE', Georgia: 'GEO', Albania: 'ALB', Kosovo: 'KVX',
  'North Macedonia': 'MKD', 'Bosnia and Herzegovina': 'BIH', Montenegro: 'MNE', Finland: 'FIN', Iceland: 'ISL',
  Japan: 'JPN', 'Korea Republic': 'KOR', Australia: 'AUS', 'DR Congo': 'COD', Angola: 'ANG', Gabon: 'GAB',
  Jamaica: 'JAM', 'Cape Verde Islands': 'CPV', 'Guinea-Bissau': 'GNB', 'Burkina Faso': 'BFA', Gambia: 'GAM',
  Zambia: 'ZAM', Israel: 'ISR', Armenia: 'ARM', Bulgaria: 'BUL', Luxembourg: 'LUX', Suriname: 'SUR', Curacao: 'CUW',
};

const SKIP_WORDS = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'as', 'ssc', 'us', 'vfb', 'vfl', 'tsv', 'sv', 'rc', 'rcd', 'cd', 'ud', 'sd', 'ca', 'club', 'de', 'del', 'la', 'le', 'the', 'and', '1.', '1', 'fsv', 'sco', 'aj', 'ogc', 'losc', 'og', 'ec', 'se', 'sl', 'fk', 'sk', 'nk', 'kv', 'krc', 'bk', 'if', 'ik', 'aik', 'cs', 'cfr', 'fcsb']);

/** Sigla de 3 letras: "Manchester United" → MUN, "Arsenal" → ARS (sem repetir). */
function shortOf(name: string, used: Set<string>): string {
  const words = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 \-.]/g, '').split(/[\s-]+/).filter((w) => w && !SKIP_WORDS.has(w.toLowerCase()));
  const letters = (w: string) => w.replace(/[^A-Za-z]/g, '').toUpperCase();
  const tries: string[] = [];
  if (words.length >= 2) tries.push(letters(words[0]!).slice(0, 1) + letters(words[1]!).slice(0, 2));
  if (words[0]) tries.push(letters(words[0]).slice(0, 3));
  if (words.length >= 2) tries.push(letters(words[0]!).slice(0, 2) + letters(words[1]!).slice(0, 1));
  for (const t of tries) {
    if (t.length === 3 && !used.has(t)) {
      used.add(t);
      return t;
    }
  }
  const base = (tries[0] ?? letters(name)).padEnd(3, 'X').slice(0, 2);
  let s = `${base}1`;
  for (let i = 2; used.has(s); i++) s = `${base}${i}`;
  used.add(s);
  return s;
}

/** Força do XI ideal (descansado) de um elenco. */
function ratingOf(formation: Formation, squad: Player[]): number {
  const l = autoLineup(formation, squad.map((p) => ({ ...p, fitness: 100 })));
  return l.slots.length ? l.slots.reduce((a, s) => a + s.rating, 0) / l.slots.length : 0;
}

/** A formação em que o elenco rende mais. */
function bestFormation(squad: Player[]): { formation: Formation; rating: number } {
  let best = { formation: '4-3-3' as Formation, rating: -1 };
  for (const f of FORMATION_LIST) {
    const r = ratingOf(f, squad);
    if (r > best.rating + 0.05) best = { formation: f, rating: r };
  }
  return best;
}

export interface RealWorldReport {
  leagues: { id: string; name: string; clubs: number; players: number; best: number; worst: number }[];
  warnings: string[];
}

const MAX_CLUBS = 20;
const MAX_SQUAD_SIZE = 30;
const TIEBREAKERS: LeagueConfig['tiebreakers'] = ['points', 'goalDiff', 'goalsFor', 'headToHead', 'wins', 'awayGoalsFor'];

/** Monta o mundo real a partir do CSV do dataset. `season` = 1ª temporada do jogo. */
export function buildRealWorld(csv: string, season = 2026): GeneratedWorld & { report: RealWorldReport } {
  const imp = importPlayersCsv(csv, { format: 'fifa', season, leagueId: '', datasetIds: true });
  const warnings: string[] = [];
  const playersById: Record<string, Player> = {};
  for (const p of imp.players) {
    // Valor no padrão do jogo (o pedido de venda sai dele); nacionalidade em código.
    const fixed: Player = { ...p, nationality: NAT_CODES[p.nationality] ?? p.nationality };
    playersById[p.id] = { ...fixed, value: marketValue(fixed, season) };
  }
  const clubsByLeague: Record<string, Club[]> = {};
  for (const c of imp.clubs) (clubsByLeague[c.leagueId] ??= []).push(c);

  const used = new Set<string>();
  const leagues: LeagueConfig[] = [];
  const clubs: Club[] = [];
  const players: Player[] = [];
  const report: RealWorldReport = { leagues: [], warnings };

  /** Clubes de uma liga do dataset, ordenados pela força, com elenco e formação. */
  const prepare = (fifaId: string, max: number) => {
    const list = (clubsByLeague[fifaId] ?? []).map((c) => {
      const squad = c.squad.map((id) => playersById[id]!).filter(Boolean);
      const { formation, rating } = bestFormation(squad);
      return { c, squad, formation, rating };
    });
    list.sort((a, b) => b.rating - a.rating);
    if (list.length > max) warnings.push(`liga ${fifaId}: ${list.length} clubes, ficam os ${max} mais fortes`);
    return list.slice(0, max);
  };

  // Países com elenco completo (1ª e 2ª divisão).
  for (const spec of COUNTRIES) {
    const ids = FULL_IDS[spec.code]!;
    for (const tier of [1, 2] as const) {
      const fifaId = tier === 1 ? ids.first : ids.second;
      const leagueId = `${spec.code}${tier}`;
      const list = prepare(fifaId, MAX_CLUBS);
      const league: LeagueConfig =
        tier === 1
          ? {
              id: leagueId, name: spec.league, country: spec.country, clubIds: [], pointsForWin: 3, pointsForDraw: 1, legs: 2,
              tiebreakers: TIEBREAKERS, tier: 1, mode: 'full', relegation: spec.relegation, linkedLeagueId: `${spec.code}2`,
              cupName: spec.cup, supercupName: spec.supercup, continental: spec.continental, reputation: spec.reputation,
            }
          : {
              id: leagueId, name: spec.second, country: spec.country, clubIds: [], pointsForWin: 3, pointsForDraw: 1, legs: 2,
              tiebreakers: TIEBREAKERS, tier: 2, mode: 'strength', relegation: spec.relegation, linkedLeagueId: `${spec.code}1`,
              reputation: Math.round(spec.reputation * 0.6),
            };
      for (const { c, squad, formation, rating } of list) {
        const id = `${leagueId}-${slugify(c.name)}`;
        // Elenco grande demais: saem os piores (fora goleiros, para não ficar sem).
        const sorted = squad.slice().sort((a, b) => b.ovr - a.ovr);
        const keep = sorted.slice(0, MAX_SQUAD_SIZE);
        if (squad.length < 18) warnings.push(`${c.name}: só ${squad.length} jogadores no dataset`);
        const roster = keep.map((p) => ({ ...p, clubId: id }));
        for (const p of roster) players.push(p);
        const byId: Record<string, Player> = {};
        for (const p of roster) byId[p.id] = p;
        const base = {
          id,
          name: c.name,
          shortName: shortOf(c.name, used),
          leagueId,
          squad: roster.map((p) => p.id),
          startingXI: [],
          tactic: { formation, pressing: 3, lineHeight: 3, tempo: 3 } as Club['tactic'],
          budget: 0,
          wageBudget: 0,
          // Reputação pela força do XI, com um empurrão da liga.
          reputation: Math.round(Math.max(1, Math.min(100, (rating - 55) * 3 + (tier === 1 ? 0 : -6)))),
        };
        clubs.push(initFinance(base, byId));
        league.clubIds.push(id);
      }
      leagues.push(league);
      report.leagues.push({ id: leagueId, name: league.name, clubs: list.length, players: list.reduce((a, x) => a + Math.min(MAX_SQUAD_SIZE, x.squad.length), 0), best: round1(list[0]?.rating ?? 0), worst: round1(list[list.length - 1]?.rating ?? 0) });
    }
  }

  // Ligas de fundo: clubes reais "por força"; os destaques de cada um ficam na vitrine.
  for (const spec of REAL_BACKGROUND) {
    const leagueId = `${spec.code}1`;
    const list = prepare(spec.fifaId, MAX_CLUBS);
    if (list.length < 8) {
      warnings.push(`${spec.league}: só ${list.length} clubes no dataset, liga ignorada`);
      continue;
    }
    const league: LeagueConfig = {
      id: leagueId, name: spec.league, country: spec.country, clubIds: [], pointsForWin: 3, pointsForDraw: 1, legs: 2,
      tiebreakers: TIEBREAKERS, tier: 1, mode: 'strength', relegation: 0, reputation: spec.reputation,
      ...(spec.continental ? { continental: spec.continental } : {}),
    };
    const youthHeavy = spec.code === 'bra' || spec.code === 'arg';
    for (const { c, squad, formation, rating } of list) {
      const id = `${leagueId}-${slugify(c.name)}`;
      const base = {
        id, name: c.name, shortName: shortOf(c.name, used), leagueId, squad: [], startingXI: [],
        tactic: { formation, pressing: 3, lineHeight: 3, tempo: 3 } as Club['tactic'], budget: 0, wageBudget: 0,
        reputation: Math.round(Math.max(1, Math.min(100, (rating - 55) * 3))),
      };
      const showcase = pickShowcase(squad, youthHeavy ? 4 : 3).map((p) => ({ ...p, clubId: id }));
      for (const p of showcase) players.push(p);
      clubs.push({ ...ghostClub(base, rating), showcase: showcase.map((p) => p.id) });
      league.clubIds.push(id);
    }
    leagues.push(league);
    report.leagues.push({ id: leagueId, name: league.name, clubs: list.length, players: 0, best: round1(list[0]?.rating ?? 0), worst: round1(list[list.length - 1]?.rating ?? 0) });
  }
  return { leagues, clubs, players, report };
}

/** Vitrine real: o melhor, a maior promessa (até 21 anos) e o segundo melhor (e mais uma promessa). */
function pickShowcase(squad: Player[], n: number): Player[] {
  const out: Player[] = [];
  const add = (p: Player | undefined) => p && !out.includes(p) && out.push(p);
  const byOvr = squad.slice().sort((a, b) => b.ovr - a.ovr);
  const young = squad.filter((p) => p.age <= 21).sort((a, b) => b.potential - a.potential);
  add(byOvr[0]);
  add(young[0]);
  add(byOvr.find((p) => !out.includes(p)));
  if (n > 3) add(young.find((p) => !out.includes(p)) ?? byOvr.find((p) => !out.includes(p)));
  return out.slice(0, n);
}

const round1 = (v: number) => Math.round(v * 10) / 10;

