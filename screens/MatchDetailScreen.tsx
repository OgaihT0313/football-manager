// Detalhe da partida: placar, gols esperados, lances e notas dos titulares.

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Muted, SectionTitle } from '../components/ui';
import { findResult } from '../src/competitions/world';
import type { MatchEvent, MatchResult, Player } from '../src/domain/types';
import { selectCareer, useGame } from '../store/gameStore';
import { WatchView } from './WatchView';

const EVENT_LABEL: Record<MatchEvent['type'], string> = { goal: 'Gol', yellow: 'Amarelo', red: 'Vermelho', injury: 'Lesão' };
const EVENT_COLOR: Record<MatchEvent['type'], string> = {
  goal: 'bg-green-600',
  yellow: 'bg-amber-400',
  red: 'bg-red-600',
  injury: 'bg-slate-400',
};

const minuteLabel = (m: number) => (m > 90 ? `90+${m - 90}′` : `${m}′`);

export function MatchDetailScreen({ fixtureId }: { fixtureId: string }) {
  const career = useGame(selectCareer)!;
  const close = useGame((s) => s.openMatch);
  const insets = useSafeAreaInsets();
  const [watching, setWatching] = useState(false);
  const found = findResult(career.season, fixtureId);
  if (!found) return null;
  const { result: r, comp } = found;
  const summarized = r.homeXI.length === 0 && r.awayXI.length === 0;
  const { clubs, players } = career;
  const home = clubs[r.homeId]!;
  const away = clubs[r.awayId]!;
  const name = (id: string) => players[id]?.name ?? id;
  if (watching && !summarized) return <WatchView result={r} clubs={clubs} players={players} seed={career.seed} onClose={() => setWatching(false)} />;

  return (
    <View className="absolute inset-0 bg-slate-50 dark:bg-slate-950">
      <ScrollView contentContainerClassName="gap-4 p-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View className="flex-row justify-end">
          <Button variant="ghost" label="Fechar" onPress={() => close(null)} />
        </View>
        <Card>
          <View className="flex-row items-center">
            <Text className="flex-1 text-center text-base font-semibold text-slate-900 dark:text-slate-100" numberOfLines={2}>
              {home.name}
            </Text>
            <Text className="mx-3 text-4xl font-black text-slate-900 dark:text-white">
              {r.homeGoals} x {r.awayGoals}
            </Text>
            <Text className="flex-1 text-center text-base font-semibold text-slate-900 dark:text-slate-100" numberOfLines={2}>
              {away.name}
            </Text>
          </View>
          <Muted className="mt-2 text-center">
            Gols esperados {r.homeXg.toFixed(2).replace('.', ',')} x {r.awayXg.toFixed(2).replace('.', ',')}
          </Muted>
          {r.shootoutWinnerId ? <Muted className="text-center">{clubs[r.shootoutWinnerId]?.name} venceu nos pênaltis</Muted> : null}
          <Muted className="text-center">{comp.name}</Muted>
          {summarized ? null : <Button className="mt-3" label="Assistir em 2D" onPress={() => setWatching(true)} />}
        </Card>

        <Card>
          <SectionTitle>Lances</SectionTitle>
          {r.events.length === 0 ? <Muted>Nenhum lance registrado.</Muted> : null}
          {r.events.map((e, i) => {
            const isHome = e.clubId === r.homeId;
            return (
              <View key={i} className={`items-center gap-2 py-1.5 ${isHome ? 'flex-row' : 'flex-row-reverse'}`}>
                <Text className="w-12 text-center text-sm font-bold text-slate-500">{minuteLabel(e.minute)}</Text>
                <View className={`h-3 w-3 rounded-sm ${EVENT_COLOR[e.type]}`} />
                <View className={`flex-1 ${isHome ? '' : 'items-end'}`}>
                  <Text className="text-sm text-slate-900 dark:text-slate-100">
                    {EVENT_LABEL[e.type]} · {name(e.playerId)}
                  </Text>
                  {e.assistId ? <Muted className="text-xs">assistência de {name(e.assistId)}</Muted> : null}
                  {e.type === 'injury' ? <Muted className="text-xs">fora por {e.matchesOut} jogo(s)</Muted> : null}
                </View>
              </View>
            );
          })}
        </Card>

        {summarized ? (
          <Muted className="text-center">Jogo de outra competição: guardamos só o placar e os gols.</Muted>
        ) : (
          <View className="flex-row gap-3">
            <Ratings title={home.shortName} ids={r.homeXI} result={r} players={players} />
            <Ratings title={away.shortName} ids={r.awayXI} result={r} players={players} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Ratings({ title, ids, result, players }: { title: string; ids: string[]; result: MatchResult; players: Record<string, Player> }) {
  return (
    <Card className="flex-1 p-3">
      <SectionTitle>{title} · notas</SectionTitle>
      {ids.map((id) => {
        const v = result.ratings[id] ?? 0;
        const tone = v >= 7.5 ? 'text-green-600 dark:text-green-400' : v < 6 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100';
        return (
          <View key={id} className="flex-row items-center justify-between py-0.5">
            <Text className="flex-1 text-xs text-slate-700 dark:text-slate-300" numberOfLines={1}>
              {players[id]?.name ?? id}
            </Text>
            <Text className={`ml-1 text-xs font-bold ${tone}`}>{v.toFixed(1).replace('.', ',')}</Text>
          </View>
        );
      })}
    </Card>
  );
}
