import type { LoudnessPoint } from "../types";

export function interpolateLoudnessAtTime(
  data: LoudnessPoint[],
  time: number,
): { momentary: number; shortTerm: number } | null {
  if (!data.length || !Number.isFinite(time)) return null;
  if (time <= data[0].time) {
    return { momentary: data[0].momentary, shortTerm: data[0].shortTerm };
  }
  const last = data[data.length - 1];
  if (time >= last.time) {
    return { momentary: last.momentary, shortTerm: last.shortTerm };
  }
  for (let i = 0; i < data.length - 1; i++) {
    const a = data[i];
    const b = data[i + 1];
    if (time >= a.time && time <= b.time) {
      if (b.time === a.time) return { momentary: a.momentary, shortTerm: a.shortTerm };
      const t = (time - a.time) / (b.time - a.time);
      return {
        momentary: a.momentary + t * (b.momentary - a.momentary),
        shortTerm: a.shortTerm + t * (b.shortTerm - a.shortTerm),
      };
    }
  }
  return null;
}

/** Percentile of finite values in [0,1] p */
export function percentile(values: number[], p: number): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return -60;
  const idx = (v.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return v[lo];
  return v[lo] + (v[hi] - v[lo]) * (idx - lo);
}

export function yDomainFromLoudness(
  data: LoudnessPoint[],
  fullScale: boolean,
): [number, number] {
  const mVals: number[] = [];
  const sVals: number[] = [];
  for (const d of data) {
    if (Number.isFinite(d.momentary)) mVals.push(d.momentary);
    if (Number.isFinite(d.shortTerm)) sVals.push(d.shortTerm);
  }
  const all = [...mVals, ...sVals];
  if (fullScale || !all.length) {
    return [-70, 0];
  }
  const lo = percentile(all, 0.05);
  const hi = percentile(all, 0.95);
  const pad = 2;
  const ymin = Math.max(-70, Math.floor((Math.min(lo, hi) - pad) / 2) * 2);
  const ymax = Math.min(6, Math.ceil((Math.max(lo, hi) + pad) / 2) * 2);
  if (ymax - ymin < 6) {
    const mid = (ymax + ymin) / 2;
    return [Math.max(-70, mid - 8), Math.min(0, mid + 8)] as [number, number];
  }
  return [ymin, ymax] as [number, number];
}

export function ticksForDomain([min, max]: [number, number]): number[] {
  const step = (max - min) <= 12 ? 2 : 5;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-6; v += step) {
    out.push(Math.round(v * 10) / 10);
  }
  return out.length ? out : [min, max];
}
