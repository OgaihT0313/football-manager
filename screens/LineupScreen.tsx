// Escalação: formação, tática e o XI vaga a vaga. Toque numa vaga para escolher o jogador.

import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { LEVEL_LABEL, POS_LABEL } from '../components/labels';
import { Badge, Button, Card, FitnessBar, Muted, SectionTitle, Segmented, Strong } from '../components/ui';
import { userLineup } from '../src/career/career';
import { familiarity, FORMATION_LIST, FORMATIONS } from '../src/domain/positions';
import type { Level, Player, Position } from '../src/domain/types';
import { slotRating } from '../src/engine/lineup';
import { teamStrength } from '../src/engine/matchEngine';
import { selectCareer, useGame } from '../store/gameStore';

const LEVELS: readonly Level[] = [1, 2, 3, 4, 5];
const TACTIC_ROWS = [
  { key: 'pressing', label: 'Pressão' },
  { key: 'lineHeight', label: 'Linha defensiva' },
  { key: 'tempo', label: 'Ritmo' },
] as const;

export function LineupScreen() {
  const career = useGame(selectCareer)!;
  const setFormation = useGame((s) => s.setFormation);
  const setTacticLevel = useGame((s) => s.setTacticLevel);
  const setSlot = useGame((s) => s.setSlot);
  const autoXI = useGame((s) => s.autoXI);
  const [picking, setPicking] = useState<number | null>(null);

  const { clubs, userClubId, players, season } = career;
  const club = clubs[userClubId]!;
  const positions = FORMATIONS[club.tactic.formation];
  const lineup = useMemo(() => userLineup(career), [career]);
  const strength = useMemo(() => teamStrength(lineup, positions), [lineup, positions]);

  // Jogador efetivo em cada vaga (o escolhido, ou o reserva que entra se ele estiver fora).
  const effective = useMemo(() => {
    const remaining = lineup.slots.slice();
    return positions.map((pos) => {
      const i = remaining.findIndex((s) => s.pos === pos);
      return i >= 0 ? remaining.splice(i, 1)[0]! : null;
    });
  }, [lineup, positions]);

  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
        <Header title="Escalação" subtitle={`${club.tactic.formation} · próxima rodada ${Math.min(season.nextRound, season.totalRounds)}`} />

        <Card>
          <SectionTitle>Formação</SectionTitle>
          <Segmented options={FORMATION_LIST} value={club.tactic.formation} onChange={setFormation} />
          <Muted className="mt-2">Trocar a formação refaz o XI automaticamente.</Muted>
        </Card>

        <Card>
          <SectionTitle>Força atual</SectionTitle>
          <View className="flex-row justify-between">
            {[
              ['Ataque', strength.attack],
              ['Meio', strength.midfield],
              ['Defesa', strength.defense],
              ['Goleiro', strength.goalkeeper],
            ].map(([label, v]) => (
              <View key={label as string} className="items-center">
                <Text className="text-xl font-bold text-slate-900 dark:text-white">{Math.round(v as number)}</Text>
                <Muted>{label as string}</Muted>
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <View className="mb-2 flex-row items-center justify-between">
            <SectionTitle>Titulares</SectionTitle>
            <Button variant="ghost" label="Automática" onPress={autoXI} />
          </View>
          {positions.map((pos, i) => {
            const chosenId = club.startingXI[i];
            const chosen = chosenId ? players[chosenId] : undefined;
            const slot = effective[i];
            const p = slot ? players[slot.playerId] : undefined;
            const replaced = !!chosen && !!p && chosen.id !== p.id;
            const fam = p ? familiarity(p, pos) : 1;
            return (
              <Pressable
                key={`${pos}-${i}`}
                accessibilityRole="button"
                onPress={() => setPicking(i)}
                className="flex-row items-center gap-2 border-b border-slate-200 py-2.5 active:bg-slate-100 dark:border-slate-800 dark:active:bg-slate-800"
              >
                <Text className="w-10 text-xs font-bold text-slate-600 dark:text-slate-300">{POS_LABEL[pos]}</Text>
                <View className="flex-1">
                  <Text className="text-slate-900 dark:text-slate-100" numberOfLines={1}>
                    {p?.name ?? '— vaga vazia —'}
                  </Text>
                  {replaced ? <Muted>no lugar de {chosen!.name} (fora)</Muted> : null}
                  {p && fam < 1 ? (
                    <Muted>{p.positions.includes(pos) ? 'posição secundária' : `fora de posição (${Math.round(fam * 100)}%)`}</Muted>
                  ) : null}
                </View>
                {p ? <FitnessBar value={p.fitness ?? 100} /> : null}
                <Text className="w-9 text-right font-bold text-slate-900 dark:text-white">{slot ? Math.round(slot.rating) : '-'}</Text>
              </Pressable>
            );
          })}
        </Card>

        <Card>
          <SectionTitle>Tática</SectionTitle>
          {TACTIC_ROWS.map((row) => (
            <View key={row.key} className="mb-3">
              <View className="mb-1 flex-row justify-between">
                <Strong className="text-sm">{row.label}</Strong>
                <Muted>{LEVEL_LABEL[row.key][club.tactic[row.key] - 1]}</Muted>
              </View>
              <Segmented options={LEVELS} value={club.tactic[row.key]} onChange={(v) => setTacticLevel(row.key, v)} />
            </View>
          ))}
          <Muted>Pressão alta cansa mais. Linha alta e ritmo alto criam mais, mas expõem a defesa.</Muted>
        </Card>
      </ScrollView>

      {picking !== null ? (
        <PlayerPicker
          pos={positions[picking]!}
          currentId={club.startingXI[picking]}
          squad={club.squad.map((id) => players[id]!).filter(Boolean)}
          xi={club.startingXI}
          status={season.status}
          onPick={(id) => {
            setSlot(picking, id);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </View>
  );
}

function PlayerPicker({
  pos,
  currentId,
  squad,
  xi,
  status,
  onPick,
  onClose,
}: {
  pos: Position;
  currentId: string | undefined;
  squad: Player[];
  xi: string[];
  status: Record<string, { out: number; reason: string | null }>;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const sorted = useMemo(() => squad.slice().sort((a, b) => slotRating(b, pos) - slotRating(a, pos)), [squad, pos]);
  return (
    <View className="absolute inset-0 bg-black/50">
      <Pressable accessibilityLabel="Fechar" className="flex-1" onPress={onClose} />
      <View className="max-h-[75%] rounded-t-3xl bg-white dark:bg-slate-900" style={{ paddingBottom: insets.bottom }}>
        <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
          <Strong>Escolher {POS_LABEL[pos]}</Strong>
          <Button variant="ghost" label="Fechar" onPress={onClose} />
        </View>
        <FlatList
          data={sorted}
          keyExtractor={(p) => p.id}
          contentContainerClassName="px-4 pb-4"
          renderItem={({ item: p }) => {
            const st = status[p.id];
            const out = !!st && st.out > 0;
            const inXI = xi.includes(p.id);
            const fam = familiarity(p, pos);
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => onPick(p.id)}
                className={`flex-row items-center gap-2 border-b border-slate-200 py-2.5 active:bg-slate-100 dark:border-slate-800 dark:active:bg-slate-800 ${p.id === currentId ? 'bg-green-50 dark:bg-green-950' : ''}`}
              >
                <Text className="w-10 text-xs font-bold text-slate-600 dark:text-slate-300">{POS_LABEL[p.positions[0]!]}</Text>
                <View className="flex-1 flex-row items-center gap-1.5">
                  <Text className={`shrink text-slate-900 dark:text-slate-100 ${out ? 'opacity-50' : ''}`} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {inXI ? <Badge tone="good" label="XI" /> : null}
                  {out ? <Badge tone={st!.reason === 'injury' ? 'bad' : 'warn'} label={st!.reason === 'injury' ? 'Lesão' : 'Susp.'} /> : null}
                  {fam < 1 ? <Badge tone="warn" label={`${Math.round(fam * 100)}%`} /> : null}
                </View>
                <FitnessBar value={p.fitness ?? 100} />
                <Text className="w-9 text-right font-bold text-slate-900 dark:text-white">{Math.round(slotRating(p, pos))}</Text>
              </Pressable>
            );
          }}
        />
      </View>
    </View>
  );
}
