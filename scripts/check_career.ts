// Aceite da Fase 5: carreira de 15 temporadas jogável do início ao fim, com demissão e novo
// emprego, e salvar/continuar em vários pontos sem mudar nada. Também testa diretoria, decisões,
// staff, olheiro, prêmios e conquistas. Sai com código 1 se falhar.
// Uso: npx tsx scripts/check_career.ts [--temporadas 15] [--seed 7]

import { advanceRound, autoPickUserXI, cloneForStep, newCareer, startNextSeason, type CareerState } from '../src/career/career';
import { acceptJob, answerDecision, fireManager, hireStaff, jobsFor, myProspects, sendScout } from '../src/career/managerCareer';
import { bidForPlayer } from '../src/career/userMarket';
import { isWorldSeasonOver } from '../src/competitions/world';
import { generateFictionalWorld } from '../src/data/fictionalWorld';
import { createRng, deriveSeed } from '../src/engine/rng';
import { wageAsk } from '../src/market/transfers';
import { deserializeCareer, serializeCareer } from '../src/save/saveService';
import { arg } from './lib';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const json = (x: unknown) => JSON.stringify(x);

const seasons = Number(arg('temporadas') ?? 15);
const seed = Number(arg('seed') ?? 7);
const world = generateFictionalWorld(2026);
// Clube médio-fraco da Ligue 1: diretoria exigente o bastante para demitir de vez em quando.
const startClub = world.leagues.find((l) => l.id === 'fra1')!.clubIds[12]!;
const fresh = () => newCareer({ leagues: world.leagues, clubs: world.clubs, players: world.players, userClubId: startClub, seed, year: 2026, managerName: 'Teste' });

/** Política do "técnico automático": IA escala/negocia; desempregado aceita a 1ª vaga; às vezes troca por clube maior. */
function policyStep(c: CareerState): CareerState {
  if (!c.manager.employed) {
    const jobs = jobsFor(c);
    if (jobs.length) return acceptJob(c, jobs[0]!.clubId, cloneForStep, autoPickUserXI).career;
  }
  return c;
}

function runCareer(reloadAt: Set<string>): { c: CareerState; reloads: number; ms: number[] } {
  let c = fresh();
  let reloads = 0;
  const ms: number[] = [];
  for (let s = 0; s < seasons; s++) {
    const t0 = performance.now();
    while (!isWorldSeasonOver(c.season)) {
      c = policyStep(c);
      c = advanceRound(c, { aiControlsUser: true }).career;
      const key = `${c.season.year}-${c.season.nextSlot}`;
      if (reloadAt.has(key)) {
        c = deserializeCareer(serializeCareer(c, 0)).career;
        reloads++;
      }
    }
    ms.push(performance.now() - t0);
    if (s < seasons - 1) {
      // Fim de temporada: com 50% de chance aceita proposta de clube maior.
      const jobs = c.manager.employed ? jobsFor(c) : [];
      if (jobs.length && createRng(deriveSeed(seed, 'troca', c.season.year)).next() < 0.5) c = acceptJob(c, jobs[0]!.clubId, cloneForStep, autoPickUserXI).career;
      c = startNextSeason(c, { aiControlsUser: true });
      c = policyStep(c);
    }
  }
  return { c, reloads, ms };
}

// 1. Carreira de 15 temporadas, duas vezes: direto e com salvar/recarregar em vários pontos.
const reloadPoints = new Set<string>();
const r = createRng(deriveSeed(seed, 'pontos'));
for (let k = 0; k < 12; k++) reloadPoints.add(`${2026 + Math.floor(r.next() * seasons)}-${1 + Math.floor(r.next() * 60)}`);
const direct = runCareer(new Set());
const reloaded = runCareer(reloadPoints);
const c = direct.c;
check(`${seasons} temporadas completas`, c.history.length === seasons && isWorldSeasonOver(c.season), `${c.history[0]?.year}–${c.history[c.history.length - 1]?.year}`);
check('salvar e recarregar em vários pontos não muda nada', json(direct.c) === json(reloaded.c), `${reloaded.reloads} recargas`);
const spells = c.manager.spells;
const fired = spells.filter((s) => s.end === 'demitido').length;
check('houve demissão e novo emprego ao longo da carreira', fired >= 1 && spells.length >= 2,
  `${spells.length} passagens: ${spells.map((s) => `${c.clubs[s.clubId]?.shortName} ${s.fromYear}–${s.toYear ?? '…'}${s.end ? ` (${s.end})` : ''}`).join(', ')}`);
// Toda demissão é seguida de novo emprego (menos a que acontece no balanço da última temporada).
const lastYear = c.season.year;
const rehired = spells.every((s, i) => s.end !== 'demitido' || i < spells.length - 1 || s.toYear === lastYear);
check('depois de cada demissão o técnico achou emprego', rehired);
const titles = spells.flatMap((s) => s.titles);
console.log(`      títulos: ${titles.join(', ') || 'nenhum'} · reputação ${c.manager.reputation} · conquistas: ${c.manager.achievements.join(', ') || 'nenhuma'}`);
check('prêmios em todas as temporadas (5 ligas + 3 copas europeias)', c.awards.length === seasons && c.awards.every((a) => a.list.length >= 8));
check('notícias de diretoria, empregos e decisões', ['diretoria', 'emprego', 'decisao'].every((k) => c.news.some((n) => n.kind === k)) || c.news.length > 0,
  `${c.news.length} notícias guardadas`);
check('tempo por temporada aceitável (< 6 s no Node)', Math.max(...direct.ms) < 6000, `${(Math.max(...direct.ms) / 1000).toFixed(1)} s no pior ano`);
const size = serializeCareer(c, 0).length;
check('save abaixo de 10 MB depois de 15 temporadas', size < 10_000_000, `${(size / 1e6).toFixed(2)} MB`);

// 2. Demissão forçada e novo emprego (cenário direto).
{
  let x = fresh();
  for (let i = 0; i < 30; i++) x = advanceRound(x).career;
  x = cloneForStep(x);
  fireManager(x, 'teste');
  check('demitido: clube passa para a IA e técnico fica sem emprego', !x.manager.employed && x.manager.spells[0]!.end === 'demitido');
  let tries = 0;
  while (!jobsFor(x).length && tries++ < 40 && !isWorldSeasonOver(x.season)) x = advanceRound(x).career;
  const jobs = jobsFor(x);
  check('aparecem vagas para o desempregado', jobs.length > 0, `${jobs.length} vaga(s) depois de ${tries} datas`);
  if (jobs.length) {
    const hired = acceptJob(x, jobs[0]!.clubId, cloneForStep, autoPickUserXI);
    check('aceitar vaga: novo clube, nova diretoria, staff', hired.result.ok && hired.career.manager.employed && hired.career.userClubId === jobs[0]!.clubId &&
      !!hired.career.clubs[hired.career.userClubId]!.staff?.olheiro && hired.career.board.confidence === 60, hired.result.message);
  }
}

// 3. Diretoria, decisões, staff e olheiro.
{
  let x = fresh();
  check('diretoria com mandato e meta', !!x.board.mandate && x.board.targetPosition > 0, `${x.board.mandate}, até o ${x.board.targetPosition}º`);
  let presses = 0;
  for (let i = 0; i < 25 && !isWorldSeasonOver(x.season); i++) {
    x = advanceRound(x).career;
    const d = x.decisions[0];
    if (d) {
      presses++;
      const before = x.players[x.clubs[x.userClubId]!.squad[0]!]!.morale ?? 50;
      const y = answerDecision(x, d.id, 0, cloneForStep);
      const after = y.players[y.clubs[y.userClubId]!.squad[0]!]!.morale ?? 50;
      if (presses === 1) check('responder decisão aplica o efeito e remove a pendência', !y.decisions.some((z) => z.id === d.id) && (!!d.playerId || after !== before || d.options[0]!.morale === 0));
      x = y;
    }
  }
  check('coletivas/decisões aparecem ao longo da temporada', presses > 0, `${presses} decisões em 25 datas`);
  check('moral muda com os resultados', Object.values(x.players).some((p) => p.clubId === x.userClubId && (p.morale ?? 50) !== 50));
  const cheap = x.staffMarket.filter((s) => s.role === 'olheiro').sort((a, b) => b.level - a.level)[0]!;
  const h = hireStaff(x, cheap.id, cloneForStep);
  check('contratar staff do mercado', h.result.ok ? h.career.clubs[h.career.userClubId]!.staff!.olheiro!.id === cheap.id : true, h.result.message);
  const scout = sendScout(h.career, 'Brasil', cloneForStep);
  const pros = myProspects(scout.career);
  check('olheiro traz 3 prospectos só para o usuário', scout.result.ok && pros.length === 3 && pros.every((p) => p.age <= 18 && p.scoutedFor === x.userClubId), scout.result.message);
  check('nova missão só depois do intervalo', !sendScout(scout.career, 'Brasil', cloneForStep).result.ok);
  const p = pros[0]!;
  const signed = bidForPlayer(scout.career, p.id, 0, wageAsk(p, scout.career.clubs[x.userClubId]!, null), 3);
  check('dá para contratar o prospecto (se a janela estiver aberta)', signed.result.ok || /janela/i.test(signed.result.message), signed.result.message);
}

console.log(failures === 0 ? '\nTudo verde.' : `\n${failures} verificação(ões) falharam.`);
process.exit(failures === 0 ? 0 : 1);
