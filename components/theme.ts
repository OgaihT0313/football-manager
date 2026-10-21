// Identidade "Mesa de Comando": tokens de cor por tema (escuro e claro), variáveis CSS para o
// NativeWind (classes bg-bg, bg-s1, text-ink, border-line, bg-acc...) e as mesmas cores em JS
// para quem desenha fora do NativeWind (Skia, estilos calculados).

import { useColorScheme, vars } from 'nativewind';
import { useWindowDimensions } from 'react-native';

export interface Palette {
  bg: string;
  s1: string;
  s2: string;
  line: string;
  ink: string;
  mute: string;
  /** Única cor de ação (fundo de botão primário, aba ativa, OVR ≥ 80). */
  acc: string;
  /** Acento usado como texto (no claro é mais escuro, para contraste). */
  acct: string;
  onacc: string;
  pos: string;
  neg: string;
  pitch: string;
  /** Linhas do campo. */
  pl: string;
  /** Amarelo dos cartões. */
  card: string;
}

export const PALETTES: Record<'dark' | 'light', Palette> = {
  dark: {
    bg: '#0E1210', s1: '#161B18', s2: '#1F2521', line: '#2B322D', ink: '#EDEFE8', mute: '#98A199',
    acc: '#FFB020', acct: '#FFB020', onacc: '#1B1300', pos: '#3DDC97', neg: '#FF6B5E', pitch: '#123526',
    pl: 'rgba(237,239,232,0.26)', card: '#E8C547',
  },
  light: {
    bg: '#F3F0E8', s1: '#FFFFFF', s2: '#E9E5DA', line: '#D9D3C5', ink: '#141714', mute: '#5A5F59',
    acc: '#F5A300', acct: '#8A5800', onacc: '#1B1300', pos: '#0E7F50', neg: '#C2362B', pitch: '#2E6A49',
    pl: 'rgba(255,255,255,0.6)', card: '#E8C547',
  },
};

const TOKENS = ['bg', 's1', 's2', 'line', 'ink', 'mute', 'acc', 'acct', 'onacc', 'pos', 'neg', 'pitch'] as const;

/** "#FFB020" → "255 176 32" (formato das variáveis, para o NativeWind aplicar opacidade). */
function triplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Estilo com as variáveis do tema; vai na raiz do app (e de cada painel sobreposto). */
export const THEME_VARS = {
  dark: vars(Object.fromEntries(TOKENS.map((k) => [`--c-${k}`, triplet(PALETTES.dark[k])]))),
  light: vars(Object.fromEntries(TOKENS.map((k) => [`--c-${k}`, triplet(PALETTES.light[k])]))),
};

export function useScheme(): 'dark' | 'light' {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'light' ? 'light' : 'dark';
}

/** Cores do tema atual em JS. */
export function useTokens(): Palette {
  return PALETTES[useScheme()];
}

/** Layout de PC (abas no topo, 2–3 colunas) a partir desta largura. */
export const WIDE_BREAKPOINT = 1024;

export function useWide(): boolean {
  return useWindowDimensions().width >= WIDE_BREAKPOINT;
}

/** Cores de clube (escudo provisório: círculo com a cor + sigla). Estáveis pelo id. */
const CLUB_COLORS = [
  '#B3202B', '#1E5AA8', '#1C7A4A', '#6A3FA0', '#D9822B', '#0E7C86', '#9C1D5A', '#7A5C2E',
  '#3B4A8C', '#2E7D32', '#8C2F39', '#2B6CB0', '#B7791F', '#4A5568', '#C05621', '#285E61',
];

export function clubColor(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return CLUB_COLORS[(h >>> 0) % CLUB_COLORS.length]!;
}

/**
 * Cor do visitante nas barras comparativas e no campo: a do clube, a menos que pareça o âmbar do
 * mandante (tons de laranja/amarelo); aí usa o azul do design.
 */
export function rivalColor(id: string): string {
  const hex = clubColor(id);
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return hex;
  const d = max - min;
  const hue = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const deg = hue * 60;
  return deg >= 15 && deg <= 70 ? '#1E5AA8' : hex;
}
