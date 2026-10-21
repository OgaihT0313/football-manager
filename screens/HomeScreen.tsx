// Início: próximo jogo (jogar, simular), forma, diretoria, caixa de entrada (decisões, propostas,
// desfalques, contratos, notícias), resultados e próximos jogos.
// Celular: uma coluna. PC: jogo e caixa de entrada à esquerda; tabela, forma e diretoria à direita.

import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatMoney, slotDate } from '../components/labels';
import { BoardMini, DecisionsCard, JobOffersCard, UnemployedView } from '../components/ManagerCards';
import { useWide } from '../components/theme';
import { Button, Card, Crest, Dot, Form, Label, Muted, Num } from '../components/ui';
import { nextFixtureOf, outcomeFor, positionOf, resultsOf, upcomingOf, userLeague } from '../src/career/queries';
import { isWorldSeasonOver, type CompetitionState } from '../src/competitions/world';
import type { Club, Fixture } from '../src/domain/types';
import { openWindow } from '../src/market/calendar';
import type { CareerState } from '../src/career/career';
import { selectCareer, useGame, type Tab } from '../store/gameStore';

/** "PREMIER LEAGUE · RODADA 12" ou "FA CUP · QUARTAS DE FINAL". */
function stageLabel(comp: CompetitionState, fx: Fixture): string {
  if (comp.kind === 'league') return `${comp.name} · rodada ${fx.round}`;
  if (comp.kind === 'europe') {
    if (comp.stages[0]?.fixtureIds.includes(fx.id)) return `${comp.name} · fase de liga ${fx.round}`;
    const stage = comp.stages[fx.round - 1]?.name ?? '';
    return `${comp.name} · ${stage}${fx.leg ? (fx.leg === 1 ? ' (ida)' : ' (volta)') : ''}`;
  }
  const stage = comp.stages[fx.round - 1]?.name ?? '';
  return `${comp.name}${stage ? ` · ${stage}` : ''}`;
}

interface InboxItem {
  key: string;
  dot: 'acc' | 'pos' | 'neg' | 'mute';
  title: string;
  sub: string;
  cta?: { label: string; tab: Tab };
}

/** Caixa de entrada montada do estado da carreira (nada novo no save). */
function inboxOf(c: CareerState): InboxItem[] {
  const { season, clubs, userClubId, players } = c;
  const club = clubs[userClubId]!;
  const out: InboxItem[] = [];
  for (const o of c.inbox) {
    const p = players[o.playerId];
    out.push({ key: o.id, dot: 'acc', title: `Proposta por ${p?.name ?? '?'}`, sub: `${clubs[o.fromClubId]?.name} oferece ${formatMoney(o.fee)}`, cta: { label: 'Responder', tab: 'mercado' } });
  }
  for (const id of club.squad) {
    const st = season.status[id];
    if (!st || st.out <= 0) continue;
    const p = players[id];
    out.push({
      key: `out-${id}`,
      dot: 'neg',
      title: `${p?.name ?? '?'} fora por ${st.out} jogo${st.out > 1 ? 's' : ''}`,
      sub: st.reason === 'injury' ? 'Lesão' : 'Suspensão',
      cta: { label: 'Escalação', tab: 'escalacao' },
    });
  }
  const expiring = club.squad.map((id) => players[id]!).filter((p) => p && !p.loan && p.contract.expires === season.year);
  if (expiring.length) {
    out.push({
      key: 'contratos',
      dot: 'acc',
      title: `${expiring.length} contrato${expiring.length > 1 ? 's terminam' : ' termina'} na temporada`,
      sub: expiring.slice(0, 3).map((p) => p.name).join(', ') + (expiring.length > 3 ? '…' : ''),
      cta: { label: 'Renovar', tab: 'elenco' },
    });
  }
  if (openWindow(season)) out.push({ key: 'janela', dot: 'mute', title: 'Janela de transferências aberta', sub: 'Compre, venda e empreste até o fim da janela.', cta: { label: 'Mercado', tab: 'mercado' } });
  for (const n of c.news.slice(-4).reverse()) {
    out.push({
      key: `n-${n.year}-${n.slot}-${n.text.slice(0, 12)}`,
      dot: n.kind === 'titulo' || n.kind === 'premio' ? 'pos' : n.kind === 'diretoria' || n.kind === 'emprego' ? 'acc' : 'mute',
      title: n.text,
      sub: `${n.year} · ${n.kind === 'diretoria' ? 'Diretoria' : n.kind === 'emprego' ? 'Empregos' : n.kind === 'titulo' ? 'Título' : n.kind === 'premio' ? 'Prêmio' : n.kind === 'olheiro' ? 'Olheiro' : n.kind === 'staff' ? 'Staff' : 'Decisão'}`,
    });
  }
  return out;
}

function Side({ club, line, size, align, wide }: { club: Club; line: string; size: number; align: 'start' | 'end' | 'center'; wide: boolean }) {
  if (!wide) {
    return (
      <View className="flex-1 items-center gap-2">
        <Crest id={club.id} short={club.shortName} size={size} />
        <Text className="text-center font-sansb text-[13.5px] text-ink" numberOfLines={2}>
          {club.name}
        </Text>
        <Text className="font-mono text-[10.5px] text-mute">{line}</Text>
      </View>
    );
  }
  const text = (
    <View className={`shrink gap-1 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      <Text className="font-disp uppercase text-ink" style={{ fontSize: 40, lineHeight: 42 }} numberOfLines={1}>
        {club.name}
      </Text>
      <Text className="font-mono text-xs text-mute">{line}</Text>
    </View>
  );
  return (
    <View className={`flex-1 flex-row items-center gap-5 ${align === 'end' ? 'justify-end' : ''}`}>
      {align === 'end' ? text : null}
      <Crest id={club.id} short={club.shortName} size={size} />
      {align === 'end' ? null : text}
    </View>
  );
}

export function HomeScreen() {
  const wide = useWide();
  const career = useGame(selectCareer)!;
  const busy = useGame((s) => s.busy);
  const saveError = useGame((s) => s.saveError);
  const playNextRound = useGame((s) => s.playNextRound);
  const quickSim = useGame((s) => s.quickSim);
  const simulateToEnd = useGame((s) => s.simulateToEnd);
  const nextSeason = useGame((s) => s.nextSeason);
  const openMatch = useGame((s) => s.openMatch);
  const backToMenu = useGame((s) => s.backToMenu);
  const setTab = useGame((s) => s.setTab);

  const { season, clubs, userClubId } = career;
  const club = clubs[userClubId]!;
  const over = isWorldSeasonOver(season);
  const league = userLeague(career);
  const next = nextFixtureOf(season, userClubId);
  const upcoming = useMemo(() => upcomingOf(season, userClubId, 6).slice(1), [season, userClubId]);
  const allResults = useMemo(() => resultsOf(season, userClubId), [season, userClubId]);
  const recent = allResults.slice(-5).reverse();
  const formOf = (id: string) =>
    resultsOf(season, id)
      .slice(-5)
      .map(({ result }) => outcomeFor(result, id));
  const form = allResults.slice(-5).map(({ result }) => outcomeFor(result, userClubId));
  const started = (league?.results.length ?? 0) > 0;
  const pos = positionOf(season, userClubId);
  const row = league?.table[pos - 1];
  const inbox = useMemo(() => inboxOf(career), [career]);
  const last = career.history.find((h) => h.year === season.year);

  if (!career.manager.employed) return <UnemployedView career={career} />;

  const opponentId = next ? (next.fx.homeId === userClubId ? next.fx.awayId : next.fx.homeId) : null;
  const opponent = opponentId ? clubs[opponentId] : null;
  const home = next ? next.fx.homeId === userClubId : true;
  const lineOf = (id: string) => {
    if (!started || next?.comp.kind !== 'league') return career.leagues[clubs[id]!.leagueId]?.name ?? '';
    const p = positionOf(season, id);
    const pts = league?.table[p - 1]?.points ?? 0;
    return wide ? `${p}º · ${pts} PTS · ${formOf(id).join(' ')}` : `${p}º · ${pts} pts`;
  };

  const date = slotDate(season.year, season.slots[season.nextSlot]);
  const balance = club.finance.balance;

  const matchCard = over ? (
    <Card className={`gap-3 ${wide ? 'rounded-[20px] p-7' : 'rounded-[18px]'}`}>
      <Label>Temporada {season.year} encerrada</Label>
      <Num size={wide ? 40 : 28} className="uppercase">
        Campeão: {clubs[league?.table[0]?.clubId ?? '']?.name}
      </Num>
      <Muted>
        {club.name} terminou em {last?.userPosition ?? pos}º com {last?.userPoints ?? row?.points} pontos.
      </Muted>
      {Object.values(season.competitions)
        .filter((comp) => comp.kind !== 'league' && comp.clubIds.includes(userClubId))
        .map((comp) => (
          <Muted key={comp.id}>
            {comp.name}: campeão {clubs[comp.championId ?? '']?.name ?? '—'}
          </Muted>
        ))}
      <Button className="mt-2" size={wide ? 'lg' : 'md'} label={`Começar ${season.year + 1}`} loading={busy} onPress={nextSeason} />
    </Card>
  ) : next && opponent ? (
    <View className={`overflow-hidden border border-line bg-s1 ${wide ? 'rounded-[20px]' : 'rounded-[18px]'}`}>
      <View className={`flex-row justify-between border-b border-line ${wide ? 'px-7 py-4' : 'px-3.5 py-2.5'}`}>
        <Text className="shrink font-monom uppercase tracking-[0.8px] text-mute" style={{ fontSize: wide ? 12 : 10.5 }} numberOfLines={1}>
          {wide ? 'Próximo jogo · ' : ''}
          {stageLabel(next.comp, next.fx)}
        </Text>
        <Text className="ml-2 font-monom uppercase tracking-[0.8px] text-mute" style={{ fontSize: wide ? 12 : 10.5 }}>
          {next.fx.neutral ? 'Campo neutro' : home ? 'Casa' : 'Fora'}
          {wide ? ` · ${date}` : ''}
        </Text>
      </View>
      <View className={`flex-row items-center ${wide ? 'gap-6 px-7 py-10' : 'gap-2 px-3.5 py-[18px]'}`}>
        <Side club={home ? club : opponent} line={lineOf(home ? club.id : opponent.id)} size={wide ? 80 : 52} align="end" wide={wide} />
        <Text className="font-disp9 text-mute" style={{ fontSize: wide ? 40 : 30 }}>
          VS
        </Text>
        <Side club={home ? opponent : club} line={lineOf(home ? opponent.id : club.id)} size={wide ? 80 : 52} align="start" wide={wide} />
      </View>
      <View className={`flex-row gap-2 ${wide ? 'justify-center gap-3 px-7 pb-7' : 'px-3.5 pb-3.5'}`}>
        <Button className={wide ? 'w-[240px]' : 'flex-[1.4]'} size={wide ? 'lg' : 'md'} label={wide ? 'Jogar partida' : 'Jogar'} loading={busy} onPress={playNextRound} />
        <Button className={wide ? 'w-[160px]' : 'flex-1'} size={wide ? 'lg' : 'md'} variant="secondary" label="Simular" disabled={busy} onPress={quickSim} />
        {wide ? <Button className="w-[160px]" size="lg" variant="secondary" label="Ver escalação" onPress={() => setTab('escalacao')} /> : null}
      </View>
    </View>
  ) : null;

  const formCard = (
    <Card className={`flex-1 gap-2 ${wide ? 'rounded-2xl p-[18px]' : 'p-3'}`}>
      <Label>Forma</Label>
      {form.length ? <Form list={form} size={wide ? 26 : 24} /> : <Muted className="text-xs">Sem jogos ainda.</Muted>}
    </Card>
  );

  const inboxList = (
    <View>
      <Label className={`px-0.5 ${wide ? 'pb-2.5' : 'pb-1.5 pt-1'}`}>Caixa de entrada · {inbox.length}</Label>
      {inbox.length === 0 ? <Muted className="border-t border-line py-3">Nada novo.</Muted> : null}
      {inbox.map((m) => (
        <Pressable
          key={m.key}
          accessibilityRole={m.cta ? 'button' : undefined}
          disabled={!m.cta}
          onPress={() => m.cta && setTab(m.cta.tab)}
          className={`flex-row gap-3 border-t border-line active:bg-s2 ${wide ? 'items-center gap-4 px-1 py-4' : 'px-1 py-[11px]'}`}
        >
          <View className={wide ? '' : 'mt-[7px]'}>
            <Dot tone={m.dot} size={wide ? 8 : 6} />
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="font-sanss text-ink" style={{ fontSize: wide ? 15 : 13.5 }}>
              {m.title}
            </Text>
            <Text className="font-sans text-mute" style={{ fontSize: wide ? 13 : 12 }} numberOfLines={2}>
              {m.sub}
            </Text>
          </View>
          {wide && m.cta ? <Text className="font-sanss text-[13px] text-acct">{m.cta.label}</Text> : null}
        </Pressable>
      ))}
    </View>
  );

  const resultsList = recent.length ? (
    <View>
      <Label className="px-0.5 pb-1.5 pt-1">Últimos resultados</Label>
      {recent.map(({ result: r, comp }) => {
        const h = r.homeId === userClubId;
        const opp = clubs[h ? r.awayId : r.homeId];
        const o = outcomeFor(r, userClubId);
        return (
          <Pressable key={r.fixtureId} accessibilityRole="button" onPress={() => openMatch(r.fixtureId)} className="flex-row items-center gap-3 border-t border-line px-1 py-2.5 active:bg-s2">
            <Form list={[o]} size={22} />
            <View className="flex-1">
              <Text className="font-sanss text-[13.5px] text-ink" numberOfLines={1}>
                {h ? 'vs' : '@'} {opp?.name}
              </Text>
              <Text className="font-mono text-[10.5px] uppercase text-mute">{comp.name}</Text>
            </View>
            <Text className="font-disp text-lg text-ink">
              {h ? `${r.homeGoals} x ${r.awayGoals}` : `${r.awayGoals} x ${r.homeGoals}`}
              {r.shootoutWinnerId ? ' (P)' : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  ) : null;

  const upcomingList = upcoming.length ? (
    <View>
      <Label className="px-0.5 pb-1.5 pt-1">Depois</Label>
      {upcoming.map(({ fx, comp }) => {
        const oppId = fx.homeId === userClubId ? fx.awayId : fx.homeId;
        return (
          <View key={fx.id} className="flex-row items-center justify-between border-t border-line px-1 py-2">
            <Text className="flex-1 font-sans text-[13px] text-ink" numberOfLines={1}>
              {fx.homeId === userClubId ? 'vs' : '@'} {clubs[oppId]?.name}
            </Text>
            <Text className="ml-2 font-mono text-[10.5px] uppercase text-mute">{comp.kind === 'league' ? `R${fx.round}` : comp.name}</Text>
          </View>
        );
      })}
    </View>
  ) : null;

  if (wide) {
    const top = (league?.table ?? []).slice(0, 6);
    const mineInTop = top.some((r) => r.clubId === userClubId);
    const rows = mineInTop || !row ? top : [...top.slice(0, 5), row];
    return (
      <ScrollView contentContainerClassName="flex-row gap-8 px-12 py-10">
        <View className="flex-1 gap-7">
          {saveError ? (
            <Card className="border-neg">
              <Muted>{saveError}</Muted>
            </Card>
          ) : null}
          {matchCard}
          <DecisionsCard career={career} />
          {inboxList}
          <JobOffersCard career={career} />
          {resultsList}
        </View>
        <View className="w-[400px] gap-5">
          <Card className="gap-1 rounded-2xl p-5">
            <Pressable accessibilityRole="button" onPress={() => setTab('liga')} className="flex-row justify-between pb-2">
              <Label>{league?.name}</Label>
              <Label className="text-acct">Ver tabela →</Label>
            </Pressable>
            {rows.map((r) => {
              const p = league!.table.indexOf(r) + 1;
              const mine = r.clubId === userClubId;
              return (
                <View key={r.clubId} className={`h-[38px] flex-row items-center rounded-lg px-2 ${mine ? 'bg-s2' : ''}`}>
                  <Text className="w-6 font-monob text-xs text-mute">{started ? p : '–'}</Text>
                  <Text className={`flex-1 text-sm text-ink ${mine ? 'font-sansb' : 'font-sans'}`} numberOfLines={1}>
                    {clubs[r.clubId]?.name}
                  </Text>
                  <Text className="w-10 text-right font-disp text-lg text-ink">{r.points}</Text>
                </View>
              );
            })}
          </Card>
          <View className="flex-row gap-4">
            {formCard}
            <BoardMini career={career} wide />
          </View>
          <Card className="gap-1 rounded-2xl p-5">
            <Label>Caixa do clube</Label>
            <Num size={30} className={balance >= 0 ? 'text-pos' : 'text-neg'}>
              {formatMoney(balance)}
            </Num>
          </Card>
          {upcomingList}
          {!over ? <Button variant="ghost" label="Simular até o fim da temporada" disabled={busy} onPress={simulateToEnd} /> : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerClassName="gap-3 pb-8">
      <View className="flex-row items-center gap-2.5 px-[18px] pb-1 pt-2">
        <Crest id={club.id} short={club.shortName} size={34} />
        <View className="flex-1">
          <Text className="font-sansb text-[15px] text-ink" numberOfLines={1}>
            {club.name}
          </Text>
          <Text className="font-mono text-[11px] text-mute">
            {date}
            {started ? ` · ${pos}º` : ''}
          </Text>
        </View>
        <Text className={`font-monom text-[11px] ${balance >= 0 ? 'text-pos' : 'text-neg'}`}>{formatMoney(balance)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Menu" onPress={backToMenu} hitSlop={10} className="ml-1 px-1">
          <Text className="font-sansb text-lg text-mute">≡</Text>
        </Pressable>
      </View>
      <View className="gap-3 px-3.5">
        {saveError ? (
          <Card className="border-neg">
            <Muted>{saveError}</Muted>
          </Card>
        ) : null}
        {matchCard}
        <View className="flex-row gap-2.5">
          {formCard}
          <BoardMini career={career} />
        </View>
        <DecisionsCard career={career} />
        {inboxList}
        <JobOffersCard career={career} />
        {resultsList}
        {upcomingList}
        {!over ? <Button variant="ghost" label="Simular até o fim da temporada" disabled={busy} onPress={simulateToEnd} /> : null}
      </View>
    </ScrollView>
  );
}
