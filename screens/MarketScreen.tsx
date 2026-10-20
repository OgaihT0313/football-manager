// Mercado: busca de jogadores (outros clubes e agentes livres), propostas recebidas e
// movimentações recentes da liga.

import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Header } from '../components/Header';
import { formatMoney, formatWage, POS_LABEL } from '../components/labels';
import { NegotiationSheet } from '../components/NegotiationSheet';
import { Badge, Button, Card, Muted, SectionTitle, Segmented, Strong } from '../components/ui';
import { answerOffer, marketPool } from '../src/career/userMarket';
import { spendableFee, wageRoom } from '../src/club/finance';
import type { Player, Position, TransferRecord } from '../src/domain/types';
import { openWindow, preContractsOpen, windowLabel } from '../src/market/calendar';
import { selectCareer, useGame } from '../store/gameStore';

type View_ = 'buscar' | 'propostas' | 'movimentos';
type Group = 'Todos' | 'GOL' | 'DEF' | 'MEI' | 'ATA';
type Source = 'Clubes' | 'Livres' | 'Fim de contrato';

const GROUPS: readonly Group[] = ['Todos', 'GOL', 'DEF', 'MEI', 'ATA'];
const SOURCES: readonly Source[] = ['Clubes', 'Livres', 'Fim de contrato'];
const GROUP_OF: Record<Position, Group> = {
  GK: 'GOL', CB: 'DEF', LB: 'DEF', RB: 'DEF', DM: 'MEI', CM: 'MEI', AM: 'MEI', LW: 'ATA', RW: 'ATA', ST: 'ATA',
};
const MAX_ROWS = 80;

export function MarketScreen() {
  const career = useGame(selectCareer)!;
  const market = useGame((s) => s.market);
  const [view, setView] = useState<View_>('buscar');
  const [group, setGroup] = useState<Group>('Todos');
  const [source, setSource] = useState<Source>('Clubes');
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [negotiating, setNegotiating] = useState<string | null>(null);

  const { season, clubs, userClubId, players, inbox } = career;
  const user = clubs[userClubId]!;
  const win = openWindow(season);
  const budget = spendableFee(user);

  const list = useMemo(() => {
    return marketPool(career)
      .filter((p) => {
        if (source === 'Livres') return p.clubId === null;
        if (source === 'Fim de contrato') return p.clubId !== null && !p.loan && p.contract.expires === season.year;
        return p.clubId !== null;
      })
      .filter((p) => group === 'Todos' || GROUP_OF[p.positions[0]!] === group)
      // O valor de mercado é só uma referência: o clube dono pode pedir mais.
      .filter((p) => !onlyAffordable || p.value <= budget)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, MAX_ROWS);
  }, [career, source, group, season.year, onlyAffordable, budget]);

  const recent = useMemo(
    () => career.transfers.filter((t) => t.year === season.year && t.type !== 'loanReturn').slice(-40).reverse(),
    [career.transfers, season.year],
  );

  return (
    <View className="flex-1">
      <Header title="Mercado" subtitle={windowLabel(season)} />
      <View className="gap-3 px-4 pb-2">
        <View className="flex-row justify-between">
          <View>
            <Muted>Orçamento</Muted>
            <Strong>{formatMoney(spendableFee(user))}</Strong>
          </View>
          <View className="items-end">
            <Muted>Folga na folha</Muted>
            <Strong>{formatWage(wageRoom(user, players))}</Strong>
          </View>
        </View>
        <Segmented
          options={['buscar', 'propostas', 'movimentos'] as const}
          value={view}
          onChange={setView}
          labelOf={(v) => (v === 'buscar' ? 'Buscar' : v === 'propostas' ? `Propostas${inbox.length ? ` (${inbox.length})` : ''}` : 'Movimentos')}
        />
      </View>

      {view === 'buscar' ? (
        <>
          <View className="gap-2 px-4 pb-2">
            <Segmented options={SOURCES} value={source} onChange={setSource} />
            <Segmented options={GROUPS} value={group} onChange={setGroup} />
            <Segmented
              options={['todos', 'orcamento'] as const}
              value={onlyAffordable ? 'orcamento' : 'todos'}
              onChange={(v) => setOnlyAffordable(v === 'orcamento')}
              labelOf={(v) => (v === 'todos' ? 'Todos os preços' : 'Valor até o orçamento')}
            />
            {source === 'Fim de contrato' && !preContractsOpen(season) ? (
              <Muted>Pré-contratos abrem na janela de inverno; antes disso, só comprando.</Muted>
            ) : null}
          </View>
          <FlatList
            data={list}
            keyExtractor={(p) => p.id}
            contentContainerClassName="px-4 pb-6"
            ListEmptyComponent={<Muted className="py-6 text-center">Ninguém encontrado com esse filtro.</Muted>}
            renderItem={({ item }) => <PlayerRow p={item} clubName={item.clubId ? clubs[item.clubId]?.shortName : undefined} onPress={() => setNegotiating(item.id)} />}
          />
        </>
      ) : null}

      {view === 'propostas' ? (
        <FlatList
          data={inbox}
          keyExtractor={(o) => o.id}
          contentContainerClassName="gap-2 px-4 pb-6"
          ListEmptyComponent={
            <Muted className="py-6 text-center">
              {win ? 'Nenhuma proposta pelos seus jogadores por enquanto.' : 'Propostas só chegam com a janela aberta.'}
            </Muted>
          }
          renderItem={({ item: o }) => {
            const p = players[o.playerId];
            return (
              <Card>
                <Strong>
                  {clubs[o.fromClubId]?.name} quer {p?.name}
                </Strong>
                <Muted>
                  Oferta {formatMoney(o.fee)} · valor {formatMoney(p?.value ?? 0)} · vale até a rodada {o.expiresRound}
                </Muted>
                <View className="mt-2 flex-row gap-2">
                  <Button className="flex-1" variant="secondary" label="Recusar" onPress={() => market((c) => answerOffer(c, o.id, false))} />
                  <Button className="flex-1" label="Vender" onPress={() => market((c) => answerOffer(c, o.id, true))} />
                </View>
              </Card>
            );
          }}
        />
      ) : null}

      {view === 'movimentos' ? (
        <FlatList
          data={recent}
          keyExtractor={(t, i) => `${t.playerId}-${i}`}
          contentContainerClassName="px-4 pb-6"
          ListHeaderComponent={<SectionTitle>Temporada {season.year}</SectionTitle>}
          ListEmptyComponent={<Muted className="py-6 text-center">Nenhuma movimentação ainda nesta temporada.</Muted>}
          renderItem={({ item }) => <TransferRow t={item} clubs={clubs} userClubId={userClubId} />}
        />
      ) : null}

      {negotiating ? <NegotiationSheet playerId={negotiating} mode="comprar" onClose={() => setNegotiating(null)} /> : null}
    </View>
  );
}

function PlayerRow({ p, clubName, onPress }: { p: Player; clubName?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-2 border-b border-slate-200 py-2.5 active:bg-slate-100 dark:border-slate-800 dark:active:bg-slate-800"
    >
      <Text className="w-10 text-xs font-bold text-slate-600 dark:text-slate-300">{POS_LABEL[p.positions[0]!]}</Text>
      <View className="flex-1">
        <Text className="text-slate-900 dark:text-slate-100" numberOfLines={1}>
          {p.name}
        </Text>
        <Muted className="text-xs">
          {p.age} anos · {clubName ?? 'livre'} · {formatMoney(p.value)}
          {p.loan ? ' · emprestado' : ''}
        </Muted>
      </View>
      <Text className="w-9 text-right text-base font-bold text-slate-900 dark:text-white">{p.ovr}</Text>
    </Pressable>
  );
}

const TYPE_LABEL: Record<TransferRecord['type'], string> = {
  transfer: 'Transferência', loan: 'Empréstimo', free: 'Sem custo', release: 'Dispensa', loanReturn: 'Volta de empréstimo',
};

function TransferRow({ t, clubs, userClubId }: { t: TransferRecord; clubs: Record<string, { shortName: string }>; userClubId: string }) {
  const mine = t.fromClubId === userClubId || t.toClubId === userClubId;
  return (
    <View className={`border-b border-slate-200 py-2 dark:border-slate-800 ${mine ? 'bg-green-50 dark:bg-green-950' : ''}`}>
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 text-sm text-slate-900 dark:text-slate-100" numberOfLines={1}>
          {t.playerName}
        </Text>
        <Badge tone={t.type === 'transfer' ? 'good' : 'neutral'} label={TYPE_LABEL[t.type]} />
      </View>
      <Muted className="text-xs">
        {t.fromClubId ? clubs[t.fromClubId]?.shortName : 'livre'} → {t.toClubId ? clubs[t.toClubId]?.shortName : 'livre'}
        {t.type === 'transfer' ? ` · ${formatMoney(t.fee)}` : ''}
        {t.type === 'release' ? ` · multa ${formatMoney(t.fee)}` : ''}
        {t.round > 0 ? ` · antes da rodada ${t.round}` : ' · na virada'}
      </Muted>
    </View>
  );
}
