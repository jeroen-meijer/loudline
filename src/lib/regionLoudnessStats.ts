import type { LoudnessPoint } from "../types";
import { analyzeOffline } from "./analyzeOffline";
import { percentile } from "./loudnessMath";

function lowerBound(data: LoudnessPoint[], t: number): number {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (data[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function medianSorted(sorted: number[]): number {
  if (!sorted.length) return -70;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface QuickRegionStats {
  durationSec: number;
  pointCount: number;
  momentary: { min: number; max: number; median: number; p95: number };
  shortTerm: { min: number; max: number; median: number; p95: number };
}

/**
 * Fast stats from the meter snapshot series in [tLo, tHi] (file seconds).
 * These describe the momentary/short-term curves — not BS.1770 integrated.
 */
export function computeQuickRegionStats(
  data: LoudnessPoint[],
  tLo: number,
  tHi: number,
): QuickRegionStats | null {
  if (!data.length) return null;
  const a = Math.min(tLo, tHi);
  const b = Math.max(tLo, tHi);
  const i0 = lowerBound(data, a);
  const i1 = lowerBound(data, b + 1e-9);
  const slice = data.slice(i0, Math.min(data.length, i1 + 1)).filter((p) => p.time >= a && p.time <= b);
  if (!slice.length) return null;
  const m = slice.map((p) => p.momentary).filter(Number.isFinite);
  const s = slice.map((p) => p.shortTerm).filter(Number.isFinite);
  if (!m.length || !s.length) return null;
  const mSorted = [...m].sort((x, y) => x - y);
  const sSorted = [...s].sort((x, y) => x - y);
  return {
    durationSec: Math.max(0, b - a),
    pointCount: slice.length,
    momentary: {
      min: mSorted[0]!,
      max: mSorted[mSorted.length - 1]!,
      median: medianSorted(mSorted),
      p95: percentile(m, 0.95),
    },
    shortTerm: {
      min: sSorted[0]!,
      max: sSorted[sSorted.length - 1]!,
      median: medianSorted(sSorted),
      p95: percentile(s, 0.95),
    },
  };
}

/** Extract [startSec, endSec] for offline worklet (inclusive-ish by frame bounds). */
export function sliceAudioBuffer(buffer: AudioBuffer, startSec: number, endSec: number): AudioBuffer | null {
  const sr = buffer.sampleRate;
  const t0 = Math.min(startSec, endSec);
  const t1 = Math.max(startSec, endSec);
  const startFrame = Math.max(0, Math.floor(t0 * sr));
  const endFrame = Math.min(buffer.length, Math.ceil(t1 * sr));
  const len = endFrame - startFrame;
  if (len < 64) return null;
  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: len,
    sampleRate: sr,
  });
  const tmp = new Float32Array(len);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    buffer.copyFromChannel(tmp, c, startFrame);
    out.copyToChannel(tmp, c, 0);
  }
  return out;
}

export interface HeavyRegionStats {
  integrated: number;
  lra: number;
  truePeakMax: number;
}

/** Full loudness-worklet pass on the time slice (CPU-heavy — debounce in UI). */
export async function analyzeRegionHeavy(
  buffer: AudioBuffer,
  t0: number,
  t1: number,
): Promise<HeavyRegionStats | null> {
  const sliced = sliceAudioBuffer(buffer, t0, t1);
  if (!sliced) return null;
  const partial = await analyzeOffline(sliced, undefined, 0.1);
  return {
    integrated: partial.integrated,
    lra: partial.lra,
    truePeakMax: partial.truePeakMax,
  };
}
