// Aceite da Fase 6 (ligas de fundo e eras): vitrine do exterior, compras da IA e do usuário,
// virada, migração v5 → v6 e as eras (nomes, pontos, gols). Sai com código 1 se falhar.
// Uso: npx tsx scripts/check_world.ts [--temporadas 3]

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { advanceRound, cloneForStep, newCareer, simulateRounds, startNextSeason, type CareerState } from '../src/career/career';
import { bidForPlayer, requestLoan } from '../src/career/userMarket';
import { isWorldSeasonOver } from '../src/competitions/world';
import { eraRules, eraWorld, validateEra, type EraPack } from '../src/data/eras';
import { generateFictionalWorld } from '../src/data/fictionalWorld';
import { isAbroadClub, showcasePlayers } from '../src/market/abroad';
import { openWindow } from '../src/market/calendar';
import { spendableFee } from '../src/club/finance';
import { askingPrice, wageAsk } from '../src/market/transfers';
import { deserializeCareer, serializeCareer } from '../src/save/saveService';
import { arg, DATA } from './lib';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const json = (x: unknown) => JSON.stringify(x);

const seasons = Number(arg('temporadas') ?? 3);
const world = generateFictionalWorld(2026);
const userClub = world.leagues.find((l) => l.id === 'esp1')!.clubIds[2]!;
const fresh = (seed = 5) => newCareer({ leagues: world.leagues, clubs: world.clubs, players: world.players, userClubId: userClub, seed, year: 2026 });

// 1. Ligas de fundo e vitrine.
const c0 = fresh();
const abroad = Object.values(c0.clubs).filter((cl) => isAbroadClub(cl, c0.leagues));
const shown = showcasePlayers(c0.clubs, c0.players);
check('14 ligas de fundo, com Brasil e Argentina', ['por1', 'hol1', 'bra1', 'arg1'].every((id) => c0.leagues[id]) && Object.values(c0.leagues).filter((l) => l.mode === 'strength' && l.tier === 1).length === 14);
check('cada clube de fundo mostra 3 jogadores (4 no Brasil e na Argentina)', abroad.every((cl) => cl.showcase?.length === (['bra1', 'arg1'].includes(cl.leagueId) ? 4 : 3)),
  `${abroad.length} clubes, ${shown.length} jogadores na vitrine`);
check('vitrine: jogador ligado ao clube, nacionalidade do país, sem entrar no elenco', shown.every((p) => c0.clubs[p.clubId!]!.squad.length === 0) &&
  shown.filter((p) => p.clubId!.startsWith('bra1')).every((p) => p.nationality === 'BRA'));
const southAm = new Set([...c0.leagues.bra1!.clubIds, ...c0.leagues.arg1!.clubIds]);
const euro = ['ucl', 'uel', 'uecl'].flatMap((t) => c0.season.competitions[t]?.clubIds ?? []);
check('Brasil e Argentina não jogam competições europeias', euro.length === 108 && !euro.some((id) => southAm.has(id)));
check('Brasileirão e Liga Profesional jogam a temporada', !!c0.season.competitions.bra1?.fixtures.length && !!c0.season.competitions.arg1?.fixtures.length,
  `${c0.season.competitions.bra1?.fixtures.length} jogos no Brasil`);
const ovr = (ps: { ovr: number }[]) => (ps.reduce((a, p) => a + p.ovr, 0) / ps.length).toFixed(1);
const young = shown.filter((p) => p.age <= 20);
console.log(`      vitrine: OVR médio ${ovr(shown)}, ${young.length} jovens até 20 anos (potencial médio ${(young.reduce((a, p) => a + p.potential, 0) / young.length).toFixed(1)})`);

// 2. Compra do usuário e empréstimo recusado.
{
  // A melhor joia que cabe no orçamento do usuário.
  const budget = spendableFee(c0.clubs[userClub]!);
  const target = shown
    .filter((p) => p.age <= 20 && askingPrice(p, c0.clubs[p.clubId!]!, c0.players, 2026) <= budget)
    .sort((a, b) => b.potential - a.potential)[0]!;
  const seller = c0.clubs[target.clubId!]!;
  const fee = askingPrice(target, seller, c0.players, 2026);
  const wage = wageAsk(target, c0.clubs[userClub]!, seller);
  const before = seller.finance.balance;
  check('janela aberta no início', !!openWindow(c0.season));
  const r = bidForPlayer(c0, target.id, fee, wage, 4);
  const after = r.career;
  check('usuário compra a joia de um clube de fundo', r.result.ok && after.players[target.id]!.clubId === userClub && after.clubs[userClub]!.squad.includes(target.id), r.result.message);
  check('vitrine encolhe e o vendedor recebe', !after.clubs[seller.id]!.showcase!.includes(target.id) && after.clubs[seller.id]!.finance.balance === before + fee, `taxa ${fee}`);
  const low = bidForPlayer(c0, target.id, Math.round(fee * 0.5), wage, 4);
  check('proposta baixa é recusada', !low.result.ok, low.result.message);
  const other = shown.find((p) => p.id !== target.id)!;
  check('clube do exterior não empresta', !requestLoan(c0, other.id, 1).result.ok);

  // 3. Virada: quem sobrou sai; quem foi comprado fica; vitrine nova.
  let x = after;
  const t0 = performance.now();
  x = simulateRounds(x, Infinity, { aiControlsUser: false });
  const aiBuys = x.transfers.filter((t) => t.year === 2026 && t.fromClubId && !x.clubs[t.fromClubId]!.squad.length && isAbroadClub(x.clubs[t.fromClubId]!, x.leagues) && t.toClubId !== userClub);
  check('a IA compra jogadores da vitrine', aiBuys.length > 0, `${aiBuys.length} compras na 1ª temporada, taxa média ${(aiBuys.reduce((a, t) => a + t.fee, 0) / Math.max(1, aiBuys.length) / 1e6).toFixed(1)} mi`);
  const next = startNextSeason(x);
  const oldLeft = Object.keys(next.players).filter((id) => /-v2026-/.test(id) && next.players[id]!.clubId && !next.clubs[next.players[id]!.clubId!]!.squad.length);
  check('na virada, quem não foi vendido some e a vitrine é nova', oldLeft.length === 0 && showcasePlayers(next.clubs, next.players).every((p) => p.id.includes('-v2027-')));
  check('quem foi comprado continua no mundo', next.players[target.id]?.clubId === userClub);
  console.log(`      temporada com vitrine: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

// 4. Várias temporadas: compras da IA por temporada e determinismo com save no meio.
{
  let c: CareerState = fresh(9);
  const buys: number[] = [];
  for (let s = 0; s < seasons; s++) {
    c = simulateRounds(c, Infinity, { aiControlsUser: true });
    const y = c.season.year;
    buys.push(c.transfers.filter((t) => t.year === y && t.fromClubId && isAbroadClub(c.clubs[t.fromClubId]!, c.leagues)).length);
    if (s < seasons - 1) c = startNextSeason(c, { aiControlsUser: true });
  }
  check('a IA compra da vitrine todo ano, sem esvaziar (≤ 40% dos jogadores)', buys.every((b) => b > 0 && b <= shown.length * 0.4), buys.join(' / '));
  let a = fresh(13);
  let b = fresh(13);
  for (let i = 0; i < 12; i++) {
    a = advanceRound(a).career;
    b = advanceRound(b).career;
    if (i === 5) b = deserializeCareer(serializeCareer(b, 0)).career;
  }
  check('salvar e recarregar com vitrine não muda nada', json(a) === json(b));
}

// 5. Migração v5 → v6.
{
  const v6 = advanceRound(fresh(17)).career;
  const v5 = cloneForStep(v6);
  delete v5.leagues.bra1;
  delete v5.leagues.arg1;
  delete v5.season.competitions.bra1;
  delete v5.season.competitions.arg1;
  for (const cl of Object.values(v5.clubs)) {
    if (cl.leagueId === 'bra1' || cl.leagueId === 'arg1') delete v5.clubs[cl.id];
    else if (cl.showcase) {
      for (const id of cl.showcase) delete v5.players[id];
      const { showcase: _s, ...rest } = cl;
      v5.clubs[cl.id] = rest;
    }
  }
  const migrated = deserializeCareer(JSON.stringify({ saveVersion: 5, savedAt: 0, data: { ...v5, saveVersion: 5 } })).career;
  check('save v5 migra: ganha Brasil, Argentina e vitrines', !!migrated.leagues.bra1 && !!migrated.leagues.arg1 && showcasePlayers(migrated.clubs, migrated.players).length === shown.length);
  let m = simulateRounds(migrated);
  m = startNextSeason(m);
  check('depois da virada, as ligas novas jogam', !!m.season.competitions.bra1?.fixtures.length);
}

// 6. Eras.
const packs = JSON.parse(readFileSync(join(DATA, 'eras', 'eras.json'), 'utf8')) as EraPack[];
check('pacotes de era válidos', packs.every((p) => validateEra(p).length === 0), packs.map((p) => `${p.name} (${p.year})`).join(', '));
const rows: Record<string, string | number>[] = [];
const goalsBy: Record<string, number> = {};
for (const pack of packs) {
  const t0 = performance.now();
  const w = eraWorld(pack);
  const genMs = performance.now() - t0;
  const club = w.leagues.find((l) => l.id === 'ita1')!.clubIds[0]!;
  let c = newCareer({ leagues: w.leagues, clubs: w.clubs, players: w.players, userClubId: club, seed: 3, year: pack.year, era: eraRules(pack) });
  const okYear = c.season.year === pack.year;
  const ucl = c.season.competitions.ucl?.name;
  const expected = pack.europeNames?.ucl ?? 'Champions League';
  c = simulateRounds(c, Infinity, { aiControlsUser: true });
  let goals = 0;
  let games = 0;
  for (const comp of Object.values(c.season.competitions)) {
    if (comp.kind !== 'league' || comp.mode !== 'full') continue;
    for (const r of comp.results) {
      goals += r.homeGoals + r.awayGoals;
      games++;
    }
  }
  const spain = c.season.competitions.esp1!.table[0]!;
  const winPts = c.leagues.esp1!.pointsForWin;
  const roundTrip = json(deserializeCareer(serializeCareer(c, 0)).career) === json(c);
  goalsBy[pack.id] = goals / games;
  rows.push({ era: pack.name, ano: c.season.year, 'gols/j': (goals / games).toFixed(2), 'pts vitória (ESP)': winPts, 'campeão ESP pts': spain.points, champions: ucl ?? '-', 'gerar mundo ms': Math.round(genMs) });
  check(`era ${pack.name}: ano, nome da Champions, pontos e save`, okYear && ucl === expected && winPts === (pack.pointsByCountry?.Espanha ?? pack.pointsForWin ?? 3) &&
    spain.points === spain.wins * winPts + spain.draws && roundTrip && isWorldSeasonOver(c.season));
}
console.table(rows);
check('menos gols nas eras antigas (anos 70 < atual em pelo menos 0,15)', goalsBy.anos70! < goalsBy.atual! - 0.15, `${goalsBy.anos70!.toFixed(2)} x ${goalsBy.atual!.toFixed(2)}`);
check('gols por jogo de todas as eras entre 2,3 e 2,95', Object.values(goalsBy).every((g) => g >= 2.3 && g <= 2.95));

console.log(failures === 0 ? '\nTudo verde.' : `\n${failures} verificação(ões) falharam.`);
process.exit(failures === 0 ? 0 : 1);
