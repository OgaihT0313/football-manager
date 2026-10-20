// Simula várias temporadas seguidas com mercado, finanças e evolução, e mede se a liga
// degenera (OVR disparando ou caindo, clubes quebrados, elencos vazios, idade fora do lugar).
//
// Uso: npx tsx scripts/diagnose_league.ts [--temporadas 10] [--carreiras 3] [--seed 1] [--detalhe]
// A IA cuida de todos os clubes, inclusive o do "usuário".

import { newCareer, simulateRounds, startNextSeason, type CareerState } from '../src/career/career';
import { clubLevel } from '../src/club/development';
import { weeklyWageBill } from '../src/club/finance';
import { generateFictionalLeague } from '../src/data/fictionalLeague';
import { deriveSeed } from '../src/engine/rng';
import { arg, flag, loadLeague } from './lib';

const seasons = Number(arg('temporadas') ?? 10);
const careers = Number(arg('carreiras') ?? 3);
const baseSeed = Number(arg('seed') ?? 1);
const detail = flag('detalhe');

interface SeasonStats {
  year: number;
  top11: number;
  top11Min: number;
  top11Max: number;
  ovrAll: number;
  age: number;
  young: number;
  old: number;
  squadMin: number;
  squadMax: number;
  wageRatio: number;
  overCap: number;
  balanceMin: number;
  balanceMed: number;
  broke: number;
  transfers: number;
  fees: number;
  loans: number;
  frees: number;
  releases: number;
  freeAgents: number;
  championPts: number;
  goalsPerGame: number;
  playersTotal: number;
}

const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** Medido no fim da temporada (antes da virada). */
function measure(c: CareerState): SeasonStats {
  const clubs = c.league.clubIds.map((id) => c.clubs[id]!);
  const levels = clubs.map((cl) => clubLevel(cl, c.players));
  const contracted = Object.values(c.players).filter((p) => p.clubId);
  const ratios = clubs.map((cl) => (weeklyWageBill(cl.id, c.players) * 52) / cl.finance.revenueBase);
  const balances = clubs.map((cl) => cl.finance.balance / cl.finance.revenueBase);
  const t = c.transfers.filter((x) => x.year === c.season.year);
  const results = c.season.results;
  return {
    year: c.season.year,
    top11: mean(levels),
    top11Min: Math.min(...levels),
    top11Max: Math.max(...levels),
    ovrAll: mean(contracted.map((p) => p.ovr)),
    age: mean(contracted.map((p) => p.age)),
    young: contracted.filter((p) => p.age <= 21).length / contracted.length,
    old: contracted.filter((p) => p.age >= 30).length / contracted.length,
    squadMin: Math.min(...clubs.map((cl) => cl.squad.length)),
    squadMax: Math.max(...clubs.map((cl) => cl.squad.length)),
    wageRatio: mean(ratios),
    overCap: clubs.filter((cl) => weeklyWageBill(cl.id, c.players) > cl.wageBudget * 1.05).length,
    balanceMin: Math.min(...balances),
    balanceMed: median(balances),
    broke: balances.filter((b) => b < -0.5).length,
    transfers: t.filter((x) => x.type === 'transfer').length,
    fees: t.filter((x) => x.type === 'transfer').reduce((a, x) => a + x.fee, 0),
    loans: t.filter((x) => x.type === 'loan').length,
    frees: t.filter((x) => x.type === 'free' && x.toClubId).length,
    releases: t.filter((x) => x.type === 'release').length,
    freeAgents: Object.values(c.players).filter((p) => !p.clubId).length,
    championPts: c.season.table[0]!.points,
    goalsPerGame: mean(results.map((r) => r.homeGoals + r.awayGoals)),
    playersTotal: Object.keys(c.players).length,
  };
}

const fixed = loadLeague() ?? generateFictionalLeague({ seed: 2026 });
const all: SeasonStats[][] = [];
const t0 = performance.now();
for (let k = 0; k < careers; k++) {
  const seed = deriveSeed(baseSeed, 'carreira', k);
  let c = newCareer({ ...fixed, userClubId: fixed.league.clubIds[0]!, seed, year: 2026 });
  const rows: SeasonStats[] = [];
  for (let s = 0; s < seasons; s++) {
    c = simulateRounds(c, Infinity, { aiControlsUser: true });
    rows.push(measure(c));
    if (s < seasons - 1) c = startNextSeason(c, { aiControlsUser: true });
  }
  all.push(rows);
}
const elapsed = (performance.now() - t0) / 1000;

const M = (v: number) => (v / 1e6).toFixed(0);
const pct = (v: number) => (100 * v).toFixed(0) + '%';
// Média entre carreiras, temporada a temporada.
const avgRows = Array.from({ length: seasons }, (_, i) => {
  const xs = all.map((r) => r[i]!);
  const f = (k: keyof SeasonStats) => mean(xs.map((x) => x[k] as number));
  return {
    temp: xs[0]!.year,
    'top11 méd': f('top11').toFixed(1),
    'top11 mín-máx': `${f('top11Min').toFixed(0)}-${f('top11Max').toFixed(0)}`,
    'ovr todos': f('ovrAll').toFixed(1),
    idade: f('age').toFixed(1),
    '≤21': pct(f('young')),
    '≥30': pct(f('old')),
    elenco: `${Math.min(...xs.map((x) => x.squadMin))}-${Math.max(...xs.map((x) => x.squadMax))}`,
    'folha/receita': pct(f('wageRatio')),
    'caixa mín/R': f('balanceMin').toFixed(2),
    'caixa méd/R': f('balanceMed').toFixed(2),
    transf: f('transfers').toFixed(0),
    'taxas M': M(f('fees')),
    empr: f('loans').toFixed(0),
    livres: f('frees').toFixed(0),
    'campeão pts': f('championPts').toFixed(0),
    'gols/j': f('goalsPerGame').toFixed(2),
  };
});

console.log(`\nDiagnóstico: ${careers} carreira(s) x ${seasons} temporadas (IA em todos os clubes)`);
console.table(avgRows);
if (detail) for (const rows of all) console.table(rows);

// Critérios de "não degenerou" (sobre todas as carreiras).
const flat = all.flat();
const first = mean(all.map((r) => r[0]!.top11));
const last = mean(all.map((r) => r[r.length - 1]!.top11));
const criteria = [
  { nome: 'OVR médio dos titulares estável (Δ entre 1ª e última ≤ 3)', medido: `${first.toFixed(1)} → ${last.toFixed(1)}`, ok: Math.abs(last - first) <= 3 },
  { nome: 'Nenhum elenco < 18 ou > 30', medido: `${Math.min(...flat.map((x) => x.squadMin))}–${Math.max(...flat.map((x) => x.squadMax))}`, ok: flat.every((x) => x.squadMin >= 18 && x.squadMax <= 30) },
  { nome: 'Nenhum clube quebrado (caixa < -50% da receita)', medido: `${Math.max(...flat.map((x) => x.broke))} no pior ano`, ok: flat.every((x) => x.broke === 0) },
  { nome: 'Folha/receita média entre 45% e 75%', medido: `${pct(Math.min(...flat.map((x) => x.wageRatio)))}–${pct(Math.max(...flat.map((x) => x.wageRatio)))}`, ok: flat.every((x) => x.wageRatio >= 0.45 && x.wageRatio <= 0.75) },
  { nome: 'Idade média entre 24 e 28', medido: `${Math.min(...flat.map((x) => x.age)).toFixed(1)}–${Math.max(...flat.map((x) => x.age)).toFixed(1)}`, ok: flat.every((x) => x.age >= 24 && x.age <= 28) },
  { nome: 'Mercado vivo (≥ 10 transferências pagas por temporada)', medido: `mín ${Math.min(...flat.map((x) => x.transfers))}`, ok: flat.every((x) => x.transfers >= 10) },
  // Uma temporada tem desvio de ~0,09 gol/jogo só por sorteio; por isso a faixa vale para a média
  // e cada temporada isolada só precisa ficar a até ~4 desvios (2,45–3,2).
  { nome: 'Gols por jogo: média 2,6–2,9', medido: mean(flat.map((x) => x.goalsPerGame)).toFixed(2), ok: Math.abs(mean(flat.map((x) => x.goalsPerGame)) - 2.75) <= 0.15 },
  { nome: 'Gols por jogo: cada temporada 2,45–3,2', medido: `${Math.min(...flat.map((x) => x.goalsPerGame)).toFixed(2)}–${Math.max(...flat.map((x) => x.goalsPerGame)).toFixed(2)}`, ok: flat.every((x) => x.goalsPerGame >= 2.45 && x.goalsPerGame <= 3.2) },
];
console.table(criteria.map((c) => ({ critério: c.nome, medido: c.medido, status: c.ok ? 'OK' : 'FORA' })));
console.log(`Jogadores no save ao fim: ${mean(all.map((r) => r[r.length - 1]!.playersTotal)).toFixed(0)} | agentes livres: ${mean(all.map((r) => r[r.length - 1]!.freeAgents)).toFixed(0)}`);
console.log(`Tempo: ${elapsed.toFixed(1)} s (${((elapsed / (careers * seasons)) * 1000).toFixed(0)} ms por temporada com mercado)`);
process.exit(criteria.every((c) => c.ok) ? 0 : 1);
