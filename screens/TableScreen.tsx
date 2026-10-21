// Tabela de classificação de uma liga, com as faixas de vaga europeia, acesso e rebaixamento.

import { FlatList, Text, View } from 'react-native';
import { Header } from '../components/Header';
import { Muted } from '../components/ui';
import type { CompetitionState } from '../src/competitions/world';
import { selectCareer, useGame } from '../store/gameStore';

const COLS = [
  { key: 'J', w: 'w-7' },
  { key: 'V', w: 'w-7' },
  { key: 'E', w: 'w-7' },
  { key: 'D', w: 'w-7' },
  { key: 'SG', w: 'w-9' },
  { key: 'Pts', w: 'w-10' },
] as const;

export function TableScreen({ comp }: { comp: CompetitionState }) {
  const career = useGame(selectCareer)!;
  const { season, clubs, userClubId } = career;
  const league = career.leagues[comp.leagueId ?? ''];
  const n = comp.table.length;
  const played = comp.table.reduce((m, r) => Math.max(m, r.played), 0);
  const tier = league?.tier ?? 1;
  const k = league?.relegation ?? 0;
  const cont = league?.continental;
  const ucl = cont?.ucl ?? 0;
  const europe = ucl + (cont?.uel ?? 0) + (cont?.uecl ?? 0);
  const isEurope = comp.kind === 'europe';
  const zoneOf = (i: number) => {
    if (isEurope) return i < 8 ? 'border-l-green-600' : i < 24 ? 'border-l-sky-500' : 'border-l-red-500';
    if (tier === 2) return i < k ? 'border-l-green-600' : 'border-l-transparent';
    if (i < ucl) return 'border-l-green-600';
    if (i < europe) return 'border-l-sky-500';
    if (i >= n - k) return 'border-l-red-500';
    return 'border-l-transparent';
  };

  return (
    <View className="flex-1">
      <Header title={comp.name} subtitle={`${season.year} · ${played} rodadas jogadas`} />
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
        data={comp.table}
        keyExtractor={(r) => r.clubId}
        contentContainerClassName="px-4 pb-6"
        renderItem={({ item: r, index }) => {
          const mine = r.clubId === userClubId;
          const zone = zoneOf(index);
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
        ListFooterComponent={
          <Muted className="mt-3 text-xs">
            {isEurope
              ? 'Verde: oitavas (1º–8º) · azul: playoff (9º–24º) · vermelho: eliminados.'
              : tier === 2
              ? `Verde: sobem (${k}).`
              : `Verde: Champions (${ucl}) · azul: Europa/Conference (${europe - ucl}) · vermelho: caem (${k}).`}
          </Muted>
        }
      />
    </View>
  );
}
