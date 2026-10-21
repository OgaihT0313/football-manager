// Clube: Finanças (caixa, verba, folha, receitas e despesas da temporada, staff, emprestados e
// movimentações), Staff, Diretoria e Carreira (painéis em ClubPanels.tsx).

import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { formatMoney, formatWage } from '../components/labels';
import { BoardCard } from '../components/ManagerCards';
import { useWide } from '../components/theme';
import { Card, Dots, Label, Meter, Muted, Num, Tabs, Title } from '../components/ui';
import { MAX_DEBT_SHARE, spendableFee, staffBudget, staffWeekly, weeklyWageBill } from '../src/club/finance';
import { ROLE_LABEL, STAFF_ROLES } from '../src/manager/staff';
import { selectCareer, useGame } from '../store/gameStore';
import { CareerView, StaffView } from './ClubPanels';

type Sub = 'financas' | 'staff' | 'diretoria' | 'carreira';
const SUB_LABEL: Record<Sub, string> = { financas: 'Finanças', staff: 'Staff', diretoria: 'Diretoria', carreira: 'Carreira' };

export function ClubScreen() {
  const wide = useWide();
  const career = useGame(selectCareer)!;
  const [sub, setSub] = useState<Sub>('financas');
  return (
    <View className="flex-1">
      <View className={wide ? 'flex-row items-end gap-8 border-b border-line px-12 pt-9' : 'gap-2.5 px-[18px] pt-2'}>
        <Title size={wide ? 40 : 30} className={wide ? 'pb-3' : ''}>
          Clube
        </Title>
        <Tabs options={['financas', 'staff', 'diretoria', 'carreira'] as const} value={sub} onChange={setSub} labelOf={(s) => SUB_LABEL[s]} size={wide ? 14.5 : 13} className={wide ? 'border-b-0' : ''} />
      </View>
      <View className="flex-1">
        {sub === 'financas' ? (
          <FinanceView onStaff={() => setSub('staff')} />
        ) : sub === 'staff' ? (
          <StaffView />
        ) : sub === 'diretoria' ? (
          <ScrollView contentContainerClassName={wide ? 'mx-auto w-full max-w-[760px] gap-4 px-12 py-8' : 'gap-3 px-3.5 py-3'}>
            <BoardCard career={career} />
            <Muted className="px-1 text-xs">
              A confiança acompanha a campanha contra a meta e as copas. Abaixo da linha do mandato no fim da temporada (ou muito baixa a partir da 19ª rodada), você é demitido.
            </Muted>
          </ScrollView>
        ) : (
          <CareerView />
        )}
      </View>
    </View>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <View className="flex-row justify-between">
      <Text className="font-sans text-[13px] text-ink">{label}</Text>
      <Text className={`font-monob text-[12.5px] ${tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-ink'}`}>{value}</Text>
    </View>
  );
}

function FinanceView({ onStaff }: { onStaff: () => void }) {
  const wide = useWide();
  const career = useGame(selectCareer)!;
  const { clubs, userClubId, players, season, transfers } = career;
  const club = clubs[userClubId]!;
  const f = club.finance;
  const bill = weeklyWageBill(club, players);
  const led = f.season;
  const net = led.income + led.prizes + led.transfersOut - led.wages - led.operating - led.transfersIn;
  const capPct = Math.round((bill / Math.max(1, club.wageBudget)) * 100);

  const loanedOut = useMemo(() => Object.values(players).filter((p) => p.loan?.parentClubId === userClubId), [players, userClubId]);
  const mine = useMemo(
    () => transfers.filter((t) => t.fromClubId === userClubId || t.toClubId === userClubId).slice(-15).reverse(),
    [transfers, userClubId],
  );
  const items: { label: string; value: number; tone: 'pos' | 'neg' }[] = [
    { label: 'TV, bilheteria e comercial', value: led.income, tone: 'pos' },
    { label: 'Premiação', value: led.prizes, tone: 'pos' },
    { label: 'Vendas', value: led.transfersOut, tone: 'pos' },
    { label: 'Salários', value: led.wages, tone: 'neg' },
    { label: 'Estrutura e staff', value: led.operating, tone: 'neg' },
    { label: 'Compras', value: led.transfersIn, tone: 'neg' },
  ];
  const money = (it: (typeof items)[number]) => `${it.tone === 'pos' ? '+' : '−'} ${formatMoney(it.value).replace('−', '')}`;

  const saldo = (
    <View className="gap-0.5">
      <Label>Saldo em caixa</Label>
      <Num size={wide ? 72 : 52} black className={f.balance < 0 ? 'text-neg' : ''}>
        {formatMoney(f.balance)}
      </Num>
      <Text className={`font-monom ${net >= 0 ? 'text-pos' : 'text-neg'}`} style={{ fontSize: wide ? 13 : 12 }}>
        {net >= 0 ? '▲' : '▼'} {formatMoney(Math.abs(net))} na temporada
      </Text>
    </View>
  );

  const ledger = (
    <Card className={`gap-[9px] ${wide ? 'flex-1 rounded-[18px] p-6' : 'px-3.5 py-3'}`}>
      <Label>Temporada {season.year} · receitas e despesas</Label>
      {wide ? (
        <View className="gap-3 py-2">
          {items.map((it) => {
            const max = Math.max(1, ...items.map((x) => x.value));
            return (
              <View key={it.label} className="gap-1">
                <View className="flex-row justify-between">
                  <Muted className="text-xs">{it.label}</Muted>
                  <Text className={`font-monob text-[13px] ${it.tone === 'pos' ? 'text-pos' : 'text-neg'}`}>{money(it)}</Text>
                </View>
                <View className="h-2 overflow-hidden rounded-sm bg-s2">
                  <View className={`h-full rounded-sm ${it.tone === 'pos' ? 'bg-pos' : 'bg-neg'}`} style={{ width: `${(it.value / max) * 100}%` }} />
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        items.map((it) => <Line key={it.label} label={it.label} value={money(it)} tone={it.tone} />)
      )}
      <View className="mt-1 border-t border-line pt-2">
        <Line label="Resultado" value={formatMoney(net)} tone={net >= 0 ? 'pos' : 'neg'} />
      </View>
      <Muted className="text-xs">A premiação pela colocação entra no fim da temporada.</Muted>
    </Card>
  );

  const staff = (
    <View className={wide ? 'flex-1 rounded-[18px] border border-line bg-s1 p-6' : ''}>
      <View className="flex-row items-start justify-between pb-2">
        <View className="gap-0.5">
          <Label>Staff</Label>
          <Text className="font-mono text-[11px] text-mute">
            {formatWage(staffWeekly(club))} de {formatWage(staffBudget(club))}
          </Text>
        </View>
        <Text accessibilityRole="button" onPress={onStaff} className="font-monom text-[10.5px] uppercase tracking-[1px] text-acct">
          Contratar →
        </Text>
      </View>
      {STAFF_ROLES.map((role) => {
        const m = club.staff?.[role];
        return (
          <View key={role} className={`flex-row items-center gap-2.5 border-t border-line ${wide ? 'h-[62px]' : 'px-1 py-[9px]'}`}>
            <View className="flex-1">
              <Text className="font-sanss text-[13.5px] text-ink">{m?.name ?? 'Cargo vago'}</Text>
              <Text className="font-sans text-[11.5px] text-mute">{ROLE_LABEL[role]}</Text>
            </View>
            <Dots n={m?.level ?? 0} size={wide ? 9 : 7} />
            {wide ? <Text className="w-[110px] text-right font-mono text-[12.5px] text-mute">{m ? formatWage(m.wage) : '—'}</Text> : null}
          </View>
        );
      })}
    </View>
  );

  const extras = (
    <>
      {loanedOut.length > 0 ? (
        <View>
          <Label className="px-1 pb-1.5">Emprestados</Label>
          {loanedOut.map((p) => (
            <Text key={p.id} className="border-t border-line px-1 py-2 font-sans text-[13px] text-ink">
              {p.name} <Text className="text-mute">→ {clubs[p.clubId ?? '']?.name} (volta no fim de {p.loan!.until})</Text>
            </Text>
          ))}
        </View>
      ) : null}
      <View>
        <Label className="px-1 pb-1.5">Movimentações do clube</Label>
        {mine.length === 0 ? <Muted className="px-1">Nenhuma ainda.</Muted> : null}
        {mine.map((t, i) => {
          const incoming = t.toClubId === userClubId;
          const other = incoming ? t.fromClubId : t.toClubId;
          const what =
            t.type === 'release' ? `dispensado (multa ${formatMoney(t.fee)})`
            : t.type === 'loan' ? (incoming ? 'chegou emprestado' : 'saiu emprestado')
            : t.type === 'loanReturn' ? (incoming ? 'voltou de empréstimo' : 'devolvido')
            : `${incoming ? 'chegou' : 'saiu'}${t.fee ? ` por ${formatMoney(t.fee)}` : ' de graça'}`;
          return (
            <Text key={`${t.playerId}-${i}`} className="border-t border-line px-1 py-2 font-sans text-[13px] text-ink">
              <Text className="font-mono text-[11px] text-mute">{t.year} · </Text>
              {t.playerName} {what}
              {other ? <Text className="text-mute"> ({clubs[other]?.shortName ?? '?'})</Text> : null}
            </Text>
          );
        })}
      </View>
    </>
  );

  const kpis: [string, string, string][] = [
    ['Verba de transferências', formatMoney(spendableFee(club)), `Orçamento ${formatMoney(club.budget)}`],
    ['Folha / teto', `${capPct}%`, `${formatWage(bill)} de ${formatWage(club.wageBudget)}`],
    ['Receita anual', formatMoney(f.revenueBase), `Limite de dívida ${formatMoney(-MAX_DEBT_SHARE * f.revenueBase)}`],
  ];

  if (wide) {
    return (
      <ScrollView contentContainerClassName="gap-7 px-12 py-8">
        <View className="flex-row items-end gap-5">
          <View className="flex-[1.4]">{saldo}</View>
          {kpis.map(([k, v, s]) => (
            <Card key={k} className="flex-1 gap-1.5 rounded-2xl p-5">
              <Label>{k}</Label>
              <Num size={32}>{v}</Num>
              <Muted className="text-[12.5px]">{s}</Muted>
            </Card>
          ))}
        </View>
        <View className="flex-row gap-7">
          {ledger}
          {staff}
        </View>
        <View className="flex-row gap-7">
          <View className="flex-1 gap-5">{extras}</View>
          <View className="flex-1" />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerClassName="gap-3 px-3.5 pb-8 pt-3">
      <View className="px-1 pt-1">{saldo}</View>
      <View className="flex-row gap-2.5">
        <Card className="flex-1 gap-1 p-3">
          <Label className="text-[10px]">Verba transf.</Label>
          <Num size={24}>{formatMoney(spendableFee(club))}</Num>
        </Card>
        <Card className="flex-1 gap-1.5 p-3">
          <Label className="text-[10px]">Folha semanal</Label>
          <Num size={24}>{formatMoney(bill)}</Num>
          <Meter pct={capPct} tone={capPct > 100 ? 'neg' : 'acc'} />
        </Card>
      </View>
      {ledger}
      {staff}
      {extras}
    </ScrollView>
  );
}
