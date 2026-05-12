import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LoudnessPoint, WaveformBucket } from "../types";
import { WaveformBackdrop } from "./WaveformBackdrop";
import { RangeBar } from "./RangeBar";
import { formatLufs, formatTime } from "../lib/format";
import { yDomainFromLoudness, ticksForDomain, interpolateLoudnessAtTime } from "../lib/loudnessMath";

export interface LoudnessChartProps {
  data: LoudnessPoint[];
  waveform: WaveformBucket[];
  duration: number;
  integrated: number;
  cursorTime: number | null;
  /** Visible time window in seconds. */
  timeRange: { start: number; end: number };
  onTimeRangeChange: (start: number, end: number) => void;
  fullScaleY: boolean;
  onFullScaleYChange: (v: boolean) => void;
  /** Manual Y window in LUFS (null = auto/percentile). */
  manualYRange: [number, number] | null;
  onManualYRangeChange: (r: [number, number] | null) => void;
  /** Called on hover with seconds; null when the pointer leaves the plot. */
  onHoverTime: (t: number | null) => void;
  /** Whether Space-to-play is currently armed for this chart. */
  isArmed: boolean;
}

const PLOT_PADDING = {
  top: 8,
  right: 16,
  bottom: 30, // matches X_AXIS_HEIGHT below
  left: 0,
} as const;
const Y_AXIS_WIDTH = 44;
const X_AXIS_HEIGHT = 30;
/** Viewport at or below this width uses stacked chart + full-width LUFS bar. */
const MOBILE_MAX_WIDTH_PX = 640;
const MIN_TIME_SPAN = 0.5;
const MIN_LUFS_SPAN = 3;
const ABS_Y_MIN = -70;
const ABS_Y_MAX = 0;
const FONT_MONO = "var(--font-mono)";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Binary search for first index i where data[i].time >= t.
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

interface ChartCoreProps {
  data: LoudnessPoint[];
  xDomain: [number, number];
  yDomain: [number, number];
  yTicks: number[];
  integrated: number;
  yAxisWidth: number;
  tickFontSize: number;
  xAxisHeight: number;
}

/**
 * Heavy Recharts subtree, isolated and memoed so frequent hover state changes
 * in the parent don't trigger SVG path re-computation.
 */
const ChartCore = memo(function ChartCore({
  data,
  xDomain,
  yDomain,
  yTicks,
  integrated,
  yAxisWidth,
  tickFontSize,
  xAxisHeight,
}: ChartCoreProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: PLOT_PADDING.top, right: PLOT_PADDING.right, left: PLOT_PADDING.left, bottom: 0 }}
      >
        <XAxis
          type="number"
          dataKey="time"
          domain={xDomain}
          allowDataOverflow
          height={xAxisHeight}
          tickFormatter={(v) => formatTime(v as number)}
          stroke="var(--axis-line)"
          tick={{ fill: "var(--axis-tick)", fontSize: tickFontSize, fontFamily: FONT_MONO }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={yDomain}
          ticks={yTicks}
          tickFormatter={(v) => `${v}`}
          stroke="var(--axis-line)"
          tick={{ fill: "var(--axis-tick)", fontSize: tickFontSize, fontFamily: FONT_MONO }}
          tickLine={false}
          width={yAxisWidth}
          allowDataOverflow
        />
        <ReferenceLine
          y={integrated}
          stroke="var(--chart-integrated)"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <Area
          type="linear"
          dataKey="momentary"
          name="Momentary"
          stroke="var(--chart-momentary)"
          fill="var(--chart-momentary)"
          fillOpacity={0.12}
          strokeWidth={1}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
        <Line
          type="linear"
          dataKey="shortTerm"
          name="Short-term"
          stroke="var(--chart-short-term)"
          strokeWidth={2}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
});

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
  manualYRange,
  onManualYRangeChange,
  onHoverTime,
  isArmed,
}: LoudnessChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const plotBoxRef = useRef<HTMLDivElement>(null);
  const [plotBox, setPlotBox] = useState({ width: 0, height: 0 });

  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const xAxisPixels = compact ? 34 : X_AXIS_HEIGHT;
  const yAxisW = compact ? 34 : Y_AXIS_WIDTH;
  const tickFs = compact ? 12 : 11;

  // Measure the inner plot container so we can map clientX <-> seconds.
  useLayoutEffect(() => {
    const el = plotBoxRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setPlotBox({ width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- Visible-window data slice (binary search, ~O(log N)) ----
  // Recharts walks every point in `data` on each render to compute paths, so
  // slicing here makes pan/zoom scale with the *visible* window, not the file.
  const windowData = useMemo(() => {
    if (!data.length) return data;
    const lo = lowerBound(data, timeRange.start);
    const hi = lowerBound(data, timeRange.end);
    const startIdx = Math.max(0, lo - 1);
    const endIdx = Math.min(data.length - 1, hi);
    return data.slice(startIdx, endIdx + 1);
  }, [data, timeRange.start, timeRange.end]);

  // ---- Y domain ----
  const autoY = useMemo(() => yDomainFromLoudness(windowData, false), [windowData]);
  const yDomain: [number, number] = useMemo(() => {
    if (fullScaleY) return [ABS_Y_MIN, ABS_Y_MAX];
    if (manualYRange) return manualYRange;
    return autoY;
  }, [autoY, fullScaleY, manualYRange]);
  const yTicks = useMemo(() => ticksForDomain(yDomain), [yDomain]);
  const xDomain: [number, number] = useMemo(
    () => [timeRange.start, timeRange.end],
    [timeRange.start, timeRange.end],
  );

  // ---- Time <-> pixel helpers ----
  const plotLeftPx = yAxisW + PLOT_PADDING.left;
  const plotRightPx = Math.max(plotLeftPx, plotBox.width - PLOT_PADDING.right);
  const plotWidthPx = Math.max(1, plotRightPx - plotLeftPx);
  const plotTopPx = PLOT_PADDING.top;
  const plotBottomPx = Math.max(plotTopPx, plotBox.height - xAxisPixels);
  const plotInnerHeightPx = Math.max(1, plotBottomPx - plotTopPx);

  const tSpan = Math.max(1e-6, timeRange.end - timeRange.start);
  const timeToX = useCallback(
    (t: number) => plotLeftPx + ((t - timeRange.start) / tSpan) * plotWidthPx,
    [plotLeftPx, plotWidthPx, tSpan, timeRange.start],
  );
  const xToTime = useCallback(
    (xRelPlotBox: number) => {
      const f = clamp((xRelPlotBox - plotLeftPx) / plotWidthPx, 0, 1);
      return timeRange.start + f * tSpan;
    },
    [plotLeftPx, plotWidthPx, tSpan, timeRange.start],
  );

  // ---- Hover handling on a transparent layer over the plot ----
  // We throttle hover state to rAF so a 120Hz pointermove burst becomes 1
  // update per frame (Recharts is memoed so it won't re-render, but the
  // overlay still needs to paint).
  const [hoverX, setHoverX] = useState<number | null>(null);
  const hoverRafRef = useRef(0);
  const pendingHoverRef = useRef<{ x: number | null; t: number | null }>({ x: null, t: null });

  const flushHover = useCallback(() => {
    hoverRafRef.current = 0;
    const { x, t } = pendingHoverRef.current;
    setHoverX(x);
    onHoverTime(t);
  }, [onHoverTime]);

  const queueHover = useCallback(
    (x: number | null, t: number | null) => {
      pendingHoverRef.current = { x, t };
      if (!hoverRafRef.current) {
        hoverRafRef.current = requestAnimationFrame(flushHover);
      }
    },
    [flushHover],
  );

  useEffect(() => {
    return () => {
      if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
    };
  }, []);

  // ---- Wheel: zoom + pan, rAF-coalesced ----
  // Refs hold the "live" target ranges so multiple wheel events in the same
  // frame accumulate, but React only re-renders once per frame.
  const liveTimeRangeRef = useRef(timeRange);
  const liveManualYRef = useRef<[number, number] | null>(manualYRange);
  const wheelRafRef = useRef(0);

  useEffect(() => {
    liveTimeRangeRef.current = timeRange;
  }, [timeRange]);
  useEffect(() => {
    liveManualYRef.current = manualYRange;
  }, [manualYRange]);

  const flushWheel = useCallback(() => {
    wheelRafRef.current = 0;
    const tr = liveTimeRangeRef.current;
    onTimeRangeChange(tr.start, tr.end);
    const my = liveManualYRef.current;
    if (my) onManualYRangeChange(my);
  }, [onManualYRangeChange, onTimeRangeChange]);

  const scheduleFlush = useCallback(() => {
    if (!wheelRafRef.current) {
      wheelRafRef.current = requestAnimationFrame(flushWheel);
    }
  }, [flushWheel]);

  const fullScaleYRef = useRef(fullScaleY);
  const autoYRef = useRef(autoY);
  const onFullScaleYChangeRef = useRef(onFullScaleYChange);
  useEffect(() => {
    fullScaleYRef.current = fullScaleY;
  }, [fullScaleY]);
  useEffect(() => {
    autoYRef.current = autoY;
  }, [autoY]);
  useEffect(() => {
    onFullScaleYChangeRef.current = onFullScaleYChange;
  }, [onFullScaleYChange]);

  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<
    | {
        mode: "time";
        d0: number;
        span0: number;
        anchorFrac: number;
        start0: number;
        end0: number;
      }
    | { mode: "y"; d0: number; span0: number; mid: number; ymin0: number; ymax0: number }
    | null
  >(null);

  // Native pointer events: two-finger pinch (time or LUFS) + single-finger scrub.
  // iOS/Android do not emit wheel+ctrlKey for pinch on a div; this path mirrors desktop zoom.
  useEffect(() => {
    const el = plotBoxRef.current;
    if (!el) return;

    const pointers = pointersRef.current;
    const pinch = pinchRef;

    const syncPinchBase = () => {
      if (pointers.size !== 2) {
        pinch.current = null;
        return;
      }
      const pts = [...pointers.values()];
      const d0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (d0 < 12) {
        pinch.current = null;
        return;
      }
      const r = el.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - r.left;
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const vertical = Math.abs(dy) > Math.abs(dx);
      const live = liveTimeRangeRef.current;
      const spanT = Math.max(1e-6, live.end - live.start);
      const pl = plotLeftPx;
      const pw = plotWidthPx;

      if (vertical && !fullScaleYRef.current) {
        const cur = liveManualYRef.current ?? autoYRef.current;
        const ymin0 = cur[0];
        const ymax0 = cur[1];
        pinch.current = {
          mode: "y",
          d0,
          span0: ymax0 - ymin0,
          mid: (ymin0 + ymax0) / 2,
          ymin0,
          ymax0,
        };
        return;
      }

      const anchorFrac = clamp((midX - pl) / pw, 0, 1);
      pinch.current = {
        mode: "time",
        d0,
        span0: spanT,
        anchorFrac,
        start0: live.start,
        end0: live.end,
      };
    };

    const applyTimePinch = (d: number) => {
      const p = pinch.current;
      if (!p || p.mode !== "time") return;
      const minSpan = Math.max(MIN_TIME_SPAN, duration / 5000);
      const newSpan = clamp(p.span0 * (p.d0 / d), minSpan, duration);
      const anchorTime = p.start0 + p.anchorFrac * p.span0;
      let newStart = anchorTime - p.anchorFrac * newSpan;
      let newEnd = newStart + newSpan;
      if (newStart < 0) {
        newEnd -= newStart;
        newStart = 0;
      }
      if (newEnd > duration) {
        newStart -= newEnd - duration;
        newEnd = duration;
      }
      liveTimeRangeRef.current = {
        start: Math.max(0, newStart),
        end: Math.min(duration, newEnd),
      };
      scheduleFlush();
    };

    const applyYPinch = (d: number) => {
      const p = pinch.current;
      if (!p || p.mode !== "y") return;
      if (fullScaleYRef.current) onFullScaleYChangeRef.current(false);
      const newSpan = clamp(p.span0 * (p.d0 / d), MIN_LUFS_SPAN, ABS_Y_MAX - ABS_Y_MIN);
      let lo = p.mid - newSpan / 2;
      let hi = p.mid + newSpan / 2;
      if (lo < ABS_Y_MIN) {
        hi += ABS_Y_MIN - lo;
        lo = ABS_Y_MIN;
      }
      if (hi > ABS_Y_MAX) {
        lo -= hi - ABS_Y_MAX;
        hi = ABS_Y_MAX;
      }
      liveManualYRef.current = [
        clamp(lo, ABS_Y_MIN, ABS_Y_MAX - MIN_LUFS_SPAN),
        clamp(hi, ABS_Y_MIN + MIN_LUFS_SPAN, ABS_Y_MAX),
      ];
      scheduleFlush();
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) syncPinchBase();
    };

    const onMove = (e: PointerEvent) => {
      // Mouse (and pen) hover without a prior pointerdown: still emit scrub position.
      // The pointers map is only filled on pointerdown; desktop hover used to work via
      // React pointermove before we unified on native listeners.
      const hoverOnlyMove =
        (e.pointerType === "mouse" || e.pointerType === "pen") && e.buttons === 0;
      if (hoverOnlyMove && pointers.size < 2) {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left;
        if (x < plotLeftPx || x > plotRightPx) queueHover(null, null);
        else queueHover(x, xToTime(x));
        return;
      }

      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {
        if (!pinch.current) syncPinchBase();
        if (pinch.current) {
          e.preventDefault();
          const pts = [...pointers.values()];
          const d = Math.max(12, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
          if (pinch.current.mode === "time") applyTimePinch(d);
          else applyYPinch(d);
        }
        return;
      }

      if (pointers.size === 1) {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left;
        if (x < plotLeftPx || x > plotRightPx) queueHover(null, null);
        else queueHover(x, xToTime(x));
      }
    };

    const clearPointer = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch.current = null;
      if (pointers.size === 0) queueHover(null, null);
    };

    const onLeave = () => {
      pointers.clear();
      pinch.current = null;
      queueHover(null, null);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove, { passive: false });
    el.addEventListener("pointerup", clearPointer);
    el.addEventListener("pointercancel", clearPointer);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", clearPointer);
      el.removeEventListener("pointercancel", clearPointer);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [
    duration,
    plotLeftPx,
    plotRightPx,
    plotWidthPx,
    queueHover,
    scheduleFlush,
    xToTime,
  ]);

  useEffect(() => {
    return () => {
      if (wheelRafRef.current) cancelAnimationFrame(wheelRafRef.current);
    };
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const el = plotBoxRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (x < 0 || x > r.width || y < 0 || y > r.height) return;

      const isPinch = e.ctrlKey;
      const isMouseWheel =
        e.deltaMode > 0 || (Math.abs(e.deltaY) >= 50 && Math.abs(e.deltaX) < 1);
      const shouldZoom = isPinch || isMouseWheel;
      const live = liveTimeRangeRef.current;
      const liveSpan = Math.max(1e-6, live.end - live.start);

      if (shouldZoom) {
        e.preventDefault();
        const intensity = isPinch ? 0.015 : 0.0025;
        const scale = Math.exp(e.deltaY * intensity);
        const minSpan = Math.max(MIN_TIME_SPAN, duration / 5000);
        const newSpan = clamp(liveSpan * scale, minSpan, duration);
        const anchorFrac = clamp((x - plotLeftPx) / plotWidthPx, 0, 1);
        const anchorTime = live.start + anchorFrac * liveSpan;
        let newStart = anchorTime - anchorFrac * newSpan;
        let newEnd = newStart + newSpan;
        if (newStart < 0) {
          newEnd -= newStart;
          newStart = 0;
        }
        if (newEnd > duration) {
          newStart -= newEnd - duration;
          newEnd = duration;
        }
        liveTimeRangeRef.current = {
          start: Math.max(0, newStart),
          end: Math.min(duration, newEnd),
        };
        scheduleFlush();
        return;
      }

      e.preventDefault();
      const dxTime = (e.deltaX / plotWidthPx) * liveSpan;
      let newStart = live.start + dxTime;
      let newEnd = live.end + dxTime;
      if (newStart < 0) {
        newEnd -= newStart;
        newStart = 0;
      }
      if (newEnd > duration) {
        newStart -= newEnd - duration;
        newEnd = duration;
      }
      if (Math.abs(dxTime) > 0) {
        liveTimeRangeRef.current = {
          start: Math.max(0, newStart),
          end: Math.min(duration, newEnd),
        };
      }

      if (Math.abs(e.deltaY) > 0 && !fullScaleY) {
        const currentY = liveManualYRef.current ?? autoY;
        const ySpan = currentY[1] - currentY[0];
        // Natural scrolling: two fingers down (deltaY < 0) should make the curve
        // drift downward visually, which means the LUFS window shifts up.
        const dy = (e.deltaY / plotInnerHeightPx) * ySpan;
        let newMin = currentY[0] - dy;
        let newMax = currentY[1] - dy;
        if (newMin < ABS_Y_MIN) {
          newMax -= newMin - ABS_Y_MIN;
          newMin = ABS_Y_MIN;
        }
        if (newMax > ABS_Y_MAX) {
          newMin -= newMax - ABS_Y_MAX;
          newMax = ABS_Y_MAX;
        }
        liveManualYRef.current = [
          clamp(newMin, ABS_Y_MIN, ABS_Y_MAX - MIN_LUFS_SPAN),
          clamp(newMax, ABS_Y_MIN + MIN_LUFS_SPAN, ABS_Y_MAX),
        ];
      }

      scheduleFlush();
    },
    [
      autoY,
      duration,
      fullScaleY,
      plotInnerHeightPx,
      plotLeftPx,
      plotWidthPx,
      scheduleFlush,
    ],
  );

  // Non-passive wheel listener so we can preventDefault to suppress page scroll.
  useEffect(() => {
    const el = plotBoxRef.current;
    if (!el) return;
    const listener = (e: WheelEvent) => handleWheel(e);
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, [handleWheel]);

  // ---- Playhead / hover overlay ----
  const cursorPx = useMemo(() => {
    if (cursorTime == null) return null;
    if (cursorTime < timeRange.start || cursorTime > timeRange.end) return null;
    return timeToX(cursorTime);
  }, [cursorTime, timeRange.start, timeRange.end, timeToX]);

  const hoverValues = useMemo(() => {
    if (hoverX == null) return null;
    const t = xToTime(hoverX);
    const v = interpolateLoudnessAtTime(windowData, t);
    return v ? { t, momentary: v.momentary, shortTerm: v.shortTerm } : null;
  }, [hoverX, windowData, xToTime]);

  // Target waveform resolution: ~2 lines per CSS pixel of plot width.
  const waveformMaxBuckets = Math.max(64, Math.round(plotWidthPx * 2));

  const onTimeBarChange = useCallback(
    (s: number, e: number) => onTimeRangeChange(s, e),
    [onTimeRangeChange],
  );
  const onYBarChange = useCallback(
    (s: number, e: number) => {
      if (fullScaleY) onFullScaleYChange(false);
      onManualYRangeChange([s, e]);
    },
    [fullScaleY, onFullScaleYChange, onManualYRangeChange],
  );

  return (
    <div
      ref={wrapRef}
      className={`loudness-chart-wrap${isArmed ? " armed" : ""}`}
      style={{ position: "relative" }}
    >
      <div className="chart-controls-row">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={fullScaleY}
            onChange={(e) => onFullScaleYChange(e.target.checked)}
          />
          <span>Full LUFS scale (−70…0)</span>
        </label>
        {!fullScaleY && manualYRange && (
          <button
            type="button"
            className="link-btn"
            onClick={() => onManualYRangeChange(null)}
            title="Reset to auto-fit Y range"
          >
            Reset Y
          </button>
        )}
      </div>

      <div className="chart-row">
        <div
          ref={plotBoxRef}
          className="chart-plot"
          style={{
            position: "relative",
            flex: 1,
            minWidth: 0,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
            touchAction: "none",
          }}
        >
          {/* Waveform backdrop — clipped to plot area */}
          <div
            style={{
              position: "absolute",
              left: plotLeftPx,
              top: plotTopPx,
              width: plotWidthPx,
              height: plotInnerHeightPx,
              zIndex: 0,
              pointerEvents: "none",
            }}
          >
            <WaveformBackdrop
              buckets={waveform}
              timeStart={timeRange.start}
              timeEnd={timeRange.end}
              maxBuckets={waveformMaxBuckets}
            />
          </div>

          <ChartCore
            data={windowData}
            xDomain={xDomain}
            yDomain={yDomain}
            yTicks={yTicks}
            integrated={integrated}
            yAxisWidth={yAxisW}
            tickFontSize={tickFs}
            xAxisHeight={xAxisPixels}
          />

          {/* Hover line */}
          {hoverX != null && (
            <div
              style={{
                position: "absolute",
                left: hoverX,
                top: plotTopPx,
                width: 1,
                height: plotInnerHeightPx,
                background: "var(--muted-foreground)",
                opacity: 0.45,
                pointerEvents: "none",
                zIndex: 3,
              }}
            />
          )}

          {/* Playhead */}
          {cursorPx != null && (
            <div
              style={{
                position: "absolute",
                left: cursorPx,
                top: plotTopPx,
                width: 2,
                height: plotInnerHeightPx,
                background: "var(--playhead)",
                pointerEvents: "none",
                zIndex: 4,
                boxShadow: "0 0 8px rgba(255,255,255,0.18)",
              }}
            />
          )}

          {/* Hover tooltip */}
          {hoverValues && hoverX != null && (
            <div
              className="hover-tooltip"
              style={{
                position: "absolute",
                left: clamp(hoverX + 12, plotLeftPx, plotRightPx - 180),
                top: plotTopPx + 10,
                pointerEvents: "none",
                zIndex: 5,
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 12,
                color: "var(--foreground)",
                minWidth: 160,
                boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
                fontFamily: FONT_MONO,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <div style={{ fontWeight: 600 }}>{formatTime(hoverValues.t)}</div>
              <div style={{ color: "var(--chart-momentary)", marginTop: 4 }}>
                Momentary: {formatLufs(hoverValues.momentary)}
              </div>
              <div style={{ color: "var(--chart-short-term)" }}>
                Short-term: {formatLufs(hoverValues.shortTerm)}
              </div>
            </div>
          )}
        </div>

        {/* Vertical LUFS bar — desktop / wide viewports */}
        <div className="chart-lufs-side">
          <RangeBar
            orientation="vertical"
            direction="up"
            min={ABS_Y_MIN}
            max={ABS_Y_MAX}
            start={yDomain[0]}
            end={yDomain[1]}
            minSpan={MIN_LUFS_SPAN}
            label="LUFS"
            formatValue={(v) => v.toFixed(0)}
            onChange={onYBarChange}
          />
        </div>
      </div>

      {/* Full-width LUFS window — narrow viewports (chart uses full width above) */}
      <div className="chart-lufs-below">
        <RangeBar
          orientation="horizontal"
          direction="right"
          min={ABS_Y_MIN}
          max={ABS_Y_MAX}
          start={yDomain[0]}
          end={yDomain[1]}
          minSpan={MIN_LUFS_SPAN}
          label="LUFS window"
          formatValue={(v) => v.toFixed(0)}
          onChange={onYBarChange}
        />
      </div>

      {/* Horizontal time range bar */}
      <div className="chart-time-bar" style={{ marginTop: 12, paddingLeft: yAxisW }}>
        <RangeBar
          orientation="horizontal"
          direction="right"
          min={0}
          max={duration}
          start={timeRange.start}
          end={timeRange.end}
          minSpan={MIN_TIME_SPAN}
          label="Time"
          formatValue={(v) => formatTime(v)}
          onChange={onTimeBarChange}
        />
      </div>

      {/* Legend */}
      <div className="chart-legend">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 2, background: "var(--chart-momentary)" }} />
          <span>Momentary</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 2, background: "var(--chart-short-term)" }} />
          <span>Short-term</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 0, borderTop: "1.5px dashed var(--chart-integrated)" }} />
          <span>Integrated</span>
        </span>
      </div>
    </div>
  );
}
