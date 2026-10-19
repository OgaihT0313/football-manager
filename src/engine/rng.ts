// Gerador pseudoaleatório com seed (mulberry32). Proibido usar Math.random() no domínio.
// O estado é um único inteiro de 32 bits, então pode ser salvo e restaurado.

export interface Rng {
  /** Float uniforme em [0, 1). */
  next(): number;
  /** Estado atual, para salvar e retomar a sequência com `createRng(state)`. */
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state() {
      return s;
    },
  };
}

/** Deriva uma seed nova e estável a partir de uma seed base e de rótulos (hash FNV-1a). */
export function deriveSeed(base: number, ...parts: (string | number)[]): number {
  let h = 0x811c9dc5 ^ (base >>> 0);
  for (const part of parts) {
    const str = String(part);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Inteiro uniforme em [min, max], inclusivo. */
export function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng.next() * (max - min + 1));
}

export function chance(rng: Rng, p: number): boolean {
  return rng.next() < p;
}

/** Normal(mean, sd) por Box-Muller. */
export function gaussian(rng: Rng, mean = 0, sd = 1): number {
  let u = 0;
  while (u === 0) u = rng.next();
  const v = rng.next();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Poisson(λ) pelo método de Knuth (adequado para λ pequeno, como gols). */
export function poisson(rng: Rng, lambda: number): number {
  if (!(lambda > 0)) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = rng.next();
  while (p > limit) {
    k++;
    p *= rng.next();
  }
  return k;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: lista vazia');
  return items[Math.floor(rng.next() * items.length)] as T;
}

/** Sorteia um índice com probabilidade proporcional ao peso. Pesos <= 0 nunca saem. */
export function weightedIndex(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) if (w > 0) total += w;
  if (total <= 0) throw new Error('weightedIndex: nenhum peso positivo');
  let r = rng.next() * total;
  let last = -1;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] as number;
    if (w <= 0) continue;
    last = i;
    r -= w;
    if (r < 0) return i;
  }
  return last;
}

export function weightedPick<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  if (items.length !== weights.length) throw new Error('weightedPick: tamanhos diferentes');
  return items[weightedIndex(rng, weights)] as T;
}

/** Embaralha uma cópia (Fisher-Yates). */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
