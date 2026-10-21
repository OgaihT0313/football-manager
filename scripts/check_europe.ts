// Verificações das competições europeias (Fase 4): 5 temporadas completas do mundo com todas as
// competições, sem partida duplicada, sem clube em dois jogos na mesma data, formato certo e
// campeão coerente com a força. Sai com código 1 se falhar.
// Uso: npx tsx scripts/check_europe.ts [--temporadas 5] [--seed 3]

import { newCareer, simulateRounds, startNextSeason, type CareerState } from '../src/career/career';
import { MATCHES_PER_TEAM, type EuropeTier } from '../src/competitions/europe';
import { squadRating } from '../src/competitions/world';
import { generateFictionalWorld } from '../src/data/fictionalWorld';
import { serializeCareer } from '../src/save/saveService';
import { arg } from './lib';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const seasons = Number(arg('temporadas') ?? 5);
const world = generateFictionalWorld(2026);
let c: CareerState = newCareer({ leagues: world.leagues, clubs: world.clubs, players: world.players, userClubId: world.leagues[0]!.clubIds[3]!, seed: Number(arg('seed') ?? 3), year: 2026 });
const TIERS: EuropeTier[] = ['ucl', 'uel', 'uecl'];
const ratingOf = (cc: CareerState, id: string) => (cc.clubs[id]!.squad.length ? squadRating(cc.clubs[id]!, cc.players) : (cc.clubs[id]!.strength ?? 50));

let formatOk = true;
let noClash = true;
let noDup = true;
let disjoint = true;
let koOk = true;
let homeOk = true;
const champRanks: Record<EuropeTier, number[]> = { ucl: [], uel: [], uecl: [] };
const champStrength: Record<EuropeTier, number[]> = { ucl: [], uel: [], uecl: [] };
const times: number[] = [];
let prizeOk = true;
let maxSize = 0;

for (let s = 0; s < seasons; s++) {
  // Ranking de força no início da temporada (o "coeficiente" usado nos potes).
  const ranks: Record<EuropeTier, string[]> = { ucl: [], uel: [], uecl: [] };
  for (const t of TIERS) ranks[t] = (c.season.competitions[t]?.clubIds ?? []).slice().sort((a, b) => ratingOf(c, b) - ratingOf(c, a));
  const before = Object.fromEntries((c.season.competitions.ucl?.clubIds ?? []).map((id) => [id, c.clubs[id]!.finance.balance]));
  const t0 = performance.now();
  c = simulateRounds(c, Infinity, { aiControlsUser: true });
  times.push(performance.now() - t0);
  maxSize = Math.max(maxSize, serializeCareer(c, 0).length);
  const comps = Object.values(c.season.competitions);

  // Ninguém em dois jogos na mesma data, em todas as competições.
  const bySlot = new Map<number, Set<string>>();
  for (const comp of comps) {
    for (const f of comp.fixtures) {
      const set = bySlot.get(f.slot!) ?? new Set<string>();
      if (set.has(f.homeId) || set.has(f.awayId)) noClash = false;
      set.add(f.homeId);
      set.add(f.awayId);
      bySlot.set(f.slot!, set);
    }
  }
  const seenIds = new Set<string>();
  for (const comp of comps) for (const f of comp.fixtures) {
    if (seenIds.has(f.id)) noDup = false;
    seenIds.add(f.id);
  }

  const inEurope = new Map<string, EuropeTier>();
  for (const t of TIERS) {
    const comp = c.season.competitions[t];
    if (!comp) {
      formatOk = false;
      continue;
    }
    for (const id of comp.clubIds) {
      if (inEurope.has(id)) disjoint = false;
      inEurope.set(id, t);
    }
    const leagueIds = new Set(comp.stages[0]!.fixtureIds);
    const games: Record<string, number> = {};
    const home: Record<string, number> = {};
    const pairs = new Set<string>();
    for (const f of comp.fixtures.filter((x) => leagueIds.has(x.id))) {
      games[f.homeId] = (games[f.homeId] ?? 0) + 1;
      games[f.awayId] = (games[f.awayId] ?? 0) + 1;
      home[f.homeId] = (home[f.homeId] ?? 0) + 1;
      const key = [f.homeId, f.awayId].sort().join('|');
      if (pairs.has(key)) noDup = false;
      pairs.add(key);
    }
    const k = MATCHES_PER_TEAM[t];
    if (comp.clubIds.length !== 36 || comp.clubIds.some((id) => games[id] !== k)) formatOk = false;
    if (comp.clubIds.some((id) => home[id] !== k / 2)) homeOk = false;
    if (comp.stages.map((st) => st.fixtureIds.length).slice(1).join('/') !== '16/16/8/4/1' || !comp.championId) koOk = false;
    if (comp.championId) {
      champRanks[t].push(ranks[t].indexOf(comp.championId) + 1);
      champStrength[t].push(ratingOf(c, comp.championId));
    }
  }
  // Premiação: todo participante da Champions com elenco ganha dinheiro na temporada.
  for (const id of c.season.competitions.ucl?.clubIds ?? []) {
    const club = c.clubs[id]!;
    if (club.squad.length && club.finance.season.prizes < 6_000_000) prizeOk = false;
    void before;
  }
  if (s < seasons - 1) c = startNextSeason(c, { aiControlsUser: true });
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
check(`${seasons} temporadas com Champions, Europa League e Conference (36 clubes; 8/8/6 jogos)`, formatOk);
check('mando equilibrado na fase de liga (4/4/3 jogos em casa)', homeOk);
check('mata-mata completo: playoff 16, oitavas 16, quartas 8, semi 4, final 1 jogo(s)', koOk);
check('nenhuma partida duplicada (id ou confronto repetido na fase de liga)', noDup);
check('nenhum clube em dois jogos na mesma data (todas as competições)', noClash);
check('nenhum clube em duas copas europeias na mesma temporada', disjoint);
check('premiação da Champions paga a todos os participantes com elenco', prizeOk);
for (const t of TIERS) {
  const r = champRanks[t];
  // Coerente: na média, o campeão está entre os 9 mais fortes dos 36 (quarto de cima). Na
  // Conference os 36 têm força parecida: medido em 30 temporadas antes da Fase 6, o campeão ficou
  // em média em 10,7º; o limite dela é 12 (terço de cima).
  const limit = t === 'uecl' ? 12 : 9;
  check(`campeão da ${t.toUpperCase()} coerente com a força (posição média no ranking ≤ ${limit})`, r.length === seasons && mean(r) <= limit,
    `posições ${r.join(', ')} · força ${champStrength[t].map((x) => x.toFixed(0)).join(', ')}`);
}
check('tempo por temporada aceitável (< 5 s no Node)', Math.max(...times) < 5000, `${times.map((t) => (t / 1000).toFixed(1)).join(' / ')} s`);
check('save abaixo de 10 MB', maxSize < 10_000_000, `${(maxSize / 1e6).toFixed(2)} MB no pior fim de temporada`);

console.log(failures === 0 ? '\nTudo verde.' : `\n${failures} verificação(ões) falharam.`);
process.exit(failures === 0 ? 0 : 1);
