export const G = 9.81;

/** L/h -> m³/s */
export const lphToM3s = (q: number) => q / 3_600_000;
/** m³/s -> L/h */
export const m3sToLph = (q: number) => q * 3_600_000;

/** metres of water column -> kPa */
export const headToKPa = (h: number) => h * G;
/** kPa -> metres of water column */
export const kPaToHead = (kpa: number) => kpa / G;
/** metres -> MPa */
export const headToMPa = (h: number) => (h * G) / 1000;

export const round = (v: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const fmt = (v: number, digits = 1) =>
  Number.isFinite(v) ? v.toFixed(digits) : '—';
