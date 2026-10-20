// Converte um CSV de ratings em players.json + clubs.json.
//
// Uso: npx tsx scripts/import_players.ts --csv caminho.csv [--formato nativo|fifa]
//        [--saida data/import] [--temporada 2026] [--liga importada]
//
// A saída vai para uma pasta separada (padrão data/import/) para não sobrescrever a liga
// fictícia usada pelo backtest. Formato das colunas em FORMATO-DADOS.md.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ImportError, importPlayersCsv, type ImportFormat } from '../src/data/importPlayers';
import { arg, DATA, writeJson } from './lib';

const csvPath = arg('csv');
const format = (arg('formato') ?? 'nativo') as ImportFormat;
const outDir = resolve(arg('saida') ?? join(DATA, 'import'));
const season = Number(arg('temporada') ?? 2026);
const leagueId = arg('liga') ?? 'importada';

function fail(msg: string): never {
  console.error(`Erro: ${msg}`);
  process.exit(1);
}

if (!csvPath) fail('informe o arquivo com --csv caminho.csv');
if (format !== 'nativo' && format !== 'fifa') fail(`formato '${format}' desconhecido; use 'nativo' ou 'fifa'`);
if (!existsSync(csvPath)) fail(`arquivo não encontrado: ${csvPath}`);

try {
  const result = importPlayersCsv(readFileSync(csvPath, 'utf8'), { format, season, leagueId });
  writeJson(join(outDir, 'players.json'), result.players);
  writeJson(join(outDir, 'clubs.json'), result.clubs);
  writeJson(join(outDir, 'leagues.json'), result.leagues);
  for (const w of result.warnings) console.warn(`Aviso: ${w}`);
  console.log(`${result.players.length} jogadores, ${result.clubs.length} clubes e ${result.leagues.length} ligas gravados em ${outDir}`);
  console.log('Para jogar com esses dados, copie leagues.json, clubs.json e players.json para data/world/ (ver FORMATO-DADOS.md).');
} catch (e) {
  if (e instanceof ImportError) fail(e.message);
  throw e;
}
