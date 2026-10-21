// Clube: caixa, orçamentos da diretoria, folha salarial, receitas e despesas da temporada,
// emprestados e movimentações do clube.

import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Header } from '../components/Header';
import { formatMoney, formatWage } from '../components/labels';
import { Card, Muted, SectionTitle, Segmented, Strong } from '../components/ui';
import { MAX_DEBT_SHARE, spendableFee, weeklyWageBill } from '../src/club/finance';
import { selectCareer, useGame } from '../store/gameStore';
import { CareerView, StaffView } from './ClubPanels';

function Line({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-green-700 dark:text-green-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100';
  return (
    <View className="flex-row justify-between py-1">
      <Muted>{label}</Muted>
      <Text className={`text-sm font-semibold ${color}`}>{value}</Text>
    </View>
  );
}

/** Aba Clube: finanças, staff e carreira do técnico. */
export function ClubScreen() {
  const [sub, setSub] = useState<'financas' | 'staff' | 'carreira'>('financas');
  return (
    <View className="flex-1">
      <View className="px-4 pt-2">
        <Segmented
          options={['financas', 'staff', 'carreira'] as const}
          value={sub}
          onChange={setSub}
          labelOf={(v) => (v === 'financas' ? 'Finanças' : v === 'staff' ? 'Staff' : 'Carreira')}
        />
      </View>
      <View className="flex-1">{sub === 'financas' ? <FinanceView /> : sub === 'staff' ? <StaffView /> : <CareerView />}</View>
    </View>
  );
}

function FinanceView() {
  const career = useGame(selectCareer)!;
  const { clubs, userClubId, players, season, transfers } = career;
  const club = clubs[userClubId]!;
  const f = club.finance;
  const bill = weeklyWageBill(club, players);
  const led = f.season;
  const net = led.income + led.prizes + led.transfersOut - led.wages - led.operating - led.transfersIn;

  const loanedOut = useMemo(() => Object.values(players).filter((p) => p.loan?.parentClubId === userClubId), [players, userClubId]);
  const mine = useMemo(
    () => transfers.filter((t) => t.fromClubId === userClubId || t.toClubId === userClubId).slice(-15).reverse(),
    [transfers, userClubId],
  );
  const capPct = Math.round((bill / Math.max(1, club.wageBudget)) * 100);

  return (
    <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
      <Header title={club.name} subtitle={`Reputação ${club.reputation} · treino ${'★'.repeat(club.training)}${'☆'.repeat(5 - club.training)}`} />

      <Card>
        <SectionTitle>Caixa e orçamento</SectionTitle>
        <Strong className="text-2xl">{formatMoney(f.balance)}</Strong>
        <Muted>em caixa · receita anual de referência {formatMoney(f.revenueBase)}</Muted>
        <View className="mt-3">
          <Line label="Orçamento de transferências" value={formatMoney(club.budget)} />
          <Line label="Pode gastar agora" value={formatMoney(spendableFee(club))} />
          <Line label="Limite de dívida (fair play)" value={formatMoney(-MAX_DEBT_SHARE * f.revenueBase)} />
        </View>
      </Card>

      <Card>
        <SectionTitle>Folha salarial</SectionTitle>
        <View className="flex-row items-baseline justify-between">
          <Strong>{formatWage(bill)}</Strong>
          <Muted>teto {formatWage(club.wageBudget)}</Muted>
        </View>
        <View className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <View className={`h-full ${capPct > 100 ? 'bg-red-500' : capPct > 92 ? 'bg-amber-500' : 'bg-green-600'}`} style={{ width: `${Math.min(100, capPct)}%` }} />
        </View>
        <Muted className="mt-1">{capPct}% do teto definido pela diretoria</Muted>
      </Card>

      <Card>
        <SectionTitle>Temporada {season.year}</SectionTitle>
        <Line label="TV, bilheteria e comercial" value={formatMoney(led.income)} tone="good" />
        <Line label="Premiação" value={formatMoney(led.prizes)} tone="good" />
        <Line label="Vendas" value={formatMoney(led.transfersOut)} tone="good" />
        <Line label="Salários (e multas de dispensa)" value={formatMoney(-led.wages)} tone="bad" />
        <Line label="Custos operacionais" value={formatMoney(-led.operating)} tone="bad" />
        <Line label="Compras" value={formatMoney(-led.transfersIn)} tone="bad" />
        <View className="mt-1 border-t border-slate-200 pt-1 dark:border-slate-800">
          <Line label="Resultado" value={formatMoney(net)} tone={net >= 0 ? 'good' : 'bad'} />
        </View>
        <Muted className="mt-1">A premiação pela colocação entra no fim da temporada.</Muted>
      </Card>

      {loanedOut.length > 0 ? (
        <Card>
          <SectionTitle>Emprestados</SectionTitle>
          {loanedOut.map((p) => (
            <Muted key={p.id}>
              {p.name} → {clubs[p.clubId ?? '']?.name} (volta no fim de {p.loan!.until})
            </Muted>
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Movimentações do clube</SectionTitle>
        {mine.length === 0 ? <Muted>Nenhuma ainda.</Muted> : null}
        {mine.map((t, i) => {
          const incoming = t.toClubId === userClubId;
          const other = incoming ? t.fromClubId : t.toClubId;
          const what =
            t.type === 'release' ? `dispensado (multa ${formatMoney(t.fee)})`
            : t.type === 'loan' ? (incoming ? 'chegou emprestado' : 'saiu emprestado')
            : t.type === 'loanReturn' ? (incoming ? 'voltou de empréstimo' : 'devolvido')
            : `${incoming ? 'chegou' : 'saiu'}${t.fee ? ` por ${formatMoney(t.fee)}` : ' de graça'}`;
          return (
            <Muted key={`${t.playerId}-${i}`}>
              {t.year} · {t.playerName} {what}
              {other ? ` (${clubs[other]?.shortName ?? '?'})` : ''}
            </Muted>
          );
        })}
      </Card>
    </ScrollView>
  );
}
