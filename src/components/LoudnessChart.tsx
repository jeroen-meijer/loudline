import {
  Area,
  Brush,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCallback, useMemo } from "react";
import type { LoudnessPoint } from "../types";
import { WaveformBackdrop } from "./WaveformBackdrop";
import type { WaveformBucket } from "../types";
import { formatLufs, formatTime } from "../lib/format";
import { yDomainFromLoudness, ticksForDomain } from "../lib/loudnessMath";

export interface LoudnessChartProps {
  data: LoudnessPoint[];
  waveform: WaveformBucket[];
  duration: number;
  integrated: number;
  cursorTime: number | null;
  /** Visible window in seconds */
  timeRange: { start: number; end: number };
  onTimeRangeChange: (start: number, end: number) => void;
  fullScaleY: boolean;
  onFullScaleYChange: (v: boolean) => void;
  onHoverTime: (t: number | null) => void;
  isArmed: boolean;
}

export function LoudnessChart({
  data,
  waveform,
  duration,
  integrated,
  cursorTime,
  timeRange,
  onTimeRangeChange,
  fullScaleY,
  onFullScaleYChange,
  onHoverTime,
  isArmed,
}: LoudnessChartProps) {
  const chartData = data;

  const yDomain = useMemo(
    () =>
      yDomainFromLoudness(
        data.filter((d) => d.time >= timeRange.start && d.time <= timeRange.end),
        fullScaleY,
      ),
    [data, fullScaleY, timeRange.end, timeRange.start],
  );
  const yTicks = useMemo(() => ticksForDomain(yDomain), [yDomain]);

  const brushStartIndex = useMemo(() => {
    let i = 0;
    for (; i < data.length; i++) {
      if (data[i].time >= timeRange.start) break;
    }
    return Math.min(i, Math.max(0, data.length - 1));
  }, [data, timeRange.start]);

  const brushEndIndex = useMemo(() => {
    let i = data.length - 1;
    for (; i >= 0; i--) {
      if (data[i].time <= timeRange.end) break;
    }
    return Math.max(i, 0);
  }, [data, timeRange.end]);

  const handleBrush = useCallback(
    (e: { startIndex?: number; endIndex?: number }) => {
      const s = e.startIndex ?? 0;
      const en = e.endIndex ?? data.length - 1;
      const t0 = data[s]?.time ?? 0;
      const t1 = data[en]?.time ?? duration;
      onTimeRangeChange(t0, Math.min(t1, duration));
    },
    [data, duration, onTimeRangeChange],
  );

  const handleMouseMove = useCallback((state: unknown) => {
    const s = state as { activePayload?: { payload: LoudnessPoint }[] };
    const p = s?.activePayload?.[0]?.payload;
    if (p) onHoverTime(p.time);
  }, [onHoverTime]);

  const handleMouseLeave = useCallback(() => {
    onHoverTime(null);
  }, [onHoverTime]);

  const showPlayhead =
    cursorTime != null &&
    cursorTime >= timeRange.start - 1e-3 &&
    cursorTime <= timeRange.end + 1e-3;

  return (
    <div
      className={`loudness-chart-wrap ${isArmed ? " armed" : ""}`}
      style={{ position: "relative", height: 320 }}
    >
      <div style={{ position: "absolute", inset: 36, opacity: 1, zIndex: 0 }}>
        <WaveformBackdrop
          buckets={waveform}
          timeStart={timeRange.start}
          timeEnd={timeRange.end}
        />
      </div>
      <div style={{ position: "relative", zIndex: 1, height: "100%" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginBottom: 8 }}>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={fullScaleY}
              onChange={(e) => onFullScaleYChange(e.target.checked)}
            />
            <span>Full LUFS scale (−70…0)</span>
          </label>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 16, left: 0, bottom: 40 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <XAxis
              type="number"
              dataKey="time"
              domain={[timeRange.start, timeRange.end]}
              allowDataOverflow
              tickFormatter={(v) => formatTime(v as number)}
              stroke="var(--muted-foreground)"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              domain={yDomain}
              ticks={yTicks}
              tickFormatter={(v) => `${v}`}
              stroke="var(--muted-foreground)"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              width={44}
            />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }}
              labelFormatter={(v) => formatTime(v as number)}
              formatter={(value, name) => [formatLufs(Number(value)), String(name)]}
            />
            <Legend />
            <ReferenceLine
              y={integrated}
              stroke="var(--chart-integrated)"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            {showPlayhead && (
              <ReferenceLine
                x={cursorTime!}
                stroke="var(--playhead)"
                strokeWidth={2}
                strokeDasharray="4 2"
              />
            )}
            <Area
              type="monotone"
              dataKey="momentary"
              name="Momentary"
              stroke="var(--chart-momentary)"
              fill="var(--chart-momentary)"
              fillOpacity={0.12}
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="shortTerm"
              name="Short-term"
              stroke="var(--chart-short-term)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Brush
              dataKey="time"
              height={28}
              stroke="var(--border)"
              fill="var(--chart-brush)"
              travellerWidth={8}
              startIndex={brushStartIndex}
              endIndex={brushEndIndex}
              onChange={handleBrush}
              tickFormatter={(v) => formatTime(v as number)}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
