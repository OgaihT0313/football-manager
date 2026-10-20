// Negociação com um jogador: compra, empréstimo, pré-contrato ou renovação.
// Os valores iniciais são o pedido estimado; o resultado (aceite, contraproposta, recusa) aparece
// embaixo e, numa contraproposta, um toque aplica o valor pedido.

import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { bidForPlayer, renewPlayer, requestLoan, signPreContract, type MarketResult } from '../src/career/userMarket';
import { spendableFee, wageRoom } from '../src/club/finance';
import { openWindow, preContractsOpen } from '../src/market/calendar';
import { askingPrice, renewalResponse, wageAsk } from '../src/market/transfers';
import { contractYearsRange } from '../src/market/valuation';
import { selectCareer, useGame } from '../store/gameStore';
import { formatMoney, formatWage, POS_LABEL } from './labels';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';
import { Badge, Button, Card, Muted, Segmented, Strong } from './ui';

export type NegotiationMode = 'comprar' | 'renovar';

const YEARS = [1, 2, 3, 4, 5] as const;
const SHARES = [0.5, 0.75, 1] as const;

export function NegotiationSheet({ playerId, mode, onClose }: { playerId: string; mode: NegotiationMode; onClose: () => void }) {
  const career = useGame(selectCareer)!;
  const market = useGame((s) => s.market);
  const p = career.players[playerId];
  const user = career.clubs[career.userClubId]!;
  const from = p?.clubId ? career.clubs[p.clubId] : null;
  const year = career.season.year;

  const initial = useMemo(() => {
    if (!p) return { fee: 0, wage: 0, years: 3 };
    const [minY, maxY] = contractYearsRange(p.age);
    const years = Math.min(maxY, Math.max(minY, 3));
    if (mode === 'renovar') {
      const ans = renewalResponse(p, 0, years);
      return { fee: 0, wage: ans.kind === 'refuse' ? ans.wage : p.contract.wage, years };
    }
    const fee = from ? askingPrice(p, from, career.players, year) : 0;
    return { fee: Math.round((fee * 0.9) / 50_000) * 50_000, wage: wageAsk(p, user, from ?? null), years };
    // Calculado só ao abrir a folha: depois o usuário mexe nos valores.
  }, [playerId, mode]);

  const [fee, setFee] = useState(initial.fee);
  const [wage, setWage] = useState(initial.wage);
  const [years, setYears] = useState<number>(initial.years);
  const [share, setShare] = useState<(typeof SHARES)[number]>(1);
  const [result, setResult] = useState<MarketResult | null>(null);

  if (!p) return null;
  const windowOpen = !!openWindow(career.season);
  const isFree = !p.clubId;
  const canPreContract = !!from && !p.loan && p.contract.expires === year && preContractsOpen(career.season);
  const range = contractYearsRange(p.age);
  const feeStep = Math.max(50_000, Math.round((p.value * 0.05) / 50_000) * 50_000);
  const wageStep = Math.max(500, Math.round((wage * 0.05) / 100) * 100);

  const run = (action: Parameters<typeof market>[0]) => {
    const r = market(action);
    setResult(r);
    if (r.ok) setTimeout(onClose, 900);
  };

  return (
    <Sheet title={mode === 'renovar' ? `Renovar com ${p.name}` : p.name} onClose={onClose}>
      <Card className="p-3">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Badge label={p.positions.map((x) => POS_LABEL[x]).join('/')} />
          <Badge tone="good" label={`OVR ${p.ovr}`} />
          <Badge label={`Pot. ${p.potential}`} />
          <Badge label={`${p.age} anos`} />
          {p.loan ? <Badge tone="warn" label="Emprestado" /> : null}
        </View>
        <Muted className="mt-2">
          {from ? from.name : 'Agente livre'} · valor {formatMoney(p.value)} · salário {formatWage(p.contract.wage)}
          {p.clubId ? ` · contrato até ${p.contract.expires}` : ''}
          {p.contract.releaseClause ? ` · multa ${formatMoney(p.contract.releaseClause)}` : ''}
        </Muted>
        {mode === 'comprar' ? (
          <Muted className="mt-1">
            Seu orçamento: {formatMoney(spendableFee(user))} · folga na folha: {formatWage(wageRoom(user, career.players))}
          </Muted>
        ) : (
          <Muted className="mt-1">Folga na folha: {formatWage(wageRoom(user, career.players))}</Muted>
        )}
      </Card>

      {mode === 'comprar' && !isFree ? <Stepper label="Taxa de transferência" value={fee} onChange={setFee} step={feeStep} format={formatMoney} /> : null}
      <Stepper label="Salário semanal" value={wage} onChange={setWage} step={wageStep} min={500} format={formatWage} />
      <View>
        <Muted className="mb-1">
          Duração (ele aceita de {range[0]} a {range[1]} temporadas)
        </Muted>
        <Segmented options={YEARS} value={years as (typeof YEARS)[number]} onChange={setYears} labelOf={(y) => `${y}a`} />
      </View>

      {result ? (
        <Card className={result.ok ? 'border-green-400 dark:border-green-700' : 'border-amber-400 dark:border-amber-700'}>
          <Strong className="text-sm">{result.message}</Strong>
          {!result.ok && result.counterFee ? (
            <Button className="mt-2" variant="secondary" label={`Usar ${formatMoney(result.counterFee)}`} onPress={() => setFee(result.counterFee!)} />
          ) : null}
          {!result.ok && result.wage ? (
            <Button
              className="mt-2"
              variant="secondary"
              label={`Usar ${formatWage(result.wage)}${result.years ? ` e ${Math.min(Math.max(years, result.years[0]), result.years[1])}a` : ''}`}
              onPress={() => {
                setWage(result.wage!);
                if (result.years) setYears(Math.min(Math.max(years, result.years[0]), result.years[1]));
              }}
            />
          ) : null}
        </Card>
      ) : null}

      {mode === 'renovar' ? (
        <Button label="Propor renovação" onPress={() => run((c) => renewPlayer(c, p.id, wage, years))} />
      ) : (
        <View className="gap-2">
          <Button
            label={isFree ? 'Contratar' : 'Fazer proposta'}
            disabled={!windowOpen || !!p.loan}
            onPress={() => run((c) => bidForPlayer(c, p.id, isFree ? 0 : fee, wage, years))}
          />
          {!windowOpen ? <Muted>Janela fechada: compras e empréstimos só nas janelas.</Muted> : null}
          {canPreContract ? (
            <Button variant="secondary" label="Assinar pré-contrato (chega de graça)" onPress={() => run((c) => signPreContract(c, p.id, wage, years))} />
          ) : null}
          {from && !p.loan ? (
            <Card className="p-3">
              <Muted className="mb-2">Empréstimo até o fim da temporada — você paga:</Muted>
              <Segmented options={SHARES} value={share} onChange={setShare} labelOf={(x) => `${Math.round(x * 100)}% do salário`} />
              <Button className="mt-2" variant="secondary" label="Pedir empréstimo" disabled={!windowOpen} onPress={() => run((c) => requestLoan(c, p.id, share))} />
            </Card>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
