// Rodadas: jogos de cada rodada, com placar quando já jogados.

import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Header } from '../components/Header';
import { Button, Card, Muted } from '../components/ui';
import { roundFixtures } from '../src/competitions/season';
import type { MatchResult } from '../src/domain/types';
import { selectCareer, useGame } from '../store/gameStore';

export function RoundsScreen() {
  const career = useGame(selectCareer)!;
  const roundView = useGame((s) => s.roundView);
  const setRoundView = useGame((s) => s.setRoundView);
  const openMatch = useGame((s) => s.openMatch);
  const { season, clubs, userClubId } = career;

  // Padrão: a última rodada jogada (ou a 1ª se nada foi jogado).
  const round = roundView ?? Math.max(1, Math.min(season.nextRound - 1, season.totalRounds));
  const fixtures = useMemo(() => roundFixtures(season, round), [season, round]);
  const results = useMemo(() => {
    const m: Record<string, MatchResult> = {};
    for (const r of season.results) m[r.fixtureId] = r;
    return m;
  }, [season.results]);

  return (
    <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
      <Header title="Rodadas" subtitle={round < season.nextRound ? 'Toque num jogo para ver os detalhes' : 'Rodada ainda não jogada'} />
      <View className="flex-row items-center justify-between">
        <Button variant="secondary" label="‹ Anterior" disabled={round <= 1} onPress={() => setRoundView(round - 1)} />
        <Text className="text-lg font-bold text-slate-900 dark:text-white">Rodada {round}</Text>
        <Button variant="secondary" label="Próxima ›" disabled={round >= season.totalRounds} onPress={() => setRoundView(round + 1)} />
      </View>
      <Card className="p-2">
        {fixtures.map((f) => {
          const r = results[f.id];
          const mine = f.homeId === userClubId || f.awayId === userClubId;
          return (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              disabled={!r}
              onPress={() => r && openMatch(f.id)}
              className={`flex-row items-center rounded-lg px-2 py-3 active:bg-slate-100 dark:active:bg-slate-800 ${mine ? 'bg-green-50 dark:bg-green-950' : ''}`}
            >
              <Text
                className={`flex-1 text-right text-sm text-slate-900 dark:text-slate-100 ${f.homeId === userClubId ? 'font-bold' : ''}`}
                numberOfLines={1}
              >
                {clubs[f.homeId]?.name}
              </Text>
              <Text className="mx-3 w-14 text-center text-base font-bold text-slate-900 dark:text-white">
                {r ? `${r.homeGoals} x ${r.awayGoals}` : 'x'}
              </Text>
              <Text
                className={`flex-1 text-sm text-slate-900 dark:text-slate-100 ${f.awayId === userClubId ? 'font-bold' : ''}`}
                numberOfLines={1}
              >
                {clubs[f.awayId]?.name}
              </Text>
            </Pressable>
          );
        })}
      </Card>
      {roundView !== null ? <Button variant="ghost" label="Voltar à rodada atual" onPress={() => setRoundView(null)} /> : null}
      <Muted className="text-center">{season.totalRounds} rodadas · ida e volta</Muted>
    </ScrollView>
  );
}
