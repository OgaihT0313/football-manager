// Verificações da carreira e do save versionado. Sai com código 1 se alguma falhar.
// Uso: npx tsx scripts/check_save.ts

import {
  advanceRound, autoPickUserXI, CURRENT_SAVE_VERSION, newCareer, setUserFormation, setUserSlot, setUserTactic,
  simulateRounds, startNextSeason, userLineup, type CareerState,
} from '../src/career/career';
import { isSeasonOver } from '../src/competitions/season';
import { generateFictionalLeague } from '../src/data/fictionalLeague';
import { FORMATIONS } from '../src/domain/positions';
import { createSaveService, deserializeCareer, memoryStorage, migrate, SaveError, serializeCareer } from '../src/save/saveService';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const json = (x: unknown) => JSON.stringify(x);

const gen = generateFictionalLeague({ seed: 2026 });
const userClubId = gen.clubs[7]!.id;
const start = newCareer({ league: gen.league, clubs: gen.clubs, players: gen.players, userClubId, seed: 99, year: 2026 });

// 1. Ações não alteram o estado recebido.
{
  const before = json(start);
  const { career: after, results } = advanceRound(start);
  check('advanceRound não altera o estado anterior', json(start) === before);
  check('rodada 1 tem 10 jogos e avança para a rodada 2', results.length === 10 && after.season.nextRound === 2);
  check('jogadores que atuaram ficam cansados', results[0]!.homeXI.every((id) => (after.players[id]!.fitness ?? 100) < 100));
  setUserTactic(start, { pressing: 5 });
  setUserFormation(start, '3-5-2');
  check('ações de tática e formação não alteram o estado anterior', json(start) === before);
}

// 2. Rodada a rodada = temporada de uma vez.
const byRound = (() => {
  let c = start;
  while (!isSeasonOver(c.season)) c = advanceRound(c).career;
  return c;
})();
const atOnce = simulateRounds(start);
check('jogar rodada a rodada dá o mesmo resultado que simular tudo', json(byRound) === json(atOnce));
check('temporada completa: 38 rodadas, 380 jogos', atOnce.season.results.length === 380 && isSeasonOver(atOnce.season));
check('histórico registra a temporada encerrada', atOnce.history.length === 1 && atOnce.history[0]!.championId === atOnce.season.table[0]!.clubId,
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

  const size = storage.dump()['carreira']!.length;
  const endSize = serializeCareer(atOnce, 0).length;
  check('save com tamanho razoável (< 2 MB no fim da temporada)', endSize < 2_000_000,
    `rodada 17: ${(size / 1024).toFixed(0)} KB; fim da temporada: ${(endSize / 1024).toFixed(0)} KB`);

  await saves.clear();
  check('apagar o save faz load devolver null', (await saves.load()) === null);
}

// 4. Versão e migrações.
{
  const text = serializeCareer(start, 1);
  check('save grava a versão atual', JSON.parse(text).saveVersion === CURRENT_SAVE_VERSION);
  const migrations = {
    1: (d: { a: number }) => ({ ...d, b: d.a * 2 }),
    2: (d: { a: number; b: number }) => ({ ...d, c: d.a + d.b }),
  };
  check('migrações rodam em ordem da versão antiga até a atual', json(migrate({ a: 1 }, 1, migrations, 3)) === json({ a: 1, b: 2, c: 3 }));
  const throws = (f: () => unknown) => {
    try {
      f();
      return false;
    } catch (e) {
      return e instanceof SaveError;
    }
  };
  check('falta de migração gera erro claro', throws(() => migrate({}, 1, {}, 2)));
  check('save mais novo que o app gera erro claro', throws(() => migrate({}, 9, {}, 1)));
  check('save corrompido gera erro claro', throws(() => deserializeCareer('{"saveVersion":1,"data":')));

  // Save da Fase 1 (v1): clubes sem finanças/treino e carreira sem listas de mercado.
  const v1Clubs: Record<string, unknown> = {};
  for (const [id, cl] of Object.entries(start.clubs)) {
    const { finance: _f, training: _t, ...rest } = cl;
    v1Clubs[id] = rest;
  }
  const { transfers: _tr, inbox: _in, preContracts: _pc, ...v1Rest } = start;
  const v1 = JSON.stringify({ saveVersion: 1, savedAt: 1, data: { ...v1Rest, saveVersion: 1, clubs: v1Clubs } });
  let migrated: CareerState | null = null;
  try {
    migrated = deserializeCareer(v1).career;
  } catch {
    migrated = null;
  }
  const club0 = migrated?.clubs[userClubId];
  check('save v1 (Fase 1) migra para v2 com finanças e listas de mercado',
    !!migrated && migrated.saveVersion === CURRENT_SAVE_VERSION && !!club0?.finance && !!club0.training &&
      Array.isArray(migrated.transfers) && Array.isArray(migrated.inbox) && Array.isArray(migrated.preContracts));
  check('save migrado continua jogável', !!migrated && advanceRound(migrated).results.length === 10);
  check('save sem dados gera erro claro', throws(() => deserializeCareer('{"saveVersion":1}')));
}

// 5. Escalação do usuário.
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
  const lineup = userLineup(swapped);
  check('escalação efetiva usa o XI escolhido', lineup.slots.some((s) => s.playerId === bench));
  const f352 = setUserFormation(start, '3-5-2');
  check('trocar formação refaz o XI para a nova formação', f352.clubs[userClubId]!.tactic.formation === '3-5-2' &&
    f352.clubs[userClubId]!.startingXI.length === 11);
  const tired: CareerState = simulateRounds(start, 5);
  check('escalação automática disponível no meio da temporada', autoPickUserXI(tired).clubs[userClubId]!.startingXI.length === 11);
}

// 6. Temporada seguinte.
{
  const next = startNextSeason(atOnce);
  check('nova temporada começa do zero com o ano seguinte', next.season.year === 2027 && next.season.nextRound === 1 && next.season.results.length === 0);
  check('nova temporada tem calendário diferente', json(next.season.fixtures.map((f) => f.homeId)) !== json(atOnce.season.fixtures.map((f) => f.homeId)));
  const second = simulateRounds(next);
  check('segunda temporada entra no histórico', second.history.length === 2 && second.history[1]!.year === 2027);
  check('não começa temporada nova com a atual em andamento', startNextSeason(start) === start);
}

console.log(failures === 0 ? '\nTudo verde.' : `\n${failures} verificação(ões) falharam.`);
process.exit(failures === 0 ? 0 : 1);
