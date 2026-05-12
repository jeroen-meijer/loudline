import type { AnalysisProgress } from "../types";

export function AnalysisProgressDisplay({ progress }: { progress: AnalysisProgress }) {
  const label = progress.stage === "decoding" ? "Decoding audio…" : "Measuring loudness…";
  const pct = Math.round(progress.progress * 100);
  return (
    <div className="card" style={{ padding: 24 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>
      <div
        style={{
          marginTop: 12,
          height: 8,
          borderRadius: 4,
          background: "var(--border)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--primary)",
            transition: "width 0.2s",
          }}
        />
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>
        {pct}%
      </p>
    </div>
  );
}
