// Verificações automáticas do motor e da liga. Sai com código 1 se alguma falhar.
// Uso: npx tsx scripts/check_engine.ts

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { computeTable, generateFixtures } from '../src/competitions/league';
import { simulateSeason } from '../src/competitions/season';
import { generateFictionalLeague } from '../src/data/fictionalLeague';
import { effectiveAt, familiarity, FORMATIONS } from '../src/domain/positions';
import type { Club, LeagueConfig, MatchResult, Player } from '../src/domain/types';
import { chooseLineup } from '../src/engine/lineup';
import { DEFAULT_CONTEXT, expectedGoals, simulateMatch, teamStrength } from '../src/engine/matchEngine';
import { createRng, deriveSeed, poisson } from '../src/engine/rng';
import { indexPlayers, ROOT } from './lib';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const gen = generateFictionalLeague({ seed: 77 });
const players = indexPlayers(gen.players);
const clubs: Record<string, Club> = {};
for (const c of gen.clubs) clubs[c.id] = c;

// 1. Determinismo.
{
  const a = simulateSeason({ league: gen.league, clubs: gen.clubs, players, seed: 123 });
  const b = simulateSeason({ league: gen.league, clubs: gen.clubs, players, seed: 123 });
  const c = simulateSeason({ league: gen.league, clubs: gen.clubs, players, seed: 124 });
  check('mesma seed = mesma temporada', JSON.stringify(a) === JSON.stringify(b));
  check('seed diferente = temporada diferente', JSON.stringify(a.results) !== JSON.stringify(c.results));
  const g1 = generateFictionalLeague({ seed: 5 });
  const g2 = generateFictionalLeague({ seed: 5 });
  check('mesma seed = mesma liga gerada', JSON.stringify(g1) === JSON.stringify(g2));

  const r1 = createRng(42);
  r1.next();
  r1.next();
  const r2 = createRng(r1.state());
  check('RNG retoma a sequência a partir do estado salvo', r1.next() === r2.next());

  const r = createRng(9);
  let sum = 0;
  const n = 200_000;
  for (let i = 0; i < n; i++) sum += poisson(r, 1.4);
  check('Poisson(1,4) tem média ~1,4', Math.abs(sum / n - 1.4) < 0.02, (sum / n).toFixed(3));
}

// 2. Fora de posição rende menos.
{
  const st = gen.players.find((p) => p.positions[0] === 'ST' && p.positions.length === 1)!;
  const cb = gen.players.find((p) => p.positions[0] === 'CB' && p.positions.length === 1)!;
  check('atacante rende menos de zagueiro', effectiveAt(st, 'CB') < effectiveAt(st, 'ST'),
    `${effectiveAt(st, 'ST').toFixed(1)} -> ${effectiveAt(st, 'CB').toFixed(1)}`);
  check('zagueiro rende menos de atacante', effectiveAt(cb, 'ST') < effectiveAt(cb, 'CB'));
  check('familiaridade fora de posição < 1', familiarity(st, 'CB') < 1 && familiarity(st, 'ST') === 1);
  check('goleiro na linha é muito penalizado', familiarity({ positions: ['GK'] }, 'ST') < 0.5);

  // Mesmo elenco, XI forçado com todo mundo trocado de setor, gera λ menor.
  const club = gen.clubs[0]!;
  const natural = chooseLineup(club, players);
  const xiIds = natural.slots.map((s) => s.playerId);
  // Inverte a lista: goleiro vai para o ataque, atacantes para o gol/defesa.
  const flipped: Club = { ...club, startingXI: xiIds.slice().reverse() };
  const forced = chooseLineup(flipped, players);
  // Força a ordem invertida nas vagas (sem deixar a escolha redistribuir).
  const positions = FORMATIONS[club.tactic.formation];
  const forcedSlots = positions.map((pos, i) => {
    const p = players[xiIds[xiIds.length - 1 - i]!]!;
    return { pos, playerId: p.id, rating: effectiveAt(p, pos) };
  });
  const sNat = teamStrength(natural, positions);
  const sFor = teamStrength({ formation: club.tactic.formation, slots: forcedSlots }, positions);
  check('XI fora de posição tem ataque e defesa menores', sFor.offense < sNat.offense && sFor.defenseLine < sNat.defenseLine,
    `ofensivo ${sNat.offense.toFixed(1)} -> ${sFor.offense.toFixed(1)}, defensivo ${sNat.defenseLine.toFixed(1)} -> ${sFor.defenseLine.toFixed(1)}`);
  check('XI escolhido pelo usuário é respeitado vaga a vaga',
    forced.slots.map((s) => s.playerId).join() === flipped.startingXI.join());
  const fixedClub: Club = { ...club, startingXI: xiIds };
  const gkId = xiIds[positions.indexOf('GK')]!;
  const withoutGk = chooseLineup(fixedClub, players, (id) => id !== gkId);
  const subGk = withoutGk.slots.find((s) => s.pos === 'GK')!.playerId;
  check('vaga de titular indisponível vai para o reserva da posição',
    subGk !== gkId && players[subGk]!.positions[0] === 'GK' &&
      withoutGk.slots.filter((s) => s.pos !== 'GK').every((s, i) => s.playerId === natural.slots.filter((x) => x.pos !== 'GK')[i]!.playerId));
  const gkSlot = natural.slots.find((s) => s.pos === 'GK')!;
  check('escalação automática põe goleiro no gol', players[gkSlot.playerId]!.positions[0] === 'GK');
}

// 3. Goleiro melhor sofre menos.
{
  const club = gen.clubs[5]!;
  const opp = gen.clubs[6]!;
  const lineup = chooseLineup(club, players);
  const oppLineup = chooseLineup(opp, players);
  const gkId = lineup.slots.find((s) => s.pos === 'GK')!.playerId;
  const gk = players[gkId]!;
  const betterGk: Player = { ...gk, goalkeeping: Math.min(99, gk.goalkeeping + 15) };
  const players2 = { ...players, [gkId]: betterGk };
  const lineup2 = chooseLineup(club, players2);

  const positions = FORMATIONS[club.tactic.formation];
  const oppPositions = FORMATIONS[opp.tactic.formation];
  const xgBase = expectedGoals(teamStrength(oppLineup, oppPositions), teamStrength(lineup, positions), opp.tactic, club.tactic, DEFAULT_CONTEXT);
  const xgBetter = expectedGoals(teamStrength(oppLineup, oppPositions), teamStrength(lineup2, positions), opp.tactic, club.tactic, DEFAULT_CONTEXT);
  check('goleiro melhor reduz λ do adversário', xgBetter.home < xgBase.home, `${xgBase.home.toFixed(3)} -> ${xgBetter.home.toFixed(3)}`);

  const n = 20_000;
  let concededBase = 0;
  let concededBetter = 0;
  for (let i = 0; i < n; i++) {
    const fixture = { id: `gk-${i}`, round: 1, homeId: opp.id, awayId: club.id };
    concededBase += simulateMatch({ fixture, home: opp, away: club, homeLineup: oppLineup, awayLineup: lineup, players, ctx: DEFAULT_CONTEXT, rng: createRng(deriveSeed(1, i)) }).homeGoals;
    concededBetter += simulateMatch({ fixture, home: opp, away: club, homeLineup: oppLineup, awayLineup: lineup2, players: players2, ctx: DEFAULT_CONTEXT, rng: createRng(deriveSeed(1, i)) }).homeGoals;
  }
  check('goleiro melhor sofre menos gols (20 mil jogos)', concededBetter < concededBase,
    `${(concededBase / n).toFixed(3)} -> ${(concededBetter / n).toFixed(3)} gols sofridos por jogo`);
}

// 4. Calendário.
{
  const fx = generateFixtures(gen.league, 3);
  const n = gen.league.clubIds.length;
  const rounds = new Set(fx.map((f) => f.round));
  check('380 jogos em 38 rodadas', fx.length === n * (n - 1) && rounds.size === 2 * (n - 1), `${fx.length} jogos, ${rounds.size} rodadas`);
  let onePerRound = true;
  for (const r of rounds) {
    const ids = fx.filter((f) => f.round === r).flatMap((f) => [f.homeId, f.awayId]);
    if (new Set(ids).size !== n) onePerRound = false;
  }
  check('cada clube joga exatamente uma vez por rodada', onePerRound);
  const pairs = new Set(fx.map((f) => `${f.homeId}|${f.awayId}`));
  check('cada mando de cada confronto acontece uma vez', pairs.size === fx.length);
  const homeCount: Record<string, number> = {};
  for (const f of fx) homeCount[f.homeId] = (homeCount[f.homeId] ?? 0) + 1;
  check('19 jogos em casa para cada clube', Object.values(homeCount).every((c) => c === n - 1));
  let maxStreak = 0;
  for (const id of gen.league.clubIds) {
    const seq = fx.filter((f) => f.homeId === id || f.awayId === id).sort((a, b) => a.round - b.round).map((f) => f.homeId === id);
    let streak = 1;
    for (let i = 1; i < seq.length; i++) {
      streak = seq[i] === seq[i - 1] ? streak + 1 : 1;
      maxStreak = Math.max(maxStreak, streak);
    }
  }
  check('nenhum clube com mais de 3 jogos seguidos com o mesmo mando', maxStreak <= 3, `maior sequência: ${maxStreak}`);
}

// 5. Desempate.
{
  const league: LeagueConfig = { ...gen.league, clubIds: ['a', 'b', 'c'] };
  const m = (h: string, a: string, hg: number, ag: number): MatchResult => ({
    fixtureId: `${h}-${a}`, homeId: h, awayId: a, homeGoals: hg, awayGoals: ag, homeXg: 1, awayXg: 1, events: [], ratings: {}, homeXI: [], awayXI: [],
  });
  // a e b: 7 pontos, 5 gols pró, 3 contra. b fez 4 pontos contra a no confronto direto.
  const table = computeTable(league, [m('a', 'c', 2, 0), m('c', 'a', 0, 1), m('b', 'c', 2, 0), m('c', 'b', 1, 0), m('b', 'a', 2, 1), m('a', 'b', 1, 1)]);
  const [first, second] = table;
  check('confronto direto desempata quando pontos, saldo e gols pró empatam',
    first!.clubId === 'b' && second!.clubId === 'a' && first!.points === second!.points &&
      first!.goalsFor === second!.goalsFor && first!.goalsAgainst === second!.goalsAgainst,
    table.map((r) => `${r.clubId}:${r.points}pts ${r.goalsFor}-${r.goalsAgainst}`).join(', '));
}

// 6. Sanidade da temporada: sem NaN, eventos coerentes com o placar, lesionado não joga.
{
  const season = simulateSeason({ league: gen.league, clubs: gen.clubs, players, seed: 999 });
  let finite = true;
  let eventsOk = true;
  let ratingsOk = true;
  for (const r of season.results) {
    if (![r.homeXg, r.awayXg, r.homeGoals, r.awayGoals].every(Number.isFinite)) finite = false;
    const hg = r.events.filter((e) => e.type === 'goal' && e.clubId === r.homeId).length;
    const ag = r.events.filter((e) => e.type === 'goal' && e.clubId === r.awayId).length;
    if (hg !== r.homeGoals || ag !== r.awayGoals) eventsOk = false;
    for (const e of r.events) {
      const xi = e.clubId === r.homeId ? r.homeXI : r.awayXI;
      if (!xi.includes(e.playerId) || (e.assistId && (e.assistId === e.playerId || !xi.includes(e.assistId)))) eventsOk = false;
    }
    for (const v of Object.values(r.ratings)) if (!Number.isFinite(v) || v < 1 || v > 10) ratingsOk = false;
    if (r.homeXI.length !== 11 || r.awayXI.length !== 11) eventsOk = false;
  }
  check('sem NaN/Infinity em λ e placares', finite);
  check('gols nos eventos batem com o placar; autores e garçons estão no XI', eventsOk);
  check('notas entre 1 e 10', ratingsOk);

  const pts = season.table.reduce((a, r) => a + r.points, 0);
  const draws = season.results.filter((r) => r.homeGoals === r.awayGoals).length;
  check('soma de pontos da tabela bate com resultados', pts === 3 * (season.results.length - draws) + 2 * draws);

  // Lesionado por N jogos não aparece nos N jogos seguintes do clube.
  let injuryOk = true;
  let injuriesChecked = 0;
  season.results.forEach((r, idx) => {
    for (const e of r.events) {
      if (e.type !== 'injury') continue;
      const next = season.results.slice(idx + 1).filter((x) => x.homeId === e.clubId || x.awayId === e.clubId).slice(0, e.matchesOut ?? 1);
      injuriesChecked++;
      if (next.some((x) => x.homeXI.includes(e.playerId) || x.awayXI.includes(e.playerId))) injuryOk = false;
    }
  });
  check('jogador lesionado fica fora das partidas seguintes', injuryOk, `${injuriesChecked} lesões verificadas`);

  check('resultado da temporada é JSON puro (ida e volta sem perda)', JSON.stringify(JSON.parse(JSON.stringify(season))) === JSON.stringify(season));
}

// 6b. Fadiga: cansado rende menos, condição fica em 0-100 e o rodízio acontece.
{
  const club = gen.clubs[3]!;
  const rested = chooseLineup(club, players);
  const tiredPlayers: Record<string, Player> = { ...players };
  for (const s of rested.slots) tiredPlayers[s.playerId] = { ...players[s.playerId]!, fitness: 40 };
  const positions = FORMATIONS[club.tactic.formation];
  const tiredFixed = chooseLineup({ ...club, startingXI: rested.slots.map((s) => s.playerId) }, tiredPlayers);
  check('time cansado tem força menor', teamStrength(tiredFixed, positions).offense < teamStrength(rested, positions).offense);
  const auto = chooseLineup(club, tiredPlayers);
  check('escalação automática poupa titulares muito cansados', auto.slots.some((s) => !rested.slots.some((r) => r.playerId === s.playerId)));

  const season = simulateSeason({ league: gen.league, clubs: gen.clubs, players, seed: 31 });
  let starts = 0;
  let distinct = 0;
  const appearances: Record<string, number> = {};
  for (const r of season.results) for (const id of [...r.homeXI, ...r.awayXI]) appearances[id] = (appearances[id] ?? 0) + 1;
  for (const v of Object.values(appearances)) {
    starts += v;
    distinct++;
  }
  check('rodízio: mais de 11 titulares diferentes por clube na temporada', distinct / gen.clubs.length > 11, `${(distinct / gen.clubs.length).toFixed(1)} jogadores usados por clube`);
  check('dados de entrada não são alterados pela simulação', gen.players.every((p) => p.fitness === 100));
}

// 7. Domínio sem React e sem Math.random.
{
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) {
        // Ignora comentários (o rng.ts cita Math.random() para proibi-lo).
        const src = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        if (/from\s+['"]react(-native)?['"/]/.test(src)) offenders.push(`${name}: importa react`);
        if (/Math\.random\s*\(/.test(src)) offenders.push(`${name}: usa Math.random`);
      }
    }
  };
  walk(join(ROOT, 'src'));
  check('src/ não importa React nem usa Math.random', offenders.length === 0, offenders.join('; '));
}

console.log(failures === 0 ? '\nTudo verde.' : `\n${failures} verificação(ões) falharam.`);
process.exit(failures === 0 ? 0 : 1);
