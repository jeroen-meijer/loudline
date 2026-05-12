import { useMemo } from "react";
import type { WaveformBucket } from "../types";

interface WaveformBackdropProps {
  buckets: WaveformBucket[];
  timeStart: number;
  timeEnd: number;
  /** Target number of vertical lines drawn (capped to plot width). */
  maxBuckets?: number;
  className?: string;
}

/** Low-opacity amplitude silhouette behind the chart (PCM, not LUFS). */
export function WaveformBackdrop({
  buckets,
  timeStart,
  timeEnd,
  maxBuckets = 1200,
  className,
}: WaveformBackdropProps) {
  const span = Math.max(1e-6, timeEnd - timeStart);
  const w = 1000;
  const h = 200;
  const mid = h / 2;
  const amp = h * 0.45;

  // Downsample to `maxBuckets` lines before generating SVG; otherwise a tight
  // zoom-out on a long master can ask the renderer to draw thousands of
  // vertical lines per frame.
  const lines = useMemo(() => {
    if (!buckets.length) return [];
    // Binary search would be faster, but a one-pass scan is plenty since
    // the bucket array is already small relative to the audio.
    const inRangeStart = lowerBound(buckets, timeStart);
    const inRangeEnd = lowerBound(buckets, timeEnd);
    const visible = buckets.slice(
      Math.max(0, inRangeStart - 1),
      Math.min(buckets.length, inRangeEnd + 1),
    );
    if (!visible.length) return [];

    const target = Math.max(8, maxBuckets);
    if (visible.length <= target) {
      return visible.map((b) => {
        const x = ((b.t - timeStart) / span) * w;
        const y1 = mid - b.max * amp;
        const y2 = mid - b.min * amp;
        return `M ${x.toFixed(1)} ${y1.toFixed(1)} L ${x.toFixed(1)} ${y2.toFixed(1)}`;
      });
    }

    const out: string[] = [];
    const step = visible.length / target;
    for (let i = 0; i < target; i++) {
      const lo = Math.floor(i * step);
      const hi = Math.min(visible.length, Math.floor((i + 1) * step));
      if (hi <= lo) continue;
      let mn = Infinity;
      let mx = -Infinity;
      let tSum = 0;
      let cnt = 0;
      for (let j = lo; j < hi; j++) {
        const b = visible[j];
        if (b.min < mn) mn = b.min;
        if (b.max > mx) mx = b.max;
        tSum += b.t;
        cnt++;
      }
      if (!cnt) continue;
      const t = tSum / cnt;
      const x = ((t - timeStart) / span) * w;
      const y1 = mid - mx * amp;
      const y2 = mid - mn * amp;
      out.push(`M ${x.toFixed(1)} ${y1.toFixed(1)} L ${x.toFixed(1)} ${y2.toFixed(1)}`);
    }
    return out;
  }, [amp, buckets, maxBuckets, mid, span, timeEnd, timeStart, w]);

  if (!lines.length) return null;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: 0.12,
      }}
      aria-hidden
    >
      <path d={lines.join(" ")} stroke="var(--waveform-stroke)" strokeWidth={2} fill="none" />
    </svg>
  );
}

function lowerBound(buckets: WaveformBucket[], t: number): number {
  let lo = 0;
  let hi = buckets.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (buckets[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
