// Tabela de classificação.

import { FlatList, Text, View } from 'react-native';
import { Header } from '../components/Header';
import { selectCareer, useGame } from '../store/gameStore';

const COLS = [
  { key: 'J', w: 'w-7' },
  { key: 'V', w: 'w-7' },
  { key: 'E', w: 'w-7' },
  { key: 'D', w: 'w-7' },
  { key: 'SG', w: 'w-9' },
  { key: 'Pts', w: 'w-10' },
] as const;

export function TableScreen() {
  const career = useGame(selectCareer)!;
  const { season, clubs, userClubId, league } = career;
  const n = season.table.length;

  return (
    <View className="flex-1">
      <Header title="Tabela" subtitle={`${league.name} ${season.year} · ${Math.min(season.nextRound - 1, season.totalRounds)} rodadas jogadas`} />
      <View className="flex-row px-4 pb-1">
        <Text className="w-7 text-xs font-bold text-slate-500">#</Text>
        <Text className="flex-1 text-xs font-bold text-slate-500">CLUBE</Text>
        {COLS.map((c) => (
          <Text key={c.key} className={`${c.w} text-right text-xs font-bold text-slate-500`}>
            {c.key}
          </Text>
        ))}
      </View>
      <FlatList
        data={season.table}
        keyExtractor={(r) => r.clubId}
        contentContainerClassName="px-4 pb-6"
        renderItem={({ item: r, index }) => {
          const mine = r.clubId === userClubId;
          // Faixas só visuais por enquanto: 4 primeiros e 3 últimos (vagas reais na Fase 3).
          const zone = index < 4 ? 'border-l-green-600' : index >= n - 3 ? 'border-l-red-500' : 'border-l-transparent';
          const values = [r.played, r.wins, r.draws, r.losses, r.goalsFor - r.goalsAgainst, r.points];
          return (
            <View
              className={`flex-row items-center border-b border-l-4 border-b-slate-200 py-2 pl-1 dark:border-b-slate-800 ${zone} ${mine ? 'bg-green-50 dark:bg-green-950' : ''}`}
            >
              <Text className="w-6 text-sm text-slate-500 dark:text-slate-400">{index + 1}</Text>
              <Text className={`flex-1 text-sm text-slate-900 dark:text-slate-100 ${mine ? 'font-bold' : ''}`} numberOfLines={1}>
                {clubs[r.clubId]?.name}
              </Text>
              {COLS.map((c, i) => (
                <Text
                  key={c.key}
                  className={`${c.w} text-right text-sm ${c.key === 'Pts' ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}
                >
                  {values[i]}
                </Text>
              ))}
            </View>
          );
        }}
      />
    </View>
  );
}
