// Jogos de uma rodada (liga ou fase de liga europeia), com placar quando já jogados.

import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Muted } from '../components/ui';
import type { CompetitionState } from '../src/competitions/world';
import type { MatchResult } from '../src/domain/types';
import { selectCareer, useGame } from '../store/gameStore';

export function useRound(comp: CompetitionState) {
  const roundView = useGame((s) => s.roundView);
  const results = useMemo(() => {
    const m: Record<string, MatchResult> = {};
    for (const r of comp.results) m[r.fixtureId] = r;
    return m;
  }, [comp.results]);
  const totalRounds = comp.fixtures.reduce((m, f) => Math.max(m, f.round), 0);
  // Padrão: a última rodada jogada (ou a 1ª se nada foi jogado).
  const lastPlayed = comp.fixtures.reduce((m, f) => (results[f.id] ? Math.max(m, f.round) : m), 0);
  const round = Math.min(totalRounds, roundView ?? Math.max(1, lastPlayed));
  const fixtures = comp.fixtures.filter((f) => f.round === round);
  return { results, totalRounds, lastPlayed, round, fixtures };
}

/** Lista de jogos de uma rodada (compacta; usada também na coluna do PC). */
export function RoundList({ comp, compact = false }: { comp: CompetitionState; compact?: boolean }) {
  const career = useGame(selectCareer)!;
  const openMatch = useGame((s) => s.openMatch);
  const { clubs, userClubId } = career;
  const { results, fixtures } = useRound(comp);
  return (
    <View>
      {fixtures.map((f) => {
        const r = results[f.id];
        const mine = f.homeId === userClubId || f.awayId === userClubId;
        return (
          <Pressable
            key={f.id}
            accessibilityRole="button"
            disabled={!r}
            onPress={() => r && openMatch(f.id)}
            className={`flex-row items-center gap-2 border-t border-line px-1 active:bg-s2 ${compact ? 'h-11' : 'h-12'} ${mine ? 'bg-s2' : ''}`}
          >
            <Text className={`flex-1 text-right text-[13.5px] text-ink ${mine && f.homeId === userClubId ? 'font-sansb' : 'font-sans'}`} numberOfLines={1}>
              {compact ? clubs[f.homeId]?.shortName : clubs[f.homeId]?.name}
            </Text>
            <Text className={`w-[54px] text-center ${r ? 'font-disp text-lg text-ink' : 'font-monom text-[11.5px] text-mute'}`}>
              {r ? `${r.homeGoals} x ${r.awayGoals}` : 'x'}
            </Text>
            <Text className={`flex-1 text-[13.5px] text-ink ${mine && f.awayId === userClubId ? 'font-sansb' : 'font-sans'}`} numberOfLines={1}>
              {compact ? clubs[f.awayId]?.shortName : clubs[f.awayId]?.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function RoundsScreen({ comp }: { comp: CompetitionState }) {
  const setRoundView = useGame((s) => s.setRoundView);
  const roundView = useGame((s) => s.roundView);
  const { totalRounds, lastPlayed, round } = useRound(comp);
  return (
    <ScrollView contentContainerClassName="gap-3 px-3.5 pb-8 pt-2">
      <View className="flex-row items-center justify-between">
        <Button size="sm" variant="secondary" label="‹ Anterior" disabled={round <= 1} onPress={() => setRoundView(round - 1)} />
        <Text className="font-disp text-xl uppercase text-ink">Rodada {round}</Text>
        <Button size="sm" variant="secondary" label="Próxima ›" disabled={round >= totalRounds} onPress={() => setRoundView(round + 1)} />
      </View>
      <RoundList comp={comp} />
      <Muted className="text-center text-xs">{round <= lastPlayed ? 'Toque num jogo para ver os detalhes' : 'Rodada ainda não jogada'}</Muted>
      {roundView !== null ? <Button variant="ghost" size="sm" label="Voltar à rodada atual" onPress={() => setRoundView(null)} /> : null}
    </ScrollView>
  );
}
