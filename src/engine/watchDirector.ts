// Diretor da visão 2D (Fase 6). A partida já foi decidida pelo motor (placar, xG e eventos com
// minuto); aqui se monta só a encenação: uma linha do tempo com a bola (posses, ataques, chutes
// e gols nos minutos certos) e a posição dos 22 jogadores a partir da formação e da bola.
// Mesmo conceito do `watchDirector` do NBA GM. Puro e com seed: o mesmo jogo sempre se repete igual.
//
// Coordenadas: x de 0 (gol do mandante) a 1 (gol do visitante), y de 0 a 1 (lateral a lateral).
// O mandante ataca para a direita o jogo todo (sem troca de lado no intervalo, para facilitar a leitura).

import type { MatchEvent, MatchResult, Position } from '../domain/types';
import { createRng, deriveSeed, gaussian, int, type Rng } from './rng';

export type Side = 'home' | 'away';
export type FrameKind = 'jogo' | 'chute' | 'defesa' | 'gol' | 'saida' | 'intervalo' | 'fim';

export interface WatchFrame {
  /** Segundos de jogo (0 a 5400). */
  t: number;
  x: number;
  y: number;
  poss: Side;
  kind: FrameKind;
}

export interface WatchMark extends MatchEvent {
  /** Segundos de jogo. */
  t: number;
}

export interface WatchScript {
  frames: WatchFrame[];
  /** Eventos do motor (gols, cartões, lesões) no tempo da encenação. */
  marks: WatchMark[];
  shots: Record<Side, number>;
  /** Cada finalização encenada, em ordem (no alvo = gol ou defesa). */
  shotLog: { t: number; side: Side; onTarget: boolean }[];
  duration: number;
}

export const MATCH_SECONDS = 90 * 60;
const HALF = 45 * 60;

const clamp01 = (v: number, lo = 0.02, hi = 0.98) => Math.max(lo, Math.min(hi, v));
/** x na direção de ataque do lado (o visitante ataca para a esquerda). */
const ax = (side: Side, x: number) => (side === 'home' ? x : 1 - x);
const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');

interface Climax {
  t: number;
  side: Side;
  outcome: 'gol' | 'chute' | 'defesa';
  mark?: WatchMark;
}

/** Segundo do lance de um evento: minuto do motor mais um pouco, sem passar do fim do tempo. */
function eventSecond(rng: Rng, minute: number): number {
  const m = Math.max(1, Math.min(90, minute));
  const base = (m - 1) * 60 + int(rng, 5, 55);
  // Lance do 1º tempo não pode cair no intervalo.
  return m <= 45 ? Math.min(base, HALF - 20) : Math.max(base, HALF + 30);
}

/** Monta a encenação de uma partida. */
export function directMatch(result: MatchResult, seed = 0): WatchScript {
  const rng = createRng(deriveSeed(seed, 'assistir', result.fixtureId));
  const sideOf = (clubId: string): Side => (clubId === result.homeId ? 'home' : 'away');
  const marks: WatchMark[] = result.events.map((e) => ({ ...e, t: eventSecond(rng, e.minute) })).sort((a, b) => a.t - b.t);

  // Chutes: os gols do motor e mais alguns sem gol, proporcionais ao xG.
  const climaxes: Climax[] = [];
  const shots: Record<Side, number> = { home: 0, away: 0 };
  for (const m of marks) if (m.type === 'goal') climaxes.push({ t: m.t, side: sideOf(m.clubId), outcome: 'gol', mark: m });
  for (const side of ['home', 'away'] as Side[]) {
    const xg = side === 'home' ? result.homeXg : result.awayXg;
    const goals = side === 'home' ? result.homeGoals : result.awayGoals;
    const extra = Math.max(0, Math.round(xg * 8 + gaussian(rng, 0, 1.5)) - goals);
    shots[side] = goals + extra;
    for (let i = 0; i < extra; i++) {
      const minute = int(rng, 1, 90);
      climaxes.push({ t: eventSecond(rng, minute), side, outcome: rng.next() < 0.45 ? 'defesa' : 'chute' });
    }
  }
  climaxes.sort((a, b) => a.t - b.t);
  // Dois lances a menos de 40 s: o segundo é empurrado (gols nunca saem do minuto do motor).
  for (let i = 1; i < climaxes.length; i++) {
    const prev = climaxes[i - 1]!;
    const cur = climaxes[i]!;
    if (cur.t - prev.t < 40 && cur.outcome !== 'gol') cur.t = Math.min(MATCH_SECONDS - 10, prev.t + 40 + int(rng, 0, 20));
  }
  climaxes.sort((a, b) => a.t - b.t);

  // Domínio: quem tem mais xG fica mais com a bola.
  const shotLog: WatchScript['shotLog'] = [];
  const share = (result.homeXg + 0.3) / (result.homeXg + result.awayXg + 0.6);
  const frames: WatchFrame[] = [];
  let poss: Side = 'home';
  let t = 0;
  let x = 0.5;
  let y = 0.5;
  const push = (kind: FrameKind = 'jogo') => frames.push({ t: Math.round(t * 10) / 10, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, poss, kind });
  const kickoff = (side: Side, at: number) => {
    t = at;
    poss = side;
    x = 0.5;
    y = 0.5;
    push('saida');
  };

  /** Posse "neutra" até `until`: troca de passes e perdas de bola no meio-campo. */
  const fill = (until: number) => {
    while (until - t > 14) {
      const dur = Math.min(until - t - 2, 6 + rng.next() * 20);
      const steps = Math.max(2, Math.round(dur / 4));
      for (let k = 0; k < steps; k++) {
        t += dur / steps;
        const progress = ax(poss, x) + gaussian(rng, 0.03, 0.08);
        x = clamp01(ax(poss, Math.max(0.15, Math.min(0.78, progress))), 0.08, 0.92);
        y = clamp01(y + gaussian(rng, 0, 0.18), 0.06, 0.94);
        push();
      }
      // Fim da posse: o outro lado recupera (mais vezes para quem domina).
      const keepHome = rng.next() < share;
      poss = keepHome ? 'home' : 'away';
    }
  };

  /** Ataque que termina no lance `c` (chegada, chute e desfecho). */
  const attack = (c: Climax) => {
    // Lance colado no anterior (ex.: gol logo depois de outra saída de bola): vem um pouco depois.
    // Último lance cabe antes do apito final (chute, desfecho e comemoração).
    const at = Math.max(t + 3, Math.min(MATCH_SECONDS - 6, Math.max(c.t, t + 8)));
    if (at !== c.t) {
      c.t = at;
      if (c.mark) c.mark.t = c.t;
    }
    const start = Math.max(t + 2, c.t - 12 - rng.next() * 8);
    t = start;
    poss = c.side;
    x = ax(c.side, 0.45 + rng.next() * 0.1);
    y = 0.2 + rng.next() * 0.6;
    push();
    const steps = 3;
    for (let k = 1; k <= steps; k++) {
      t = start + ((c.t - start) * k) / (steps + 1);
      x = ax(c.side, 0.55 + (0.3 * k) / steps + gaussian(rng, 0, 0.02));
      y = clamp01(0.5 + (y - 0.5) * 0.6 + gaussian(rng, 0, 0.1), 0.1, 0.9);
      push();
    }
    t = c.t;
    x = ax(c.side, 0.84 + rng.next() * 0.06);
    y = 0.32 + rng.next() * 0.36;
    push('chute');
    t = c.t + 1.2;
    if (c.outcome === 'gol') {
      x = ax(c.side, 0.995);
      y = 0.46 + rng.next() * 0.08;
      push('gol');
    } else if (c.outcome === 'defesa') {
      x = ax(c.side, 0.95);
      y = 0.5 + gaussian(rng, 0, 0.05);
      push('defesa');
      poss = other(c.side);
    } else {
      x = ax(c.side, 0.995);
      y = rng.next() < 0.5 ? 0.3 + rng.next() * 0.1 : 0.6 + rng.next() * 0.1;
      push('chute');
      poss = other(c.side);
    }
  };

  kickoff('home', 0);
  let secondHalf = false;
  for (const c of climaxes) {
    if (!secondHalf && c.t > HALF) {
      fill(HALF - 2);
      t = Math.max(t + 1, HALF);
      x = 0.5;
      y = 0.5;
      push('intervalo');
      kickoff('away', t + 1);
      secondHalf = true;
    }
    // Chute sem gol que não cabe mais no tempo fica de fora.
    if (c.outcome !== 'gol' && t > MATCH_SECONDS - 14) {
      shots[c.side]--;
      continue;
    }
    fill(c.t - 20);
    attack(c);
    shotLog.push({ t: c.t, side: c.side, onTarget: c.outcome !== 'chute' });
    if (c.outcome === 'gol') {
      // Comemoração e nova saída de quem sofreu.
      t += 2;
      push('gol');
      // Gol nos acréscimos: não há nova saída.
      if (t + 25 < MATCH_SECONDS - 5) kickoff(other(c.side), t + 25);
    } else {
      t += 1;
    }
  }
  if (!secondHalf) {
    fill(HALF - 2);
    t = Math.max(t + 1, HALF);
    x = 0.5;
    y = 0.5;
    push('intervalo');
    kickoff('away', t + 1);
  }
  fill(MATCH_SECONDS - 1);
  t = Math.max(t + 0.5, MATCH_SECONDS);
  push('fim');
  marks.sort((a, b) => a.t - b.t);
  return { frames, marks, shots, shotLog, duration: MATCH_SECONDS };
}

export interface WatchState {
  x: number;
  y: number;
  poss: Side;
  kind: FrameKind;
  /** Último evento já ocorrido (para a legenda). */
  last: WatchMark | null;
}

/** Estado da encenação no segundo `t` (bola interpolada entre os quadros). */
export function sampleAt(script: WatchScript, t: number): WatchState {
  const f = script.frames;
  let lo = 0;
  let hi = f.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (f[mid]!.t <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = f[lo]!;
  const b = f[Math.min(lo + 1, f.length - 1)]!;
  const span = b.t - a.t;
  const k = span > 0 ? Math.max(0, Math.min(1, (t - a.t) / span)) : 0;
  // Saída de bola e intervalo: a bola "teleporta" para o centro, sem deslizar.
  const jump = b.kind === 'saida' || b.kind === 'intervalo';
  const e = jump ? 0 : k * k * (3 - 2 * k);
  let last: WatchMark | null = null;
  for (const m of script.marks) {
    if (m.t > t) break;
    last = m;
  }
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, poss: a.poss, kind: a.kind, last };
}

/** Placar no segundo `t`. */
export function scoreAt(script: WatchScript, result: Pick<MatchResult, 'homeId'>, t: number): [number, number] {
  const s: [number, number] = [0, 0];
  for (const m of script.marks) if (m.type === 'goal' && m.t <= t) s[m.clubId === result.homeId ? 0 : 1]++;
  return s;
}

/** Lugar de cada função num time que ataca para a direita (x, y). */
const BASE: Record<Position, [number, number]> = {
  GK: [0.05, 0.5],
  CB: [0.2, 0.5],
  LB: [0.25, 0.14],
  RB: [0.25, 0.86],
  DM: [0.34, 0.5],
  CM: [0.43, 0.5],
  AM: [0.55, 0.5],
  LW: [0.6, 0.16],
  RW: [0.6, 0.84],
  ST: [0.68, 0.5],
};

/** Posições-base de uma formação (funções repetidas se espalham na largura). */
export function formationSpots(positions: readonly Position[]): [number, number][] {
  const total: Record<string, number> = {};
  for (const p of positions) total[p] = (total[p] ?? 0) + 1;
  const seen: Record<string, number> = {};
  return positions.map((p) => {
    const n = total[p]!;
    const i = (seen[p] = (seen[p] ?? 0) + 1) - 1;
    const [x, y] = BASE[p];
    if (n === 1) return [x, y];
    const width = p === 'CB' ? 0.34 : p === 'ST' ? 0.3 : 0.42;
    return [x, 0.5 - width / 2 + (width * i) / (n - 1)];
  });
}

/**
 * Onde cada jogador do lado está, dada a bola: o time sobe e desce com a bola, fecha na largura
 * do lado dela, avança quando tem a posse, e o mais perto vai na bola.
 */
export function playerSpots(spots: [number, number][], side: Side, s: Pick<WatchState, 'x' | 'y' | 'poss'>): [number, number][] {
  const bx = ax(side, s.x);
  const has = s.poss === side;
  const shift = (bx - 0.5) * 0.55 + (has ? 0.06 : -0.04);
  const out = spots.map(([x, y], i): [number, number] => {
    if (i === 0 && x < 0.1) return [ax(side, clamp01(0.05 + Math.max(0, bx - 0.6) * 0.08)), clamp01(0.5 + (s.y - 0.5) * 0.25)];
    const nx = clamp01(x + shift * (0.6 + x * 0.6));
    const ny = clamp01(y + (s.y - y) * (has ? 0.12 : 0.28));
    return [ax(side, nx), ny];
  });
  // O mais próximo da bola (fora o goleiro) vai nela: com a posse conduz, sem ela pressiona.
  let best = -1;
  let bestD = Infinity;
  out.forEach(([x, y], i) => {
    if (i === 0) return;
    const d = (x - s.x) ** 2 + (y - s.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  if (best > 0) {
    const pull = has ? 0.85 : 0.55;
    const [x, y] = out[best]!;
    out[best] = [x + (s.x - x) * pull, y + (s.y - y) * pull];
  }
  return out;
}

/**
 * Pressão do jogo até o segundo `upTo`, em `bins` faixas iguais de 0 a 90 min: média de quanto
 * cada lado está com a bola no terço final (+ mandante, − visitante), de −1 a 1. Faixas ainda
 * não jogadas ficam null.
 */
export function pressureSeries(script: WatchScript, upTo: number, bins = 30): (number | null)[] {
  const out: (number | null)[] = [];
  const width = MATCH_SECONDS / bins;
  for (let b = 0; b < bins; b++) {
    const from = b * width;
    if (from >= upTo) {
      out.push(null);
      continue;
    }
    const to = Math.min(upTo, from + width);
    let sum = 0;
    let n = 0;
    for (let t = from; t < to; t += 10) {
      const s = sampleAt(script, t);
      const home = s.poss === 'home' ? Math.max(0, s.x - 0.55) / 0.45 : 0;
      const away = s.poss === 'away' ? Math.max(0, 0.45 - s.x) / 0.45 : 0;
      sum += home - away;
      n++;
    }
    out.push(n ? Math.max(-1, Math.min(1, sum / n)) : 0);
  }
  return out;
}

/** Estatísticas encenadas até o segundo `t`: posse do mandante (%), finalizações e no alvo. */
export function liveStats(script: WatchScript, t: number): { possession: number; shots: Record<Side, number>; onTarget: Record<Side, number> } {
  let home = 0;
  let total = 0;
  for (let s = 0; s <= Math.min(t, MATCH_SECONDS); s += 15) {
    if (sampleAt(script, s).poss === 'home') home++;
    total++;
  }
  const shots: Record<Side, number> = { home: 0, away: 0 };
  const onTarget: Record<Side, number> = { home: 0, away: 0 };
  for (const sh of script.shotLog) {
    if (sh.t > t) break;
    shots[sh.side]++;
    if (sh.onTarget) onTarget[sh.side]++;
  }
  return { possession: total ? Math.round((home / total) * 100) : 50, shots, onTarget };
}
