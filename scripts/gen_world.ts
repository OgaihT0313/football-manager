// Gera o mundo fictício (5 países, 1ª e 2ª divisões) em data/world/.
// Uso: npx tsx scripts/gen_world.ts [--seed 2026]

import { join } from 'node:path';
import { generateFictionalWorld } from '../src/data/fictionalWorld';
import { squadRating } from '../src/competitions/world';
import { arg, DATA, writeJson } from './lib';

const seed = Number(arg('seed') ?? 2026);
const world = generateFictionalWorld(seed);
const dir = join(DATA, 'world');
writeJson(join(dir, 'leagues.json'), world.leagues);
writeJson(join(dir, 'clubs.json'), world.clubs);
writeJson(join(dir, 'players.json'), world.players);
writeJson(join(dir, 'meta.json'), { source: `fictício (seed ${seed})` });

const players: Record<string, (typeof world.players)[number]> = {};
for (const p of world.players) players[p.id] = p;
console.log(`Mundo gerado com seed ${seed}: ${world.leagues.length} ligas, ${world.clubs.length} clubes, ${world.players.length} jogadores.`);
console.table(
  world.leagues.map((l) => {
    const clubs = l.clubIds.map((id) => world.clubs.find((c) => c.id === id)!);
    const ratings = clubs.map((c) => (c.squad.length ? squadRating(c, players) : (c.strength ?? 0)));
    return {
      liga: l.name,
      divisão: l.tier,
      clubes: clubs.length,
      'força máx': Math.max(...ratings).toFixed(1),
      'força mín': Math.min(...ratings).toFixed(1),
      'receita méd (mi)': (clubs.reduce((a, c) => a + c.finance.revenueBase, 0) / clubs.length / 1e6).toFixed(0),
    };
  }),
);
