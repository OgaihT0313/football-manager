// Tabela de classificação (liga ou fase de liga europeia) com faixas de vaga, acesso e
// rebaixamento. Celular: # | clube | J | SG | PTS. PC: + V E D GP GC e forma dos 5 últimos.
// Também exporta a artilharia de uma competição.

import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { clubColor, useWide } from '../components/theme';
import { Form, Muted } from '../components/ui';
import type { CompetitionState } from '../src/competitions/world';
import type { MatchResult } from '../src/domain/types';
import { selectCareer, useGame } from '../store/gameStore';

type Zone = 'pos' | 'acc' | 'neg' | null;
const ZONE_BG: Record<Exclude<Zone, null>, string> = { pos: 'bg-pos', acc: 'bg-acc', neg: 'bg-neg' };

/** Forma (V/E/D) dos últimos 5 jogos de cada clube na competição. */
function formByClub(results: MatchResult[]): Record<string, ('V' | 'E' | 'D')[]> {
  const out: Record<string, ('V' | 'E' | 'D')[]> = {};
  for (const r of results) {
    const h = r.homeGoals > r.awayGoals ? 'V' : r.homeGoals < r.awayGoals ? 'D' : 'E';
    const a = h === 'V' ? 'D' : h === 'D' ? 'V' : 'E';
    (out[r.homeId] ??= []).push(h);
    (out[r.awayId] ??= []).push(a);
  }
  for (const k of Object.keys(out)) out[k] = out[k]!.slice(-5);
  return out;
}

export function TableScreen({ comp }: { comp: CompetitionState }) {
  const wide = useWide();
  const career = useGame(selectCareer)!;
  const { clubs, userClubId } = career;
  const league = career.leagues[comp.leagueId ?? ''];
  const n = comp.table.length;
  const tier = league?.tier ?? 1;
  const k = league?.relegation ?? 0;
  const cont = league?.continental;
  const ucl = cont?.ucl ?? 0;
  const europe = ucl + (cont?.uel ?? 0) + (cont?.uecl ?? 0);
  const isEurope = comp.kind === 'europe';
  const form = useMemo(() => (wide ? formByClub(comp.results) : {}), [wide, comp.results]);
  const zoneOf = (i: number): Zone => {
    if (isEurope) return i < 8 ? 'pos' : i < 24 ? 'acc' : 'neg';
    if (tier === 2) return i < k ? 'pos' : null;
    if (i < ucl) return 'pos';
    if (i < europe) return 'acc';
    if (i >= n - k && k > 0) return 'neg';
    return null;
  };
  const legend: [Exclude<Zone, null>, string][] = isEurope
    ? [['pos', 'Oitavas (1º–8º)'], ['acc', 'Playoff (9º–24º)'], ['neg', 'Eliminados']]
    : tier === 2
      ? [['pos', `Acesso (${k})`]]
      : [
          ...(ucl ? ([['pos', wide ? 'Champions' : 'Continental']] as [Exclude<Zone, null>, string][]) : []),
          ...(europe - ucl ? ([['acc', wide ? 'Europa / Conference' : 'Pré']] as [Exclude<Zone, null>, string][]) : []),
          ...(k ? ([['neg', wide ? 'Rebaixamento' : 'Rebaix.']] as [Exclude<Zone, null>, string][]) : []),
        ];

  const head = wide
    ? ['#', 'CLUBE', 'J', 'V', 'E', 'D', 'GP', 'GC', 'SG', 'FORMA', 'PTS']
    : ['#', 'CLUBE', 'J', 'SG', 'PTS'];

  return (
    <View className="flex-1">
      <View className={`flex-row gap-1.5 border-b border-line pb-1.5 pt-1 ${wide ? 'gap-2 px-4' : 'px-[18px]'}`}>
        {head.map((h) => (
          <Text key={h} className={`font-monom text-[10px] text-mute ${colClass(h, wide)}`}>
            {h}
          </Text>
        ))}
      </View>
      <ScrollView>
        {comp.table.map((r, i) => {
          const mine = r.clubId === userClubId;
          const zone = zoneOf(i);
          const sg = r.goalsFor - r.goalsAgainst;
          const cells: Record<string, string | number> = { J: r.played, V: r.wins, E: r.draws, D: r.losses, GP: r.goalsFor, GC: r.goalsAgainst, SG: sg > 0 ? `+${sg}` : sg };
          return (
            <View key={r.clubId} className={`flex-row items-center gap-1.5 border-t border-line ${wide ? 'h-[46px] gap-2 px-4' : 'h-10 px-[18px]'} ${mine ? 'bg-s2' : ''}`}>
              {zone ? <View className={`absolute bottom-0 left-0 top-0 w-[3px] ${ZONE_BG[zone]}`} /> : null}
              <Text className={`font-monob text-ink ${colClass('#', wide)}`} style={{ fontSize: wide ? 13 : 12 }}>
                {i + 1}
              </Text>
              <View className={`flex-row items-center gap-2 ${colClass('CLUBE', wide)}`}>
                <View className="rounded-full" style={{ width: wide ? 12 : 10, height: wide ? 12 : 10, backgroundColor: clubColor(r.clubId) }} />
                <Text className={`shrink text-ink ${mine ? 'font-sansb' : 'font-sans'}`} style={{ fontSize: wide ? 14.5 : 13 }} numberOfLines={1}>
                  {clubs[r.clubId]?.name}
                </Text>
              </View>
              {head.slice(2, -1).map((h) =>
                h === 'FORMA' ? (
                  <View key={h} className={`items-center ${colClass(h, wide)}`}>
                    <Form list={form[r.clubId] ?? []} size={18} letters={false} />
                  </View>
                ) : (
                  <Text key={h} className={`font-mono text-mute ${colClass(h, wide)} ${h === 'SG' ? 'text-ink' : ''}`} style={{ fontSize: wide ? 13 : 12 }}>
                    {cells[h]}
                  </Text>
                ),
              )}
              <Text className={`font-disp text-ink ${colClass('PTS', wide)}`} style={{ fontSize: wide ? 20 : 16 }}>
                {r.points}
              </Text>
            </View>
          );
        })}
        <View className={`flex-row flex-wrap gap-3 border-t border-line py-2 ${wide ? 'px-4 pt-3' : 'px-[18px]'}`}>
          {legend.map(([z, label]) => (
            <View key={label} className="flex-row items-center gap-1.5">
              <View className={`h-2 w-2 ${ZONE_BG[z]}`} />
              <Text className="font-monom text-[10px] uppercase text-mute">{label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function colClass(h: string, wide: boolean): string {
  if (h === '#') return wide ? 'w-9' : 'w-[22px]';
  if (h === 'CLUBE') return 'flex-1 min-w-0';
  if (h === 'FORMA') return 'w-[130px] text-center';
  if (h === 'PTS') return `${wide ? 'w-14' : 'w-8'} text-right`;
  if (h === 'SG') return `${wide ? 'w-[46px]' : 'w-[30px]'} text-right`;
  return `${wide ? 'w-[46px]' : 'w-6'} text-right`;
}

/** Artilharia de uma competição (gols guardados nos resultados). */
export function Scorers({ comp, limit = 10 }: { comp: CompetitionState; limit?: number }) {
  const career = useGame(selectCareer)!;
  const { players, clubs } = career;
  const list = useMemo(() => {
    const goals: Record<string, { n: number; club: string }> = {};
    for (const r of comp.results) for (const e of r.events) if (e.type === 'goal') (goals[e.playerId] ??= { n: 0, club: e.clubId }).n++;
    return Object.entries(goals)
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, limit);
  }, [comp.results, limit]);
  if (!list.length) return <Muted className="py-3">Nenhum gol ainda.</Muted>;
  return (
    <View>
      {list.map(([id, g], i) => (
        <View key={id} className="h-11 flex-row items-center gap-2.5 border-t border-line">
          <Text className="w-5 font-monob text-xs text-mute">{i + 1}</Text>
          <View className="flex-1">
            <Text className={`font-sanss text-sm ${g.club === career.userClubId ? 'text-acct' : 'text-ink'}`} numberOfLines={1}>
              {players[id]?.name ?? 'Jogador que saiu'}
            </Text>
            <Text className="font-sans text-xs text-mute">{clubs[g.club]?.name}</Text>
          </View>
          <Text className="w-[30px] text-right font-disp text-xl text-ink">{g.n}</Text>
        </View>
      ))}
    </View>
  );
}

