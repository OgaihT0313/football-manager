// Utilitários de script (Node). O domínio em src/ não usa fs; só os scripts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GeneratedLeague } from '../src/data/fictionalLeague';
import type { Club, LeagueConfig, Player } from '../src/domain/types';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = join(ROOT, 'data');

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function saveLeague(gen: GeneratedLeague): void {
  writeJson(join(DATA, 'leagues', `${gen.league.id}.json`), gen.league);
  writeJson(join(DATA, 'clubs.json'), gen.clubs);
  writeJson(join(DATA, 'players.json'), gen.players);
}

export function loadLeague(leagueId = 'ficticia'): GeneratedLeague | null {
  const leaguePath = join(DATA, 'leagues', `${leagueId}.json`);
  if (!existsSync(leaguePath)) return null;
  const league = readJson<LeagueConfig>(leaguePath);
  const clubs = readJson<Club[]>(join(DATA, 'clubs.json')).filter((c) => c.leagueId === leagueId);
  const players = readJson<Player[]>(join(DATA, 'players.json'));
  return { league, clubs, players };
}

export function indexPlayers(players: Player[]): Record<string, Player> {
  const out: Record<string, Player> = {};
  for (const p of players) out[p.id] = p;
  return out;
}

/** Lê `--nome valor` ou `--nome=valor` dos argumentos. */
export function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === `--${name}`) return argv[i + 1];
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}

export function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}
