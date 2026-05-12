interface FileStripProps {
  name: string;
  sizeBytes: number;
  onReplace: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  armed: boolean;
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
  armed,
}: FileStripProps) {
  return (
    <div
      className={`card file-strip ${armed ? "armed" : ""}`}
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
          {fmtMb(sizeBytes)} · waveform uses max(|sample|) across channels
        </div>
      </div>
      <button type="button" className="btn ghost" onClick={onReplace} title="Remove file">
        ✕
      </button>
    </div>
  );
}
