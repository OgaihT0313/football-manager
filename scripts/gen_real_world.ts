// Gera o mundo real em data/world/ a partir de um dataset do EA FC (formato sofifa, ex.: FC26).
// Uso: npx tsx scripts/gen_real_world.ts --csv caminho/FC26.csv [--temporada 2026] [--saida data/world]
// O CSV não vai para o repositório; só o mundo gerado. Detalhes em FORMATO-DADOS.md.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildRealWorld, REAL_TUNING, type WorldMeta } from '../src/data/realWorld';
import { arg, DATA, writeJson } from './lib';

const csvPath = arg('csv');
if (!csvPath || !existsSync(csvPath)) {
  console.error(`Erro: informe o CSV do dataset com --csv (não encontrado: ${csvPath ?? '—'})`);
  process.exit(1);
}
const season = Number(arg('temporada') ?? 2026);
const outDir = resolve(arg('saida') ?? join(DATA, 'world'));

const t0 = performance.now();
const world = buildRealWorld(readFileSync(csvPath, 'utf8'), season);
writeJson(join(outDir, 'leagues.json'), world.leagues);
writeJson(join(outDir, 'clubs.json'), world.clubs);
writeJson(join(outDir, 'players.json'), world.players);
const meta: WorldMeta = { source: `EA FC (${csvPath.split(/[\/]/).pop()})`, tuning: REAL_TUNING };
writeJson(join(outDir, 'meta.json'), meta);
console.log(`Mundo real: ${world.leagues.length} ligas, ${world.clubs.length} clubes, ${world.players.length} jogadores em ${outDir} (${Math.round(performance.now() - t0)} ms).`);
console.table(world.report.leagues.map((l) => ({ liga: l.name, id: l.id, clubes: l.clubs, jogadores: l.players, 'força máx': l.best, 'força mín': l.worst })));
for (const w of world.report.warnings) console.warn(`Aviso: ${w}`);
