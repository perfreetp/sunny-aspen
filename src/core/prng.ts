/**
 * Deterministic, dependency-free PRNG. The whole layout is reproducible from a
 * (params, seed) pair, so 同样的参数 + 同样的种子 => 完全相同的布置.
 */

export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  if (a === 0) a = 0x9e3779b9;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** symmetric uniform in [-1, 1] */
export function jitter(rng: () => number, amount: number): number {
  if (!amount) return 0;
  return (rng() * 2 - 1) * amount;
}

/** FNV-1a over a numeric sequence, used as a layout fingerprint. */
export function hashNumbers(nums: number[]): string {
  let h = 0x811c9dc5;
  for (const n of nums) {
    const v = Math.round(n * 1000) | 0;
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
