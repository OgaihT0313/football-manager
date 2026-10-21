// Partida: placar, pressão do jogo, estatísticas, lances, campo 2D e notas. Logo depois de jogada
// (store.matchLive), a partida passa "ao vivo" do minuto 0 com pausa e velocidade; aberta depois,
// mostra o fim e dá para assistir de novo. A encenação vem de src/engine/watchDirector.ts: placar,
// minutos dos gols e cartões são os do motor.
// Celular: placar no topo, abas Lances / Campo 2D e controles no rodapé. PC: lances | campo e
// pressão | estatísticas, velocidade e notas.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PitchCanvas } from '../components/PitchCanvas';
import { pitchHeight } from '../components/pitchSize';
import { rivalColor, useTokens, useWide } from '../components/theme';
import { Button, Card, Crest, Label, Muted, Segmented } from '../components/ui';
import { findResult, type CompetitionState } from '../src/competitions/world';
import { FORMATIONS } from '../src/domain/positions';
import type { Club, MatchEvent, MatchResult, Player, Position } from '../src/domain/types';
import {
  directMatch, formationSpots, liveStats, MATCH_SECONDS, playerSpots, pressureSeries, sampleAt, scoreAt, type WatchMark,
} from '../src/engine/watchDirector';
import { selectCareer, useGame } from '../store/gameStore';

/** Segundos de jogo por segundo real. */
const SPEEDS = { '1×': 20, '3×': 60, '9×': 180, 'Rápido': 600 } as const;
type Speed = keyof typeof SPEEDS;
const SPEED_LIST = Object.keys(SPEEDS) as Speed[];

const minuteLabel = (m: number) => (m > 90 ? `90+${m - 90}′` : `${m}′`);

/** Ordena o XI nas vagas da formação do clube, pela posição principal de cada um. */
function orderXI(club: Club, xi: string[], players: Record<string, Player>): Position[] {
  const free = FORMATIONS[club.tactic.formation].slice();
  const out: Position[] = [];
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

function stageName(comp: CompetitionState, fixtureId: string): string {
  const fx = comp.fixtures.find((f) => f.id === fixtureId);
  if (!fx) return comp.name;
  if (comp.kind === 'league') return `${comp.name} · R${fx.round}`;
  if (comp.kind === 'europe' && comp.stages[0]?.fixtureIds.includes(fx.id)) return `${comp.name} · fase de liga`;
  return `${comp.name} · ${comp.stages[fx.round - 1]?.name ?? ''}`;
}

export function MatchDetailScreen({ fixtureId }: { fixtureId: string }) {
  const career = useGame(selectCareer)!;
  const found = findResult(career.season, fixtureId);
  if (!found) return null;
  return <Match key={fixtureId} result={found.result} comp={found.comp} />;
}

function Match({ result: r, comp }: { result: MatchResult; comp: CompetitionState }) {
  const wide = useWide();
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const career = useGame(selectCareer)!;
  const close = useGame((s) => s.openMatch);
  const live = useGame((s) => s.matchLive);
  const { clubs, players, seed } = career;
  const home = clubs[r.homeId]!;
  const away = clubs[r.awayId]!;
  const detailed = r.homeXI.length > 0 && r.awayXI.length > 0;
  const awayColor = rivalColor(away.id);

  const script = useMemo(() => directMatch(r, seed), [r, seed]);
  const homeSpots = useMemo(() => (detailed ? formationSpots(orderXI(home, r.homeXI, players)) : []), [detailed, home, r.homeXI, players]);
  const awaySpots = useMemo(() => (detailed ? formationSpots(orderXI(away, r.awayXI, players)) : []), [detailed, away, r.awayXI, players]);

  const [time, setTime] = useState(live ? 0 : MATCH_SECONDS);
  const [playing, setPlaying] = useState(live);
  const [speed, setSpeed] = useState<Speed>('3×');
  const [tab, setTab] = useState<'lances' | 'campo'>('lances');
  const tRef = useRef(time);
  tRef.current = time;

  useEffect(() => {
    if (!playing) return;
    let last: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      // Aparelho lento (poucos quadros): o relógio segue o tempo real, sem saltar mais de 0,5 s.
      const dt = last === null ? 0 : Math.min(0.5, (now - last) / 1000);
      last = now;
      const next = Math.min(MATCH_SECONDS, tRef.current + dt * SPEEDS[speed]);
      setTime(next);
      if (next >= MATCH_SECONDS) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const ended = time >= MATCH_SECONDS;
  const state = sampleAt(script, time);
  const [hg, ag] = ended ? [r.homeGoals, r.awayGoals] : scoreAt(script, r, time);
  const minute = Math.min(90, Math.floor(time / 60) + (time > 0 ? 1 : 0));
  const minuteKey = Math.floor(time / 30);
  const stats = useMemo(() => liveStats(script, time), [script, minuteKey]);
  const pressure = useMemo(() => pressureSeries(script, time, wide ? 34 : 24), [script, minuteKey, wide]);
  const marks = script.marks.filter((m) => m.t <= time).reverse();
  const cards = (side: 'home' | 'away') => marks.filter((m) => (m.type === 'yellow' || m.type === 'red') && (m.clubId === r.homeId) === (side === 'home')).length;

  const status = ended ? 'Fim de jogo' : state.kind === 'intervalo' ? 'Intervalo' : minuteLabel(minute);
  const restart = () => {
    setTime(0);
    setPlaying(true);
  };
  const toEnd = () => {
    setTime(MATCH_SECONDS);
    setPlaying(false);
  };

  const liveBadge = (
    <View className="flex-row items-center gap-1.5">
      {!ended && (playing || time > 0) ? <View className="h-1.5 w-1.5 rounded-full bg-neg" /> : null}
      <Text className={`font-monom uppercase tracking-[1px] ${!ended && time > 0 ? 'text-neg' : 'text-mute'}`} style={{ fontSize: wide ? 11 : 10.5 }}>
        {ended ? 'Encerrado' : time > 0 ? 'Ao vivo' : 'Pré-jogo'}
        {wide ? ` · ${stageName(comp, r.fixtureId)}` : ''}
      </Text>
    </View>
  );

  const score = (size: number) => (
    <View className="items-center">
      <Text className="font-disp9 text-ink" style={{ fontSize: size, lineHeight: size * 0.95 }}>
        {hg}
        <Text className="text-mute">{wide ? '  :  ' : ' : '}</Text>
        {ag}
      </Text>
      <Text className="font-monob text-acct" style={{ fontSize: wide ? 18 : 14 }}>
        {status}
      </Text>
      {ended && r.shootoutWinnerId ? <Text className="font-mono text-[11px] text-mute">{clubs[r.shootoutWinnerId]?.shortName} nos pênaltis</Text> : null}
    </View>
  );

  const pressureChart = (height: number) => (
    <View className="gap-1.5">
      <View className="flex-row justify-between">
        <Text className="font-monom text-[10px] uppercase text-mute">Pressão do jogo</Text>
        <Text className="font-monom text-[10px] text-mute">0′ — {minuteLabel(Math.max(1, minute))}</Text>
      </View>
      <View className="flex-row items-center gap-[2px]" style={{ height }}>
        {pressure.map((v, i) => (
          <View key={i} className="h-full flex-1 justify-center">
            <View style={{ height: Math.max(0, v ?? 0) * (height / 2), backgroundColor: t.acc, borderRadius: 1 }} />
            <View style={{ height: Math.max(0, -(v ?? 0)) * (height / 2), backgroundColor: awayColor, borderRadius: 1 }} />
            {v === null ? <View className="h-px bg-line" /> : null}
          </View>
        ))}
      </View>
    </View>
  );

  const statRows: [string, number | string, number | string, number, number][] = [
    ['Posse', `${stats.possession}%`, `${100 - stats.possession}%`, stats.possession, 100 - stats.possession],
    ['Finalizações', stats.shots.home, stats.shots.away, stats.shots.home, stats.shots.away],
    ['No alvo', stats.onTarget.home, stats.onTarget.away, stats.onTarget.home, stats.onTarget.away],
    ['Cartões', cards('home'), cards('away'), cards('home'), cards('away')],
    ...(ended ? ([['Gols esperados', fmtXg(r.homeXg), fmtXg(r.awayXg), r.homeXg, r.awayXg]] as [string, string, string, number, number][]) : []),
  ];
  const statsBlock = (
    <View className="gap-[7px]">
      {statRows.map(([label, h, a, hf, af]) => (
        <View key={label} className="flex-row items-center gap-2">
          <Text className="w-[38px] font-monob text-xs text-ink">{h}</Text>
          <View className="flex-1 gap-[3px]">
            <Text className="text-center font-sans text-[11px] text-mute">{label}</Text>
            <View className="h-1 flex-row gap-[2px]">
              {hf + af > 0 ? (
                <>
                  {hf > 0 ? <View style={{ flex: hf, backgroundColor: t.acc, borderRadius: 2 }} /> : null}
                  {af > 0 ? <View style={{ flex: af, backgroundColor: awayColor, borderRadius: 2 }} /> : null}
                </>
              ) : (
                <View className="flex-1 rounded-sm bg-s2" />
              )}
            </View>
          </View>
          <Text className="w-[38px] text-right font-monob text-xs text-ink">{a}</Text>
        </View>
      ))}
    </View>
  );

  const events = (
    <View className="border-t border-line">
      {marks.length === 0 ? <Muted className="py-3 text-center text-xs">Nenhum lance ainda.</Muted> : null}
      {marks.map((m, i) => (
        <EventRow key={i} m={m} homeId={r.homeId} players={players} clubs={clubs} wide={wide} />
      ))}
    </View>
  );

  const pitchFor = (w: number, horizontal: boolean) =>
    detailed ? (
      <View className="overflow-hidden" style={{ borderRadius: horizontal ? 18 : 14, width: w, height: pitchHeight(w, horizontal) }}>
        <PitchCanvas
          width={w}
          horizontal={horizontal}
          ball={{ x: state.x, y: state.y }}
          home={playerSpots(homeSpots, 'home', state)}
          away={playerSpots(awaySpots, 'away', state)}
          goal={state.kind === 'gol'}
          colors={{ pitch: t.pitch, line: t.pl, home: t.acc, away: awayColor }}
        />
        <View className="absolute bottom-3 left-3 rounded-lg px-3 py-2" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <Text className="font-sanss text-[13px] text-white">{caption(state.kind, state.poss === 'home' ? home : away, marks[0], time, players)}</Text>
        </View>
      </View>
    ) : (
      <Muted className="py-6 text-center">Jogo de outra competição: guardamos só o placar e os gols, sem campo 2D.</Muted>
    );

  const ratings = detailed && ended ? (
    <View className="flex-row gap-3">
      <Ratings title={home.shortName} ids={r.homeXI} result={r} players={players} />
      <Ratings title={away.shortName} ids={r.awayXI} result={r} players={players} />
    </View>
  ) : null;

  const controls = (
    <>
      <Button
        className={wide ? 'flex-1' : 'w-12 px-0'}
        variant="secondary"
        label={ended ? '↺' : playing ? '❚❚' : '▶'}
        onPress={() => (ended ? restart() : setPlaying(!playing))}
      />
      {wide ? null : (
        <Button className="flex-1" variant="secondary" label={`Velocidade ${speed}`} onPress={() => setSpeed(SPEED_LIST[(SPEED_LIST.indexOf(speed) + 1) % SPEED_LIST.length]!)} />
      )}
    </>
  );
  const primary = ended ? (
    <Button className="flex-1" label="Fechar" onPress={() => close(null)} />
  ) : (
    <Button className="flex-1" label={wide ? 'Pular para o fim' : 'Fim ▸▸'} onPress={toEnd} />
  );

  if (wide) {
    const centerW = Math.max(420, winW - 96 - 320 - 340 - 56);
    const maxPitchH = winH - 200 - 140 - 100;
    const pitchW = Math.min(centerW, Math.round(maxPitchH * (105 / 68)));
    return (
      <View className="absolute inset-0 bg-bg">
        <View className="flex-row items-center gap-10 border-b border-line bg-s1 px-12 pb-[22px] pt-6">
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar partida" onPress={() => close(null)} className="absolute left-5 top-5" hitSlop={10}>
            <Text className="font-sans text-xl text-mute">←</Text>
          </Pressable>
          <View className="flex-1 flex-row items-center justify-end gap-5">
            <Text className="shrink font-disp uppercase text-ink" style={{ fontSize: 44 }} numberOfLines={1}>
              {home.name}
            </Text>
            <Crest id={home.id} short={home.shortName} size={72} />
          </View>
          <View className="items-center gap-1">
            {liveBadge}
            {score(104)}
          </View>
          <View className="flex-1 flex-row items-center gap-5">
            <Crest id={away.id} short={away.shortName} size={72} />
            <Text className="shrink font-disp uppercase text-ink" style={{ fontSize: 44 }} numberOfLines={1}>
              {away.name}
            </Text>
          </View>
        </View>
        <View className="flex-1 flex-row gap-7 px-12 py-7">
          <ScrollView className="w-[320px] grow-0">
            <Label className="pb-2.5">Lances</Label>
            {events}
          </ScrollView>
          <View className="flex-1 items-center gap-[18px]">
            {pitchFor(pitchW, true)}
            <View className="self-stretch">{pressureChart(52)}</View>
          </View>
          <ScrollView className="w-[340px] grow-0" contentContainerClassName="gap-[18px]">
            <Card className="gap-3.5 rounded-2xl p-[22px]">
              <Label>Estatísticas</Label>
              {statsBlock}
            </Card>
            <View className="flex-row gap-1.5 rounded-xl bg-s2 p-1">
              {SPEED_LIST.map((s) => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  accessibilityState={{ selected: s === speed }}
                  onPress={() => setSpeed(s)}
                  className={`h-[38px] flex-1 items-center justify-center rounded-[9px] ${s === speed ? 'bg-acc' : ''}`}
                >
                  <Text className={`font-monob text-[13px] ${s === speed ? 'text-onacc' : 'text-mute'}`}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <View className="flex-row gap-2.5">{controls}</View>
            <View className="flex-row">{primary}</View>
            {ratings}
          </ScrollView>
        </View>
      </View>
    );
  }

  const pitchW = Math.min(winW - 28, Math.round((winH - insets.top - insets.bottom - 330) / (105 / 68)));
  return (
    <View className="absolute inset-0 bg-bg">
      <View className="gap-3 border-b border-line bg-s1 px-4 pb-4 pt-1.5">
        <View className="flex-row items-center justify-between">
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar partida" onPress={() => close(null)} hitSlop={10} className="flex-row items-center gap-2">
            <Text className="font-sans text-lg text-mute">←</Text>
            <Text className="font-monom text-[10.5px] uppercase tracking-[0.8px] text-mute" numberOfLines={1}>
              {stageName(comp, r.fixtureId)}
            </Text>
          </Pressable>
          {liveBadge}
        </View>
        <View className="flex-row items-center">
          <View className="flex-1 items-center gap-1.5">
            <Crest id={home.id} short={home.shortName} size={40} />
            <Text className="font-sanss text-[12.5px] text-ink" numberOfLines={1}>
              {home.shortName}
            </Text>
          </View>
          {score(60)}
          <View className="flex-1 items-center gap-1.5">
            <Crest id={away.id} short={away.shortName} size={40} />
            <Text className="font-sanss text-[12.5px] text-ink" numberOfLines={1}>
              {away.shortName}
            </Text>
          </View>
        </View>
        {pressureChart(26)}
      </View>
      <View className="px-4 pt-3">
        <Segmented options={['lances', 'campo'] as const} value={tab} onChange={setTab} labelOf={(v) => (v === 'lances' ? 'Lances' : 'Campo 2D')} />
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 py-3">
        {tab === 'lances' ? (
          <>
            {statsBlock}
            {events}
            {ratings}
          </>
        ) : (
          <View className="items-center">{pitchFor(pitchW, false)}</View>
        )}
      </ScrollView>
      <View className="flex-row gap-2 border-t border-line bg-s1 px-3.5 pt-2.5" style={{ paddingBottom: Math.max(insets.bottom, 14) }}>
        {controls}
        {primary}
      </View>
    </View>
  );
}

const fmtXg = (v: number) => v.toFixed(1).replace('.', ',');

/** Legenda do lance no campo. */
function caption(kind: string, side: Club, last: WatchMark | undefined, time: number, players: Record<string, Player>): string {
  if (last && time - last.t < 6 && last.type === 'goal') return `GOL! ${players[last.playerId]?.name ?? ''}`;
  if (last && time - last.t < 6 && last.type !== 'injury') return `Cartão para ${players[last.playerId]?.name ?? ''}`;
  if (kind === 'intervalo') return 'Intervalo';
  if (kind === 'chute') return `${side.shortName} finaliza`;
  if (kind === 'defesa') return 'Defesa do goleiro';
  if (kind === 'saida') return 'Bola rolando';
  if (kind === 'fim') return 'Fim de jogo';
  return `${side.shortName} com a bola`;
}

const ICON: Record<MatchEvent['type'], { bg: string; ink: string; label: string }> = {
  goal: { bg: 'bg-acc', ink: 'text-onacc', label: 'G' },
  yellow: { bg: 'bg-cartao', ink: 'text-onacc', label: '' },
  red: { bg: 'bg-neg', ink: 'text-white', label: '' },
  injury: { bg: 'bg-s2', ink: 'text-ink', label: '+' },
};

function EventRow({ m, homeId, players, clubs, wide }: { m: WatchMark; homeId: string; players: Record<string, Player>; clubs: Record<string, Club>; wide: boolean }) {
  const isHome = m.clubId === homeId;
  const ic = ICON[m.type];
  const name = players[m.playerId]?.name ?? '?';
  const text =
    m.type === 'goal' ? `${name}${m.assistId ? ` (${players[m.assistId]?.name.split(' ').slice(-1)[0] ?? ''})` : ''}`
    : m.type === 'injury' ? `${name} lesionado · ${m.matchesOut} jogo(s)`
    : name;
  return (
    <View className={`items-center gap-2.5 border-b border-line ${wide ? 'h-[52px] flex-row' : `py-2 ${isHome ? 'flex-row' : 'flex-row-reverse'}`}`}>
      <Text className="w-[34px] text-center font-monob text-xs text-mute">{minuteLabel(m.minute)}</Text>
      <View className={`h-5 w-5 items-center justify-center rounded-[5px] ${ic.bg}`}>
        <Text className={`font-disp text-[11px] ${ic.ink}`}>{ic.label}</Text>
      </View>
      <View className={`shrink ${wide || isHome ? '' : 'items-end'}`}>
        <Text className="font-sanss text-[13px] text-ink" numberOfLines={1}>
          {text}
        </Text>
        {wide ? <Text className="font-sans text-[11.5px] text-mute">{clubs[m.clubId]?.name}</Text> : null}
      </View>
    </View>
  );
}

function Ratings({ title, ids, result, players }: { title: string; ids: string[]; result: MatchResult; players: Record<string, Player> }) {
  return (
    <Card className="flex-1 p-3">
      <Label className="pb-1.5">{title} · notas</Label>
      {ids.map((id) => {
        const v = result.ratings[id] ?? 0;
        const tone = v >= 7.5 ? 'text-pos' : v < 6 ? 'text-neg' : 'text-ink';
        return (
          <View key={id} className="flex-row items-center justify-between py-0.5">
            <Text className="flex-1 font-sans text-xs text-ink" numberOfLines={1}>
              {players[id]?.name ?? id}
            </Text>
            <Text className={`ml-1 font-monob text-xs ${tone}`}>{v.toFixed(1).replace('.', ',')}</Text>
          </View>
        );
      })}
    </Card>
  );
}
