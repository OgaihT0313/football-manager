// Mercado: busca de jogadores (clubes, exterior, livres, fim de contrato), propostas recebidas e
// movimentações. Celular: controle segmentado, busca, filtros em chips e cartões. PC: filtros |
// resultados em tabela | verba, folha e propostas recebidas.

import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { formatMoney, formatWage, POS_GROUP, POS_GROUPS, POS_LABEL, type PosGroup } from '../components/labels';
import { NegotiationSheet } from '../components/NegotiationSheet';
import { useTokens, useWide } from '../components/theme';
import { Badge, Button, Card, Chips, Label, Meter, Muted, Num, OvrBadge, PlayerPhoto, Segmented, Strong, Tabs, Title } from '../components/ui';
import { answerOffer, marketPool } from '../src/career/userMarket';
import { spendableFee, wageRoom, weeklyWageBill } from '../src/club/finance';
import type { Club, IncomingOffer, Player, TransferRecord } from '../src/domain/types';
import { potentialRange, staffLevel } from '../src/manager/staff';
import { openWindow, preContractsOpen, windowLabel } from '../src/market/calendar';
import { selectCareer, useGame } from '../store/gameStore';

type View_ = 'buscar' | 'propostas' | 'movimentos';
type Source = 'Clubes' | 'Exterior' | 'Livres' | 'Fim de contrato';
type Age = 'Todas' | 'Até 21' | '22–29' | '30+';
type Ovr = 'Todos' | '70+' | '75+' | '80+';

const SOURCES: readonly Source[] = ['Clubes', 'Exterior', 'Livres', 'Fim de contrato'];
const AGES: readonly Age[] = ['Todas', 'Até 21', '22–29', '30+'];
const OVRS: readonly Ovr[] = ['Todos', '70+', '75+', '80+'];
const MAX_ROWS = 80;

const ageOk = (a: Age, age: number) => a === 'Todas' || (a === 'Até 21' ? age <= 21 : a === '22–29' ? age >= 22 && age <= 29 : age >= 30);
const ovrOk = (o: Ovr, ovr: number) => o === 'Todos' || ovr >= Number(o.slice(0, 2));

export function MarketScreen() {
  const wide = useWide();
  const t = useTokens();
  const career = useGame(selectCareer)!;
  const market = useGame((s) => s.market);
  const [view, setView] = useState<View_>('buscar');
  const [group, setGroup] = useState<PosGroup>('Todos');
  const [source, setSource] = useState<Source>('Clubes');
  const [age, setAge] = useState<Age>('Todas');
  const [minOvr, setMinOvr] = useState<Ovr>('Todos');
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [query, setQuery] = useState('');
  const [negotiating, setNegotiating] = useState<string | null>(null);

  const { season, clubs, userClubId, players, inbox } = career;
  const user = clubs[userClubId]!;
  const win = openWindow(season);
  const budget = spendableFee(user);
  const scout = staffLevel(user, 'olheiro');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return marketPool(career)
      .filter((p) => {
        if (source === 'Livres') return p.clubId === null;
        // Exterior: vitrine das ligas de fundo (Portugal, Holanda, Brasil...).
        const abroad = p.clubId !== null && !clubs[p.clubId]?.squad.length;
        if (source === 'Exterior') return abroad;
        if (abroad) return false;
        if (source === 'Fim de contrato') return p.clubId !== null && !p.loan && p.contract.expires === season.year;
        return p.clubId !== null;
      })
      .filter((p) => group === 'Todos' || POS_GROUP[p.positions[0]!] === group)
      .filter((p) => ageOk(age, p.age) && ovrOk(minOvr, p.ovr))
      // O valor de mercado é só uma referência: o clube dono pode pedir mais.
      .filter((p) => !onlyAffordable || p.value <= budget)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.clubId ? clubs[p.clubId]?.name.toLowerCase().includes(q) : 'livre'.includes(q)))
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, MAX_ROWS);
  }, [career, clubs, source, group, age, minOvr, season.year, onlyAffordable, budget, query]);

  const recent = useMemo(
    () => career.transfers.filter((x) => x.year === season.year && x.type !== 'loanReturn').slice(-40).reverse(),
    [career.transfers, season.year],
  );

  const clubLabel = (p: Player) => {
    if (!p.clubId) return 'Livre';
    const cl = clubs[p.clubId];
    if (!cl) return '?';
    return cl.squad.length ? cl.name : `${cl.name} · ${career.leagues[cl.leagueId]?.country ?? ''}`;
  };
  const potLabel = (p: Player) => {
    const [lo, hi] = potentialRange(p, scout);
    return lo === hi ? `${lo}` : `${lo}–${hi}`;
  };

  const search = (
    <View className="h-[42px] flex-row items-center gap-2 rounded-[10px] border border-line bg-s1 px-3">
      <Text className="font-sans text-[13px] text-mute">⌕</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Nome ou clube"
        placeholderTextColor={t.mute}
        className="flex-1 font-sans text-[13px] text-ink"
        style={{ outlineStyle: 'none' } as object}
        accessibilityLabel="Buscar jogador"
      />
      {query ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => setQuery('')} hitSlop={8}>
          <Text className="font-sans text-mute">✕</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const offers = (
    <View className="gap-2">
      {inbox.length === 0 ? (
        <Muted className="py-4">{win ? 'Nenhuma proposta pelos seus jogadores por enquanto.' : 'Propostas só chegam com a janela aberta.'}</Muted>
      ) : null}
      {inbox.map((o) => (
        <OfferRow key={o.id} o={o} p={players[o.playerId]} from={clubs[o.fromClubId]} onAnswer={(accept) => market((c) => answerOffer(c, o.id, accept))} />
      ))}
    </View>
  );

  const moves = (
    <View>
      {recent.length === 0 ? <Muted className="py-4">Nenhuma movimentação ainda nesta temporada.</Muted> : null}
      {recent.map((x, i) => (
        <TransferRow key={`${x.playerId}-${i}`} t={x} clubs={clubs} userClubId={userClubId} />
      ))}
    </View>
  );

  const hint =
    source === 'Exterior' ? 'Clubes das ligas de fundo mostram 3 jogadores por temporada (4 no Brasil e na Argentina). Quem não for vendido fica por lá.'
    : source === 'Fim de contrato' && !preContractsOpen(season) ? 'Pré-contratos abrem na janela de inverno; antes disso, só comprando.'
    : null;

  if (wide) {
    const bill = weeklyWageBill(user, players);
    return (
      <View className="flex-1 flex-row gap-8 px-12 py-9">
        <ScrollView className="w-[220px] grow-0" contentContainerClassName="gap-[22px]">
          <Title size={40}>Mercado</Title>
          {search}
          <FilterBlock label="Origem">
            <Wrap options={SOURCES} value={source} onChange={setSource} />
          </FilterBlock>
          <FilterBlock label="Posição">
            <Wrap options={POS_GROUPS} value={group} onChange={setGroup} />
          </FilterBlock>
          <FilterBlock label="Idade">
            <Wrap options={AGES} value={age} onChange={setAge} />
          </FilterBlock>
          <FilterBlock label="OVR mínimo">
            <Wrap options={OVRS} value={minOvr} onChange={setMinOvr} />
          </FilterBlock>
          <FilterBlock label="Valor">
            <Wrap options={['Todos', 'Até a verba'] as const} value={onlyAffordable ? 'Até a verba' : 'Todos'} onChange={(v) => setOnlyAffordable(v !== 'Todos')} />
          </FilterBlock>
          {hint ? <Muted className="text-xs">{hint}</Muted> : null}
        </ScrollView>
        <View className="flex-1 gap-3.5">
          <Tabs
            options={['buscar', 'propostas', 'movimentos'] as const}
            value={view}
            onChange={setView}
            size={14}
            labelOf={(v) => (v === 'buscar' ? `Resultados · ${list.length}` : v === 'propostas' ? `Propostas · ${inbox.length}` : 'Movimentos')}
          />
          {view === 'buscar' ? (
            <>
              <View className="flex-row gap-2.5 px-3.5 py-1">
                {(['OVR', 'JOGADOR', 'IDADE', 'CLUBE', 'POT', 'VALOR', 'SALÁRIO', ''] as const).map((h, i) => (
                  <Text key={i} className={`font-monom text-[10.5px] tracking-[0.8px] text-mute ${MCOL[i]}`}>
                    {h}
                  </Text>
                ))}
              </View>
              <FlatList
                data={list}
                keyExtractor={(p) => p.id}
                contentContainerClassName="gap-2"
                ListEmptyComponent={<Muted className="py-6 text-center">Ninguém encontrado com esse filtro.</Muted>}
                renderItem={({ item: p }) => (
                  <View className="h-[58px] flex-row items-center gap-2.5 rounded-xl border border-line bg-s1 px-3.5">
                    <View className={MCOL[0]}>
                      <OvrBadge ovr={p.ovr} w={40} h={30} size={18} />
                    </View>
                    <View className={`flex-row items-center gap-2.5 ${MCOL[1]}`}>
                      <PlayerPhoto id={p.id} name={p.name} size={34} />
                      <View className="min-w-0 flex-1">
                        <Text className="font-sansb text-[14.5px] text-ink" numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text className="font-monom text-[11px] text-mute" numberOfLines={1}>
                          {p.positions.map((x) => POS_LABEL[x]).join('/')}
                        </Text>
                      </View>
                    </View>
                    <Text className={`font-mono text-[13px] text-ink ${MCOL[2]}`}>{p.age}</Text>
                    <Text className={`font-sans text-[13.5px] text-mute ${MCOL[3]}`} numberOfLines={1}>
                      {clubLabel(p)}
                    </Text>
                    <Text className={`font-monob text-[13px] text-pos ${MCOL[4]}`}>{potLabel(p)}</Text>
                    <Text className={`font-monob text-[13px] text-ink ${MCOL[5]}`}>{formatMoney(p.value)}</Text>
                    <Text className={`font-mono text-xs text-mute ${MCOL[6]}`} numberOfLines={1}>
                      {formatWage(p.contract.wage)}
                    </Text>
                    <View className={MCOL[7]}>
                      <Button size="sm" variant="outline" label="Proposta" onPress={() => setNegotiating(p.id)} />
                    </View>
                  </View>
                )}
              />
            </>
          ) : (
            <ScrollView>{view === 'propostas' ? offers : moves}</ScrollView>
          )}
        </View>
        <ScrollView className="w-[300px] grow-0" contentContainerClassName="gap-4">
          <Card className="gap-3.5 rounded-2xl p-[22px]">
            <View className="gap-0.5">
              <Label>Verba de transferências</Label>
              <Num size={44} black>
                {formatMoney(budget)}
              </Num>
            </View>
            <View className="gap-1.5">
              <View className="flex-row justify-between">
                <Muted>Folha salarial</Muted>
                <Text className="font-monob text-[12.5px] text-ink">
                  {formatMoney(bill)} / {formatMoney(user.wageBudget)}
                </Text>
              </View>
              <Meter pct={(bill / Math.max(1, user.wageBudget)) * 100} tone={bill > user.wageBudget ? 'neg' : 'acc'} height={5} />
              <Muted className="text-xs">Folga {formatWage(wageRoom(user, players))}</Muted>
            </View>
            <Text className="font-monom text-[11px] uppercase text-mute">{windowLabel(season)}</Text>
          </Card>
          <Card className="gap-3 rounded-2xl p-[22px]">
            <Label>Propostas recebidas</Label>
            {offers}
          </Card>
        </ScrollView>
        {negotiating ? <NegotiationSheet playerId={negotiating} mode="comprar" onClose={() => setNegotiating(null)} /> : null}
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="gap-3 px-[18px] pb-3 pt-2">
        <View className="flex-row items-baseline justify-between">
          <Title>Mercado</Title>
          <Text className="font-monom text-[11px] text-mute">
            VERBA <Text className="text-ink">{formatMoney(budget)}</Text>
          </Text>
        </View>
        <Segmented
          options={['buscar', 'propostas', 'movimentos'] as const}
          value={view}
          onChange={setView}
          labelOf={(v) => (v === 'buscar' ? 'Buscar' : v === 'propostas' ? `Propostas${inbox.length ? ` · ${inbox.length}` : ''}` : 'Movimentos')}
        />
        {view === 'buscar' ? (
          <>
            {search}
            <Chips options={SOURCES} value={source} onChange={setSource} />
            <Chips options={POS_GROUPS} value={group} onChange={setGroup} />
            <Chips options={['Todos os preços', 'Até a verba'] as const} value={onlyAffordable ? 'Até a verba' : 'Todos os preços'} onChange={(v) => setOnlyAffordable(v === 'Até a verba')} />
            {hint ? <Muted className="text-xs">{hint}</Muted> : null}
            <Text className="font-monom text-[10.5px] uppercase text-mute">{windowLabel(season)}</Text>
          </>
        ) : null}
      </View>
      {view === 'buscar' ? (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          contentContainerClassName="gap-2 px-3.5 pb-6"
          ListEmptyComponent={<Muted className="py-6 text-center">Ninguém encontrado com esse filtro.</Muted>}
          renderItem={({ item: p }) => (
            <Card className="gap-2.5 p-3">
              <View className="flex-row items-center gap-2.5">
                <PlayerPhoto id={p.id} name={p.name} size={38} />
                <View className="min-w-0 flex-1 gap-px">
                  <Text className="font-sansb text-sm text-ink" numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text className="font-mono text-[11px] uppercase text-mute" numberOfLines={1}>
                    {POS_LABEL[p.positions[0]!]} · {p.age} anos · {clubLabel(p)}
                    {p.loan ? ' · emprestado' : ''}
                  </Text>
                </View>
                <View className="items-end gap-1">
                  <OvrBadge ovr={p.ovr} w={36} h={28} size={17} />
                  <Text className="font-mono text-[10.5px] text-pos">POT {potLabel(p)}</Text>
                </View>
              </View>
              <View className="flex-row items-center gap-3">
                <View>
                  <Text className="font-monom text-[10px] text-mute">VALOR</Text>
                  <Text className="font-monob text-[13px] text-ink">{formatMoney(p.value)}</Text>
                </View>
                <View>
                  <Text className="font-monom text-[10px] text-mute">SALÁRIO</Text>
                  <Text className="font-monob text-[13px] text-ink">{formatWage(p.contract.wage)}</Text>
                </View>
                <Button className="ml-auto" size="sm" variant="outline" label="Proposta" onPress={() => setNegotiating(p.id)} />
              </View>
            </Card>
          )}
        />
      ) : (
        <ScrollView contentContainerClassName="px-3.5 pb-6">{view === 'propostas' ? offers : moves}</ScrollView>
      )}
      {negotiating ? <NegotiationSheet playerId={negotiating} mode="comprar" onClose={() => setNegotiating(null)} /> : null}
    </View>
  );
}

const MCOL = ['w-[46px]', 'flex-[1.5] min-w-0', 'w-[44px]', 'flex-1 min-w-0', 'w-[54px]', 'w-[80px] text-right', 'w-[108px] text-right', 'w-[92px]'] as const;

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Label>{label}</Label>
      {children}
    </View>
  );
}

/** Chips que quebram linha (coluna de filtros do PC). */
function Wrap<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o)}
            className={`min-h-[32px] justify-center rounded-full border px-3 ${active ? 'border-ink bg-ink' : 'border-line active:bg-s2'}`}
          >
            <Text className={`font-sanss text-[12.5px] ${active ? 'text-bg' : 'text-mute'}`}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function OfferRow({ o, p, from, onAnswer }: { o: IncomingOffer; p?: Player; from?: Club; onAnswer: (accept: boolean) => void }) {
  return (
    <View className="gap-2.5 border-t border-line pt-3">
      <View className="flex-row justify-between">
        <Strong className="text-[14.5px]">{p?.name ?? '?'}</Strong>
        <Text className="font-monob text-[13px] text-ink">{formatMoney(o.fee)}</Text>
      </View>
      <Muted className="text-[12.5px]">
        {from?.name} · valor {formatMoney(p?.value ?? 0)} · vale até a rodada {o.expiresRound}
      </Muted>
      <View className="flex-row gap-1.5">
        <Button className="flex-1" size="sm" label="Vender" onPress={() => onAnswer(true)} />
        <Button className="flex-1" size="sm" variant="secondary" label="Recusar" onPress={() => onAnswer(false)} />
      </View>
    </View>
  );
}

const TYPE_LABEL: Record<TransferRecord['type'], string> = {
  transfer: 'Transferência', loan: 'Empréstimo', free: 'Sem custo', release: 'Dispensa', loanReturn: 'Volta de empréstimo',
};

function TransferRow({ t, clubs, userClubId }: { t: TransferRecord; clubs: Record<string, { shortName: string }>; userClubId: string }) {
  const mine = t.fromClubId === userClubId || t.toClubId === userClubId;
  return (
    <View className={`border-b border-line px-1 py-2.5 ${mine ? 'bg-s2' : ''}`}>
      <View className="flex-row items-center justify-between gap-2">
        <Text className={`flex-1 text-sm text-ink ${mine ? 'font-sansb' : 'font-sans'}`} numberOfLines={1}>
          {t.playerName}
        </Text>
        <Badge tone={t.type === 'transfer' ? 'acc' : 'neutral'} label={TYPE_LABEL[t.type]} />
      </View>
      <Text className="font-mono text-[11px] text-mute">
        {t.fromClubId ? clubs[t.fromClubId]?.shortName : 'livre'} → {t.toClubId ? clubs[t.toClubId]?.shortName : 'livre'}
        {t.type === 'transfer' ? ` · ${formatMoney(t.fee)}` : ''}
        {t.type === 'release' ? ` · multa ${formatMoney(t.fee)}` : ''}
        {t.round > 0 ? ` · antes da rodada ${t.round}` : ' · na virada'}
      </Text>
    </View>
  );
}
