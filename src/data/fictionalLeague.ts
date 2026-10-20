// Gerador de liga fictícia (20 clubes x 25 jogadores) com distribuição de força realista:
// poucos clubes fortes, maioria média, alguns fracos.

import { computeOvr, FORMATIONS, FORMATION_LIST, POSITION_WEIGHTS, ratingAt } from '../domain/positions';
import type { Attributes, Club, Foot, Formation, LeagueConfig, Level, Player, Position } from '../domain/types';
import { initFinance } from '../club/finance';
import { createRng, gaussian, int, pick, shuffle, type Rng } from '../engine/rng';
import { marketValue, wageDemand } from '../market/valuation';

export interface GeneratedLeague {
  league: LeagueConfig;
  clubs: Club[];
  players: Player[];
}

export interface GenOptions {
  seed: number;
  leagueId?: string;
  season?: number;
}

/**
 * Nível-alvo (OVR médio dos titulares) por posição no ranking de força, do mais forte ao mais
 * fraco. Os valores são faixas [mín, máx]; cada clube sorteia dentro da sua.
 */
export const STRENGTH_TIERS: readonly [number, number][] = [
  [81, 83], [80.5, 82.5], [79.5, 81.5],
  [77, 79],
  [74, 76], [73, 75], [73, 75],
  [71, 73], [71, 73], [70, 72], [70, 72], [69, 71], [69, 71], [68, 70],
  [67, 69], [67, 69], [66, 68], [66, 68],
  [64, 66], [63, 65],
];

const CLUB_NAMES: readonly [string, string][] = [
  ['Atlético Vale Real', 'AVR'], ['Porto Sereno FC', 'PSE'], ['Real Montanha', 'RMO'],
  ['União Ribeira', 'URI'], ['Sporting Aurora', 'SAU'], ['Clube Náutico Baía', 'CNB'],
  ['Esporte Clube Pinhal', 'ECP'], ['Associação Lagoa Azul', 'ALA'], ['Ferroviário Central', 'FCE'],
  ['Operário da Serra', 'OSE'], ['Grêmio Campestre', 'GCA'], ['Independente do Norte', 'INO'],
  ['Estrela do Mar', 'EMA'], ['América do Planalto', 'APL'], ['Comercial de Itaboa', 'CIT'],
  ['Juventude Fluvial', 'JFL'], ['Olímpico Ventania', 'OVE'], ['Santa Clara do Sul', 'SCS'],
  ['Desportivo Pedreira', 'DPE'], ['Rio Claro United', 'RCU'],
];

const FIRST_NAMES = [
  'Lucas', 'Mateus', 'Gabriel', 'Rafael', 'Thiago', 'Bruno', 'Diego', 'Felipe', 'André', 'Pedro',
  'João', 'Caio', 'Vitor', 'Leandro', 'Rodrigo', 'Marcelo', 'Daniel', 'Igor', 'Hugo', 'Renan',
  'Luca', 'Marco', 'Andrea', 'Paolo', 'Nicolas', 'Antoine', 'Julien', 'Hugo', 'Jonas', 'Felix',
  'Lukas', 'Timo', 'Sergio', 'Pablo', 'Álvaro', 'Iker', 'Javier', 'Kai', 'Liam', 'Noah',
  'Oliver', 'Jack', 'Harry', 'Emeka', 'Moussa', 'Ibrahima', 'Youssef', 'Kenji', 'Mikkel', 'Erik',
];
const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Costa', 'Pereira', 'Almeida', 'Ferreira', 'Rocha', 'Lima',
  'Barbosa', 'Ribeiro', 'Martins', 'Carvalho', 'Gomes', 'Rossi', 'Bianchi', 'Romano', 'Ferrari',
  'Moreau', 'Laurent', 'Girard', 'Dubois', 'Müller', 'Schmidt', 'Weber', 'Wagner', 'García',
  'Fernández', 'López', 'Martínez', 'Navarro', 'Smith', 'Walker', 'Taylor', 'Wright', 'Diallo',
  'Traoré', 'Okafor', 'Mensah', 'Haddad', 'Tanaka', 'Nielsen', 'Larsen', 'Jansen', 'De Vries',
  'Novak', 'Kowalski', 'Andersson', 'Petrović',
];
const NATIONALITIES = [
  'BRA', 'BRA', 'POR', 'ESP', 'ESP', 'ITA', 'ITA', 'FRA', 'FRA', 'GER', 'GER', 'ENG', 'ENG', 'ARG',
  'NED', 'BEL', 'SEN', 'NGA', 'CIV', 'DEN', 'SWE', 'CRO', 'SRB', 'POL', 'JPN', 'URU', 'COL', 'MAR',
];

/** Posições secundárias plausíveis para cada posição principal. */
const SECONDARY: Record<Position, Position[]> = {
  GK: [],
  CB: ['DM', 'RB', 'LB'],
  LB: ['LW', 'RB', 'CB'],
  RB: ['RW', 'LB', 'CB'],
  DM: ['CM', 'CB'],
  CM: ['DM', 'AM'],
  AM: ['CM', 'LW', 'RW', 'ST'],
  LW: ['RW', 'AM', 'ST'],
  RW: ['LW', 'AM', 'ST'],
  ST: ['AM', 'LW', 'RW'],
};

const clamp = (v: number, lo = 1, hi = 99) => Math.max(lo, Math.min(hi, v));

/** Gera atributos cujo OVR na posição principal fica próximo de `target`. */
function makeAttributes(rng: Rng, pos: Position, target: number): Attributes {
  const w = POSITION_WEIGHTS[pos];
  const attrs: Attributes = { attack: 0, creation: 0, defending: 0, physical: 0, goalkeeping: 0 };
  const keys = Object.keys(attrs) as (keyof Attributes)[];
  // Goleiro: só `goalkeeping` define o nível; reposição (criação) e físico ficam abaixo dele.
  const anchors: (keyof Attributes)[] = pos === 'GK' ? ['goalkeeping'] : keys.filter((k) => w[k] > 0);
  for (const key of keys) {
    if (anchors.includes(key)) attrs[key] = target + gaussian(rng, 0, 4);
    else if (key === 'goalkeeping') attrs[key] = int(rng, 5, 20);
    else if (pos === 'GK') attrs[key] = target - (key === 'physical' ? 8 : key === 'creation' ? 20 : 40) + gaussian(rng, 0, 5);
    else attrs[key] = target - 18 + gaussian(rng, 0, 7);
  }
  // Corrige o desvio para o OVR cair no alvo, mexendo só nos atributos-âncora.
  for (let iter = 0; iter < 3; iter++) {
    const diff = target - ratingAt(attrs, pos);
    const share = anchors.reduce((a, k) => a + w[k], 0);
    for (const key of anchors) attrs[key] = clamp(attrs[key] + diff / share);
  }
  for (const key of keys) attrs[key] = Math.round(clamp(attrs[key]));
  return attrs;
}

/** Laterais e pontas esquerdas são canhotos na maioria; no resto, ~20% canhotos. */
function pickFoot(rng: Rng, pos: Position): Foot {
  const r = rng.next();
  if (pos === 'LB' || pos === 'LW') return r < 0.8 ? 'L' : 'R';
  if (r < 0.2) return 'L';
  return r < 0.24 ? 'B' : 'R';
}

export function makePlayer(
  rng: Rng,
  id: string,
  clubId: string | null,
  pos: Position,
  target: number,
  season: number,
  ageRange: [number, number],
  /** Pontos de potencial por ano abaixo dos 27: sorteado entre [mín, máx]. */
  growthRange: [number, number] = [1, 3],
): Player {
  const age = int(rng, ageRange[0], ageRange[1]);
  const attrs = makeAttributes(rng, pos, target);
  const ovr = computeOvr(attrs, pos);
  const positions: Position[] = [pos];
  for (const sec of SECONDARY[pos]) {
    if (positions.length < 3 && rng.next() < 0.35) positions.push(sec);
  }
  const growth = Math.max(0, 27 - age) * (growthRange[0] + rng.next() * (growthRange[1] - growthRange[0]));
  const potential = Math.round(clamp(ovr + growth, ovr, 99));
  // De 0 a 4 temporadas além da atual: ~1/5 dos contratos termina no fim desta temporada.
  const contract = { wage: wageDemand({ ovr, age }), expires: season + int(rng, 0, 4) };
  const value = marketValue({ ovr, age, potential, positions, contract }, season);
  return {
    id,
    name: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,
    age,
    nationality: pick(rng, NATIONALITIES),
    positions,
    foot: pickFoot(rng, pos),
    ovr,
    potential,
    contract,
    value,
    clubId,
    morale: 50,
    fitness: 100,
    ...attrs,
  };
}

/**
 * Elenco de 25 para um clube de nível `level` (OVR médio dos titulares): titular e reserva
 * para cada vaga da formação, terceiro goleiro e dois jovens coringas.
 */
export function generateSquad(rng: Rng, clubId: string, level: number, formation: Formation, season: number, idPrefix = clubId): Player[] {
  const slots = FORMATIONS[formation];
  const plan: { pos: Position; target: number; ages: [number, number] }[] = [];
  for (const pos of slots) {
    plan.push({ pos, target: level + gaussian(rng, 0, 2.5), ages: [21, 33] });
    plan.push({ pos, target: level - 5 + gaussian(rng, 0, 3), ages: [18, 34] });
  }
  plan.push({ pos: 'GK', target: level - 12 + gaussian(rng, 0, 3), ages: [17, 36] });
  for (let k = 0; k < 2; k++) {
    plan.push({ pos: pick(rng, slots.slice(1)), target: level - 8 + gaussian(rng, 0, 4), ages: [17, 21] });
  }
  return plan.map((p, j) => makePlayer(rng, `${idPrefix}-${String(j + 1).padStart(2, '0')}`, clubId, p.pos, p.target, season, p.ages));
}

export function generateFictionalLeague(opts: GenOptions): GeneratedLeague {
  const rng = createRng(opts.seed);
  const leagueId = opts.leagueId ?? 'ficticia';
  const season = opts.season ?? 2026;

  // Força sorteada por faixa e embaralhada entre os nomes, para o nome não indicar a força.
  const levels = STRENGTH_TIERS.map(([lo, hi]) => lo + rng.next() * (hi - lo));
  const names = shuffle(rng, CLUB_NAMES);

  const clubs: Omit<Club, 'finance' | 'training'>[] = [];
  const players: Player[] = [];

  names.forEach(([name, shortName], i) => {
    const level = levels[i] as number;
    const clubId = `${leagueId}-${shortName.toLowerCase()}`;
    const formation: Formation = pick(rng, FORMATION_LIST);
    const generated = generateSquad(rng, clubId, level, formation, season);
    players.push(...generated);
    const squad = generated.map((p) => p.id);

    clubs.push({
      id: clubId,
      name,
      shortName,
      leagueId,
      squad,
      startingXI: [],
      tactic: {
        formation,
        pressing: int(rng, 2, 4) as Level,
        lineHeight: int(rng, 2, 4) as Level,
        tempo: int(rng, 2, 4) as Level,
      },
      budget: 0,
      wageBudget: 0,
      reputation: Math.round(clamp((level - 55) * 3, 1, 100)),
    });
  });

  const league: LeagueConfig = {
    id: leagueId,
    name: 'Liga Fictícia',
    country: 'Fictícia',
    clubIds: clubs.map((c) => c.id),
    pointsForWin: 3,
    pointsForDraw: 1,
    legs: 2,
    tiebreakers: ['points', 'goalDiff', 'goalsFor', 'headToHead', 'wins', 'awayGoalsFor'],
  };

  // Finanças e orçamentos saem da folha salarial de cada elenco.
  const byId: Record<string, Player> = {};
  for (const p of players) byId[p.id] = p;
  return { league, clubs: clubs.map((c) => initFinance(c, byId)), players };
}
