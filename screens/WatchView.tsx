// Assistir à partida em 2D (Fase 6): a encenação vem do diretor (src/engine/watchDirector.ts),
// o desenho do Skia (components/Pitch2D.tsx). O relógio anda num laço de quadros com
// velocidade escolhida; dá para pausar, acelerar e pular para o fim.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PitchCanvas } from '../components/PitchCanvas';
import { Button, Muted, Segmented } from '../components/ui';
import { FORMATIONS } from '../src/domain/positions';
import type { Club, MatchResult, Player, Position } from '../src/domain/types';
import { directMatch, formationSpots, MATCH_SECONDS, playerSpots, sampleAt, scoreAt, type WatchMark } from '../src/engine/watchDirector';

/** Segundos de jogo por segundo real. */
const SPEEDS = { lento: 20, normal: 60, rapido: 180 } as const;
type Speed = keyof typeof SPEEDS;
const SPEED_LABEL: Record<Speed, string> = { lento: '1x', normal: '3x', rapido: '9x' };

const MARK_LABEL: Record<WatchMark['type'], string> = { goal: 'GOL', yellow: 'Amarelo', red: 'Vermelho', injury: 'Lesão' };

/** Ordena o XI nas vagas da formação do clube, pela posição principal de cada um. */
function orderXI(club: Club, xi: string[], players: Record<string, Player>): Position[] {
  const slots = FORMATIONS[club.tactic.formation].slice();
  const out: Position[] = [];
  const free = slots.slice();
  for (const id of xi) {
    const pos = players[id]?.positions ?? [];
    const i = free.findIndex((s) => pos[0] === s);
    const j = i >= 0 ? i : free.findIndex((s) => pos.includes(s));
    const k = j >= 0 ? j : 0;
    out.push(free[k] ?? 'CM');
    free.splice(k, 1);
  }
  // Goleiro sempre primeiro (o desenho pinta o índice 0 de outra cor).
  const gk = out.indexOf('GK');
  if (gk > 0) [out[0], out[gk]] = [out[gk]!, out[0]!];
  return out;
}

export function WatchView({
  result,
  clubs,
  players,
  seed,
  onClose,
}: {
  result: MatchResult;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  seed: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const script = useMemo(() => directMatch(result, seed), [result, seed]);
  const home = clubs[result.homeId]!;
  const away = clubs[result.awayId]!;
  const homeSpots = useMemo(() => formationSpots(orderXI(home, result.homeXI, players)), [home, result.homeXI, players]);
  const awaySpots = useMemo(() => formationSpots(orderXI(away, result.awayXI, players)), [away, result.awayXI, players]);

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>('normal');
  const tRef = useRef(0);
  tRef.current = t;

  useEffect(() => {
    if (!playing) return;
    let last: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      // Aparelho lento (poucos quadros): o relógio segue o tempo real, só não salta mais de 0,5 s.
      const dt = last === null ? 0 : Math.min(0.5, (now - last) / 1000);
      last = now;
      const next = Math.min(MATCH_SECONDS, tRef.current + dt * SPEEDS[speed]);
      setT(next);
      if (next >= MATCH_SECONDS) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const state = sampleAt(script, t);
  const [hg, ag] = scoreAt(script, result, t);
  const minute = Math.min(90, Math.floor(t / 60) + (t > 0 ? 1 : 0));
  const recent = script.marks.filter((m) => m.t <= t).slice(-4).reverse();
  const fresh = state.last && t - state.last.t < 6 ? state.last : null;
  // Campo cabe na largura e deixa espaço para placar e controles.
  const pitchW = Math.min(winW - 32, 440, Math.round((winH - insets.top - insets.bottom - 260) / 1.55));
  const ended = t >= MATCH_SECONDS;

  return (
    <View className="absolute inset-0 bg-slate-950" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerClassName="items-center gap-3 px-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View className="w-full flex-row items-center pt-2">
          <View className="h-3 w-3 rounded-full bg-blue-600" />
          <Text className="ml-1.5 flex-1 text-sm font-semibold text-white" numberOfLines={1}>
            {home.shortName}
          </Text>
          <Text className="mx-2 text-3xl font-black text-white">
            {hg} x {ag}
          </Text>
          <Text className="mr-1.5 flex-1 text-right text-sm font-semibold text-white" numberOfLines={1}>
            {away.shortName}
          </Text>
          <View className="h-3 w-3 rounded-full bg-red-600" />
        </View>
        <Text className="text-sm font-bold text-green-400">{ended ? 'Fim de jogo' : state.kind === 'intervalo' ? 'Intervalo' : `${minute}′`}</Text>

        <View className="overflow-hidden rounded-xl">
          <PitchCanvas
            width={pitchW}
            ball={{ x: state.x, y: state.y }}
            home={playerSpots(homeSpots, 'home', state)}
            away={playerSpots(awaySpots, 'away', state)}
            goal={state.kind === 'gol'}
          />
        </View>

        <View className="h-8 justify-center">
          {fresh ? (
            <Text className={`text-base font-black ${fresh.type === 'goal' ? 'text-green-400' : 'text-amber-300'}`}>
              {MARK_LABEL[fresh.type]} · {players[fresh.playerId]?.name ?? ''} ({clubs[fresh.clubId]?.shortName})
            </Text>
          ) : null}
        </View>

        <View className="w-full flex-row gap-2">
          <Button
            className="flex-1"
            label={ended ? 'Rever' : playing ? 'Pausar' : 'Continuar'}
            onPress={() => {
              if (ended) setT(0);
              setPlaying(ended ? true : !playing);
            }}
          />
          <Button className="flex-1" variant="secondary" label="Pular para o fim" onPress={() => { setT(MATCH_SECONDS); setPlaying(false); }} />
        </View>
        <View className="w-full">
          <Segmented options={['lento', 'normal', 'rapido'] as Speed[]} value={speed} onChange={setSpeed} labelOf={(s) => SPEED_LABEL[s]} />
        </View>

        <View className="w-full">
          {recent.map((m, i) => (
            <Muted key={i} className="text-xs text-slate-400">
              {m.minute}′ {MARK_LABEL[m.type]} · {players[m.playerId]?.name ?? ''} ({clubs[m.clubId]?.shortName})
            </Muted>
          ))}
          <Muted className="mt-1 text-xs text-slate-500">
            Chutes {script.shots.home} x {script.shots.away}. A encenação segue o resultado do motor: placar, minutos dos gols e cartões são os da partida.
          </Muted>
        </View>
        <Button variant="ghost" label="Voltar ao detalhe" onPress={onClose} />
      </ScrollView>
    </View>
  );
}
