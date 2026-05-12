import { formatTime } from "../lib/format";

interface MobileTransportDockProps {
  isPlaying: boolean;
  /** Current playhead / scrub time in seconds. */
  timeSec: number;
  onToggle: () => void;
}

/** Fixed bottom bar for touch devices: play/pause without keyboard or hover. */
export function MobileTransportDock({ isPlaying, timeSec, onToggle }: MobileTransportDockProps) {
  return (
    <div className="mobile-transport-dock" role="toolbar" aria-label="Playback">
      <span className="mobile-transport-time">{formatTime(timeSec)}</span>
      <button type="button" className="btn mobile-transport-btn" onClick={onToggle}>
        {isPlaying ? "Pause" : "Play"}
      </button>
    </div>
  );
}
