// Campo 2D em Skia: gramado, linhas, 22 jogadores como pontos e a bola. Desenha só o estado do
// instante; quem anima é a tela da partida (screens/MatchDetailScreen.tsx).
// Em pé (celular): o mandante ataca para cima. Deitado (PC): o mandante ataca para a direita.

import { Canvas, Circle, Group, Line, Rect, vec } from '@shopify/react-native-skia';
import { pitchHeight } from './pitchSize';

export interface PitchColors {
  pitch: string;
  line: string;
  home: string;
  away: string;
}

export interface PitchProps {
  width: number;
  /** Bola em coordenadas do diretor (x de gol a gol, y de lateral a lateral). */
  ball: { x: number; y: number };
  home: [number, number][];
  away: [number, number][];
  /** Quadro de gol (bola maior). */
  goal: boolean;
  horizontal?: boolean;
  colors: PitchColors;
}

const GK_HOME = '#E8C547';
const GK_AWAY = '#22d3ee';

export default function Pitch2D({ width, ball, home, away, goal, horizontal = false, colors }: PitchProps) {
  const h = pitchHeight(width, horizontal);
  const pad = horizontal ? 14 : 10;
  const w = width - pad * 2;
  const ph = h - pad * 2;
  // Ponto do diretor (x de gol a gol, y de lateral a lateral) → tela.
  const px = (x: number, y: number) => (horizontal ? pad + x * w : pad + y * w);
  const py = (x: number, y: number) => (horizontal ? pad + y * ph : pad + (1 - x) * ph);
  const long = horizontal ? w : ph;
  const short = horizontal ? ph : w;
  const r = Math.max(4, Math.min(width, h) / 55);
  const boxDepth = long * 0.16;
  const boxWidth = short * 0.6;
  const smallDepth = long * 0.055;
  const smallWidth = short * 0.28;
  const stripes = 10;
  // Retângulo medido "ao longo do campo" (profundidade a partir de um gol) e na largura.
  const box = (fromEnd: boolean, depth: number, width_: number) =>
    horizontal
      ? { x: fromEnd ? pad + w - depth : pad, y: pad + (ph - width_) / 2, width: depth, height: width_ }
      : { x: pad + (w - width_) / 2, y: fromEnd ? pad : pad + ph - depth, width: width_, height: depth };
  return (
    <Canvas style={{ width, height: h }}>
      <Rect x={0} y={0} width={width} height={h} color={colors.pitch} />
      {Array.from({ length: stripes / 2 }, (_, i) =>
        horizontal ? (
          <Rect key={i} x={pad + ((i * 2 + 1) * w) / stripes} y={0} width={w / stripes} height={h} color="rgba(255,255,255,0.035)" />
        ) : (
          <Rect key={i} x={0} y={pad + ((i * 2 + 1) * ph) / stripes} width={width} height={ph / stripes} color="rgba(255,255,255,0.035)" />
        ),
      )}
      <Group style="stroke" strokeWidth={1.5} color={colors.line}>
        <Rect x={pad} y={pad} width={w} height={ph} />
        {horizontal ? <Line p1={vec(pad + w / 2, pad)} p2={vec(pad + w / 2, pad + ph)} /> : <Line p1={vec(pad, pad + ph / 2)} p2={vec(pad + w, pad + ph / 2)} />}
        <Circle cx={pad + w / 2} cy={pad + ph / 2} r={short * 0.13} />
        <Rect {...box(false, boxDepth, boxWidth)} />
        <Rect {...box(true, boxDepth, boxWidth)} />
        <Rect {...box(false, smallDepth, smallWidth)} />
        <Rect {...box(true, smallDepth, smallWidth)} />
      </Group>
      {home.map(([x, y], i) => (
        <Group key={`h${i}`}>
          <Circle cx={px(x, y)} cy={py(x, y)} r={r + 1.5} color="rgba(0,0,0,0.35)" />
          <Circle cx={px(x, y)} cy={py(x, y)} r={r} color={i === 0 ? GK_HOME : colors.home} />
        </Group>
      ))}
      {away.map(([x, y], i) => (
        <Group key={`a${i}`}>
          <Circle cx={px(x, y)} cy={py(x, y)} r={r + 1.5} color="rgba(0,0,0,0.35)" />
          <Circle cx={px(x, y)} cy={py(x, y)} r={r} color={i === 0 ? GK_AWAY : colors.away} />
        </Group>
      ))}
      <Circle cx={px(ball.x, ball.y)} cy={py(ball.x, ball.y)} r={goal ? r * 1.6 : r * 1.1} color="rgba(255,255,255,0.18)" />
      <Circle cx={px(ball.x, ball.y)} cy={py(ball.x, ball.y)} r={goal ? r * 0.9 : r * 0.6} color="#ffffff" />
    </Canvas>
  );
}
