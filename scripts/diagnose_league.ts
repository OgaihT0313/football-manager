// Simula várias temporadas seguidas do mundo (5 países, 1ª e 2ª divisões, copas) com mercado,
// finanças, evolução, acesso e rebaixamento, e mede se o mundo degenera.
//
// Uso: npx tsx scripts/diagnose_league.ts [--temporadas 10] [--carreiras 2] [--seed 1] [--liga-unica]
// A IA cuida de todos os clubes, inclusive o do "usuário". Com --liga-unica usa a liga de data/.

import { newCareer, simulateRounds, startNextSeason, type CareerState } from '../src/career/career';
import { clubLevel } from '../src/club/development';
import { weeklyWageBill } from '../src/club/finance';
import { generateFictionalLeague } from '../src/data/fictionalLeague';
import { generateFictionalWorld } from '../src/data/fictionalWorld';
import { deriveSeed } from '../src/engine/rng';
import { arg, flag, loadLeague } from './lib';

const seasons = Number(arg('temporadas') ?? 10);
const careers = Number(arg('carreiras') ?? 2);
const baseSeed = Number(arg('seed') ?? 1);
const single = flag('liga-unica');

interface SeasonStats {
  year: number;
  top11: number;
  top11Min: number;
  top11Max: number;
  ovrAll: number;
  age: number;
  young: number;
  squadMin: number;
  squadMax: number;
  wageRatio: number;
  balanceMed: number;
  broke: number;
  transfers: number;
  fees: number;
  loans: number;
  goalsPerGame: number;
  /** Gols por jogo de cada 1ª divisão. */
  leagueGoals: Record<string, number>;
  championPts: number;
  /** Colocação média de quem acabou de subir (1ª temporada na 1ª divisão). */
  promotedPos: number | null;
  /** Copas ganhas por clubes da 2ª divisão. */
  lowerCupWins: number;
  seconds: number;
}

const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** 1ª divisão com elenco completo (as ligas de fundo jogam "por força" e ficam de fora). */
function topLeagues(c: CareerState) {
  return Object.values(c.leagues).filter((l) => (l.tier ?? 1) === 1 && (l.mode ?? 'full') === 'full');
}

/** Medido no fim da temporada (antes da virada), só na 1ª divisão. */
function measure(c: CareerState, promotedNow: Set<string>, seconds: number): SeasonStats {
  const tops = topLeagues(c);
  const clubs = tops.flatMap((l) => l.clubIds).map((id) => c.clubs[id]!);
  const levels = clubs.map((cl) => clubLevel(cl, c.players));
  const contracted = clubs.flatMap((cl) => cl.squad.map((id) => c.players[id]!)).filter(Boolean);
  const ratios = clubs.map((cl) => (weeklyWageBill(cl, c.players) * 52) / cl.finance.revenueBase);
  const balances = clubs.map((cl) => cl.finance.balance / cl.finance.revenueBase);
  const t = c.transfers.filter((x) => x.year === c.season.year);
  const leagueGoals: Record<string, number> = {};
  let goals = 0;
  let games = 0;
  let champ = 0;
  const promotedPositions: number[] = [];
  for (const l of tops) {
    const comp = c.season.competitions[l.id]!;
    const g = comp.results.reduce((a, r) => a + r.homeGoals + r.awayGoals, 0);
    leagueGoals[l.name] = g / comp.results.length;
    goals += g;
    games += comp.results.length;
    champ += comp.table[0]!.points;
    comp.table.forEach((row, i) => {
      if (promotedNow.has(row.clubId)) promotedPositions.push(i + 1);
    });
  }
  const lowerIds = new Set(Object.values(c.leagues).filter((l) => l.tier === 2).flatMap((l) => l.clubIds));
  const lowerCupWins = Object.values(c.season.competitions).filter((comp) => comp.kind === 'cup' && comp.championId && lowerIds.has(comp.championId)).length;
  return {
    year: c.season.year,
    top11: mean(levels),
    top11Min: Math.min(...levels),
    top11Max: Math.max(...levels),
    ovrAll: mean(contracted.map((p) => p.ovr)),
    age: mean(contracted.map((p) => p.age)),
    young: contracted.filter((p) => p.age <= 21).length / contracted.length,
    squadMin: Math.min(...clubs.map((cl) => cl.squad.length)),
    squadMax: Math.max(...clubs.map((cl) => cl.squad.length)),
    wageRatio: mean(ratios),
    balanceMed: median(balances),
    broke: balances.filter((b) => b < -0.5).length,
    transfers: t.filter((x) => x.type === 'transfer').length,
    fees: t.filter((x) => x.type === 'transfer').reduce((a, x) => a + x.fee, 0),
    loans: t.filter((x) => x.type === 'loan').length,
    goalsPerGame: goals / games,
    leagueGoals,
    championPts: champ / tops.length,
    promotedPos: promotedPositions.length ? mean(promotedPositions) : null,
    lowerCupWins,
    seconds,
  };
}

function startCareer(seed: number): CareerState {
  if (single) {
    const fixed = loadLeague() ?? generateFictionalLeague({ seed: 2026 });
    return newCareer({ leagues: [fixed.league], clubs: fixed.clubs, players: fixed.players, userClubId: fixed.league.clubIds[0]!, seed, year: 2026 });
  }
  const w = generateFictionalWorld(2026);
  return newCareer({ leagues: w.leagues, clubs: w.clubs, players: w.players, userClubId: w.leagues[0]!.clubIds[0]!, seed, year: 2026 });
}

const all: SeasonStats[][] = [];
const t0 = performance.now();
for (let k = 0; k < careers; k++) {
  let c = startCareer(deriveSeed(baseSeed, 'carreira', k));
  const rows: SeasonStats[] = [];
  let promotedNow = new Set<string>();
  for (let s = 0; s < seasons; s++) {
    const ts = performance.now();
    c = simulateRounds(c, Infinity, { aiControlsUser: true });
    rows.push(measure(c, promotedNow, (performance.now() - ts) / 1000));
    if (s < seasons - 1) {
      const before = new Set(topLeagues(c).flatMap((l) => l.clubIds));
      c = startNextSeason(c, { aiControlsUser: true });
      promotedNow = new Set(topLeagues(c).flatMap((l) => l.clubIds).filter((id) => !before.has(id)));
    }
  }
  all.push(rows);
}
const elapsed = (performance.now() - t0) / 1000;

const M = (v: number) => (v / 1e6).toFixed(0);
const pct = (v: number) => (100 * v).toFixed(0) + '%';
const avgRows = Array.from({ length: seasons }, (_, i) => {
  const xs = all.map((r) => r[i]!);
  const f = (k: keyof SeasonStats) => mean(xs.map((x) => x[k] as number));
  const promoted = xs.map((x) => x.promotedPos).filter((x): x is number => x !== null);
  return {
    temp: xs[0]!.year,
    'top11 méd': f('top11').toFixed(1),
    'top11 mín-máx': `${f('top11Min').toFixed(0)}-${f('top11Max').toFixed(0)}`,
    'ovr todos': f('ovrAll').toFixed(1),
    idade: f('age').toFixed(1),
    '≤21': pct(f('young')),
    elenco: `${Math.min(...xs.map((x) => x.squadMin))}-${Math.max(...xs.map((x) => x.squadMax))}`,
    'folha/receita': pct(f('wageRatio')),
    'caixa méd/R': f('balanceMed').toFixed(2),
    transf: f('transfers').toFixed(0),
    'taxas M': M(f('fees')),
    empr: f('loans').toFixed(0),
    'campeão pts': f('championPts').toFixed(0),
    'gols/j': f('goalsPerGame').toFixed(2),
    'promovidos (pos)': promoted.length ? mean(promoted).toFixed(1) : '-',
    'copas 2ª div': f('lowerCupWins').toFixed(1),
    's/temp': f('seconds').toFixed(1),
  };
});

console.log(`\nDiagnóstico: ${careers} carreira(s) x ${seasons} temporadas, ${single ? 'liga única' : 'mundo (5 países)'} — IA em todos os clubes; métricas da 1ª divisão`);
console.table(avgRows);

const flat = all.flat();
const first = mean(all.map((r) => r[0]!.top11));
const last = mean(all.map((r) => r[r.length - 1]!.top11));
const leagueNames = Object.keys(flat[0]!.leagueGoals);
const perLeague = leagueNames.map((n) => ({ liga: n, 'gols/j (média)': mean(flat.map((x) => x.leagueGoals[n] ?? 0)).toFixed(2) }));
if (!single) console.table(perLeague);
const promotedAll = flat.map((x) => x.promotedPos).filter((x): x is number => x !== null);
const criteria = [
  { nome: 'OVR médio dos titulares estável (Δ entre 1ª e última ≤ 3)', medido: `${first.toFixed(1)} → ${last.toFixed(1)}`, ok: Math.abs(last - first) <= 3 },
  { nome: 'Nenhum elenco < 18 ou > 30', medido: `${Math.min(...flat.map((x) => x.squadMin))}–${Math.max(...flat.map((x) => x.squadMax))}`, ok: flat.every((x) => x.squadMin >= 18 && x.squadMax <= 30) },
  { nome: 'Nenhum clube quebrado (caixa < -50% da receita)', medido: `${Math.max(...flat.map((x) => x.broke))} no pior ano`, ok: flat.every((x) => x.broke === 0) },
  { nome: 'Folha/receita média entre 45% e 75%', medido: `${pct(Math.min(...flat.map((x) => x.wageRatio)))}–${pct(Math.max(...flat.map((x) => x.wageRatio)))}`, ok: flat.every((x) => x.wageRatio >= 0.45 && x.wageRatio <= 0.75) },
  { nome: 'Idade média entre 24 e 28', medido: `${Math.min(...flat.map((x) => x.age)).toFixed(1)}–${Math.max(...flat.map((x) => x.age)).toFixed(1)}`, ok: flat.every((x) => x.age >= 24 && x.age <= 28) },
  { nome: 'Mercado vivo (≥ 10 transferências pagas por temporada)', medido: `mín ${Math.min(...flat.map((x) => x.transfers))}`, ok: flat.every((x) => x.transfers >= 10) },
  { nome: 'Gols por jogo: média 2,6–2,9', medido: mean(flat.map((x) => x.goalsPerGame)).toFixed(2), ok: Math.abs(mean(flat.map((x) => x.goalsPerGame)) - 2.75) <= 0.15 },
  ...(single
    ? [{ nome: 'Gols por jogo: cada temporada 2,45–3,2', medido: `${Math.min(...flat.map((x) => x.goalsPerGame)).toFixed(2)}–${Math.max(...flat.map((x) => x.goalsPerGame)).toFixed(2)}`, ok: flat.every((x) => x.goalsPerGame >= 2.45 && x.goalsPerGame <= 3.2) }]
    : [
        { nome: 'Gols por jogo de cada liga (média) 2,6–2,9', medido: perLeague.map((x) => x['gols/j (média)']).join(' / '), ok: perLeague.every((x) => Math.abs(Number(x['gols/j (média)']) - 2.75) <= 0.15) },
        { nome: 'Promovidos competitivos (posição média entre 9º e 17º)', medido: promotedAll.length ? mean(promotedAll).toFixed(1) : '-', ok: promotedAll.length > 0 && mean(promotedAll) >= 9 && mean(promotedAll) <= 17 },
      ]),
];
console.table(criteria.map((c) => ({ critério: c.nome, medido: c.medido, status: c.ok ? 'OK' : 'FORA' })));
console.log(`Tempo: ${elapsed.toFixed(1)} s (${((elapsed / (careers * seasons)) * 1000).toFixed(0)} ms por temporada com mercado)`);
process.exit(criteria.every((c) => c.ok) ? 0 : 1);
