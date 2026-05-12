import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface RangeBarProps {
  /** Absolute lower bound of the value space. */
  min: number;
  /** Absolute upper bound of the value space. */
  max: number;
  /** Current window start. */
  start: number;
  /** Current window end. */
  end: number;
  /** Orientation of the bar. */
  orientation: "horizontal" | "vertical";
  /** Called continuously as the user drags. */
  onChange: (start: number, end: number) => void;
  /** Optional label rendered above/left of the bar. */
  label?: string;
  /** Optional formatter for the start/end value chips. */
  formatValue?: (v: number) => string;
  /** Minimum window size in value units. */
  minSpan?: number;
  /**
   * For vertical orientation, "up" puts max at the top (typical loudness bar).
   * For horizontal orientation, "right" puts max on the right (typical time bar).
   */
  direction?: "up" | "down" | "right" | "left";
  className?: string;
}

type DragMode = "start" | "end" | "window" | null;

/**
 * A custom range selector. Replaces Recharts' Brush with something far cheaper to
 * drag, and also serves as the vertical LUFS zoom bar.
 *
 * It exposes start/end in the same value space as min..max (e.g. seconds or LUFS),
 * so callers do not need to think about pixels.
 */
export function RangeBar({
  min,
  max,
  start,
  end,
  orientation,
  onChange,
  label,
  formatValue,
  minSpan,
  direction,
  className,
}: RangeBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragMode>(null);
  const dragStateRef = useRef<{ startVal: number; endVal: number; anchor: number } | null>(null);

  const isHorizontal = orientation === "horizontal";
  const dir = direction ?? (isHorizontal ? "right" : "up");
  const span = Math.max(1e-9, max - min);
  const minSpanResolved = minSpan ?? span / 1000;

  const valueToFrac = useCallback(
    (v: number) => {
      const f = (v - min) / span;
      return Math.max(0, Math.min(1, f));
    },
    [min, span],
  );

  const fracToValue = useCallback(
    (f: number) => min + f * span,
    [min, span],
  );

  const pointerFrac = useCallback(
    (clientX: number, clientY: number): number => {
      const el = trackRef.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      let raw: number;
      if (isHorizontal) {
        raw = (clientX - r.left) / Math.max(1, r.width);
        if (dir === "left") raw = 1 - raw;
      } else {
        raw = (clientY - r.top) / Math.max(1, r.height);
        if (dir === "up") raw = 1 - raw;
      }
      return Math.max(0, Math.min(1, raw));
    },
    [dir, isHorizontal],
  );

  const startFrac = valueToFrac(Math.min(start, end));
  const endFrac = valueToFrac(Math.max(start, end));

  // Map fractions to CSS percentages depending on direction.
  const a = startFrac;
  const b = endFrac;
  const aPct = `${a * 100}%`;
  const bPct = `${b * 100}%`;
  const sizePct = `${Math.max(0, (b - a) * 100)}%`;

  const trackStyle: React.CSSProperties = isHorizontal
    ? { position: "relative", width: "100%", height: 24, cursor: "pointer" }
    : { position: "relative", width: 24, height: "100%", cursor: "pointer" };

  const windowStyle: React.CSSProperties = (() => {
    if (isHorizontal) {
      if (dir === "right") return { position: "absolute", top: 0, bottom: 0, left: aPct, width: sizePct };
      return { position: "absolute", top: 0, bottom: 0, right: aPct, width: sizePct };
    }
    if (dir === "up") return { position: "absolute", left: 0, right: 0, bottom: aPct, height: sizePct };
    return { position: "absolute", left: 0, right: 0, top: aPct, height: sizePct };
  })();

  const startHandleStyle: React.CSSProperties = (() => {
    if (isHorizontal) {
      const side = dir === "right" ? "left" : "right";
      return { position: "absolute", top: 0, bottom: 0, [side]: aPct, transform: "translateX(-50%)" } as React.CSSProperties;
    }
    const side = dir === "up" ? "bottom" : "top";
    return { position: "absolute", left: 0, right: 0, [side]: aPct, transform: "translateY(50%)" } as React.CSSProperties;
  })();

  const endHandleStyle: React.CSSProperties = (() => {
    if (isHorizontal) {
      const side = dir === "right" ? "left" : "right";
      return { position: "absolute", top: 0, bottom: 0, [side]: bPct, transform: "translateX(-50%)" } as React.CSSProperties;
    }
    const side = dir === "up" ? "bottom" : "top";
    return { position: "absolute", left: 0, right: 0, [side]: bPct, transform: "translateY(50%)" } as React.CSSProperties;
  })();

  const onPointerDown = useCallback(
    (mode: DragMode) => (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const startVal = Math.min(start, end);
      const endVal = Math.max(start, end);
      const anchor = fracToValue(pointerFrac(e.clientX, e.clientY));
      dragStateRef.current = { startVal, endVal, anchor };
      setDrag(mode);
    },
    [end, fracToValue, pointerFrac, start],
  );

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const frac = pointerFrac(e.clientX, e.clientY);
      const v = fracToValue(frac);
      const initial = dragStateRef.current;
      if (!initial) return;
      let newStart = initial.startVal;
      let newEnd = initial.endVal;
      if (drag === "start") {
        newStart = Math.min(v, initial.endVal - minSpanResolved);
        newStart = Math.max(min, newStart);
      } else if (drag === "end") {
        newEnd = Math.max(v, initial.startVal + minSpanResolved);
        newEnd = Math.min(max, newEnd);
      } else if (drag === "window") {
        const delta = v - initial.anchor;
        const winSize = initial.endVal - initial.startVal;
        newStart = initial.startVal + delta;
        newEnd = initial.endVal + delta;
        if (newStart < min) {
          newStart = min;
          newEnd = min + winSize;
        }
        if (newEnd > max) {
          newEnd = max;
          newStart = max - winSize;
        }
      }
      onChange(newStart, newEnd);
    };
    const onUp = () => {
      setDrag(null);
      dragStateRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, fracToValue, max, min, minSpanResolved, onChange, pointerFrac]);

  const wrapperStyle: React.CSSProperties = isHorizontal
    ? { display: "flex", alignItems: "center", gap: 8, width: "100%" }
    : { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%" };

  const labelEl = label ? (
    <div
      className="range-bar-label"
      style={{
        fontSize: 10,
        letterSpacing: "0.06em",
        color: "var(--muted-foreground)",
        textTransform: "uppercase",
        writingMode: isHorizontal ? undefined : "vertical-rl",
        transform: isHorizontal ? undefined : "rotate(180deg)",
      }}
    >
      {label}
    </div>
  ) : null;

  const valueChips = useMemo(() => {
    const fmt = formatValue ?? ((v: number) => v.toFixed(1));
    const lo = fmt(Math.min(start, end));
    const hi = fmt(Math.max(start, end));
    return { lo, hi };
  }, [end, formatValue, start]);

  return (
    <div className={`range-bar ${orientation} ${className ?? ""}`} style={wrapperStyle}>
      {labelEl}
      <div
        ref={trackRef}
        className="range-bar-track"
        style={trackStyle}
        onPointerDown={(e) => {
          // Clicking the empty part of the track grabs the window (pan).
          // Clicking inside the window also pans.
          // Handles are stopPropagation'd below.
          if (e.target !== trackRef.current && (e.target as HTMLElement).dataset?.role !== "window") return;
          onPointerDown("window")(e);
        }}
      >
        <div
          className="range-bar-window"
          style={windowStyle}
          data-role="window"
          onPointerDown={onPointerDown("window")}
        />
        <div
          className="range-bar-handle"
          style={startHandleStyle}
          data-role="start"
          onPointerDown={(e) => {
            e.stopPropagation();
            onPointerDown("start")(e);
          }}
        />
        <div
          className="range-bar-handle"
          style={endHandleStyle}
          data-role="end"
          onPointerDown={(e) => {
            e.stopPropagation();
            onPointerDown("end")(e);
          }}
        />
      </div>
      <div
        className="range-bar-chips"
        style={{
          display: "flex",
          gap: 8,
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          fontSize: 11,
          color: "var(--foreground)",
          minWidth: isHorizontal ? 140 : undefined,
          justifyContent: isHorizontal ? "flex-end" : "center",
        }}
      >
        <span>{valueChips.lo}</span>
        <span style={{ color: "var(--muted-foreground)" }}>→</span>
        <span>{valueChips.hi}</span>
      </div>
    </div>
  );
}
