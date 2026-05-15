import { useTranslation } from "react-i18next";

interface FileStripProps {
  name: string;
  sizeBytes: number;
  onReplace: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
}

function fmtMb(n: number) {
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileStrip({
  name,
  sizeBytes,
  onReplace,
  onHoverEnter,
  onHoverLeave,
}: FileStripProps) {
  const { t } = useTranslation();

  return (
    <div
      className="card file-strip"
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
          {t("fileStrip.waveformNote", { size: fmtMb(sizeBytes) })}
        </div>
      </div>
      <button type="button" className="btn ghost" onClick={onReplace} title={t("fileStrip.removeFile")}>
        ✕
      </button>
    </div>
  );
}
