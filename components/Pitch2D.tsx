// Campo 2D em Skia (Fase 6): grama, linhas, 22 jogadores como pontos e a bola. Desenha só o
// estado do instante; quem anima é a WatchView (screens/WatchView.tsx). Em pé (retrato): o
// mandante ataca para cima.

import { Canvas, Circle, Group, Line, Rect, vec } from '@shopify/react-native-skia';

export interface PitchProps {
  width: number;
  /** Bola em coordenadas do diretor (x de gol a gol, y de lateral a lateral). */
  ball: { x: number; y: number };
  home: [number, number][];
  away: [number, number][];
  /** Quadro de gol (pisca a bola). */
  goal: boolean;
}

/** Proporção do campo (105 x 68), em pé. */
export const PITCH_RATIO = 105 / 68;

const GRASS = '#15803d';
const GRASS_STRIPE = '#16a34a';
const LINE = 'rgba(255,255,255,0.75)';
const HOME = '#2563eb';
const HOME_GK = '#facc15';
const AWAY = '#dc2626';
const AWAY_GK = '#22d3ee';

export default function Pitch2D({ width, ball, home, away, goal }: PitchProps) {
  const h = Math.round(width * PITCH_RATIO);
  const pad = 10;
  const w = width - pad * 2;
  const ph = h - pad * 2;
  // x do diretor vira altura (mandante sobe), y vira largura.
  const sx = (y: number) => pad + y * w;
  const sy = (x: number) => pad + (1 - x) * ph;
  const r = Math.max(4, width / 55);
  const boxW = w * 0.6;
  const boxH = ph * 0.16;
  const smallW = w * 0.28;
  const smallH = ph * 0.055;
  const stripes = 10;
  return (
    <Canvas style={{ width, height: h }}>
      <Rect x={0} y={0} width={width} height={h} color={GRASS} />
      {Array.from({ length: stripes / 2 }, (_, i) => (
        <Rect key={i} x={0} y={pad + ((i * 2 + 1) * ph) / stripes} width={width} height={ph / stripes} color={GRASS_STRIPE} />
      ))}
      <Group style="stroke" strokeWidth={1.5} color={LINE}>
        <Rect x={pad} y={pad} width={w} height={ph} />
        <Line p1={vec(pad, pad + ph / 2)} p2={vec(pad + w, pad + ph / 2)} />
        <Circle cx={pad + w / 2} cy={pad + ph / 2} r={w * 0.13} />
        <Rect x={pad + (w - boxW) / 2} y={pad} width={boxW} height={boxH} />
        <Rect x={pad + (w - boxW) / 2} y={pad + ph - boxH} width={boxW} height={boxH} />
        <Rect x={pad + (w - smallW) / 2} y={pad} width={smallW} height={smallH} />
        <Rect x={pad + (w - smallW) / 2} y={pad + ph - smallH} width={smallW} height={smallH} />
      </Group>
      {/* Gols */}
      <Rect x={pad + w * 0.44} y={pad - 6} width={w * 0.12} height={6} color="rgba(255,255,255,0.9)" />
      <Rect x={pad + w * 0.44} y={pad + ph} width={w * 0.12} height={6} color="rgba(255,255,255,0.9)" />
      {home.map(([x, y], i) => (
        <Group key={`h${i}`}>
          <Circle cx={sx(y)} cy={sy(x)} r={r + 1.5} color="rgba(0,0,0,0.35)" />
          <Circle cx={sx(y)} cy={sy(x)} r={r} color={i === 0 ? HOME_GK : HOME} />
        </Group>
      ))}
      {away.map(([x, y], i) => (
        <Group key={`a${i}`}>
          <Circle cx={sx(y)} cy={sy(x)} r={r + 1.5} color="rgba(0,0,0,0.35)" />
          <Circle cx={sx(y)} cy={sy(x)} r={r} color={i === 0 ? AWAY_GK : AWAY} />
        </Group>
      ))}
      <Circle cx={sx(ball.y)} cy={sy(ball.x)} r={goal ? r * 0.9 : r * 0.6} color="#ffffff" />
      <Circle cx={sx(ball.y)} cy={sy(ball.x)} r={goal ? r * 0.9 : r * 0.6} color="#0f172a" style="stroke" strokeWidth={1} />
    </Canvas>
  );
}

export const PITCH_COLORS = { HOME, AWAY };
