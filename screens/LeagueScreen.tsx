// Liga: qualquer competição do mundo. País (ou Europa) → competição. Ligas: tabela e rodadas.
// Copas nacionais: fases. Copas europeias: tabela da fase de liga, jogos e mata-mata.

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Card, Muted, SectionTitle, Segmented } from '../components/ui';
import { stageWinners, tieWinner } from '../src/competitions/europe';
import { leagueCompetitionOf, winnerOf, type CompetitionState } from '../src/competitions/world';
import type { MatchResult } from '../src/domain/types';
import { selectCareer, useGame } from '../store/gameStore';
import { RoundsScreen } from './RoundsScreen';
import { TableScreen } from './TableScreen';

type Kind = 'l1' | 'l2' | 'copa' | 'super' | 'ucl' | 'uel' | 'uecl';
const KIND_LABEL: Record<Kind, string> = {
  l1: '1ª div.', l2: '2ª div.', copa: 'Copa', super: 'Supercopa', ucl: 'Champions', uel: 'Europa League', uecl: 'Conference',
};
const EUROPA = 'Europa';

export function LeagueScreen() {
  const career = useGame(selectCareer)!;
  const leagueView = useGame((s) => s.leagueView);
  const setLeagueView = useGame((s) => s.setLeagueView);
  const { season, leagues } = career;
  const [sub, setSub] = useState<'tabela' | 'rodadas' | 'mata'>('tabela');

  const userComp = leagueCompetitionOf(season, career.userClubId);
  const current: CompetitionState | undefined = season.competitions[leagueView ?? ''] ?? userComp ?? undefined;
  const country = current?.country ?? '';
  const hasEurope = Object.values(season.competitions).some((c) => c.kind === 'europe');
  // Países com 1ª divisão completa primeiro, depois as ligas de fundo.
  const countries = useMemo(() => {
    const tops = Object.values(leagues).filter((l) => (l.tier ?? 1) === 1);
    const full = tops.filter((l) => (l.mode ?? 'full') === 'full').map((l) => l.country);
    const bg = tops.filter((l) => l.mode === 'strength').map((l) => l.country);
    return [...(hasEurope ? [EUROPA] : []), ...new Set([...full, ...bg])];
  }, [leagues, hasEurope]);

  // Competições do país atual, por tipo.
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
    setSub('tabela');
  };

  if (!current) return <Muted className="p-4">Nenhuma competição.</Muted>;
  const isEurope = current.kind === 'europe';
  const leaguePhase: CompetitionState | null = isEurope
    ? { ...current, fixtures: current.fixtures.filter((f) => current.stages[0]!.fixtureIds.includes(f.id)) }
    : null;

  return (
    <View className="flex-1">
      <View className="gap-2 pt-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
          {countries.map((ctry) => {
            const active = ctry === country;
            return (
              <Pressable
                key={ctry}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => selectCountry(ctry)}
                className={`min-h-[36px] justify-center rounded-full px-3 ${active ? 'bg-green-600' : 'bg-slate-200 dark:bg-slate-800'}`}
              >
                <Text className={`text-sm ${active ? 'font-bold text-white' : 'text-slate-700 dark:text-slate-200'}`}>{ctry}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View className="gap-2 px-4">
          {kinds.length > 1 ? (
            <Segmented options={kinds} value={currentKind!} onChange={(k) => setLeagueView(byKind[k] ?? null)} labelOf={(k) => KIND_LABEL[k]} />
          ) : null}
          {current.kind === 'league' ? (
            <Segmented options={['tabela', 'rodadas'] as const} value={sub === 'mata' ? 'tabela' : sub} onChange={setSub} labelOf={(v) => (v === 'tabela' ? 'Tabela' : 'Rodadas')} />
          ) : null}
          {isEurope ? (
            <Segmented
              options={['tabela', 'rodadas', 'mata'] as const}
              value={sub}
              onChange={setSub}
              labelOf={(v) => (v === 'tabela' ? 'Fase de liga' : v === 'rodadas' ? 'Jogos' : 'Mata-mata')}
            />
          ) : null}
        </View>
      </View>
      <View className="flex-1">
        {current.kind === 'league' ? (
          sub === 'rodadas' ? <RoundsScreen comp={current} /> : <TableScreen comp={current} />
        ) : isEurope ? (
          sub === 'tabela' ? <TableScreen comp={current} /> : sub === 'rodadas' ? <RoundsScreen comp={leaguePhase!} /> : <KnockoutView comp={current} />
        ) : (
          <KnockoutView comp={current} />
        )}
      </View>
    </View>
  );
}

/** Fases de mata-mata (copa, supercopa ou Europa), com ida, volta e agregado. */
function KnockoutView({ comp }: { comp: CompetitionState }) {
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
        className={`flex-row items-center rounded-lg px-2 py-2 active:bg-slate-100 dark:active:bg-slate-800 ${mine ? 'bg-green-50 dark:bg-green-950' : ''}`}
      >
        <Text className={`flex-1 text-right text-sm text-slate-900 dark:text-slate-100 ${win === fx.homeId ? 'font-bold' : ''}`} numberOfLines={1}>
          {clubs[fx.homeId]?.name}
        </Text>
        <Text className="mx-2 w-16 text-center text-sm font-bold text-slate-900 dark:text-white">
          {r ? `${r.homeGoals} x ${r.awayGoals}${r.shootoutWinnerId ? '*' : ''}` : 'x'}
        </Text>
        <Text className={`flex-1 text-sm text-slate-900 dark:text-slate-100 ${win === fx.awayId ? 'font-bold' : ''}`} numberOfLines={1}>
          {clubs[fx.awayId]?.name}
        </Text>
      </Pressable>
    );
  };

  return (
    <ScrollView contentContainerClassName="gap-3 p-4 pb-8">
      <Text className="text-2xl font-bold text-slate-900 dark:text-white">{comp.name}</Text>
      <Muted>
        {comp.championId
          ? `Campeão: ${clubs[comp.championId]?.name}`
          : comp.kind === 'europe'
            ? '1º–8º vão às oitavas; 9º–24º jogam o playoff; ida e volta até a final (jogo único, campo neutro)'
            : `${comp.clubIds.length} clubes · jogo único, final em campo neutro`}
      </Muted>
      {stages.map((stage, i) => {
        const twoLegs = stage.slot2 !== undefined;
        const winners = twoLegs && stage.drawn ? stageWinners(comp, i + stageOffset) : [];
        return (
          <Card key={stage.name} className="p-3">
            <SectionTitle>{stage.name}</SectionTitle>
            {!stage.drawn ? <Muted>Sorteio na data da fase.</Muted> : null}
            {twoLegs
              ? Array.from({ length: stage.fixtureIds.length / 2 }, (_, t) => {
                  const ida = stage.fixtureIds[2 * t]!;
                  const volta = stage.fixtureIds[2 * t + 1]!;
                  const r1 = results.get(ida);
                  const r2 = results.get(volta);
                  const agg = r1 && r2 ? aggregateLabel(r1, r2, clubs) : null;
                  return (
                    <View key={ida} className="mb-1 border-b border-slate-100 pb-1 dark:border-slate-800">
                      <Row fid={ida} />
                      <Row fid={volta} />
                      {agg ? <Muted className="text-center text-xs">{agg}</Muted> : null}
                    </View>
                  );
                })
              : stage.fixtureIds.map((fid) => <Row key={fid} fid={fid} />)}
            {twoLegs && winners.length === stage.fixtureIds.length / 2 && winners.length > 0 ? (
              <Muted className="mt-1 text-xs">Avançam: {winners.map((w) => clubs[w]?.shortName).join(', ')}</Muted>
            ) : null}
          </Card>
        );
      })}
      <Muted className="text-xs">* decidido nos pênaltis</Muted>
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
