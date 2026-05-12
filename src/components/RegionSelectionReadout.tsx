import type { CSSProperties } from "react";
import { formatDbtp, formatLufs, formatTime } from "../lib/format";
import type { HeavyRegionStats, QuickRegionStats } from "../lib/regionLoudnessStats";

export type HeavyUiState =
  | null
  | { kind: "busy" }
  | { kind: "ok"; data: HeavyRegionStats }
  | { kind: "err"; message: string };

interface RegionSelectionReadoutProps {
  t0: number;
  t1: number;
  quick: QuickRegionStats | null;
  heavy: HeavyUiState;
  style: CSSProperties;
}

const rowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 11,
  marginTop: 6,
  color: "var(--muted-foreground)",
};

const valStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  color: "var(--foreground)",
};

export function RegionSelectionReadout({ t0, t1, quick, heavy, style }: RegionSelectionReadoutProps) {
  const a = Math.min(t0, t1);
  const b = Math.max(t0, t1);

  return (
    <div
      className="region-selection-popover"
      style={{
        position: "fixed",
        zIndex: 50,
        width: 288,
        maxWidth: "min(288px, calc(100vw - 24px))",
        padding: "12px 14px",
        background: "color-mix(in srgb, var(--card) 92%, transparent)",
        backdropFilter: "blur(10px)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
        fontSize: 12,
        pointerEvents: "auto",
        ...style,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.08em",
          color: "var(--muted-foreground)",
          marginBottom: 6,
        }}
      >
        SELECTION
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
        {formatTime(a)} → {formatTime(b)}
      </div>

      {quick && (
        <>
          <div style={{ ...rowStyle, marginTop: 10, fontSize: 10, letterSpacing: "0.06em" }}>CURVE (IN WINDOW)</div>
          <div style={rowStyle}>
            <span>Momentary min / max</span>
            <span style={valStyle}>
              {formatLufs(quick.momentary.min)} / {formatLufs(quick.momentary.max)}
            </span>
          </div>
          <div style={rowStyle}>
            <span>Short-term min / max</span>
            <span style={valStyle}>
              {formatLufs(quick.shortTerm.min)} / {formatLufs(quick.shortTerm.max)}
            </span>
          </div>
          <div style={rowStyle}>
            <span>Momentary median · p95</span>
            <span style={{ ...valStyle, color: "var(--chart-momentary)" }}>
              {formatLufs(quick.momentary.median)} · {formatLufs(quick.momentary.p95)}
            </span>
          </div>
          <div style={rowStyle}>
            <span>Short-term median · p95</span>
            <span style={{ ...valStyle, color: "var(--chart-short-term)" }}>
              {formatLufs(quick.shortTerm.median)} · {formatLufs(quick.shortTerm.p95)}
            </span>
          </div>
          <div style={{ ...rowStyle, marginTop: 4, fontSize: 10 }}>
            <span>Points in window</span>
            <span style={valStyle}>{quick.pointCount}</span>
          </div>
        </>
      )}

      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: "1px solid var(--border)",
          fontSize: 10,
          letterSpacing: "0.06em",
          color: "var(--muted-foreground)",
        }}
      >
        METERED ON SLICE (BS.1770)
      </div>
      {!heavy && (
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.45 }}>
          Integrated, LRA, and true peak for this exact window run after you pause dragging or release the mouse
          (debounced so the worklet does not stutter the UI).
        </p>
      )}
      {heavy?.kind === "busy" && (
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--muted-foreground)" }}>Measuring selection…</p>
      )}
      {heavy?.kind === "err" && (
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--destructive)" }}>{heavy.message}</p>
      )}
      {heavy?.kind === "ok" && (
        <div style={{ marginTop: 8 }}>
          <div style={rowStyle}>
            <span>Integrated</span>
            <span style={valStyle}>{formatLufs(heavy.data.integrated)} LUFS</span>
          </div>
          <div style={rowStyle}>
            <span>LRA</span>
            <span style={valStyle}>{heavy.data.lra.toFixed(1)} LU</span>
          </div>
          <div style={rowStyle}>
            <span>True peak (max)</span>
            <span style={{ ...valStyle, color: heavy.data.truePeakMax > -1 ? "var(--destructive)" : undefined }}>
              {formatDbtp(heavy.data.truePeakMax)} dBTP
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
