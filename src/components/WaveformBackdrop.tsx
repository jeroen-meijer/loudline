import type { WaveformBucket } from "../types";

interface WaveformBackdropProps {
  buckets: WaveformBucket[];
  timeStart: number;
  timeEnd: number;
  className?: string;
}

/** Low-opacity amplitude silhouette behind the chart (PCM, not LUFS). */
export function WaveformBackdrop({
  buckets,
  timeStart,
  timeEnd,
  className,
}: WaveformBackdropProps) {
  const span = Math.max(1e-6, timeEnd - timeStart);
  const w = 1000;
  const h = 200;
  const mid = h / 2;
  const amp = h * 0.45;

  const inRange = buckets.filter((b) => b.t >= timeStart && b.t <= timeEnd);
  if (!inRange.length) return null;

  const d: string[] = [];
  for (let i = 0; i < inRange.length; i++) {
    const b = inRange[i];
    const x = ((b.t - timeStart) / span) * w;
    const y1 = mid - b.max * amp;
    const y2 = mid - b.min * amp;
    d.push(`M ${x} ${y1} L ${x} ${y2}`);
  }

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
      <path d={d.join(" ")} stroke="var(--waveform-stroke)" strokeWidth={2} fill="none" />
    </svg>
  );
}
