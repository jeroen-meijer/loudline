import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { platformKey } from "../lib/platformCopy";
import { isTauriDesktop, openAudioFileViaDialog } from "../lib/tauriEnv";
import "./DropZone.css";

interface DropZoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function DropZone({ onFile, disabled }: DropZoneProps) {
  const { t } = useTranslation();
  const [drag, setDrag] = useState(false);
  const desktop = isTauriDesktop();
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = useCallback(
    (files: FileList | null) => {
      const f = files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  const browse = useCallback(async () => {
    if (disabled) return;
    if (desktop) {
      try {
        const f = await openAudioFileViaDialog();
        if (f) onFile(f);
      } catch (err) {
        console.error(err);
      }
      return;
    }
    inputRef.current?.click();
  }, [desktop, disabled, onFile]);

  return (
    <div
      className={`drop-zone ${drag ? "drag" : ""}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => void browse()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void browse();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.flac,.ogg,.aac,.m4a,.webm"
        style={{ display: "none" }}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files)}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDrag(false);
          pick(e.dataTransfer.files);
        }}
      >
        <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>{t("drop.title")}</p>
        <p style={{ margin: "8px 0 0", color: "var(--muted-foreground)", fontSize: 14 }}>
          {t(platformKey("drop.hintWeb", "drop.hintDesktop"))}
        </p>
      </div>
    </div>
  );
}
