// Liga: qualquer competição do mundo. País → competição (1ª, 2ª, copa, supercopa); nas ligas,
// tabela e rodadas; nas copas, as fases com os confrontos.

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Card, Muted, SectionTitle, Segmented } from '../components/ui';
import { leagueCompetitionOf, winnerOf, type CompetitionState } from '../src/competitions/world';
import { selectCareer, useGame } from '../store/gameStore';
import { RoundsScreen } from './RoundsScreen';
import { TableScreen } from './TableScreen';

type Kind = 'l1' | 'l2' | 'copa' | 'super';
const KIND_LABEL: Record<Kind, string> = { l1: '1ª div.', l2: '2ª div.', copa: 'Copa', super: 'Supercopa' };

export function LeagueScreen() {
  const career = useGame(selectCareer)!;
  const leagueView = useGame((s) => s.leagueView);
  const setLeagueView = useGame((s) => s.setLeagueView);
  const { season, leagues } = career;
  const [sub, setSub] = useState<'tabela' | 'rodadas'>('tabela');

  const userComp = leagueCompetitionOf(season, career.userClubId);
  const current: CompetitionState | undefined = season.competitions[leagueView ?? ''] ?? userComp ?? undefined;
  const country = current?.country ?? '';
  const countries = useMemo(() => [...new Set(Object.values(leagues).filter((l) => (l.tier ?? 1) === 1).map((l) => l.country))], [leagues]);

  // Competições do país atual, por tipo.
  const byKind = useMemo(() => {
    const out: Partial<Record<Kind, string>> = {};
    for (const comp of Object.values(season.competitions)) {
      if (comp.country !== country) continue;
      if (comp.kind === 'league') out[(leagues[comp.leagueId!]?.tier ?? 1) === 1 ? 'l1' : 'l2'] = comp.id;
      else if (comp.kind === 'cup') out.copa = comp.id;
      else out.super = comp.id;
    }
    return out;
  }, [season.competitions, country, leagues]);
  const kinds = (Object.keys(KIND_LABEL) as Kind[]).filter((k) => byKind[k]);
  const currentKind = kinds.find((k) => byKind[k] === current?.id) ?? 'l1';

  if (!current) return <Muted className="p-4">Nenhuma competição.</Muted>;

  return (
    <View className="flex-1">
      <View className="gap-2 px-4 pt-2">
        {countries.length > 1 ? (
          <Segmented
            options={countries}
            value={country}
            onChange={(ctry) => {
              const first = Object.values(season.competitions).find((cp) => cp.country === ctry && cp.kind === 'league' && (leagues[cp.leagueId!]?.tier ?? 1) === 1);
              if (first) setLeagueView(first.id);
            }}
            labelOf={(ctry) => (Object.values(leagues).find((l) => l.country === ctry)?.id ?? ctry).replace(/\d+$/, '').toUpperCase()}
          />
        ) : null}
        <Segmented options={kinds} value={currentKind} onChange={(k) => setLeagueView(byKind[k] ?? null)} labelOf={(k) => KIND_LABEL[k]} />
        {current.kind === 'league' ? (
          <Segmented options={['tabela', 'rodadas'] as const} value={sub} onChange={setSub} labelOf={(v) => (v === 'tabela' ? 'Tabela' : 'Rodadas')} />
        ) : null}
      </View>
      <View className="flex-1">
        {current.kind === 'league' ? sub === 'tabela' ? <TableScreen comp={current} /> : <RoundsScreen comp={current} /> : <CupView comp={current} />}
      </View>
    </View>
  );
}

function CupView({ comp }: { comp: CompetitionState }) {
  const career = useGame(selectCareer)!;
  const openMatch = useGame((s) => s.openMatch);
  const { clubs, userClubId } = career;
  const results = new Map(comp.results.map((r) => [r.fixtureId, r]));
  const fixtures = new Map(comp.fixtures.map((f) => [f.id, f]));
  return (
    <ScrollView contentContainerClassName="gap-3 p-4 pb-8">
      <Text className="text-2xl font-bold text-slate-900 dark:text-white">{comp.name}</Text>
      <Muted>
        {comp.championId ? `Campeão: ${clubs[comp.championId]?.name}` : `${comp.clubIds.length} clubes · mata-mata em jogo único, final em campo neutro`}
      </Muted>
      {comp.stages.map((stage) => (
        <Card key={stage.name} className="p-3">
          <SectionTitle>{stage.name}</SectionTitle>
          {!stage.drawn ? <Muted>Sorteio na data da fase.</Muted> : null}
          {stage.fixtureIds.map((fid) => {
            const fx = fixtures.get(fid)!;
            const r = results.get(fid);
            const mine = fx.homeId === userClubId || fx.awayId === userClubId;
            const win = r ? winnerOf(r) : null;
            return (
              <Pressable
                key={fid}
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
          })}
        </Card>
      ))}
      <Muted className="text-xs">* decidido nos pênaltis</Muted>
    </ScrollView>
  );
}
