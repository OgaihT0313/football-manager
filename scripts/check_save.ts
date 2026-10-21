// Verificações da carreira e do save versionado. Sai com código 1 se alguma falhar.
// Uso: npx tsx scripts/check_save.ts

import {
  advanceRound, advanceToNextMatch, autoPickUserXI, CURRENT_SAVE_VERSION, newCareer, setUserFormation, setUserSlot,
  setUserTactic, simulateRounds, startNextSeason, userLineup, type CareerState,
} from '../src/career/career';
import { userLeague } from '../src/career/queries';
import { isWorldSeasonOver } from '../src/competitions/world';
import { generateFictionalLeague } from '../src/data/fictionalLeague';
import { generateFictionalWorld } from '../src/data/fictionalWorld';
import { FORMATIONS } from '../src/domain/positions';
import { currentMarker } from '../src/market/calendar';
import { createSaveService, deserializeCareer, memoryStorage, migrate, SaveError, serializeCareer } from '../src/save/saveService';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const json = (x: unknown) => JSON.stringify(x);
const throws = (f: () => unknown) => {
  try {
    f();
    return false;
  } catch (e) {
    return e instanceof SaveError;
  }
};

// Mundo de uma liga só (sem copas): mesmo comportamento das Fases 1 e 2.
const gen = generateFictionalLeague({ seed: 2026 });
const userClubId = gen.clubs[7]!.id;
const start = newCareer({ leagues: [gen.league], clubs: gen.clubs, players: gen.players, userClubId, seed: 99, year: 2026 });
const leagueOf = (c: CareerState) => userLeague(c)!;

// 1. Ações não alteram o estado recebido.
{
  const before = json(start);
  const { career: after, results } = advanceRound(start);
  check('advanceRound não altera o estado anterior', json(start) === before);
  check('rodada 1 tem 10 jogos e avança para a rodada 2', results.length === 10 && currentMarker(after.season) === 2);
  check('jogadores que atuaram ficam cansados', results[0]!.homeXI.every((id) => (after.players[id]!.fitness ?? 100) < 100));
  setUserTactic(start, { pressing: 5 });
  setUserFormation(start, '3-5-2');
  check('ações de tática e formação não alteram o estado anterior', json(start) === before);
}

// 2. Data a data = temporada de uma vez.
const byRound = (() => {
  let c = start;
  while (!isWorldSeasonOver(c.season)) c = advanceRound(c).career;
  return c;
})();
const atOnce = simulateRounds(start);
check('jogar data a data dá o mesmo resultado que simular tudo', json(byRound) === json(atOnce));
check('temporada completa: 38 rodadas, 380 jogos', leagueOf(atOnce).results.length === 380 && isWorldSeasonOver(atOnce.season));
check('histórico registra a temporada encerrada', atOnce.history.length === 1 && atOnce.history[0]!.championId === leagueOf(atOnce).table[0]!.clubId,
  `usuário terminou em ${atOnce.history[0]?.userPosition}º com ${atOnce.history[0]?.userPoints} pts`);

// 3. Fechar e reabrir no meio: salvar na rodada 17, carregar e terminar.
{
  const storage = memoryStorage();
  const saves = createSaveService(storage);
  const mid = simulateRounds(start, 17);
  await saves.save(mid, 1_700_000_000_000);
  const loaded = await saves.load();
  check('save carrega o mesmo estado que foi salvo', loaded !== null && json(loaded.career) === json(mid));
  const finished = simulateRounds(loaded!.career);
  check('temporada interrompida e retomada termina idêntica', json(finished) === json(atOnce));
  await saves.clear();
  check('apagar o save faz load devolver null', (await saves.load()) === null);
}

// 4. Mundo completo (5 países, 2ª divisão, copas): interromper e retomar, e tamanho do save.
{
  const world = generateFictionalWorld(2026);
  const wUser = world.leagues[0]!.clubIds[4]!;
  const w0 = newCareer({ leagues: world.leagues, clubs: world.clubs, players: world.players, userClubId: wUser, seed: 5, year: 2026 });
  const t0 = performance.now();
  const whole = simulateRounds(w0);
  const ms = performance.now() - t0;
  const comps = Object.values(whole.season.competitions);
  check('mundo: todas as ligas, 5 copas e 5 supercopas com campeão', comps.filter((c) => c.kind === 'league').length === world.leagues.length &&
    comps.filter((c) => c.kind === 'cup').every((c) => c.championId) && comps.filter((c) => c.kind === 'supercup').every((c) => c.championId),
    `${comps.reduce((a, c) => a + c.results.length, 0)} jogos em ${(ms / 1000).toFixed(1)} s`);
  const mid = simulateRounds(w0, 21);
  const reloaded = deserializeCareer(serializeCareer(mid, 1)).career;
  check('mundo: interrompido na rodada 21, recarregado e terminado fica idêntico', json(simulateRounds(reloaded)) === json(whole));
  const size = serializeCareer(whole, 0).length;
  check('mundo: save abaixo de 10 MB no fim da temporada', size < 10_000_000, `${(size / 1e6).toFixed(2)} MB`);
  const next = advanceToNextMatch(w0);
  check('avançar até o próximo jogo para na partida do usuário', !!next.result && (next.result.homeId === wUser || next.result.awayId === wUser));
  const s2 = startNextSeason(whole);
  const top = s2.leagues[world.leagues[0]!.id]!;
  const promoted = top.clubIds.filter((id) => !world.leagues[0]!.clubIds.includes(id));
  check('acesso: 3 sobem na 1ª divisão inglesa, todos com elenco', promoted.length === 3 && promoted.every((id) => s2.clubs[id]!.squad.length >= 20));
  check('rebaixados vão para a 2ª divisão', world.leagues[0]!.clubIds.filter((id) => !top.clubIds.includes(id)).every((id) => s2.leagues[world.leagues[1]!.id]!.clubIds.includes(id)));
}

// 5. Versão e migrações.
{
  check('save grava a versão atual', JSON.parse(serializeCareer(start, 1)).saveVersion === CURRENT_SAVE_VERSION);
  const migrations = {
    1: (d: { a: number }) => ({ ...d, b: d.a * 2 }),
    2: (d: { a: number; b: number }) => ({ ...d, c: d.a + d.b }),
  };
  check('migrações rodam em ordem da versão antiga até a atual', json(migrate({ a: 1 }, 1, migrations, 3)) === json({ a: 1, b: 2, c: 3 }));
  check('falta de migração gera erro claro', throws(() => migrate({}, 1, {}, 2)));
  check('save mais novo que o app gera erro claro', throws(() => migrate({}, 9, {}, 1)));
  check('save corrompido gera erro claro', throws(() => deserializeCareer('{"saveVersion":1,"data":')));
  check('save sem dados gera erro claro', throws(() => deserializeCareer('{"saveVersion":1}')));

  // Saves antigos montados a partir de uma carreira no meio da temporada (rodada 6).
  const mid = simulateRounds(start, 5);
  const comp = leagueOf(mid);
  const v2Data = {
    saveVersion: 2,
    seed: mid.seed,
    userClubId,
    league: mid.leagues[gen.league.id],
    clubs: mid.clubs,
    players: mid.players,
    season: {
      leagueId: gen.league.id, year: mid.season.year, seed: mid.season.seed, fixtures: comp.fixtures, results: comp.results,
      nextRound: currentMarker(mid.season), totalRounds: 38, context: comp.context, status: mid.season.status, table: comp.table,
    },
    history: [],
    transfers: mid.transfers,
    inbox: mid.inbox,
    preContracts: mid.preContracts,
  };
  const fromV2 = deserializeCareer(JSON.stringify({ saveVersion: 2, savedAt: 1, data: v2Data })).career;
  const directEnd = simulateRounds(mid);
  const migratedEnd = simulateRounds(fromV2);
  check('save v2 (Fase 2) no meio da temporada migra e termina igual', json(leagueOf(migratedEnd).table) === json(leagueOf(directEnd).table) &&
    fromV2.saveVersion === CURRENT_SAVE_VERSION);

  const v1Clubs: Record<string, unknown> = {};
  for (const [id, cl] of Object.entries(mid.clubs)) {
    const { finance: _f, training: _t, ...rest } = cl;
    v1Clubs[id] = rest;
  }
  const { transfers: _tr, inbox: _in, preContracts: _pc, ...v1Rest } = v2Data;
  const fromV1 = deserializeCareer(JSON.stringify({ saveVersion: 1, savedAt: 1, data: { ...v1Rest, saveVersion: 1, clubs: v1Clubs } })).career;
  // Save da Fase 3 (v3): mesma forma, sem Europa; deve carregar e seguir jogando.
  const v3 = JSON.parse(serializeCareer(mid, 1));
  v3.saveVersion = 3;
  v3.data.saveVersion = 3;
  const fromV3 = deserializeCareer(JSON.stringify(v3)).career;
  check('save v3 (Fase 3) migra para v4 e continua jogável', fromV3.saveVersion === CURRENT_SAVE_VERSION && advanceRound(fromV3).results.length === 10);
  check('save v1 (Fase 1) migra até a versão atual e continua jogável',
    !!fromV1.clubs[userClubId]!.finance && Array.isArray(fromV1.transfers) && !!fromV1.season.competitions[gen.league.id] &&
      advanceRound(fromV1).results.length === 10);
}

// 6. Escalação do usuário.
{
  const club = start.clubs[userClubId]!;
  const xi = club.startingXI;
  check('carreira nova já vem com XI fixado (11 vagas)', xi.length === FORMATIONS[club.tactic.formation].length && xi.every(Boolean));
  const bench = club.squad.find((id) => !xi.includes(id))!;
  const swapped = setUserSlot(start, 3, bench);
  check('colocar reserva numa vaga respeita a escolha', swapped.clubs[userClubId]!.startingXI[3] === bench);
  const swap2 = setUserSlot(start, 1, xi[5]!);
  const xi2 = swap2.clubs[userClubId]!.startingXI;
  check('colocar titular em outra vaga troca os dois de lugar', xi2[1] === xi[5] && xi2[5] === xi[1]);
  check('escalação efetiva usa o XI escolhido', userLineup(swapped).slots.some((s) => s.playerId === bench));
  const f352 = setUserFormation(start, '3-5-2');
  check('trocar formação refaz o XI para a nova formação', f352.clubs[userClubId]!.tactic.formation === '3-5-2' && f352.clubs[userClubId]!.startingXI.length === 11);
  check('escalação automática disponível no meio da temporada', autoPickUserXI(simulateRounds(start, 5)).clubs[userClubId]!.startingXI.length === 11);
}

// 7. Temporada seguinte.
{
  const next = startNextSeason(atOnce);
  check('nova temporada começa do zero com o ano seguinte', next.season.year === 2027 && next.season.nextSlot === 0 && leagueOf(next).results.length === 0);
  check('nova temporada tem calendário diferente', json(leagueOf(next).fixtures.map((f) => f.homeId)) !== json(leagueOf(atOnce).fixtures.map((f) => f.homeId)));
  const second = simulateRounds(next);
  check('segunda temporada entra no histórico', second.history.length === 2 && second.history[1]!.year === 2027);
  check('não começa temporada nova com a atual em andamento', startNextSeason(start) === start);
}

console.log(failures === 0 ? '\nTudo verde.' : `\n${failures} verificação(ões) falharam.`);
process.exit(failures === 0 ? 0 : 1);
