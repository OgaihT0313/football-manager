// Verificações da visão 2D (Fase 6): a encenação respeita o resultado do motor.
// Uso: npx tsx scripts/check_watch.ts [--datas 20]

import { advanceRound, newCareer } from '../src/career/career';
import { generateFictionalWorld } from '../src/data/fictionalWorld';
import { FORMATIONS } from '../src/domain/positions';
import type { MatchResult } from '../src/domain/types';
import { directMatch, formationSpots, MATCH_SECONDS, playerSpots, sampleAt, scoreAt } from '../src/engine/watchDirector';
import { arg } from './lib';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const slots = Number(arg('datas') ?? 20);
const world = generateFictionalWorld(2026);
let c = newCareer({ leagues: world.leagues, clubs: world.clubs, players: world.players, userClubId: world.leagues[0]!.clubIds[0]!, seed: 11, year: 2026 });
const results: MatchResult[] = [];
for (let i = 0; i < slots; i++) {
  const r = advanceRound(c);
  c = r.career;
  results.push(...r.results.filter((x) => x.homeXI.length === 11 && x.awayXI.length === 11));
}

let monotonic = true;
let inside = true;
let goalsOk = true;
let goalFrames = true;
let onMinute = 0;
let goals = 0;
let shots = 0;
let frames = 0;
let ms = 0;
for (const r of results) {
  const t0 = performance.now();
  const s = directMatch(r, 11);
  ms += performance.now() - t0;
  frames += s.frames.length;
  shots += s.shots.home + s.shots.away;
  for (let i = 1; i < s.frames.length; i++) if (s.frames[i]!.t < s.frames[i - 1]!.t) monotonic = false;
  if (s.frames[0]!.t !== 0 || s.frames[s.frames.length - 1]!.t !== MATCH_SECONDS) monotonic = false;
  for (const f of s.frames) if (!(f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1)) inside = false;
  const end = scoreAt(s, r, MATCH_SECONDS);
  if (end[0] !== r.homeGoals || end[1] !== r.awayGoals) goalsOk = false;
  for (const m of s.marks) {
    if (m.type !== 'goal') continue;
    goals++;
    if (Math.abs(m.t / 60 - m.minute) <= 1.5) onMinute++;
    // O gol acontece na tela: há um quadro de gol logo depois do lance.
    if (!s.frames.some((f) => f.kind === 'gol' && f.t >= m.t && f.t <= m.t + 4)) goalFrames = false;
  }
  // Jogadores sempre dentro do campo.
  const spots = formationSpots(FORMATIONS['4-3-3']);
  for (let t = 0; t <= MATCH_SECONDS; t += 97) {
    const st = sampleAt(s, t);
    for (const side of ['home', 'away'] as const) for (const [x, y] of playerSpots(spots, side, st)) if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) inside = false;
  }
}
const n = results.length;
check(`${n} partidas encenadas`, n >= 50);
check('linha do tempo em ordem, de 0 a 90 minutos', monotonic);
check('bola e jogadores sempre dentro do campo', inside);
check('placar da encenação igual ao do motor em todas as partidas', goalsOk);
check('todo gol aparece na tela', goalFrames, `${goals} gols`);
check('gols no minuto do motor (±1,5 min) em pelo menos 95%', onMinute >= goals * 0.95, `${((onMinute / Math.max(1, goals)) * 100).toFixed(1)}%`);
check('chutes por jogo plausíveis (15–30 somando os dois)', shots / n >= 15 && shots / n <= 30, (shots / n).toFixed(1));
const a = JSON.stringify(directMatch(results[0]!, 11));
check('mesma partida, mesma encenação', a === JSON.stringify(directMatch(results[0]!, 11)));
check('montar a encenação é rápido (< 5 ms por jogo)', ms / n < 5, `${(ms / n).toFixed(2)} ms · ${(frames / n).toFixed(0)} quadros por jogo`);

console.log(failures === 0 ? '\nTudo verde.' : `\n${failures} verificação(ões) falharam.`);
process.exit(failures === 0 ? 0 : 1);
