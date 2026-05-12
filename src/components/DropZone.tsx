import { useCallback, useState } from "react";
import "./DropZone.css";

interface DropZoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function DropZone({ onFile, disabled }: DropZoneProps) {
  const [drag, setDrag] = useState(false);

  const pick = useCallback(
    (files: FileList | null) => {
      const f = files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <label className={`drop-zone ${drag ? "drag" : ""}`}>
      <input
        type="file"
        accept="audio/*,.wav,.mp3,.flac,.ogg,.aac,.m4a,.webm"
        style={{ display: "none" }}
        disabled={disabled}
        onChange={(e) => pick(e.target.files)}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files);
        }}
      >
        <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>Drop audio here</p>
        <p style={{ margin: "8px 0 0", color: "var(--muted-foreground)", fontSize: 14 }}>
          or click to browse — processing stays in your browser
        </p>
      </div>
    </label>
  );
}
