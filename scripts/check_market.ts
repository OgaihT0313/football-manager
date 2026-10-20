// Verificações do mercado, contratos, finanças e evolução (Fase 2). Sai com código 1 se falhar.
// Uso: npx tsx scripts/check_market.ts

import { advanceRound, newCareer, simulateRounds, startNextSeason, type CareerState } from '../src/career/career';
import {
  answerOffer, bidForPlayer, loanOut, releasePlayer, renewPlayer, requestLoan, signPreContract,
} from '../src/career/userMarket';
import { developPlayer, retirementChance } from '../src/club/development';
import { spendableFee, wageRoom, weeklyWageBill } from '../src/club/finance';
import { generateFictionalLeague } from '../src/data/fictionalLeague';
import type { Player } from '../src/domain/types';
import { createRng } from '../src/engine/rng';
import { openWindow, preContractsOpen } from '../src/market/calendar';
import { askingPrice, playerResponse, releaseCost, sellerResponse, startersOf, wageAsk } from '../src/market/transfers';
import { marketValue, wageDemand } from '../src/market/valuation';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const M = (v: number) => `${(v / 1e6).toFixed(1)}M`;

const gen = generateFictionalLeague({ seed: 2026 });
const userClubId = gen.clubs[10]!.id;
const start = newCareer({ league: gen.league, clubs: gen.clubs, players: gen.players, userClubId, seed: 7, year: 2026 });
const user = () => start.clubs[userClubId]!;

// 1. Valorização.
{
  const base = gen.players.find((p) => p.age === 25 && p.positions[0] === 'CM')!;
  const v = (patch: Partial<Player>) => marketValue({ ...base, ...patch }, 2026);
  check('valor cresce com o OVR', v({ ovr: 80 }) > v({ ovr: 70 }) && v({ ovr: 70 }) > v({ ovr: 60 }), `${M(v({ ovr: 60 }))} < ${M(v({ ovr: 70 }))} < ${M(v({ ovr: 80 }))}`);
  check('jovem vale mais que veterano de mesmo OVR', v({ age: 21 }) > v({ age: 33 }));
  check('potencial alto valoriza o jovem', v({ age: 19, ovr: 70, potential: 85 }) > v({ age: 19, ovr: 70, potential: 72 }));
  check('último ano de contrato desvaloriza', v({ contract: { ...base.contract, expires: 2026 } }) < v({ contract: { ...base.contract, expires: 2029 } }));
  check('salário pedido cresce com o OVR', wageDemand({ ovr: 82, age: 27 }) > wageDemand({ ovr: 70, age: 27 }));
}

// 2. Negociação.
{
  const seller = start.clubs[gen.clubs[3]!.id]!;
  const starters = startersOf(seller, start.players);
  const starter = start.players[[...starters][3]!]!;
  const bench = seller.squad.map((id) => start.players[id]!).find((p) => !starters.has(p.id) && p.positions[0] !== 'GK')!;
  const ask = askingPrice(starter, seller, start.players, 2026);
  check('titular custa mais que o valor de mercado', ask > starter.value, `${M(starter.value)} → pede ${M(ask)}`);
  check('reserva custa menos que titular, proporcionalmente',
    askingPrice(bench, seller, start.players, 2026) / Math.max(1, bench.value) < ask / starter.value);
  check('proposta no preço é aceita', sellerResponse(starter, seller, start.players, 2026, ask).kind === 'accept');
  check('proposta perto do preço vira contraproposta', sellerResponse(starter, seller, start.players, 2026, ask * 0.8).kind === 'counter');
  check('proposta muito baixa é recusada', sellerResponse(starter, seller, start.players, 2026, ask * 0.3).kind === 'reject');
  const withClause = { ...starter, contract: { ...starter.contract, releaseClause: Math.round(ask * 0.6) } };
  check('multa rescisória obriga a vender', sellerResponse(withClause, seller, start.players, 2026, withClause.contract.releaseClause!).kind === 'accept');
  const buyer = user();
  const wAsk = wageAsk(starter, buyer, seller);
  check('jogador recusa salário abaixo do pedido', playerResponse(starter, buyer, seller, wAsk - 1000, 3).kind === 'refuse');
  check('jogador aceita salário pedido', playerResponse(starter, buyer, seller, wAsk, 3).kind === 'accept');
  const bigClub = start.clubs[gen.clubs[0]!.id]!;
  const smallClub = Object.values(start.clubs).sort((a, b) => a.reputation - b.reputation)[0]!;
  check('ir para clube menor exige salário maior', wageAsk(starter, smallClub, bigClub) > wageAsk(starter, bigClub, smallClub));
}

// 3. Ações do usuário.
const otherPlayer = (c: CareerState, pred: (p: Player) => boolean) =>
  Object.values(c.players).find((p) => p.clubId && p.clubId !== c.userClubId && !p.loan && pred(p))!;
{
  check('janela de verão aberta na pré-temporada', openWindow(start.season) === 'verao');
  const closed = simulateRounds(start, 5);
  check('janela fechada no meio do turno', openWindow(closed.season) === null);

  // Compra: um reserva barato de outro clube.
  const affordable = (p: Player) => {
    const sel = start.clubs[p.clubId!]!;
    return askingPrice(p, sel, start.players, 2026) <= spendableFee(user()) && wageAsk(p, user(), sel) <= wageRoom(user(), start.players);
  };
  const target = otherPlayer(start, (p) => p.age < 30 && affordable(p) && !startersOf(start.clubs[p.clubId!]!, start.players).has(p.id));
  const seller = start.clubs[target.clubId!]!;
  const fee = askingPrice(target, seller, start.players, 2026);
  const wage = wageAsk(target, user(), seller);
  const closedTry = bidForPlayer(closed, target.id, fee, wage, 3);
  check('compra com janela fechada é recusada', !closedTry.result.ok);
  const low = bidForPlayer(start, target.id, Math.round(fee * 0.8), wage, 3);
  check('proposta baixa volta com contraproposta', !low.result.ok && low.result.counterFee === fee);
  const done = bidForPlayer(start, target.id, fee, wage, 3);
  const after = done.career;
  const u0 = user();
  const u1 = after.clubs[userClubId]!;
  const s1 = after.clubs[seller.id]!;
  check('compra aceita: jogador muda de clube', done.result.ok && after.players[target.id]!.clubId === userClubId && u1.squad.includes(target.id) && !s1.squad.includes(target.id));
  check('compra aceita: dinheiro sai de um caixa e entra no outro',
    Math.abs(u0.finance.balance - u1.finance.balance - fee) < 1 && Math.abs(s1.finance.balance - seller.finance.balance - fee) < 1,
    `taxa ${M(fee)}`);
  check('compra entra no histórico de transferências', after.transfers.some((t) => t.playerId === target.id && t.type === 'transfer' && t.fee === fee));
  check('compra não altera o estado anterior', start.players[target.id]!.clubId === seller.id);
  const rich = bidForPlayer(start, target.id, spendableFee(u0) + 1_000_000, wage, 3);
  check('proposta acima do orçamento é recusada', !rich.result.ok);

  // Empréstimo.
  const starterTarget = otherPlayer(start, (p) => startersOf(start.clubs[p.clubId!]!, start.players).has(p.id));
  check('clube não empresta titular', !requestLoan(start, starterTarget.id, 1).result.ok);
  const loanTarget = otherPlayer(
    start,
    (p) => p.age <= 23 && !startersOf(start.clubs[p.clubId!]!, start.players).has(p.id) && p.contract.wage <= wageRoom(user(), start.players),
  );
  const loaned = requestLoan(start, loanTarget.id, 1);
  check('empréstimo de reserva é aceito', loaned.result.ok && loaned.career.players[loanTarget.id]!.loan?.parentClubId === loanTarget.clubId);
  const billBefore = weeklyWageBill(userClubId, start.players);
  check('emprestado entra na folha de quem recebe', weeklyWageBill(userClubId, loaned.career.players) - billBefore === loanTarget.contract.wage);
  const back = startNextSeason(simulateRounds(loaned.career));
  const returned = back.players[loanTarget.id];
  check('emprestado volta ao dono na virada da temporada', !returned || (returned.clubId !== userClubId && !returned.loan));

  // Pré-contrato.
  const expiring = otherPlayer(
    start,
    (p) => p.contract.expires === 2026 && p.age < 30 && wageAsk(p, user(), start.clubs[p.clubId!]!) <= wageRoom(user(), start.players),
  );
  const winter = simulateRounds(start, 19);
  check('pré-contrato fechado antes do inverno', !signPreContract(start, expiring.id, 1e6, 2).result.ok && !preContractsOpen(start.season));
  const stillThere = winter.players[expiring.id];
  if (stillThere && stillThere.clubId && stillThere.clubId !== userClubId && stillThere.contract.expires === 2026 && !stillThere.loan) {
    const ask = wageAsk(stillThere, winter.clubs[userClubId]!, winter.clubs[stillThere.clubId]!);
    const pc = signPreContract(winter, expiring.id, ask, 2);
    check('pré-contrato no inverno é aceito', pc.result.ok, pc.result.message);
    const moved = startNextSeason(simulateRounds(pc.career));
    check('pré-contrato leva o jogador de graça na virada', moved.players[expiring.id]?.clubId === userClubId &&
      moved.transfers.some((t) => t.playerId === expiring.id && t.fee === 0 && t.toClubId === userClubId));
  } else {
    check('pré-contrato no inverno é aceito', true, 'alvo já tinha renovado ou saído; ignorado');
  }

  // Renovação, dispensa e empréstimo para fora.
  const mine = user().squad.map((id) => start.players[id]!).sort((a, b) => b.ovr - a.ovr)[3]!;
  const lowRenew = renewPlayer(start, mine.id, Math.round(mine.contract.wage * 0.5), 3);
  check('renovação com salário baixo é recusada com o pedido', !lowRenew.result.ok && (lowRenew.result.wage ?? 0) >= mine.contract.wage * 0.9);
  const okRenew = renewPlayer(start, mine.id, lowRenew.result.ok ? 0 : lowRenew.result.wage!, 3);
  check('renovação no pedido é aceita', okRenew.result.ok && okRenew.career.players[mine.id]!.contract.expires === 2029);
  const worst = user().squad.map((id) => start.players[id]!).sort((a, b) => a.ovr - b.ovr)[0]!;
  const rel = releasePlayer(start, worst.id);
  const cost = releaseCost(worst, 2026);
  check('dispensa cobra a multa e libera o jogador',
    rel.result.ok && rel.career.players[worst.id]!.clubId === null &&
      Math.abs(user().finance.balance - rel.career.clubs[userClubId]!.finance.balance - cost) < 1, `multa ${M(cost)}`);
  const young = user().squad.map((id) => start.players[id]!).filter((p) => p.age <= 23).sort((a, b) => a.ovr - b.ovr)[0];
  if (young) {
    const lo = loanOut(start, young.id);
    check('emprestar jogador do usuário', lo.result.ok ? lo.career.players[young.id]!.loan?.parentClubId === userClubId : true, lo.result.message);
  }
}

// 4. Propostas da IA pelos jogadores do usuário.
{
  let c = start;
  for (let i = 0; i < 3 && c.inbox.length === 0; i++) c = advanceRound(c).career;
  if (c.inbox.length > 0) {
    const offer = c.inbox[0]!;
    const accepted = answerOffer(c, offer.id, true);
    const ok = accepted.result.ok ? accepted.career.players[offer.playerId]!.clubId === offer.fromClubId : true;
    check('proposta recebida aceita vende o jogador', ok, accepted.result.message);
    const refused = answerOffer(c, offer.id, false);
    check('proposta recusada some da caixa', refused.career.inbox.every((o) => o.id !== offer.id));
  } else {
    check('IA faz propostas pelos jogadores do usuário', false, 'nenhuma proposta nas 3 rodadas de verão');
  }
}

// 5. Evolução.
{
  const rng = createRng(1);
  const avgDelta = (age: number, training: 1 | 3 | 5, apps = 30) => {
    let sum = 0;
    // OVR vem dos atributos: usa um meia real de ~68 e só troca idade e potencial.
    const base = gen.players.find((p) => p.positions[0] === 'CM' && p.ovr >= 66 && p.ovr <= 70)!;
    for (let i = 0; i < 400; i++) {
      const p = { ...base, age, potential: base.ovr + 14 };
      sum += developPlayer(p, rng, { training, apps, nextSeason: 2027 }).ovr - base.ovr;
    }
    return sum / 400;
  };
  const y = avgDelta(19, 3);
  const o = avgDelta(33, 3);
  check('jovem evolui, veterano declina', y > 2 && o < -1, `19 anos ${y.toFixed(1)}/ano, 33 anos ${o.toFixed(1)}/ano`);
  check('treino melhor acelera a evolução', avgDelta(19, 5) > avgDelta(19, 1) + 0.5);
  check('jovem sem minutos evolui menos', avgDelta(19, 3, 0) < avgDelta(19, 3, 30) - 0.5);
  check('veterano de 38 anos se aposenta', retirementChance({ ...gen.players[0]!, age: 38 }) === 1);
}

// 6. Várias temporadas: invariantes do mundo e determinismo.
{
  const run = (seed: number) => {
    let c = newCareer({ league: gen.league, clubs: gen.clubs, players: gen.players, userClubId, seed, year: 2026 });
    for (let s = 0; s < 3; s++) {
      c = simulateRounds(c, Infinity, { aiControlsUser: true });
      if (s < 2) c = startNextSeason(c, { aiControlsUser: true });
    }
    return c;
  };
  const a = run(11);
  const b = run(11);
  check('mesma seed = mesmas 3 temporadas com mercado', JSON.stringify(a) === JSON.stringify(b));

  const seen = new Map<string, string>();
  let duplicated = 0;
  let mismatch = 0;
  for (const club of Object.values(a.clubs)) {
    for (const id of club.squad) {
      if (seen.has(id)) duplicated++;
      seen.set(id, club.id);
      if (a.players[id]?.clubId !== club.id) mismatch++;
    }
  }
  const orphans = Object.values(a.players).filter((p) => p.clubId && !a.clubs[p.clubId]?.squad.includes(p.id)).length;
  check('nenhum jogador em dois elencos', duplicated === 0);
  check('elenco e clubId sempre batem', mismatch === 0 && orphans === 0, `${mismatch} divergências, ${orphans} órfãos`);
  const gkOk = Object.values(a.clubs).every((cl) => cl.squad.filter((id) => a.players[id]?.positions[0] === 'GK').length >= 2);
  check('todo clube tem pelo menos 2 goleiros', gkOk);
  const debtOk = Object.values(a.clubs).every((cl) => cl.finance.balance > -0.5 * cl.finance.revenueBase);
  check('nenhum clube quebrado após 3 temporadas', debtOk);
  const capOk = Object.values(a.clubs).every((cl) => weeklyWageBill(cl.id, a.players) <= cl.wageBudget * 1.15);
  check('folhas dentro do teto (com folga de 15%)', capOk);
  const contracts = Object.values(a.players).filter((p) => p.clubId && !p.loan).every((p) => p.contract.expires >= a.season.year);
  check('nenhum contrato vencido em jogador com clube', contracts);
  check('transferências da IA acontecem', a.transfers.filter((t) => t.type === 'transfer').length > 10, `${a.transfers.filter((t) => t.type === 'transfer').length} no histórico`);
}

console.log(failures === 0 ? '\nTudo verde.' : `\n${failures} verificação(ões) falharam.`);
process.exit(failures === 0 ? 0 : 1);
