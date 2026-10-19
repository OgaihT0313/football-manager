// Gera a liga fictícia em data/. Uso: npx tsx scripts/gen_fictional_league.ts [--seed 2026]

import { generateFictionalLeague } from '../src/data/fictionalLeague';
import { arg, saveLeague } from './lib';

const seed = Number(arg('seed') ?? 2026);
const gen = generateFictionalLeague({ seed });
saveLeague(gen);

const byClub = gen.clubs
  .map((c) => {
    const ovrs = c.squad.map((id) => gen.players.find((p) => p.id === id)!.ovr).sort((a, b) => b - a);
    const top11 = ovrs.slice(0, 11).reduce((a, b) => a + b, 0) / 11;
    return { nome: c.name, formacao: c.tactic.formation, top11: top11.toFixed(1), elenco: ovrs.length };
  })
  .sort((a, b) => Number(b.top11) - Number(a.top11));

console.log(`Liga gerada com seed ${seed}: ${gen.clubs.length} clubes, ${gen.players.length} jogadores.`);
console.table(byClub);
