// Verificações do mundo de data/world quando ele vem do dataset do EA FC (mundo real).
// Uso: npx tsx scripts/check_real.ts [--mundo data/world]

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newCareer, simulateRounds, startNextSeason } from '../src/career/career';
import type { WorldMeta } from '../src/data/realWorld';
import { FORMATIONS } from '../src/domain/positions';
import type { Club, LeagueConfig, Player } from '../src/domain/types';
import { deserializeCareer, serializeCareer } from '../src/save/saveService';
import { arg, DATA } from './lib';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const dir = arg('mundo') ?? join(DATA, 'world');
const load = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T;
const meta: WorldMeta = existsSync(join(dir, 'meta.json')) ? load('meta.json') : { source: '?' };
const leagues = load<LeagueConfig[]>('leagues.json');
const clubs = load<Club[]>('clubs.json');
const players = load<Player[]>('players.json');
const byId = new Map(players.map((p) => [p.id, p]));
const clubById = new Map(clubs.map((c) => [c.id, c]));

check('mundo real (dataset do EA FC) com ajuste', meta.source.startsWith('EA FC') && !!meta.tuning, `${meta.source} · ${JSON.stringify(meta.tuning)}`);
const full = leagues.filter((l) => l.mode === 'full');
check('5 primeiras divisões com elenco e 5 segundas', full.length === 5 && leagues.filter((l) => l.tier === 2).length === 5, full.map((l) => l.name).join(', '));
check('ligas cabem em 38 rodadas (até 20 clubes, número par)', leagues.every((l) => l.clubIds.length <= 20 && l.clubIds.length % 2 === 0));
const famous = ['Real Madrid', 'FC Barcelona', 'Liverpool', 'Manchester City', 'FC Bayern München', 'Paris Saint-Germain', 'Inter', 'Juventus'];
check('clubes conhecidos no mundo', famous.every((n) => clubs.some((c) => c.name === n)), famous.join(', '));
const squadClubs = clubs.filter((c) => c.squad.length);
const gks = (c: Club) => c.squad.filter((id) => byId.get(id)?.positions[0] === 'GK').length;
check('todo clube com elenco tem 18–30 jogadores e 2+ goleiros', squadClubs.every((c) => c.squad.length >= 18 && c.squad.length <= 30 && gks(c) >= 2),
  `${squadClubs.length} clubes; menor elenco ${Math.min(...squadClubs.map((c) => c.squad.length))}; menos goleiros ${Math.min(...squadClubs.map(gks))}`);
check('elenco e jogador apontam um para o outro', squadClubs.every((c) => c.squad.every((id) => byId.get(id)?.clubId === c.id)));
check('XI completo em todos os clubes', squadClubs.every((c) => c.squad.length >= FORMATIONS[c.tactic.formation].length));
check('ids de jogador únicos e estáveis (fc-<id do dataset>)', byId.size === players.length && players.every((p) => p.id.startsWith('fc-')));
const shorts = clubs.map((c) => c.shortName);
check('siglas de 3 caracteres e únicas', new Set(shorts).size === shorts.length && shorts.every((s) => s.length === 3));
const showcase = clubs.flatMap((c) => c.showcase ?? []);
check('vitrine real nas ligas de fundo', showcase.length > 100 && showcase.every((id) => clubById.get(byId.get(id)?.clubId ?? '')?.showcase?.includes(id)), `${showcase.length} jogadores`);
const star = players.find((p) => p.name === 'Kylian Mbappé');
check('nomes e notas reais (ex.: Mbappé)', !!star && star.ovr >= 85, star ? `${star.name} OVR ${star.ovr}, ${clubById.get(star.clubId ?? '')?.name}` : '');

// Escudos e fotos (scripts/fetch_images.ts): cobertura e ids que existem no mundo.
if (existsSync(join(dir, 'images.json'))) {
  const img = load<{ base: string; clubs: Record<string, string>; players: Record<string, string> }>('images.json');
  const crests = clubs.filter((c) => img.clubs[c.id]).length;
  const top = players.filter((p) => p.ovr >= 80);
  const topPhotos = top.filter((p) => img.players[p.id]).length;
  check('escudos para pelo menos 95% dos clubes', crests >= clubs.length * 0.95, `${crests}/${clubs.length}`);
  check('fotos para pelo menos 80% dos jogadores com OVR 80+', topPhotos >= top.length * 0.8, `${topPhotos}/${top.length} (todos: ${Object.keys(img.players).length}/${players.length})`);
  check('imagens só de clubes e jogadores do mundo', Object.keys(img.clubs).every((id) => clubById.has(id)) && Object.keys(img.players).every((id) => byId.has(id)));
} else check('images.json presente', false);

const t0 = performance.now();
let c = newCareer({ leagues, clubs, players, userClubId: full[0]!.clubIds[0]!, seed: 5, year: 2026, tuning: meta.tuning });
check('carreira guarda o ajuste do mundo', JSON.stringify(c.tuning) === JSON.stringify(meta.tuning));
c = simulateRounds(c, Infinity, { aiControlsUser: true });
const secs = (performance.now() - t0) / 1000;
const champs = full.map((l) => c.season.competitions[l.id]!.table[0]!.points);
check('temporada completa', champs.length === 5, `campeões com ${champs.join(' / ')} pts · ${secs.toFixed(1)} s`);
const next = startNextSeason(c, { aiControlsUser: true });
check('virada de temporada', next.season.year === 2027 && Object.values(next.clubs).filter((cl) => cl.squad.length).every((cl) => cl.squad.length >= 18));
const size = serializeCareer(next, 0).length;
check('salvar e carregar mantém tudo (inclusive o ajuste)', JSON.stringify(deserializeCareer(serializeCareer(next, 0)).career) === JSON.stringify(next), `${(size / 1e6).toFixed(2)} MB`);

console.log(failures === 0 ? '\nTudo verde.' : `\n${failures} verificação(ões) falharam.`);
process.exit(failures === 0 ? 0 : 1);
