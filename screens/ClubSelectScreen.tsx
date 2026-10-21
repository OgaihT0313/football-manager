// Escolha do clube para a nova carreira: país, depois clube da 1ª divisão.

import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Header } from '../components/Header';
import { formatMoney } from '../components/labels';
import { Button, Muted, Segmented } from '../components/ui';
import { strengthScore } from '../src/career/queries';
import { FORMATIONS } from '../src/domain/positions';
import { autoLineup } from '../src/engine/lineup';
import { teamStrength } from '../src/engine/matchEngine';
import { baseData, useGame } from '../store/gameStore';

// Só 1ª divisão com elenco completo (as ligas de fundo jogam "por força").
const topLeagues = baseData.leagues.filter((l) => (l.tier ?? 1) === 1 && (l.mode ?? 'full') === 'full');

export function ClubSelectScreen() {
  const startCareer = useGame((s) => s.startCareer);
  const backToMenu = useGame((s) => s.backToMenu);
  const [leagueId, setLeagueId] = useState(topLeagues[0]?.id ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const league = topLeagues.find((l) => l.id === leagueId)!;

  const clubs = useMemo(() => {
    const byId = new Map(baseData.players.map((p) => [p.id, p]));
    return baseData.clubs
      .filter((c) => league.clubIds.includes(c.id))
      .map((c) => {
        const pool = c.squad.map((id) => byId.get(id)!).filter(Boolean);
        const l = autoLineup(c.tactic.formation, pool);
        return { club: c, score: strengthScore(teamStrength(l, FORMATIONS[l.formation])) };
      })
      .sort((a, b) => b.score - a.score);
  }, [league]);
  const best = clubs[0]?.score ?? 1;
  const worst = clubs[clubs.length - 1]?.score ?? 0;
  const relegation = league.relegation ?? 3;
  const ucl = league.continental?.ucl ?? 4;

  return (
    <View className="flex-1">
      <Header title="Escolha seu clube" subtitle={`${league.name} · ${league.country}`} right={<Button variant="ghost" label="Voltar" onPress={backToMenu} />} />
      <View className="px-4 pb-2">
        <Segmented
          options={topLeagues.map((l) => l.id)}
          value={leagueId}
          onChange={(id) => {
            setLeagueId(id);
            setSelected(null);
          }}
          labelOf={(id) => id.replace(/\d+$/, '').toUpperCase()}
        />
      </View>
      <FlatList
        data={clubs}
        keyExtractor={(x) => x.club.id}
        contentContainerClassName="gap-2 px-4 pb-4"
        renderItem={({ item, index }) => {
          const active = selected === item.club.id;
          const n = clubs.length;
          const expectation =
            index < 3 ? 'Brigar pelo título' : index < ucl ? 'Vaga na Champions' : index < 8 ? 'Vaga europeia' : index < n - relegation - 2 ? 'Meio da tabela' : 'Evitar o rebaixamento';
          const pct = (item.score - worst) / Math.max(1, best - worst);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setSelected(item.club.id)}
              className={`rounded-2xl border p-3 ${active ? 'border-green-600 bg-green-50 dark:bg-green-950' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}
            >
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 text-base font-semibold text-slate-900 dark:text-slate-100" numberOfLines={1}>
                  {item.club.name}
                </Text>
                <Text className="ml-2 text-lg font-bold text-slate-900 dark:text-white">{item.score}</Text>
              </View>
              <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <View className="h-full bg-green-600" style={{ width: `${Math.round(15 + 85 * pct)}%` }} />
              </View>
              <Muted className="mt-1">
                {item.club.tactic.formation} · {expectation} · orçamento {formatMoney(item.club.budget)}
              </Muted>
            </Pressable>
          );
        }}
      />
      <View className="border-t border-slate-200 p-4 dark:border-slate-800">
        <Button label={selected ? 'Começar carreira' : 'Selecione um clube'} disabled={!selected} onPress={() => selected && startCareer(selected)} />
      </View>
    </View>
  );
}
