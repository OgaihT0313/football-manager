// Mundo fictício da Fase 3: cinco países, cada um com 1ª divisão (elencos completos),
// 2ª divisão "por força" (clubes sem elenco), copa nacional e supercopa.
// Nomes de liga e copa são os reais (uso pessoal); clubes e jogadores são fictícios até o
// usuário importar dados reais (scripts/import_players.ts).

import { initFinance, setBoardBudgets, trainingFromReputation, emptyLedger } from '../club/finance';
import { FORMATION_LIST } from '../domain/positions';
import type { Club, Formation, LeagueConfig, Level, Player } from '../domain/types';
import { createRng, deriveSeed, gaussian, int, pick, shuffle, type Rng } from '../engine/rng';
import { wageDemand } from '../market/valuation';
import { generateSquad, makePlayer, STRENGTH_TIERS } from './fictionalLeague';

export interface CountrySpec {
  /** Prefixo dos ids (ing, esp, ita, ale, fra). */
  code: string;
  country: string;
  league: string;
  second: string;
  cup: string;
  supercup: string;
  clubs: number;
  relegation: number;
  /** Deslocamento de nível da liga (mais forte = maior). */
  offset: number;
  reputation: number;
  continental: { ucl: number; uel: number; uecl: number };
  cities: string[];
  suffixes: string[];
}

export const COUNTRIES: CountrySpec[] = [
  {
    code: 'ing', country: 'Inglaterra', league: 'Premier League', second: 'Championship', cup: 'FA Cup', supercup: 'Community Shield',
    clubs: 20, relegation: 3, offset: 1.5, reputation: 90, continental: { ucl: 4, uel: 1, uecl: 1 },
    cities: ['Ashford', 'Bramley', 'Carlton', 'Dunmore', 'Eastwick', 'Fairport', 'Glenmoor', 'Hartfield', 'Ingleby', 'Kingsbridge', 'Langford', 'Marlow', 'Northam', 'Oakhurst', 'Penford', 'Redcliffe', 'Stanmore', 'Thornbury', 'Upton', 'Westbrook', 'Whitby', 'Yarrow', 'Calder', 'Hollins', 'Riverton', 'Saltash', 'Wexley', 'Bexmoor', 'Crowley', 'Dalton', 'Elmswood', 'Foxley', 'Granby', 'Hexham', 'Lydney', 'Milbourne', 'Newbury', 'Oldcastle', 'Pemberton', 'Selby'],
    suffixes: ['United', 'City', 'Rovers', 'Athletic', 'Town', 'Wanderers', 'Albion', 'County', 'FC'],
  },
  {
    code: 'esp', country: 'Espanha', league: 'La Liga', second: 'La Liga 2', cup: 'Copa del Rey', supercup: 'Supercopa de España',
    clubs: 20, relegation: 3, offset: 1, reputation: 86, continental: { ucl: 4, uel: 1, uecl: 1 },
    cities: ['Alcora', 'Benamar', 'Calahonda', 'Dosrios', 'Elvira', 'Fuenmayor', 'Guadalmar', 'Hinojal', 'Iruela', 'Jaraiz', 'Lorquí', 'Montoro', 'Navalón', 'Olivares', 'Peñaflor', 'Quintana', 'Riosol', 'Salvatierra', 'Torremar', 'Valdemar', 'Zarzal', 'Almedina', 'Belmonte', 'Cardeña', 'Doñana', 'Escalona', 'Fresneda', 'Garrovilla', 'Humanes', 'Lucena', 'Medellar', 'Nerja', 'Orcera', 'Pinto', 'Ribera', 'Sotillo', 'Tordesillas', 'Utrera', 'Villanueva', 'Yecla'],
    suffixes: ['CF', 'FC', 'Deportivo', 'Real', 'Atlético', 'UD', 'CD', 'Racing', 'SD'],
  },
  {
    code: 'ita', country: 'Itália', league: 'Serie A', second: 'Serie B', cup: 'Coppa Italia', supercup: 'Supercoppa Italiana',
    clubs: 20, relegation: 3, offset: 0, reputation: 82, continental: { ucl: 4, uel: 1, uecl: 1 },
    cities: ['Albaro', 'Brenzone', 'Castelmare', 'Dorgali', 'Erbusco', 'Fiorenzo', 'Gallarate', 'Imola Nova', 'Lavagno', 'Montecorvo', 'Novalesa', 'Orvieto Alto', 'Pescolano', 'Quarona', 'Rivasolta', 'Sanvito', 'Torrebella', 'Valmonte', 'Zibello', 'Ardenza', 'Borgofranco', 'Cerreto', 'Dolceacqua', 'Feltrina', 'Grosseto Mare', 'Lucino', 'Marradi', 'Nervesa', 'Ostiglia', 'Pontedera', 'Ravarino', 'Sassuolo Vecchio', 'Tirano', 'Urbania', 'Vallecrosia', 'Varallo', 'Cingoli', 'Fermignano', 'Lanciano', 'Monterosso'],
    suffixes: ['Calcio', 'AC', 'FC', 'Sporting', 'Virtus', 'Unione', 'Atletico', 'SSC', 'US'],
  },
  {
    code: 'ale', country: 'Alemanha', league: 'Bundesliga', second: '2. Bundesliga', cup: 'DFB-Pokal', supercup: 'DFL-Supercup',
    clubs: 18, relegation: 2, offset: 0, reputation: 82, continental: { ucl: 4, uel: 1, uecl: 1 },
    cities: ['Altenberg', 'Bergheim', 'Coswig', 'Dornstadt', 'Eschweiler', 'Falkensee', 'Grünwald', 'Hennef', 'Ilmenau', 'Jüterbog', 'Kaltenkirchen', 'Lindau', 'Meerbusch', 'Neuried', 'Oberhof', 'Pinneberg', 'Quedlinburg', 'Rastede', 'Seelow', 'Torgau', 'Unterhaching', 'Vellmar', 'Weilheim', 'Zwiesel', 'Aschau', 'Bitterfeld', 'Calw', 'Donauwörth', 'Erding', 'Friedberg', 'Goslar', 'Hamelin', 'Kempten', 'Lahr', 'Marbach', 'Nordhorn'],
    suffixes: ['SV', 'FC', 'VfB', 'TSV', 'SC', 'Borussia', 'Eintracht', 'VfL', 'Fortuna'],
  },
  {
    code: 'fra', country: 'França', league: 'Ligue 1', second: 'Ligue 2', cup: 'Coupe de France', supercup: 'Trophée des Champions',
    clubs: 18, relegation: 2, offset: -1.5, reputation: 74, continental: { ucl: 3, uel: 1, uecl: 1 },
    cities: ['Aubrac', 'Belcastel', 'Cassel', 'Dinan', 'Étretat', 'Figeac', 'Gordes', 'Honfleur', 'Issoire', 'Joigny', 'Laval-sur-Mer', 'Moissac', 'Nérac', 'Orange-Ville', 'Pézenas', 'Quimperlé', 'Riom', 'Sarlat', 'Tournus', 'Uzès', 'Vitré', 'Albert', 'Bayeux', 'Céret', 'Dole', 'Évian', 'Fougères', 'Granville', 'Hyères', 'Lodève', 'Millau', 'Nyons', 'Pontarlier', 'Saumur', 'Tulle', 'Vienne-la-Haute'],
    suffixes: ['FC', 'Olympique', 'AS', 'Stade', 'Racing', 'SC', 'US', 'Athletic', 'Union'],
  },
];

/** Liga de fundo: só clubes "por força", que jogam sua liga e alimentam as competições europeias. */
export interface BackgroundSpec {
  code: string;
  country: string;
  league: string;
  clubs: number;
  /** Força do melhor clube e queda até o pior. */
  top: number;
  spread: number;
  reputation: number;
  continental: { ucl: number; uel: number; uecl: number };
  cities: string[];
  prefixes: string[];
}

export const BACKGROUND: BackgroundSpec[] = [
  { code: 'por', country: 'Portugal', league: 'Liga Portugal', clubs: 18, top: 79, spread: 17, reputation: 68, continental: { ucl: 2, uel: 1, uecl: 1 },
    cities: ['Alvorada', 'Barcelinhos', 'Castelo Novo', 'Douradas', 'Estremoz', 'Famalicão Velho', 'Gaia Nova', 'Horta Seca', 'Ílhavo', 'Lagoa Funda', 'Mafra', 'Nazaré', 'Olhão', 'Peniche', 'Queluz', 'Rio Maior', 'Sines', 'Tavira', 'Vizela', 'Seixal'], prefixes: ['Sporting', 'FC', 'Académico', 'Vitória', 'União', 'SC'] },
  { code: 'hol', country: 'Holanda', league: 'Eredivisie', clubs: 18, top: 78, spread: 17, reputation: 66, continental: { ucl: 2, uel: 1, uecl: 1 },
    cities: ['Alkmaar Noord', 'Breda West', 'Deventer', 'Emmen', 'Gouda', 'Heerlen', 'Leiden', 'Maastricht', 'Nijkerk', 'Oss', 'Purmerend', 'Roosendaal', 'Schiedam', 'Tiel', 'Venlo', 'Zaandam', 'Zwolle Oost', 'Helmond', 'Hoorn', 'Assen'], prefixes: ['FC', 'SC', 'VV', 'Sparta', 'Vitesse', 'Fortuna'] },
  { code: 'bel', country: 'Bélgica', league: 'Pro League', clubs: 16, top: 75, spread: 14, reputation: 60, continental: { ucl: 1, uel: 1, uecl: 1 },
    cities: ['Aalst', 'Beveren', 'Charleroi Sud', 'Dendermonde', 'Eupen', 'Geel', 'Hasselt', 'Kortrijk Oost', 'Lier', 'Mechelen Noord', 'Namur', 'Oostende', 'Roeselare', 'Tienen', 'Waregem', 'Zulte', 'Lokeren', 'Mouscron'], prefixes: ['KV', 'RSC', 'Royal', 'Sporting', 'Cercle', 'KRC'] },
  { code: 'tur', country: 'Turquia', league: 'Süper Lig', clubs: 18, top: 76, spread: 15, reputation: 60, continental: { ucl: 1, uel: 1, uecl: 1 },
    cities: ['Adana', 'Bursa Yeni', 'Çorum', 'Denizli', 'Edirne', 'Giresun', 'Hatay', 'Isparta', 'Kayseri', 'Konya Merkez', 'Malatya', 'Manisa', 'Ordu', 'Rize', 'Samsun', 'Sivas', 'Trabzon Liman', 'Urfa', 'Van', 'Zonguldak'], prefixes: ['spor', 'Gençlik', 'Belediye', 'FK', 'SK', 'İdman'] },
  { code: 'esc', country: 'Escócia', league: 'Premiership', clubs: 12, top: 73, spread: 13, reputation: 56, continental: { ucl: 1, uel: 1, uecl: 1 },
    cities: ['Airdrie', 'Arbroath', 'Dumbarton', 'Elgin', 'Falkirk', 'Greenock', 'Inverurie', 'Kilmarnock Vale', 'Montrose', 'Perth', 'Stirling', 'Troon', 'Peterhead', 'Forfar'], prefixes: ['FC', 'Athletic', 'United', 'Thistle', 'Rovers', 'Academicals'] },
  { code: 'aut', country: 'Áustria', league: 'Bundesliga (AUT)', clubs: 12, top: 72, spread: 12, reputation: 55, continental: { ucl: 1, uel: 1, uecl: 1 },
    cities: ['Amstetten', 'Bregenz', 'Dornbirn', 'Feldkirch', 'Hartberg Ost', 'Kapfenberg', 'Leoben', 'Lustenau', 'Mödling', 'Steyr', 'Villach', 'Wels', 'Wolfsberg Süd', 'Krems'], prefixes: ['SV', 'SK', 'FC', 'Admira', 'Austria', 'WSG'] },
  { code: 'sui', country: 'Suíça', league: 'Super League', clubs: 12, top: 71, spread: 12, reputation: 54, continental: { ucl: 1, uel: 1, uecl: 1 },
    cities: ['Aarau', 'Bellinzona', 'Chiasso', 'Delémont', 'Frauenfeld', 'Lugano Nord', 'Neuchâtel', 'Olten', 'Schaffhausen', 'Sion Ville', 'Thun', 'Wil', 'Winterthur Ost', 'Yverdon'], prefixes: ['FC', 'Servette', 'Grasshopper', 'Young', 'Concordia', 'AC'] },
  { code: 'gre', country: 'Grécia', league: 'Super League (GRE)', clubs: 14, top: 72, spread: 13, reputation: 54, continental: { ucl: 1, uel: 1, uecl: 1 },
    cities: ['Árta', 'Chania', 'Drama', 'Kalamata', 'Kavala', 'Lamia', 'Larissa', 'Patras', 'Rodes', 'Serres', 'Trikala', 'Veria', 'Xanthi', 'Volos', 'Ioannina', 'Kozani'], prefixes: ['Panathinaikos', 'Atromitos', 'Aris', 'AE', 'Asteras', 'PAS'] },
  { code: 'tch', country: 'Tchéquia', league: 'Chance Liga', clubs: 16, top: 70, spread: 13, reputation: 50, continental: { ucl: 1, uel: 1, uecl: 1 },
    cities: ['Brno Sever', 'Budějovice', 'Hradec', 'Jablonec Dolní', 'Karviná', 'Kladno', 'Liberec Horní', 'Mladá', 'Olomouc Jih', 'Opava', 'Ostrava Nová', 'Pardubice', 'Plzeň Západ', 'Teplice', 'Zlín', 'Příbram', 'Jihlava', 'Most'], prefixes: ['FK', 'SK', 'Baník', 'Slovan', 'Viktoria', 'Dukla'] },
  { code: 'din', country: 'Dinamarca', league: 'Superliga', clubs: 12, top: 70, spread: 12, reputation: 50, continental: { ucl: 1, uel: 1, uecl: 1 },
    cities: ['Aalborg Vest', 'Esbjerg', 'Fredericia', 'Herning', 'Horsens', 'Kolding', 'Lyngby', 'Næstved', 'Odense Øst', 'Randers', 'Silkeborg', 'Vejle', 'Viborg', 'Hillerød'], prefixes: ['FC', 'AGF', 'BK', 'IF', 'Brøndby', 'AaB'] },
  { code: 'cro', country: 'Croácia', league: 'HNL', clubs: 10, top: 70, spread: 11, reputation: 48, continental: { ucl: 1, uel: 1, uecl: 1 },
    cities: ['Osijek Novi', 'Rijeka Luka', 'Split Zapad', 'Varaždin', 'Zadar', 'Šibenik', 'Pula', 'Vinkovci', 'Karlovac', 'Slaven', 'Gorica', 'Lokomotiva'], prefixes: ['NK', 'HNK', 'Dinamo', 'Hajduk', 'Inter', 'Istra'] },
  { code: 'sev', country: 'Sérvia', league: 'Superliga (SRB)', clubs: 14, top: 70, spread: 13, reputation: 48, continental: { ucl: 1, uel: 1, uecl: 1 },
    cities: ['Čačak', 'Kragujevac', 'Kruševac', 'Leskovac', 'Niš', 'Novi Pazar', 'Novi Sad Jug', 'Pančevo', 'Smederevo', 'Subotica', 'Užice', 'Zemun', 'Vranje', 'Valjevo', 'Šabac'], prefixes: ['FK', 'Radnički', 'Vojvodina', 'Partizan', 'Crvena', 'Mladost'] },
];

export interface GeneratedWorld {
  leagues: LeagueConfig[];
  clubs: Club[];
  players: Player[];
}

const TIEBREAKERS: LeagueConfig['tiebreakers'] = ['points', 'goalDiff', 'goalsFor', 'headToHead', 'wins', 'awayGoalsFor'];

/** Níveis de uma 1ª divisão de n clubes a partir das faixas da liga de 20. */
function tiersFor(n: number): readonly [number, number][] {
  if (n >= STRENGTH_TIERS.length) return STRENGTH_TIERS;
  // Tira do meio da tabela, mantendo topo e fundo.
  const drop = STRENGTH_TIERS.length - n;
  const mid = Math.floor(STRENGTH_TIERS.length / 2);
  return [...STRENGTH_TIERS.slice(0, mid - Math.ceil(drop / 2)), ...STRENGTH_TIERS.slice(mid + Math.floor(drop / 2))];
}

function clubNames(rng: Rng, spec: CountrySpec, count: number): string[] {
  const cities = shuffle(rng, spec.cities).slice(0, count);
  return cities.map((city) => {
    const suffix = pick(rng, spec.suffixes);
    // Alguns prefixos vêm antes da cidade ("Real Alcora", "VfB Coswig").
    return ['Real', 'Atlético', 'Deportivo', 'Racing', 'VfB', 'TSV', 'SV', 'VfL', 'Borussia', 'Eintracht', 'Fortuna', 'AS', 'Stade', 'Olympique', 'Virtus', 'Unione', 'US', 'SSC'].includes(suffix)
      ? `${suffix} ${city}`
      : `${city} ${suffix}`;
  });
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const shortOf = (name: string, used: Set<string>) => {
  const letters = name.normalize('NFD').replace(/[^A-Za-z ]/g, '').split(' ').filter((w) => w.length > 2 && !['FC', 'CF', 'AC', 'SC', 'SV', 'US', 'AS', 'UD', 'CD', 'SD'].includes(w));
  const base = (letters[0] ?? name).slice(0, 3).toUpperCase();
  let s = base;
  for (let i = 1; used.has(s); i++) s = `${base.slice(0, 2)}${i}`;
  used.add(s);
  return s;
};

function baseClub(id: string, name: string, shortName: string, leagueId: string, formation: Formation, rng: Rng, level: number): Omit<Club, 'finance' | 'training'> {
  return {
    id,
    name,
    shortName,
    leagueId,
    squad: [],
    startingXI: [],
    tactic: { formation, pressing: int(rng, 2, 4) as Level, lineHeight: int(rng, 2, 4) as Level, tempo: int(rng, 2, 4) as Level },
    budget: 0,
    wageBudget: 0,
    reputation: Math.round(Math.max(1, Math.min(100, (level - 55) * 3))),
  };
}

/** Folha anual estimada de um elenco de nível `level`, para dar finanças a clubes sem elenco. */
function estimatedRevenue(level: number): number {
  const weekly = 11 * wageDemand({ ovr: Math.round(level), age: 27 }) + 14 * wageDemand({ ovr: Math.round(level - 7), age: 24 });
  return Math.max(3_000_000, Math.round((weekly * 52) / 0.6 / 100_000) * 100_000);
}

/** Clube "por força" (2ª divisão): sem elenco, com força e finanças estimadas. */
export function ghostClub(base: Omit<Club, 'finance' | 'training'>, strength: number): Club {
  const revenueBase = estimatedRevenue(strength);
  return setBoardBudgets({
    ...base,
    strength: Math.round(strength * 10) / 10,
    training: trainingFromReputation(base.reputation),
    finance: { balance: Math.round(revenueBase * 0.4), revenueBase, season: emptyLedger() },
  });
}

/** Dá elenco completo a um clube que só tinha força (ao subir para a 1ª divisão). */
export function populateClub(club: Club, rng: Rng, season: number): { club: Club; players: Player[] } {
  // +1,5: o clube que sobe se reforça para a 1ª divisão.
  const level = (club.strength ?? 65) + 1.5;
  const generated = generateSquad(rng, club.id, level, club.tactic.formation, season, `${club.id}-${season}`);
  const byId: Record<string, Player> = {};
  for (const p of generated) byId[p.id] = p;
  const { strength: _s, finance: oldFinance, training, ...rest } = club;
  // Receita e orçamentos saem da folha do elenco novo; o caixa acumulado continua.
  const fresh = initFinance({ ...rest, training, squad: generated.map((p) => p.id) }, byId);
  const withSquad = setBoardBudgets({ ...fresh, finance: { ...fresh.finance, balance: oldFinance.balance } });
  return { club: withSquad, players: generated };
}

export function generateFictionalWorld(seed: number, season = 2026): GeneratedWorld {
  const leagues: LeagueConfig[] = [];
  const clubs: Club[] = [];
  const players: Player[] = [];
  const used = new Set<string>();

  for (const spec of COUNTRIES) {
    const rng = createRng(deriveSeed(seed, spec.code));
    const names = clubNames(rng, spec, spec.clubs * 2);
    const top = names.slice(0, spec.clubs);
    const second = names.slice(spec.clubs);
    const l1: LeagueConfig = {
      id: `${spec.code}1`, name: spec.league, country: spec.country, clubIds: [], pointsForWin: 3, pointsForDraw: 1, legs: 2,
      tiebreakers: TIEBREAKERS, tier: 1, mode: 'full', relegation: spec.relegation, linkedLeagueId: `${spec.code}2`,
      cupName: spec.cup, supercupName: spec.supercup, continental: spec.continental, reputation: spec.reputation,
    };
    const l2: LeagueConfig = {
      id: `${spec.code}2`, name: spec.second, country: spec.country, clubIds: [], pointsForWin: 3, pointsForDraw: 1, legs: 2,
      tiebreakers: TIEBREAKERS, tier: 2, mode: 'strength', relegation: spec.relegation, linkedLeagueId: l1.id,
      reputation: Math.round(spec.reputation * 0.6),
    };

    // 1ª divisão: níveis por faixa, embaralhados entre os nomes.
    const levels = shuffle(rng, tiersFor(spec.clubs).map(([lo, hi]) => lo + rng.next() * (hi - lo) + spec.offset));
    const byId: Record<string, Player> = {};
    const firstDraft: Omit<Club, 'finance' | 'training'>[] = [];
    top.forEach((name, i) => {
      const id = `${l1.id}-${slug(name)}`;
      const formation: Formation = pick(rng, FORMATION_LIST);
      const base = baseClub(id, name, shortOf(name, used), l1.id, formation, rng, levels[i]!);
      const squad = generateSquad(rng, id, levels[i]!, formation, season);
      for (const p of squad) {
        byId[p.id] = p;
        players.push(p);
      }
      firstDraft.push({ ...base, squad: squad.map((p) => p.id) });
    });
    for (const c of firstDraft) clubs.push(initFinance(c, byId));
    l1.clubIds = firstDraft.map((c) => c.id);

    // 2ª divisão: só força, abaixo do fundo da 1ª.
    const bottom = Math.min(...levels);
    second.forEach((name) => {
      const id = `${l2.id}-${slug(name)}`;
      // Os melhores da 2ª ficam perto do fundo da 1ª: quem sobe briga para não cair.
      const strength = bottom - 3 + gaussian(rng, 0, 2.5);
      const base = baseClub(id, name, shortOf(name, used), l2.id, pick(rng, FORMATION_LIST), rng, strength);
      clubs.push(ghostClub(base, strength));
      l2.clubIds.push(id);
    });
    leagues.push(l1, l2);
  }

  // Ligas de fundo (Fase 4): uma divisão "por força" por país, que alimenta a Europa.
  for (const spec of BACKGROUND) {
    const rng = createRng(deriveSeed(seed, spec.code));
    const cities = shuffle(rng, spec.cities).slice(0, spec.clubs);
    const league: LeagueConfig = {
      id: `${spec.code}1`, name: spec.league, country: spec.country, clubIds: [], pointsForWin: 3, pointsForDraw: 1, legs: 2,
      tiebreakers: TIEBREAKERS, tier: 1, mode: 'strength', relegation: 0, continental: spec.continental, reputation: spec.reputation,
    };
    cities.forEach((city, i) => {
      const prefix = pick(rng, spec.prefixes);
      const name = prefix === 'spor' ? `${city}spor` : `${prefix} ${city}`;
      const id = `${league.id}-${slug(name)}`;
      const strength = spec.top - spec.spread * Math.pow(i / Math.max(1, spec.clubs - 1), 0.8) + gaussian(rng, 0, 1.2);
      const base = baseClub(id, name, shortOf(name, used), league.id, pick(rng, FORMATION_LIST), rng, strength);
      clubs.push(ghostClub(base, strength));
      league.clubIds.push(id);
    });
    leagues.push(league);
  }
  return { leagues, clubs, players };
}

const OUTSIDE_POSITIONS = ['GK', 'CB', 'CB', 'LB', 'RB', 'DM', 'CM', 'CM', 'AM', 'LW', 'RW', 'ST', 'ST'] as const;

/**
 * Jogadores "de fora" (ligas menores e exterior) que chegam como agentes livres na virada, para o
 * mundo não ficar sem reposição. Nível entre o banco da 1ª divisão e a 2ª.
 */
export function outsideFreeAgents(rng: Rng, season: number, count: number, minLevel: number, maxLevel: number): Player[] {
  const out: Player[] = [];
  for (let i = 0; i < count; i++) {
    const pos = pick(rng, OUTSIDE_POSITIONS);
    const level = minLevel + rng.next() * (maxLevel - minLevel);
    const p = makePlayer(rng, `livre-${season}-${i + 1}`, null, pos, level, season, [21, 30]);
    out.push({ ...p, clubId: null, contract: { ...p.contract, expires: season } });
  }
  return out;
}

/** Completa um elenco curto com jogadores gerados no nível do clube (usado ao subir de divisão). */
export function topUpSquad(club: Club, players: Record<string, Player>, rng: Rng, season: number, target: number): Player[] {
  const level = club.strength ?? 65;
  const formation = club.tactic.formation;
  const generated = generateSquad(rng, club.id, level, formation, season, `${club.id}-r${season}`);
  // Prioriza as posições da formação que o elenco tem menos.
  const count: Record<string, number> = {};
  for (const id of club.squad) {
    const pos = players[id]?.positions[0];
    if (pos) count[pos] = (count[pos] ?? 0) + 1;
  }
  const picked: Player[] = [];
  for (const p of generated.sort((a, b) => (count[a.positions[0]!] ?? 0) - (count[b.positions[0]!] ?? 0))) {
    if (club.squad.length + picked.length >= target) break;
    picked.push(p);
    count[p.positions[0]!] = (count[p.positions[0]!] ?? 0) + 1;
  }
  return picked;
}
