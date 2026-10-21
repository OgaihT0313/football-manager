// Escolha do clube da nova carreira: era, país (1ª divisão) e clube.
// Celular: chips de era, abas de país, lista e rodapé com "Assumir". PC: ligas | grade de clubes |
// painel com os detalhes do clube escolhido.

import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { formatMoney, formatWage } from '../components/labels';
import { useWide } from '../components/theme';
import { Button, Chips, Crest, Label, Muted, Num, Tabs, Title } from '../components/ui';
import { strengthScore } from '../src/career/queries';
import { weeklyWageBill } from '../src/club/finance';
import { FORMATIONS } from '../src/domain/positions';
import type { Club, Player } from '../src/domain/types';
import { autoLineup } from '../src/engine/lineup';
import { teamStrength } from '../src/engine/matchEngine';
import { dataForEra, ERAS, useGame } from '../store/gameStore';

const stars = (rep: number) => '★'.repeat(Math.max(1, Math.min(5, Math.round(rep / 20))));

interface Row {
  club: Club;
  score: number;
  goal: string;
  bill: number;
}

export function ClubSelectScreen() {
  const wide = useWide();
  const startCareer = useGame((s) => s.startCareer);
  const backToMenu = useGame((s) => s.backToMenu);
  const [eraId, setEraId] = useState(ERAS[0]?.id ?? 'atual');
  const era = ERAS.find((e) => e.id === eraId) ?? ERAS[0]!;
  const baseData = useMemo(() => dataForEra(eraId), [eraId]);
  // Só 1ª divisão com elenco completo (as ligas de fundo jogam "por força").
  const topLeagues = useMemo(() => baseData.leagues.filter((l) => (l.tier ?? 1) === 1 && (l.mode ?? 'full') === 'full'), [baseData]);
  const [leagueId, setLeagueId] = useState(topLeagues[0]?.id ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const league = topLeagues.find((l) => l.id === leagueId) ?? topLeagues[0]!;

  const rows = useMemo<Row[]>(() => {
    const byId: Record<string, Player> = {};
    for (const p of baseData.players) byId[p.id] = p;
    const list = baseData.clubs
      .filter((c) => league.clubIds.includes(c.id))
      .map((c) => {
        const pool = c.squad.map((id) => byId[id]!).filter(Boolean);
        const l = autoLineup(c.tactic.formation, pool);
        return { club: c, score: strengthScore(teamStrength(l, FORMATIONS[l.formation])), bill: weeklyWageBill(c, byId) };
      })
      .sort((a, b) => b.score - a.score);
    const n = list.length;
    const relegation = league.relegation ?? 3;
    const ucl = league.continental?.ucl ?? 4;
    return list.map((x, i) => ({
      ...x,
      goal: i < 3 ? 'Título' : i < ucl ? 'Champions' : i < 8 ? 'Vaga europeia' : i < n - relegation - 2 ? 'Meio da tabela' : 'Não cair',
    }));
  }, [league, baseData]);

  const chosen = rows.find((r) => r.club.id === selected) ?? null;
  const eraChips = ERAS.map((e) => e.id);
  const eraLabel = (id: string) => {
    const e = ERAS.find((x) => x.id === id)!;
    return e.id === 'atual' ? `Atual · ${e.year}` : e.name;
  };
  const pickLeague = (id: string) => {
    setLeagueId(id);
    setSelected(null);
  };
  const pickEra = (id: string) => {
    setEraId(id);
    setSelected(null);
  };
  const assume = () => chosen && startCareer(chosen.club.id, eraId);

  if (wide) {
    return (
      <View className="flex-1">
        <View className="h-[72px] flex-row items-center gap-5 border-b border-line px-10">
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={backToMenu}>
            <Text className="font-sans text-xl text-mute">←</Text>
          </Pressable>
          <Title>Nova carreira · Escolha seu clube</Title>
          <View className="ml-auto">
            <Chips options={eraChips} value={eraId} onChange={pickEra} labelOf={eraLabel} />
          </View>
        </View>
        <View className="flex-1 flex-row">
          <View className="w-[240px] gap-1.5 border-r border-line px-6 py-8">
            <Label className="pb-2">País · Liga</Label>
            {topLeagues.map((l) => {
              const active = l.id === league.id;
              return (
                <Pressable
                  key={l.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => pickLeague(l.id)}
                  className={`rounded-[10px] px-3.5 py-[11px] ${active ? 'bg-s2' : 'active:bg-s2'}`}
                >
                  <Text className={`font-sanss text-sm ${active ? 'text-ink' : 'text-mute'}`}>{l.name}</Text>
                  <Text className="font-mono text-[11px] text-mute">{l.country}</Text>
                </Pressable>
              );
            })}
            <Muted className="mt-4 text-xs">
              {era.name} ({era.year}): {era.description}
            </Muted>
          </View>
          <ScrollView className="flex-1" contentContainerClassName="flex-row flex-wrap gap-3.5 p-8">
            {rows.map((r) => {
              const active = r.club.id === selected;
              return (
                <Pressable
                  key={r.club.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setSelected(r.club.id)}
                  className={`gap-3.5 rounded-[14px] bg-s1 p-[18px] ${active ? 'border-[1.5px] border-acc' : 'border-[1.5px] border-line'}`}
                  style={{ width: '31.5%' }}
                >
                  <View className="flex-row items-center gap-3">
                    <Crest id={r.club.id} short={r.club.shortName} size={44} />
                    <View className="flex-1 gap-0.5">
                      <Text className="font-sansb text-[15px] text-ink" numberOfLines={1}>
                        {r.club.name}
                      </Text>
                      <Text className="font-mono text-[11px] text-mute">REP {stars(r.club.reputation)} · {r.score}</Text>
                    </View>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="font-monom text-xs text-mute">{formatMoney(r.club.budget)}</Text>
                    <Text className="font-monom text-xs text-mute">{r.goal}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <View className="w-[420px] gap-[22px] border-l border-line bg-s1 px-9 py-10">
            {chosen ? (
              <>
                <Crest id={chosen.club.id} short={chosen.club.shortName} size={96} />
                <View className="gap-1.5">
                  <Num size={48} black className="uppercase">
                    {chosen.club.name}
                  </Num>
                  <Muted className="text-sm">
                    {league.name} · {chosen.club.tactic.formation}
                  </Muted>
                </View>
                <View className="flex-row flex-wrap gap-y-[18px]">
                  {[
                    ['Verba', formatMoney(chosen.club.budget)],
                    ['Folha', formatWage(chosen.bill)],
                    ['Força do elenco', String(chosen.score)],
                    ['Reputação', `${chosen.club.reputation}/100`],
                  ].map(([k, v]) => (
                    <View key={k} className="w-1/2 gap-1">
                      <Label>{k}</Label>
                      <Num size={24}>{v}</Num>
                    </View>
                  ))}
                </View>
                <View className="rounded-xl border border-line px-4 py-3.5">
                  <Text className="font-sans text-sm leading-5 text-ink">
                    <Text className="text-mute">Diretoria espera: </Text>
                    <Text className="font-sansb">{chosen.goal.toLowerCase()}</Text>.
                  </Text>
                </View>
                <View className="flex-1" />
                <Button size="lg" label={`Assumir ${chosen.club.name}`} onPress={assume} />
              </>
            ) : (
              <View className="flex-1 items-center justify-center">
                <Muted>Escolha um clube na lista.</Muted>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="gap-3 border-b border-line px-[18px] pb-3 pt-2.5">
        <View className="flex-row items-center gap-2.5">
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={backToMenu} hitSlop={12}>
            <Text className="font-sans text-xl text-mute">←</Text>
          </Pressable>
          <Title size={26}>Escolha seu clube</Title>
        </View>
        <Chips options={eraChips} value={eraId} onChange={pickEra} labelOf={eraLabel} />
        {eraId !== 'atual' ? <Muted className="text-xs">{era.description}</Muted> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0">
          <Tabs options={topLeagues.map((l) => l.id)} value={league.id} onChange={pickLeague} labelOf={(id) => topLeagues.find((l) => l.id === id)!.name} className="border-b-0" />
        </ScrollView>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(x) => x.club.id}
        contentContainerClassName="gap-1.5 px-3.5 py-2.5"
        renderItem={({ item }) => {
          const active = item.club.id === selected;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setSelected(item.club.id)}
              className={`flex-row items-center gap-3 rounded-xl border px-3 py-[11px] ${active ? 'border-acc bg-s1' : 'border-transparent active:bg-s2'}`}
            >
              <Crest id={item.club.id} short={item.club.shortName} size={36} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-sansb text-[14.5px] text-ink" numberOfLines={1}>
                  {item.club.name}
                </Text>
                <Text className="font-mono text-[11px] text-mute">
                  REP {stars(item.club.reputation)} · {formatMoney(item.club.budget)}
                </Text>
              </View>
              <Text className="max-w-[80px] text-right font-monom text-[10.5px] text-mute">{item.goal}</Text>
            </Pressable>
          );
        }}
      />
      <View className="gap-2.5 border-t border-line bg-s1 px-3.5 pb-[18px] pt-3">
        <View className="flex-row justify-between">
          <Muted className="text-[12.5px]">Diretoria espera</Muted>
          <Text className="font-sansb text-[12.5px] text-ink">{chosen?.goal ?? '—'}</Text>
        </View>
        <Button label={chosen ? `Assumir ${chosen.club.name}` : 'Selecione um clube'} disabled={!chosen} onPress={assume} />
      </View>
    </View>
  );
}
