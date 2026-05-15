import { useTranslation } from "react-i18next";
import { formatDbtp, formatLufs, formatTime } from "../lib/format";

interface MeterDisplayProps {
  integrated: number;
  lra: number;
  truePeakMax: number;
  duration: number;
  sampleRate: number;
  channels: number;
  cursorTime: number | null;
  momentary: number | null;
  shortTerm: number | null;
}

function Cell({
  label,
  value,
  unit,
  large,
  warn,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  large?: boolean;
  warn?: boolean;
  accent?: "momentary" | "short";
}) {
  const color =
    warn ? "var(--destructive)" : accent === "short" ? "var(--chart-short-term)" : accent === "momentary" ? "var(--chart-momentary)" : "var(--foreground)";
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--muted-foreground)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: large ? 26 : 18, fontWeight: 600, color }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{unit}</span>}
      </div>
    </div>
  );
}

export function MeterDisplay({
  integrated,
  lra,
  truePeakMax,
  duration,
  sampleRate,
  channels,
  cursorTime,
  momentary,
  shortTerm,
}: MeterDisplayProps) {
  const { t } = useTranslation();
  const ch =
    channels === 1
      ? t("meter.channelMono")
      : channels === 2
        ? t("meter.channelStereo")
        : t("meter.channelMulti", { count: channels });
  const rate = `${(sampleRate / 1000).toFixed(1)} kHz`;

  return (
    <div className="meter-grid">
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 12 }}>
          {t("meter.program")}
        </div>
        <div className="meter-card-inner">
          <Cell label={t("meter.integrated")} value={formatLufs(integrated)} unit={t("meter.unitLufs")} large />
          <Cell label={t("meter.lra")} value={lra.toFixed(1)} unit={t("meter.unitLu")} />
          <Cell
            label={t("meter.truePeak")}
            value={formatDbtp(truePeakMax)}
            unit={t("meter.unitDbtp")}
            warn={truePeakMax > -1}
          />
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--muted-foreground)" }}>
          {formatTime(duration)} · {rate} · {ch}
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 12 }}>
          {t("meter.atPlayhead")}
        </div>
        {momentary != null && shortTerm != null ? (
          <div className="meter-card-inner">
            <Cell label={t("meter.momentary")} value={formatLufs(momentary)} unit={t("meter.unitLufs")} accent="momentary" />
            <Cell label={t("meter.shortTerm")} value={formatLufs(shortTerm)} unit={t("meter.unitLufs")} large accent="short" />
            <Cell label={t("meter.timecode")} value={formatTime(cursorTime ?? 0)} />
          </div>
        ) : (
          <div style={{ color: "var(--muted-foreground)", fontSize: 14, padding: "12px 0" }}>{t("meter.hoverChart")}</div>
        )}
      </div>
    </div>
  );
}
