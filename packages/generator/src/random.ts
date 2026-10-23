/** A seeded random number generator, so a given date always produces the same puzzle. */
export interface Random {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, max). */
  int(max: number): number;
  /** A shuffled copy. */
  shuffle<T>(items: readonly T[]): T[];
}

export function seededRandom(seed: string): Random {
  // FNV-1a hash of the seed, then mulberry32.
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  }

  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (max: number) => Math.floor(next() * max);
  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  };
  return { next, int, shuffle };
}
