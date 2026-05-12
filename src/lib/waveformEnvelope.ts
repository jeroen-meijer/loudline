import type { WaveformBucket } from "../types";

const DEFAULT_BUCKETS = 2048;

/**
 * Builds a downsampled min/max envelope per time bucket.
 * **Merge rule:** per frame, `max(abs(sample))` across channels (documented in UI).
 */
export function buildWaveformEnvelope(
  buffer: AudioBuffer,
  bucketCount: number = DEFAULT_BUCKETS,
): WaveformBucket[] {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const sr = buffer.sampleRate;
  if (len === 0 || ch === 0) return [];

  const buckets = Math.min(bucketCount, Math.max(1, Math.floor(len / 64)));
  const out: WaveformBucket[] = [];
  const framesPerBucket = len / buckets;

  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * framesPerBucket);
    const end = Math.min(len, Math.floor((b + 1) * framesPerBucket));
    let peak = 0;
    for (let i = start; i < end; i++) {
      let m = 0;
      for (let c = 0; c < ch; c++) {
        const v = Math.abs(buffer.getChannelData(c)[i]);
        if (v > m) m = v;
      }
      if (m > peak) peak = m;
    }
    const t = ((start + end) / 2) / sr;
    out.push({ t, min: -peak, max: peak });
  }
  return out;
}
