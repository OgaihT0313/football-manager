// Escudos dos clubes e fotos dos jogadores do mundo real, pela imagem principal da página da
// Wikipedia em inglês. Grava data/world/images.json ({ clubs: {id: caminho}, players: {id: caminho} },
// caminho relativo a https://upload.wikimedia.org/wikipedia/). O app busca as imagens pela
// internet e, sem elas, usa a sigla do clube ou as iniciais do jogador.
//
// Para não trazer a foto da pessoa errada, jogador só é aceito quando a descrição da página diz
// "footballer" e traz o ano de nascimento do dataset; clube, quando fala de futebol.
//
// Uso: npx tsx scripts/fetch_images.ts --csv caminho/FC26.csv [--mundo data/world]

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { displayName, parseCsv } from '../src/data/importPlayers';
import type { Club, Player } from '../src/domain/types';
import { arg, DATA, writeJson } from './lib';

const csvPath = arg('csv');
const dir = arg('mundo') ?? join(DATA, 'world');
if (!csvPath) {
  console.error('Erro: informe o CSV do dataset com --csv');
  process.exit(1);
}
const UA = { 'User-Agent': 'football-manager-dev/0.8 (projeto pessoal; https://github.com/OgaihT0313/football-manager)' };
const PREFIX = 'https://upload.wikimedia.org/wikipedia/';

interface Page {
  description?: string;
  thumbnail?: { source: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Páginas por título (com redirecionamentos), em lotes de 50. */
async function lookup(titles: string[]): Promise<Record<string, Page>> {
  const out: Record<string, Page> = {};
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const params = new URLSearchParams({
      action: 'query', format: 'json', prop: 'pageimages|description', piprop: 'thumbnail', pithumbsize: '120', pilicense: 'any', redirects: '1', titles: chunk.join('|'),
    });
    let json: { query?: { pages?: Record<string, Page & { title: string }>; normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[] } } = {};
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: UA });
        if (res.ok) {
          json = await res.json();
          break;
        }
      } catch {
        // tenta de novo
      }
      await sleep(2000);
    }
    const q = json.query ?? {};
    const pages: Record<string, Page> = {};
    for (const p of Object.values(q.pages ?? {})) pages[p.title] = p;
    const map: Record<string, string> = {};
    for (const n of [...(q.normalized ?? []), ...(q.redirects ?? [])]) map[n.from] = n.to;
    for (const t of chunk) {
      let x = map[t] ?? t;
      x = map[x] ?? x;
      if (pages[x]) out[t] = pages[x]!;
    }
    await sleep(150);
  }
  return out;
}

/** Caminho curto da miniatura (sem o prefixo nem os parâmetros de rastreio). */
function shortPath(src: string): string | null {
  const clean = src.split('?')[0]!.replace('https://thumb.wikimedia.org/wikipedia/', PREFIX);
  return clean.startsWith(PREFIX) ? clean.slice(PREFIX.length) : null;
}

/** Tenta os candidatos em rodadas: só os que faltam passam para a próxima variante. */
async function resolve<T>(items: T[], variants: ((x: T) => string | null)[], accept: (x: T, p: Page) => boolean, label: string): Promise<Map<T, string>> {
  const found = new Map<T, string>();
  for (const [k, variant] of variants.entries()) {
    const pending = items.filter((x) => !found.has(x));
    const titles = [...new Set(pending.map(variant).filter((t): t is string => !!t))];
    const pages = await lookup(titles);
    for (const x of pending) {
      const t = variant(x);
      const p = t ? pages[t] : undefined;
      const path = p?.thumbnail && accept(x, p) ? shortPath(p.thumbnail.source) : null;
      if (path) found.set(x, path);
    }
    console.log(`${label}: variante ${k + 1} → ${found.size}/${items.length}`);
  }
  return found;
}

const clubs = JSON.parse(readFileSync(join(dir, 'clubs.json'), 'utf8')) as Club[];
const players = JSON.parse(readFileSync(join(dir, 'players.json'), 'utf8')) as Player[];
const { header, rows } = parseCsv(readFileSync(csvPath, 'utf8'));
const col = (r: string[], name: string) => (r[header.indexOf(name)] ?? '').trim();
const byFcId = new Map(rows.map((r) => [`fc-${col(r, 'player_id')}`, r]));

/** Títulos da Wikipedia para nomes curtos ou ambíguos do dataset. */
const CLUB_TITLES: Record<string, string> = {
  'Athletic Club': 'Athletic Bilbao', Inter: 'Inter Milan', Atalanta: 'Atalanta BC', Sassuolo: 'US Sassuolo Calcio', Genoa: 'Genoa CFC',
  Lecce: 'US Lecce', Monza: 'AC Monza', Spezia: 'Spezia Calcio', Catanzaro: 'US Catanzaro 1929', Pescara: 'Delfino Pescara 1936',
  'Südtirol': 'FC Südtirol', Padova: 'Calcio Padova', Reggiana: 'AC Reggiana 1919', Avellino: 'US Avellino 1912',
  'Famalicão': 'F.C. Famalicão', 'Santa Clara': 'C.D. Santa Clara', 'Casa Pia': 'Casa Pia A.C.', Excelsior: 'Excelsior Rotterdam',
  'FC Volendam': 'FC Volendam', 'Royal Charleroi Sporting Club': 'R. Charleroi S.C.', 'SK Rapid': 'SK Rapid Wien', 'Grazer AK 1902': 'Grazer AK',
  'FC St.Gallen 1879': 'FC St. Gallen', Fredericia: 'FC Fredericia', 'SK Brann': 'SK Brann', 'Strømsgodset IF': 'Strømsgodset IF',
  AIK: 'AIK Fotboll', 'IFK Värnamo': 'IFK Värnamo', 'Universitatea Craiova': 'CS Universitatea Craiova',
  'Asociația Clubul Sportiv Petrolul 52': 'FC Petrolul Ploiești', Bahia: 'Esporte Clube Bahia', 'River Plate': 'Club Atlético River Plate',
  'Racing Club': 'Racing Club de Avellaneda', 'Vélez Sarsfield': 'Club Atlético Vélez Sarsfield', 'Lanús': 'Club Atlético Lanús',
  Talleres: 'Talleres de Córdoba', Independiente: 'Club Atlético Independiente', 'Godoy Cruz': 'Godoy Cruz Antonio Tomba',
  'Club Atlético Unión': 'Unión de Santa Fe',
};

const clubAccept = (_: Club, p: Page) => /football|soccer|sports club/i.test(p.description ?? '');
const clubImages = await resolve(
  clubs,
  [(c) => CLUB_TITLES[c.name] ?? c.name, (c) => `${c.name} F.C.`, (c) => `${c.name} FC`, (c) => `${c.name} Football Club`, (c) => `${c.name} (football club)`, (c) => `${c.name} F.C. (football club)`],
  clubAccept,
  'escudos',
);

interface Who {
  id: string;
  short: string;
  long: string;
  shown: string;
  year: string;
}
const who: Who[] = players
  .map((p) => {
    const r = byFcId.get(p.id);
    if (!r) return null;
    const short = col(r, 'short_name');
    const long = col(r, 'long_name');
    return { id: p.id, short, long, shown: displayName(short, long), year: col(r, 'dob').slice(0, 4) };
  })
  .filter((x): x is Who => !!x && !!x.year);
const playerImages = await resolve(
  who,
  [
    (w) => w.shown,
    (w) => `${w.shown} (footballer)`,
    (w) => `${w.shown} (footballer, born ${w.year})`,
    (w) => w.long,
    (w) => (w.short !== w.shown ? `${w.short} (footballer)` : null),
    (w) => (w.short !== w.shown ? `${w.short} (footballer, born ${w.year})` : null),
  ],
  (w, p) => /footballer|soccer player/i.test(p.description ?? '') && (p.description ?? '').includes(w.year),
  'fotos',
);

const out = {
  base: PREFIX,
  clubs: Object.fromEntries([...clubImages].map(([c, path]) => [c.id, path])),
  players: Object.fromEntries([...playerImages].map(([w, path]) => [w.id, path])),
};
writeJson(join(dir, 'images.json'), out);
console.log(`Escudos: ${clubImages.size}/${clubs.length} · fotos: ${playerImages.size}/${who.length} → ${join(dir, 'images.json')}`);
