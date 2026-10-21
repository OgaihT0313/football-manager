// Escalação e tática: o XI desenhado no campo (toque na vaga para escolher o jogador), formação,
// pressão, linha defensiva e ritmo em 5 níveis, força do time e reservas.
// Celular: campo em pé (ataque para cima). PC: campo deitado e coluna com tática e reservas.

import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { LEVEL_LABEL, POS_LABEL, POS_ORDER } from '../components/labels';
import { Sheet } from '../components/Sheet';
import { useTokens, useWide } from '../components/theme';
import { Badge, Button, Card, Chips, CondBar, Label, Muted, Num, Title } from '../components/ui';
import { userLineup } from '../src/career/career';
import { familiarity, FORMATION_LIST, FORMATIONS } from '../src/domain/positions';
import type { Level, Player, Position } from '../src/domain/types';
import { slotRating } from '../src/engine/lineup';
import { teamStrength } from '../src/engine/matchEngine';
import { formationSpots } from '../src/engine/watchDirector';
import { selectCareer, useGame } from '../store/gameStore';

const TACTIC_ROWS = [
  { key: 'pressing', label: 'Pressão' },
  { key: 'lineHeight', label: 'Linha defensiva' },
  { key: 'tempo', label: 'Ritmo' },
] as const;

interface SlotView {
  pos: Position;
  player: Player | undefined;
  rating: number | null;
  /** Escolhido está fora e outro entra no lugar. */
  replaced: Player | undefined;
}

export function LineupScreen() {
  const wide = useWide();
  const career = useGame(selectCareer)!;
  const setFormation = useGame((s) => s.setFormation);
  const setTacticLevel = useGame((s) => s.setTacticLevel);
  const setSlot = useGame((s) => s.setSlot);
  const autoXI = useGame((s) => s.autoXI);
  const [picking, setPicking] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const { clubs, userClubId, players, season } = career;
  const club = clubs[userClubId]!;
  const positions = FORMATIONS[club.tactic.formation];
  const lineup = useMemo(() => userLineup(career), [career]);
  const strength = useMemo(() => teamStrength(lineup, positions), [lineup, positions]);
  const spots = useMemo(() => formationSpots(positions), [positions]);

  // Jogador efetivo em cada vaga (o escolhido, ou o reserva que entra se ele estiver fora).
  const slots = useMemo<SlotView[]>(() => {
    const remaining = lineup.slots.slice();
    return positions.map((pos, i) => {
      const k = remaining.findIndex((s) => s.pos === pos);
      const s = k >= 0 ? remaining.splice(k, 1)[0]! : null;
      const chosen = club.startingXI[i] ? players[club.startingXI[i]!] : undefined;
      const player = s ? players[s.playerId] : undefined;
      return { pos, player, rating: s ? s.rating : null, replaced: chosen && player && chosen.id !== player.id ? chosen : undefined };
    });
  }, [lineup, positions, club.startingXI, players]);

  const inXI = new Set(slots.map((s) => s.player?.id).filter(Boolean));
  const bench = club.squad
    .map((id) => players[id]!)
    .filter((p) => p && !inXI.has(p.id))
    .sort((a, b) => POS_ORDER[a.positions[0]!] - POS_ORDER[b.positions[0]!] || b.ovr - a.ovr);

  const tactic = (
    <View className={wide ? 'gap-4' : 'gap-2.5'}>
      {TACTIC_ROWS.map((row) => {
        const v = club.tactic[row.key];
        return (
          <View key={row.key} className="gap-1.5">
            <View className="flex-row justify-between">
              <Text className="font-sans text-mute" style={{ fontSize: wide ? 14 : 12.5 }}>
                {row.label}
              </Text>
              <Text className="font-sansb text-ink" style={{ fontSize: wide ? 14 : 12.5 }}>
                {LEVEL_LABEL[row.key][v - 1]}
              </Text>
            </View>
            <View className="flex-row gap-[3px]">
              {[1, 2, 3, 4, 5].map((k) => (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.label}: ${LEVEL_LABEL[row.key][k - 1]}`}
                  accessibilityState={{ selected: k === v }}
                  onPress={() => setTacticLevel(row.key, k as Level)}
                  hitSlop={{ top: 10, bottom: 10 }}
                  className="flex-1 justify-center py-1"
                >
                  <View className={`rounded-sm ${k <= v ? 'bg-acc' : 'bg-s2'}`} style={{ height: wide ? 8 : 6 }} />
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
      <Muted className="text-xs">Pressão alta cansa mais. Linha e ritmo altos criam mais, mas expõem a defesa.</Muted>
    </View>
  );

  const strengthRow = (
    <View className="flex-row justify-between">
      {(
        [
          ['Ataque', strength.attack],
          ['Meio', strength.midfield],
          ['Defesa', strength.defense],
          ['Goleiro', strength.goalkeeper],
        ] as const
      ).map(([label, v]) => (
        <View key={label} className="items-center">
          <Num size={wide ? 26 : 22}>{Math.round(v)}</Num>
          <Label className="text-[10px]">{label}</Label>
        </View>
      ))}
    </View>
  );

  const picker =
    picking !== null ? (
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
    ) : null;

  if (wide) {
    return (
      <View className="flex-1">
        <View className="flex-1 flex-row gap-8 px-12 py-9">
          <View className="flex-1 gap-[18px]">
            <View className="flex-row items-center gap-4">
              <Title size={40}>Escalação</Title>
              <Text className="font-mono text-xs uppercase text-mute">Clique na vaga para escolher o jogador</Text>
              <View className="ml-auto">
                <Chips options={FORMATION_LIST} value={club.tactic.formation} onChange={setFormation} mono />
              </View>
            </View>
            <Pitch slots={slots} spots={spots} horizontal onSlot={setPicking} />
          </View>
          <ScrollView className="w-[380px] grow-0" contentContainerClassName="gap-[18px]">
            <Card className="gap-4 rounded-2xl p-[22px]">
              <Label>Tática</Label>
              {tactic}
            </Card>
            <Card className="gap-3 rounded-2xl p-[22px]">
              <Label>Força do XI</Label>
              {strengthRow}
            </Card>
            <Card className="rounded-2xl p-[22px]">
              <View className="flex-row justify-between pb-2">
                <Label>Reservas · {bench.length}</Label>
                <Pressable accessibilityRole="button" onPress={autoXI}>
                  <Label className="text-acct">Auto</Label>
                </Pressable>
              </View>
              {bench.map((b) => (
                <View key={b.id} className="h-[42px] flex-row items-center gap-2.5 border-t border-line">
                  <Text className="w-11 font-monob text-[11.5px] text-mute">{POS_LABEL[b.positions[0]!]}</Text>
                  <Text className="flex-1 font-sanss text-sm text-ink" numberOfLines={1}>
                    {b.name}
                  </Text>
                  {season.status[b.id]?.out ? <Badge tone="bad" label="Fora" /> : null}
                  <Text className="w-[34px] text-right font-disp text-[17px] text-ink">{b.ovr}</Text>
                </View>
              ))}
            </Card>
          </ScrollView>
        </View>
        {picker}
      </View>
    );
  }

  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="gap-3 pb-8">
        <View className="flex-row items-center justify-between px-[18px] pb-1 pt-2">
          <Title>Escalação</Title>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Trocar formação"
            onPress={() => setFormOpen(!formOpen)}
            className="flex-row items-center gap-1.5 rounded-[10px] border border-line bg-s1 px-3 py-[7px]"
          >
            <Text className="font-monob text-sm text-ink">{club.tactic.formation}</Text>
            <Text className="font-mono text-[11px] text-mute">▾</Text>
          </Pressable>
        </View>
        {formOpen ? (
          <View className="px-3.5">
            <Chips
              options={FORMATION_LIST}
              value={club.tactic.formation}
              mono
              onChange={(f) => {
                setFormation(f);
                setFormOpen(false);
              }}
            />
            <Muted className="mt-1.5 text-xs">Trocar a formação refaz o XI automaticamente.</Muted>
          </View>
        ) : null}
        <View className="px-3.5">
          <Pitch slots={slots} spots={spots} onSlot={setPicking} />
        </View>
        <View className="gap-3 px-3.5">
          {tactic}
          {strengthRow}
          <Pressable
            accessibilityRole="button"
            onPress={autoXI}
            className="flex-row items-center justify-between rounded-xl border border-dashed border-line px-3 py-2.5 active:bg-s2"
          >
            <Text className="font-sans text-[12.5px] text-mute">Reservas · {bench.length}</Text>
            <Text className="font-sansb text-[12.5px] text-acct">Escalação automática →</Text>
          </Pressable>
        </View>
      </ScrollView>
      {picker}
    </View>
  );
}

/** Campo com o XI. Vertical: ataque para cima. Horizontal: ataque para a direita. */
function Pitch({ slots, spots, horizontal = false, onSlot }: { slots: SlotView[]; spots: [number, number][]; horizontal?: boolean; onSlot: (i: number) => void }) {
  const t = useTokens();
  const lineStyle = { borderColor: t.pl, borderWidth: horizontal ? 2 : 1.5 };
  const inset = horizontal ? 18 : 10;
  const size = horizontal ? 48 : 32;
  const labelW = horizontal ? 110 : 70;
  // Profundidade do diretor (0,05 = goleiro, 0,68 = atacante) vira porcentagem do campo.
  const depth = (x: number) => (x - 0.05) / 0.63;
  return (
    <View className={`overflow-hidden ${horizontal ? 'flex-1 rounded-[20px]' : 'h-[350px] rounded-2xl'}`} style={{ backgroundColor: t.pitch, minHeight: horizontal ? 480 : undefined }}>
      <View className="absolute rounded" style={[lineStyle, { left: inset, right: inset, top: inset, bottom: inset }]} />
      {horizontal ? (
        <>
          <View className="absolute left-1/2" style={{ top: inset, bottom: inset, borderLeftWidth: 2, borderColor: t.pl }} />
          <View className="absolute left-1/2 top-1/2 rounded-full" style={[lineStyle, { width: 140, height: 140, marginLeft: -70, marginTop: -70 }]} />
          <View className="absolute" style={[lineStyle, { top: '28%', bottom: '28%', left: inset, width: 110, borderLeftWidth: 0 }]} />
          <View className="absolute" style={[lineStyle, { top: '28%', bottom: '28%', right: inset, width: 110, borderRightWidth: 0 }]} />
        </>
      ) : (
        <>
          <View className="absolute top-1/2" style={{ left: inset, right: inset, borderTopWidth: 1.5, borderColor: t.pl }} />
          <View className="absolute left-1/2 top-1/2 rounded-full" style={[lineStyle, { width: 70, height: 70, marginLeft: -35, marginTop: -35 }]} />
          <View className="absolute" style={[lineStyle, { left: '28%', right: '28%', top: inset, height: 46, borderTopWidth: 0 }]} />
          <View className="absolute" style={[lineStyle, { left: '28%', right: '28%', bottom: inset, height: 46, borderBottomWidth: 0 }]} />
        </>
      )}
      {slots.map((s, i) => {
        const [x, y] = spots[i] ?? [0.5, 0.5];
        const hi = (s.rating ?? 0) >= 80;
        const left = horizontal ? 7 + depth(x) * 77 : y * 100;
        const top = horizontal ? y * 100 : 89 - depth(x) * 73;
        const name = s.player ? s.player.name.split(' ').slice(-1)[0] : 'Vaga';
        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`${POS_LABEL[s.pos]}: ${s.player?.name ?? 'vaga vazia'}`}
            onPress={() => onSlot(i)}
            className="absolute items-center"
            style={{ left: `${left}%`, top: `${top}%`, width: labelW, marginLeft: -labelW / 2, marginTop: -size / 2, gap: horizontal ? 5 : 3 }}
          >
            <View
              className="items-center justify-center rounded-full"
              style={{ width: size, height: size, borderWidth: 2, backgroundColor: hi ? t.acc : t.s1, borderColor: s.replaced ? t.neg : hi ? t.acc : t.pl }}
            >
              <Text className="font-disp" style={{ fontSize: horizontal ? 20 : 14, color: hi ? t.onacc : t.ink }}>
                {s.rating !== null ? Math.round(s.rating) : '–'}
              </Text>
            </View>
            <View className="items-center rounded" style={{ backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: horizontal ? 8 : 5, paddingVertical: horizontal ? 3 : 1 }}>
              <Text className="font-sanss text-white" style={{ fontSize: horizontal ? 12 : 10 }} numberOfLines={1}>
                {name}
              </Text>
              {horizontal ? <Text className="font-monom text-[9.5px] text-white/70">{POS_LABEL[s.pos]}</Text> : null}
            </View>
          </Pressable>
        );
      })}
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
  const sorted = useMemo(() => squad.slice().sort((a, b) => slotRating(b, pos) - slotRating(a, pos)), [squad, pos]);
  return (
    <Sheet title={`Escolher ${POS_LABEL[pos]}`} onClose={onClose}>
      <FlatList
        data={sorted}
        scrollEnabled={false}
        keyExtractor={(p) => p.id}
        renderItem={({ item: p }) => {
          const st = status[p.id];
          const out = !!st && st.out > 0;
          const inXI = xi.includes(p.id);
          const fam = familiarity(p, pos);
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onPick(p.id)}
              className={`flex-row items-center gap-2 border-b border-line px-1 py-2.5 active:bg-s2 ${p.id === currentId ? 'bg-s2' : ''}`}
            >
              <Text className="w-10 font-monob text-[11px] text-mute">{POS_LABEL[p.positions[0]!]}</Text>
              <View className="flex-1 flex-row items-center gap-1.5">
                <Text className={`shrink font-sanss text-[13.5px] text-ink ${out ? 'opacity-50' : ''}`} numberOfLines={1}>
                  {p.name}
                </Text>
                {inXI ? <Badge tone="acc" label="XI" /> : null}
                {out ? <Badge tone="bad" label={st!.reason === 'injury' ? 'Lesão' : 'Susp.'} /> : null}
                {fam < 1 ? <Badge tone="warn" label={`${Math.round(fam * 100)}%`} /> : null}
              </View>
              <CondBar value={p.fitness ?? 100} />
              <Text className="w-9 text-right font-disp text-lg text-ink">{Math.round(slotRating(p, pos))}</Text>
            </Pressable>
          );
        }}
      />
      <Button variant="secondary" label="Fechar" onPress={onClose} />
    </Sheet>
  );
}
