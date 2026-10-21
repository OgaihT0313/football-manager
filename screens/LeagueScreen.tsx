// Liga: qualquer competição do mundo. País (ou Europa) → competição → Tabela / Jogos / Artilharia
// (ligas e fase de liga europeia) ou mata-mata (copas). No PC, a tabela fica ao lado dos jogos da
// rodada e da artilharia.

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useWide } from '../components/theme';
import { Card, Chips, Label, Muted, Tabs, Title } from '../components/ui';
import { stageWinners, tieWinner } from '../src/competitions/europe';
import { leagueCompetitionOf, winnerOf, type CompetitionState } from '../src/competitions/world';
import type { MatchResult } from '../src/domain/types';
import { selectCareer, useGame } from '../store/gameStore';
import { RoundList, RoundsScreen, useRound } from './RoundsScreen';
import { Scorers, TableScreen } from './TableScreen';

type Kind = 'l1' | 'l2' | 'copa' | 'super' | 'ucl' | 'uel' | 'uecl';
const KIND_LABEL: Record<Kind, string> = {
  l1: '1ª div.', l2: '2ª div.', copa: 'Copa', super: 'Supercopa', ucl: 'Champions', uel: 'Europa League', uecl: 'Conference',
};
const EUROPA = 'Europa';
type Sub = 'tabela' | 'jogos' | 'artilharia' | 'mata';

export function LeagueScreen() {
  const wide = useWide();
  const career = useGame(selectCareer)!;
  const leagueView = useGame((s) => s.leagueView);
  const setLeagueView = useGame((s) => s.setLeagueView);
  const setRoundView = useGame((s) => s.setRoundView);
  const { season, leagues } = career;
  const [sub, setSub] = useState<Sub>('tabela');

  const userComp = leagueCompetitionOf(season, career.userClubId);
  const current: CompetitionState | undefined = season.competitions[leagueView ?? ''] ?? userComp ?? undefined;
  const country = current?.country ?? '';
  const hasEurope = Object.values(season.competitions).some((c) => c.kind === 'europe');
  // Países com 1ª divisão completa primeiro, depois as ligas de fundo.
  const countries = useMemo(() => {
    const tops = Object.values(leagues).filter((l) => (l.tier ?? 1) === 1 && season.competitions[l.id]);
    const full = tops.filter((l) => (l.mode ?? 'full') === 'full').map((l) => l.country);
    const bg = tops.filter((l) => l.mode === 'strength').map((l) => l.country);
    return [...(hasEurope ? [EUROPA] : []), ...new Set([...full, ...bg])];
  }, [leagues, hasEurope, season.competitions]);

  const byKind = useMemo(() => {
    const out: Partial<Record<Kind, string>> = {};
    for (const comp of Object.values(season.competitions)) {
      if (comp.country !== country) continue;
      if (comp.kind === 'league') out[(leagues[comp.leagueId!]?.tier ?? 1) === 1 ? 'l1' : 'l2'] = comp.id;
      else if (comp.kind === 'cup') out.copa = comp.id;
      else if (comp.kind === 'supercup') out.super = comp.id;
      else out[comp.id as 'ucl' | 'uel' | 'uecl'] = comp.id;
    }
    return out;
  }, [season.competitions, country, leagues]);
  const kinds = (Object.keys(KIND_LABEL) as Kind[]).filter((k) => byKind[k]);
  const currentKind = kinds.find((k) => byKind[k] === current?.id) ?? kinds[0];

  const selectCountry = (ctry: string) => {
    const comps = Object.values(season.competitions).filter((cp) => cp.country === ctry);
    const first = comps.find((cp) => cp.kind === 'league' && (leagues[cp.leagueId!]?.tier ?? 1) === 1) ?? comps.find((cp) => cp.id === 'ucl') ?? comps[0];
    if (first) setLeagueView(first.id);
    setRoundView(null);
    setSub('tabela');
  };
  const selectKind = (k: Kind) => {
    setLeagueView(byKind[k] ?? null);
    setRoundView(null);
    setSub('tabela');
  };

  if (!current) return <Muted className="p-4">Nenhuma competição.</Muted>;
  const isEurope = current.kind === 'europe';
  const isLeague = current.kind === 'league';
  const leaguePhase: CompetitionState | null = isEurope
    ? { ...current, fixtures: current.fixtures.filter((f) => current.stages[0]!.fixtureIds.includes(f.id)) }
    : null;
  const roundsComp = isEurope ? leaguePhase! : current;
  const subs: Sub[] = isLeague ? ['tabela', 'jogos', 'artilharia'] : isEurope ? ['tabela', 'jogos', 'mata', 'artilharia'] : ['mata', 'artilharia'];
  const activeSub = subs.includes(sub) ? sub : subs[0]!;
  const subLabel = (s: Sub) => (s === 'tabela' ? (isEurope ? 'Fase de liga' : 'Tabela') : s === 'jogos' ? 'Jogos' : s === 'artilharia' ? 'Artilharia' : 'Mata-mata');

  return (
    <View className="flex-1">
      <View className={wide ? 'gap-3 px-12 pt-8' : 'gap-2.5 px-[18px] pt-2'}>
        <View className="flex-row items-baseline gap-5">
          <Title size={wide ? 40 : 30} className="shrink">
            {current.name}
          </Title>
          <RoundMeta comp={current} />
        </View>
        <Chips options={countries} value={country} onChange={selectCountry} />
        {kinds.length > 1 ? <Chips options={kinds} value={currentKind!} onChange={selectKind} labelOf={(k) => KIND_LABEL[k]} /> : null}
        <Tabs options={subs} value={activeSub} onChange={setSub} labelOf={subLabel} size={wide ? 14 : 13} />
      </View>
      <View className={`flex-1 ${wide ? 'flex-row gap-8 px-12 pb-6 pt-4' : ''}`}>
        <View className="flex-1">
          {activeSub === 'tabela' ? (
            <TableScreen comp={current} />
          ) : activeSub === 'jogos' ? (
            <RoundsScreen comp={roundsComp} />
          ) : activeSub === 'artilharia' ? (
            <ScrollView contentContainerClassName={wide ? '' : 'px-3.5 pb-8'}>
              <Scorers comp={current} limit={20} />
            </ScrollView>
          ) : (
            <KnockoutView comp={current} />
          )}
        </View>
        {wide && (activeSub === 'tabela' || activeSub === 'mata') ? (
          <ScrollView className="w-[360px] grow-0" contentContainerClassName="gap-[18px]">
            {isLeague || isEurope ? (
              <Card className="rounded-2xl p-[22px]">
                <RoundTitle comp={roundsComp} />
                <RoundList comp={roundsComp} compact />
              </Card>
            ) : null}
            <Card className="rounded-2xl p-[22px]">
              <Label className="pb-2">Artilharia</Label>
              <Scorers comp={current} limit={6} />
            </Card>
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

function RoundMeta({ comp }: { comp: CompetitionState }) {
  const total = comp.fixtures.reduce((m, f) => Math.max(m, f.round), 0);
  const played = comp.table.reduce((m, r) => Math.max(m, r.played), 0);
  if (comp.kind !== 'league') return null;
  return <Text className="ml-auto font-mono text-[11px] uppercase text-mute">Rodada {played} / {total}</Text>;
}

function RoundTitle({ comp }: { comp: CompetitionState }) {
  const { round } = useRound(comp);
  return <Label className="pb-2">Rodada {round}</Label>;
}

/** Fases de mata-mata (copa, supercopa ou Europa), com ida, volta e agregado. */
function KnockoutView({ comp }: { comp: CompetitionState }) {
  const wide = useWide();
  const career = useGame(selectCareer)!;
  const openMatch = useGame((s) => s.openMatch);
  const { clubs, userClubId } = career;
  const results = new Map(comp.results.map((r) => [r.fixtureId, r]));
  const fixtures = new Map(comp.fixtures.map((f) => [f.id, f]));
  const stages = comp.kind === 'europe' ? comp.stages.slice(1) : comp.stages;
  const stageOffset = comp.kind === 'europe' ? 1 : 0;

  const Row = ({ fid }: { fid: string }) => {
    const fx = fixtures.get(fid)!;
    const r = results.get(fid);
    const mine = fx.homeId === userClubId || fx.awayId === userClubId;
    const win = r && fx.leg === undefined ? winnerOf(r) : null;
    return (
      <Pressable
        accessibilityRole="button"
        disabled={!r}
        onPress={() => r && openMatch(fid)}
        className={`h-10 flex-row items-center rounded-lg px-2 active:bg-s2 ${mine ? 'bg-s2' : ''}`}
      >
        <Text className={`flex-1 text-right text-[13px] text-ink ${win === fx.homeId ? 'font-sansb' : 'font-sans'}`} numberOfLines={1}>
          {clubs[fx.homeId]?.name}
        </Text>
        <Text className={`mx-2 w-16 text-center ${r ? 'font-disp text-[17px] text-ink' : 'font-monom text-xs text-mute'}`}>
          {r ? `${r.homeGoals} x ${r.awayGoals}${r.shootoutWinnerId ? '*' : ''}` : 'x'}
        </Text>
        <Text className={`flex-1 text-[13px] text-ink ${win === fx.awayId ? 'font-sansb' : 'font-sans'}`} numberOfLines={1}>
          {clubs[fx.awayId]?.name}
        </Text>
      </Pressable>
    );
  };

  return (
    <ScrollView contentContainerClassName={`gap-3 ${wide ? 'pb-6' : 'px-3.5 pb-8 pt-2'}`}>
      <Muted className="text-[12.5px]">
        {comp.championId
          ? `Campeão: ${clubs[comp.championId]?.name}`
          : comp.kind === 'europe'
            ? '1º–8º vão às oitavas; 9º–24º jogam o playoff; ida e volta até a final (jogo único, campo neutro).'
            : `${comp.clubIds.length} clubes · jogo único, final em campo neutro.`}
      </Muted>
      {stages.map((stage, i) => {
        const twoLegs = stage.slot2 !== undefined;
        const winners = twoLegs && stage.drawn ? stageWinners(comp, i + stageOffset) : [];
        return (
          <Card key={stage.name} className="p-3">
            <Label className="pb-1.5">{stage.name}</Label>
            {!stage.drawn ? <Muted className="text-xs">Sorteio na data da fase.</Muted> : null}
            {twoLegs
              ? Array.from({ length: stage.fixtureIds.length / 2 }, (_, t) => {
                  const ida = stage.fixtureIds[2 * t]!;
                  const volta = stage.fixtureIds[2 * t + 1]!;
                  const r1 = results.get(ida);
                  const r2 = results.get(volta);
                  const agg = r1 && r2 ? aggregateLabel(r1, r2, clubs) : null;
                  return (
                    <View key={ida} className="border-t border-line py-1">
                      <Row fid={ida} />
                      <Row fid={volta} />
                      {agg ? <Text className="text-center font-mono text-[10.5px] text-mute">{agg}</Text> : null}
                    </View>
                  );
                })
              : stage.fixtureIds.map((fid) => <Row key={fid} fid={fid} />)}
            {twoLegs && winners.length === stage.fixtureIds.length / 2 && winners.length > 0 ? (
              <Text className="mt-1 font-mono text-[10.5px] text-mute">Avançam: {winners.map((w) => clubs[w]?.shortName).join(', ')}</Text>
            ) : null}
          </Card>
        );
      })}
      <Text className="font-mono text-[10.5px] text-mute">* decidido nos pênaltis</Text>
    </ScrollView>
  );
}

function aggregateLabel(r1: MatchResult, r2: MatchResult, clubs: Record<string, { shortName: string }>): string {
  const a = r1.homeId;
  const b = r1.awayId;
  const ga = r1.homeGoals + (r2.homeId === a ? r2.homeGoals : r2.awayGoals);
  const gb = r1.awayGoals + (r2.homeId === b ? r2.homeGoals : r2.awayGoals);
  const w = tieWinner(r1, r2);
  return `Agregado ${clubs[a]?.shortName} ${ga} x ${gb} ${clubs[b]?.shortName} — passa ${clubs[w]?.shortName}${ga === gb ? ' nos pênaltis' : ''}`;
}
