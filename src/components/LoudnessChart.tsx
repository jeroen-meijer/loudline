import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
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
import { RegionSelectionReadout, type HeavyUiState } from "./RegionSelectionReadout";
import { formatLufs, formatTime } from "../lib/format";
import { yDomainFromLoudness, ticksForDomain, interpolateLoudnessAtTime } from "../lib/loudnessMath";
import { analyzeRegionHeavy, computeQuickRegionStats } from "../lib/regionLoudnessStats";

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
  /** Post-normalization buffer; used for desktop selection loudness (worklet re-run). */
  playbackBuffer: AudioBuffer | null;
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
const MIN_REGION_DRAG_PX = 6;
const MIN_REGION_SEC = 0.08;
const HEAVY_DEBOUNCE_MS = 380;

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
  seriesMomentary: string;
  seriesShortTerm: string;
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
  seriesMomentary,
  seriesShortTerm,
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
          name={seriesMomentary}
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
          name={seriesShortTerm}
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
  playbackBuffer,
}: LoudnessChartProps) {
  const { t } = useTranslation();
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

  type TimePair = { t0: number; t1: number };

  const [draftSel, setDraftSel] = useState<TimePair | null>(null);
  const [committedSel, setCommittedSel] = useState<TimePair | null>(null);
  const [exitSel, setExitSel] = useState<TimePair | null>(null);
  const [heavyUi, setHeavyUi] = useState<HeavyUiState>(null);
  const [popPos, setPopPos] = useState<{ left: number; top: number } | null>(null);

  const regionGestureRef = useRef<{
    phase: "maybe" | "drag";
    anchorT: number;
    anchorX: number;
    pointerId: number;
  } | null>(null);
  const draftRafRef = useRef(0);
  const pendingDraftRef = useRef<TimePair | null>(null);
  const lastDraftRef = useRef<TimePair | null>(null);
  const heavyGenRef = useRef(0);
  const heavyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const heavyTargetRef = useRef<TimePair | null>(null);
  const playbackBufferRef = useRef(playbackBuffer);
  const compactRef = useRef(compact);
  const committedSelRef = useRef(committedSel);
  const hasRegionRef = useRef(false);
  const timeRangeZoomRef = useRef(timeRange);
  const selectionOverlayRef = useRef<HTMLDivElement>(null);

  const invalidateHeavy = useCallback(() => {
    heavyGenRef.current += 1;
    if (heavyTimerRef.current) clearTimeout(heavyTimerRef.current);
    setHeavyUi(null);
    heavyTargetRef.current = null;
  }, []);

  const runHeavy = useCallback(async (id: number) => {
    if (id !== heavyGenRef.current) return;
    const buf = playbackBufferRef.current;
    const tgt = heavyTargetRef.current;
    if (!buf || !tgt || compactRef.current) return;
    const t0 = Math.min(tgt.t0, tgt.t1);
    const t1 = Math.max(tgt.t0, tgt.t1);
    if (t1 - t0 < MIN_REGION_SEC) return;
    if (id !== heavyGenRef.current) return;
    setHeavyUi({ kind: "busy" });
    try {
      const d = await analyzeRegionHeavy(buf, t0, t1);
      if (id !== heavyGenRef.current) return;
      if (!d) setHeavyUi({ kind: "err", message: t("selection.tooShort") });
      else setHeavyUi({ kind: "ok", data: d });
    } catch (e) {
      if (id !== heavyGenRef.current) return;
      setHeavyUi({ kind: "err", message: e instanceof Error ? e.message : t("selection.analyzeFailed") });
    }
  }, [t]);

  const scheduleHeavyDebounced = useCallback(() => {
    if (heavyTimerRef.current) clearTimeout(heavyTimerRef.current);
    heavyGenRef.current += 1;
    setHeavyUi(null);
    const id = heavyGenRef.current;
    heavyTimerRef.current = setTimeout(() => void runHeavy(id), HEAVY_DEBOUNCE_MS);
  }, [runHeavy]);

  const flushHeavyImmediate = useCallback(() => {
    if (heavyTimerRef.current) clearTimeout(heavyTimerRef.current);
    heavyGenRef.current += 1;
    const id = heavyGenRef.current;
    void runHeavy(id);
  }, [runHeavy]);

  const scheduleHeavyDebouncedRef = useRef(scheduleHeavyDebounced);

  const flushDraftSelection = useCallback(() => {
    draftRafRef.current = 0;
    const p = pendingDraftRef.current;
    if (p) {
      lastDraftRef.current = p;
      setDraftSel(p);
      heavyTargetRef.current = p;
      scheduleHeavyDebouncedRef.current();
    }
  }, []);

  const flushDraftSelectionRef = useRef(flushDraftSelection);

  const queueDraftSelection = useCallback((t0: number, t1: number) => {
    pendingDraftRef.current = { t0, t1 };
    if (!draftRafRef.current) {
      draftRafRef.current = requestAnimationFrame(() => flushDraftSelectionRef.current());
    }
  }, []);

  const wipeInProgressGesture = useCallback(() => {
    regionGestureRef.current = null;
    pendingDraftRef.current = null;
    if (draftRafRef.current) {
      cancelAnimationFrame(draftRafRef.current);
      draftRafRef.current = 0;
    }
    setDraftSel(null);
    lastDraftRef.current = null;
  }, []);

  const pinchCancelDraft = useCallback(() => {
    wipeInProgressGesture();
  }, [wipeInProgressGesture]);

  const clearCommittedForNewDrag = useCallback(() => {
    setExitSel(null);
    setCommittedSel(null);
    invalidateHeavy();
  }, [invalidateHeavy]);

  const fadeCommittedIfAny = useCallback(() => {
    const c = committedSelRef.current;
    if (c) {
      setExitSel(c);
      setCommittedSel(null);
      invalidateHeavy();
    }
  }, [invalidateHeavy]);

  const requestInstantClearAllSelection = useCallback(() => {
    wipeInProgressGesture();
    regionGestureRef.current = null;
    setCommittedSel(null);
    setExitSel(null);
    invalidateHeavy();
  }, [invalidateHeavy, wipeInProgressGesture]);

  const requestFadeClearAllSelection = useCallback(() => {
    wipeInProgressGesture();
    regionGestureRef.current = null;
    const c = committedSelRef.current;
    setCommittedSel(null);
    if (c) setExitSel(c);
    else setExitSel(null);
    invalidateHeavy();
  }, [invalidateHeavy, wipeInProgressGesture]);

  const commitDraftSelection = useCallback(
    (t0: number, t1: number) => {
      const a = Math.min(t0, t1);
      const b = Math.max(t0, t1);
      if (b - a < MIN_REGION_SEC) return;
      setExitSel(null);
      wipeInProgressGesture();
      lastDraftRef.current = { t0: a, t1: b };
      setCommittedSel({ t0: a, t1: b });
      heavyTargetRef.current = { t0: a, t1: b };
      flushHeavyImmediate();
    },
    [flushHeavyImmediate, wipeInProgressGesture],
  );

  const plotLeaveCancelDraft = useCallback(() => {
    const g = regionGestureRef.current;
    if (g?.phase === "drag" || g?.phase === "maybe") {
      wipeInProgressGesture();
    }
    regionGestureRef.current = null;
  }, [wipeInProgressGesture]);

  useEffect(() => {
    return () => {
      if (draftRafRef.current) cancelAnimationFrame(draftRafRef.current);
      if (heavyTimerRef.current) clearTimeout(heavyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (compact) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear region UI when crossing mobile breakpoint
      requestInstantClearAllSelection();
    }
  }, [compact, requestInstantClearAllSelection]);

  useEffect(() => {
    if (compact) {
      timeRangeZoomRef.current = timeRange;
      return;
    }
    const prev = timeRangeZoomRef.current;
    timeRangeZoomRef.current = timeRange;
    if (prev.start === timeRange.start && prev.end === timeRange.end) return;
    if (!hasRegionRef.current) return;
    requestFadeClearAllSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to visible window span, not timeRange object identity
  }, [compact, timeRange.start, timeRange.end, requestFadeClearAllSelection]);

  useEffect(() => {
    if (compact) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest(".region-selection-popover")) return;
      if (t.closest(".chart-plot")) return;
      if (!hasRegionRef.current) return;
      requestFadeClearAllSelection();
    };
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [compact, requestFadeClearAllSelection]);

  const overlayPair = draftSel ?? committedSel ?? exitSel;
  const quickStats = useMemo(() => {
    if (!overlayPair || compact) return null;
    return computeQuickRegionStats(data, overlayPair.t0, overlayPair.t1);
  }, [overlayPair, data, compact]);

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

  useLayoutEffect(() => {
    if (compact || !overlayPair) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync popover to overlay visibility
      setPopPos(null);
      return;
    }
    const el = selectionOverlayRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cardW = 288;
    const cardH = 260;
    const pad = 10;
    let left = r.right - cardW - pad;
    let top = r.top - cardH - pad;
    if (left < pad) left = pad;
    if (left + cardW > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - cardW - pad);
    if (top < pad) top = Math.min(r.bottom + pad, window.innerHeight - cardH - pad);
    if (top + cardH > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - cardH - pad);
    setPopPos({ left, top });
  }, [
    overlayPair,
    compact,
    plotBox,
    timeRange,
    plotLeftPx,
    plotWidthPx,
    plotTopPx,
    plotInnerHeightPx,
    draftSel,
    committedSel,
    exitSel,
  ]);

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

  const flushDraftForPointerUp = useCallback(() => {
    if (draftRafRef.current) {
      cancelAnimationFrame(draftRafRef.current);
      draftRafRef.current = 0;
    }
    flushDraftSelectionRef.current();
  }, []);

  type PointerRegionCtx = {
    compact: boolean;
    plotLeftPx: number;
    plotRightPx: number;
    xToTime: (x: number) => number;
    pinchCancelDraft: () => void;
    clearCommittedForNewDrag: () => void;
    fadeCommittedIfAny: () => void;
    plotLeaveCancelDraft: () => void;
    commitDraftSelection: (t0: number, t1: number) => void;
    flushDraftForPointerUp: () => void;
    queueDraftSelection: (t0: number, t1: number) => void;
  };

  const pointerRegionRef = useRef<PointerRegionCtx>({
    compact: true,
    plotLeftPx: 0,
    plotRightPx: 0,
    xToTime: () => 0,
    pinchCancelDraft: () => {},
    clearCommittedForNewDrag: () => {},
    fadeCommittedIfAny: () => {},
    plotLeaveCancelDraft: () => {},
    commitDraftSelection: () => {},
    flushDraftForPointerUp: () => {},
    queueDraftSelection: () => {},
  });

  useLayoutEffect(() => {
    playbackBufferRef.current = playbackBuffer;
    compactRef.current = compact;
    committedSelRef.current = committedSel;
    hasRegionRef.current = !!(draftSel ?? committedSel ?? exitSel);
    scheduleHeavyDebouncedRef.current = scheduleHeavyDebounced;
    flushDraftSelectionRef.current = flushDraftSelection;
    pointerRegionRef.current = {
      compact,
      plotLeftPx,
      plotRightPx,
      xToTime,
      pinchCancelDraft,
      clearCommittedForNewDrag,
      fadeCommittedIfAny,
      plotLeaveCancelDraft,
      commitDraftSelection,
      flushDraftForPointerUp,
      queueDraftSelection,
    };
  }, [
    playbackBuffer,
    compact,
    committedSel,
    draftSel,
    exitSel,
    scheduleHeavyDebounced,
    flushDraftSelection,
    plotLeftPx,
    plotRightPx,
    xToTime,
    pinchCancelDraft,
    clearCommittedForNewDrag,
    fadeCommittedIfAny,
    plotLeaveCancelDraft,
    commitDraftSelection,
    flushDraftForPointerUp,
    queueDraftSelection,
  ]);

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
      const pr = pointerRegionRef.current;
      if (pointers.size === 2) {
        pr.pinchCancelDraft();
        regionGestureRef.current = null;
        syncPinchBase();
        return;
      }
      if (!pr.compact && e.pointerType === "mouse" && e.button === 0 && pointers.size === 1) {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left;
        if (x >= pr.plotLeftPx && x <= pr.plotRightPx) {
          regionGestureRef.current = {
            phase: "maybe",
            anchorT: pr.xToTime(x),
            anchorX: x,
            pointerId: e.pointerId,
          };
        } else {
          regionGestureRef.current = null;
        }
      }
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
        pointerRegionRef.current.pinchCancelDraft();
        regionGestureRef.current = null;
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
        const pr = pointerRegionRef.current;
        const rs = regionGestureRef.current;
        if (
          !pr.compact &&
          rs &&
          e.pointerId === rs.pointerId &&
          e.pointerType === "mouse"
        ) {
          const leftDown = (e.buttons & 1) !== 0;
          const r = el.getBoundingClientRect();
          const x = e.clientX - r.left;
          if (rs.phase === "maybe" && leftDown) {
            const dx = Math.abs(x - rs.anchorX);
            if (dx > MIN_REGION_DRAG_PX && x >= pr.plotLeftPx && x <= pr.plotRightPx) {
              rs.phase = "drag";
              pr.clearCommittedForNewDrag();
              const cx = clamp(x, pr.plotLeftPx, pr.plotRightPx);
              const t = pr.xToTime(cx);
              pr.queueDraftSelection(Math.min(rs.anchorT, t), Math.max(rs.anchorT, t));
              return;
            }
          }
          if (rs.phase === "drag" && leftDown) {
            const cx = clamp(x, pr.plotLeftPx, pr.plotRightPx);
            const t = pr.xToTime(cx);
            pr.queueDraftSelection(Math.min(rs.anchorT, t), Math.max(rs.anchorT, t));
            return;
          }
        }

        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left;
        if (x < plotLeftPx || x > plotRightPx) queueHover(null, null);
        else queueHover(x, xToTime(x));
      }
    };

    const clearPointer = (e: PointerEvent) => {
      const pr = pointerRegionRef.current;
      const rs = regionGestureRef.current;
      if (rs && e.pointerId === rs.pointerId) {
        if (rs.phase === "drag") {
          pr.flushDraftForPointerUp();
          const d = lastDraftRef.current;
          if (d && Math.abs(d.t1 - d.t0) >= MIN_REGION_SEC) {
            pr.commitDraftSelection(d.t0, d.t1);
          } else {
            pr.pinchCancelDraft();
          }
        } else if (rs.phase === "maybe") {
          pr.fadeCommittedIfAny();
        }
        regionGestureRef.current = null;
      }
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch.current = null;
      if (pointers.size === 0) queueHover(null, null);
    };

    const onLeave = () => {
      pointerRegionRef.current.plotLeaveCancelDraft();
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

  const regionBounds = useMemo(() => {
    if (!overlayPair || compact) return null;
    const t0 = Math.min(overlayPair.t0, overlayPair.t1);
    const t1 = Math.max(overlayPair.t0, overlayPair.t1);
    const x1 = timeToX(t0);
    const x2 = timeToX(t1);
    const left = clamp(Math.min(x1, x2), plotLeftPx, plotRightPx);
    const right = clamp(Math.max(x1, x2), plotLeftPx, plotRightPx);
    const width = Math.max(2, right - left);
    const isExiting = exitSel !== null && draftSel === null && committedSel === null;
    return { left, width, t0, t1, isExiting };
  }, [overlayPair, compact, timeToX, exitSel, draftSel, committedSel, plotLeftPx, plotRightPx]);

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
      className="loudness-chart-wrap"
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
            {t("chart.resetY")}
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
            seriesMomentary={t("chart.seriesMomentary")}
            seriesShortTerm={t("chart.seriesShortTerm")}
          />

          {regionBounds && (
            <div
              ref={selectionOverlayRef}
              className={`region-selection-layer${regionBounds.isExiting ? " region-selection-layer--exiting" : ""}`}
              style={{
                position: "absolute",
                left: regionBounds.left,
                top: plotTopPx,
                width: regionBounds.width,
                height: plotInnerHeightPx,
                zIndex: 2,
                pointerEvents: "none",
              }}
              onTransitionEnd={(e) => {
                if (e.propertyName === "opacity" && regionBounds.isExiting) {
                  setExitSel(null);
                }
              }}
            >
              <svg
                className="region-selection-svg"
                width="100%"
                height="100%"
                viewBox={`0 0 ${regionBounds.width} ${plotInnerHeightPx}`}
                preserveAspectRatio="none"
              >
                <rect
                  x={1}
                  y={1}
                  width={Math.max(0, regionBounds.width - 2)}
                  height={Math.max(0, plotInnerHeightPx - 2)}
                  rx={6}
                  className="region-selection-rect"
                />
              </svg>
            </div>
          )}

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

      {regionBounds && popPos && !compact && (
        <RegionSelectionReadout
          t0={regionBounds.t0}
          t1={regionBounds.t1}
          quick={quickStats}
          heavy={heavyUi}
          style={{ left: popPos.left, top: popPos.top }}
        />
      )}

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
