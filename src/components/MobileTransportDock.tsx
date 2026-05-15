import { useTranslation } from "react-i18next";
import { formatTime } from "../lib/format";

interface MobileTransportDockProps {
  isPlaying: boolean;
  /** Current playhead / scrub time in seconds. */
  timeSec: number;
  onToggle: () => void;
}

/** Fixed bottom bar for touch devices: play/pause without keyboard or hover. */
export function MobileTransportDock({ isPlaying, timeSec, onToggle }: MobileTransportDockProps) {
  const { t } = useTranslation();

  return (
    <div className="mobile-transport-dock" role="toolbar" aria-label={t("transport.toolbarLabel")}>
      <span className="mobile-transport-time">{formatTime(timeSec)}</span>
      <button type="button" className="btn mobile-transport-btn" onClick={onToggle}>
        {isPlaying ? t("transport.pause") : t("transport.play")}
      </button>
    </div>
  );
}
