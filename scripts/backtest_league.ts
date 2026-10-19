// Simula N temporadas com seeds diferentes e imprime as métricas de calibração da Fase 0.
//
// Uso: npx tsx scripts/backtest_league.ts [--temporadas 500] [--seed 1] [--novas-ligas]
//        [--k 6] [--kGk 1.5] [--muHome 1.5] [--muAway 1.2] [--rho 0] [--midWeight 0.35]
//
// Sem --novas-ligas, usa a liga salva em data/ (gera se não existir). Com --novas-ligas, gera
// uma liga fictícia nova por temporada (mede o motor sem depender de um sorteio de elencos).

import { simulateSeason } from '../src/competitions/season';
import { generateFictionalLeague, type GeneratedLeague } from '../src/data/fictionalLeague';
import { chooseLineup } from '../src/engine/lineup';
import { DEFAULT_PARAMS, type EngineParams } from '../src/engine/matchEngine';
import { deriveSeed } from '../src/engine/rng';
import { arg, flag, indexPlayers, loadLeague, saveLeague } from './lib';

const seasons = Number(arg('temporadas') ?? 500);
const baseSeed = Number(arg('seed') ?? 1);
const newLeagues = flag('novas-ligas');

const params: EngineParams = { ...DEFAULT_PARAMS };
for (const key of Object.keys(params) as (keyof EngineParams)[]) {
  const v = arg(key);
  if (v !== undefined) params[key] = Number(v);
}

let fixed = newLeagues ? null : loadLeague();
if (!newLeagues && !fixed) {
  fixed = generateFictionalLeague({ seed: 2026 });
  saveLeague(fixed);
}

/** Força inicial = média do rendimento do XI ideal. */
function strongestClub(gen: GeneratedLeague, players: ReturnType<typeof indexPlayers>): string {
  let best = '';
  let bestV = -Infinity;
  for (const c of gen.clubs) {
    const l = chooseLineup(c, players);
    const v = l.slots.reduce((a, s) => a + s.rating, 0) / 11;
    if (v > bestV) {
      bestV = v;
      best = c.id;
    }
  }
  return best;
}

let games = 0;
let goals = 0;
let homeW = 0;
let draws = 0;
let awayW = 0;
const scoreCount: Record<string, number> = {};
const champPts: number[] = [];
const lastPts: number[] = [];
const strongestPos: number[] = [];
let strongestChamp = 0;
let nanCount = 0;

let cachedPlayers = fixed ? indexPlayers(fixed.players) : null;
let cachedStrongest = fixed && cachedPlayers ? strongestClub(fixed, cachedPlayers) : '';

const t0 = performance.now();
for (let s = 0; s < seasons; s++) {
  const seed = deriveSeed(baseSeed, 'temporada', s);
  let gen: GeneratedLeague;
  let players: ReturnType<typeof indexPlayers>;
  let strongest: string;
  if (fixed && cachedPlayers) {
    gen = fixed;
    players = cachedPlayers;
    strongest = cachedStrongest;
  } else {
    gen = generateFictionalLeague({ seed: deriveSeed(seed, 'liga') });
    players = indexPlayers(gen.players);
    strongest = strongestClub(gen, players);
  }

  const res = simulateSeason({ league: gen.league, clubs: gen.clubs, players, seed, params });
  for (const r of res.results) {
    games++;
    goals += r.homeGoals + r.awayGoals;
    if (!Number.isFinite(r.homeXg) || !Number.isFinite(r.awayXg)) nanCount++;
    if (r.homeGoals > r.awayGoals) homeW++;
    else if (r.homeGoals < r.awayGoals) awayW++;
    else draws++;
    const a = Math.min(r.homeGoals, r.awayGoals);
    const b = Math.max(r.homeGoals, r.awayGoals);
    const key = b >= 4 ? '4+ de um lado' : `${b}-${a}`;
    scoreCount[key] = (scoreCount[key] ?? 0) + 1;
  }
  champPts.push(res.table[0]!.points);
  lastPts.push(res.table[res.table.length - 1]!.points);
  const pos = res.table.findIndex((r) => r.clubId === strongest) + 1;
  strongestPos.push(pos);
  if (pos === 1) strongestChamp++;
}
const elapsed = (performance.now() - t0) / 1000;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (x: number) => (100 * x).toFixed(1) + '%';
const inRange = (v: number, lo: number, hi: number) => (v >= lo && v <= hi ? 'OK' : 'FORA');

const gpg = goals / games;
const hw = homeW / games;
const dr = draws / games;
const aw = awayW / games;
const cp = mean(champPts);
const lp = mean(lastPts);
const sc = strongestChamp / seasons;

console.log(`\nBacktest: ${seasons} temporadas, ${games} jogos, ${newLeagues ? 'liga nova por temporada' : 'liga de data/'}`);
console.log(`Parâmetros: ${JSON.stringify(params)}`);
console.table([
  { metrica: 'Gols por jogo', medido: gpg.toFixed(2), alvo: '2,6 – 2,9', status: inRange(gpg, 2.6, 2.9) },
  { metrica: 'Vitória do mandante', medido: pct(hw), alvo: '42 – 47%', status: inRange(hw, 0.42, 0.47) },
  { metrica: 'Empate', medido: pct(dr), alvo: '22 – 28%', status: inRange(dr, 0.22, 0.28) },
  { metrica: 'Vitória do visitante', medido: pct(aw), alvo: '27 – 32%', status: inRange(aw, 0.27, 0.32) },
  { metrica: 'Pontos do campeão', medido: cp.toFixed(1), alvo: '80 – 92', status: inRange(cp, 80, 92) },
  { metrica: 'Pontos do último', medido: lp.toFixed(1), alvo: '22 – 35', status: inRange(lp, 22, 35) },
  { metrica: 'Mais forte é campeão', medido: pct(sc), alvo: '30 – 50%', status: inRange(sc, 0.3, 0.5) },
]);
console.log(
  `Campeão: mín ${Math.min(...champPts)}, máx ${Math.max(...champPts)} | Último: mín ${Math.min(...lastPts)}, máx ${Math.max(...lastPts)} | Posição média do mais forte: ${mean(strongestPos).toFixed(2)}`,
);
const scores = Object.entries(scoreCount)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k}: ${pct(v / games)}`)
  .join(' | ');
console.log(`Placares (sem mando): ${scores}`);
console.log(`λ inválido (NaN/Infinity): ${nanCount}`);
console.log(`Tempo: ${elapsed.toFixed(1)} s (${((elapsed / seasons) * 1000).toFixed(1)} ms por temporada)`);
