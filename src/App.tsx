import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DropZone } from "./components/DropZone";
import { FileStrip } from "./components/FileStrip";
import { LoudnessChart } from "./components/LoudnessChart";
import { MeterDisplay } from "./components/MeterDisplay";
import { AnalysisProgressDisplay } from "./components/AnalysisProgressDisplay";
import { ErrorDisplay } from "./components/ErrorDisplay";
import { usePreviewPlayback } from "./hooks/usePreviewPlayback";
import { decodeFileToBuffer } from "./lib/decodeAudio";
import { analyzeFilePipeline } from "./lib/analyzeOffline";
import { interpolateLoudnessAtTime } from "./lib/loudnessMath";
import type { AnalysisProgress, AnalysisResult } from "./types";

type AppState = "idle" | "processing" | "done" | "error";

export default function App() {
  const [state, setState] = useState<AppState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress>({ stage: "decoding", progress: 0 });
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [isChartHovered, setIsChartHovered] = useState(false);
  const isChartHoveredRef = useRef(false);
  const [isFileHovered, setIsFileHovered] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [stickyCursor, setStickyCursor] = useState(0);

  const [timeRange, setTimeRange] = useState({ start: 0, end: 1 });
  const [fullScaleY, setFullScaleY] = useState(false);
  const [manualYRange, setManualYRange] = useState<[number, number] | null>(null);

  const { isPlaying, toggle, stop } = usePreviewPlayback({
    buffer: result?.playbackBuffer ?? null,
    onTimeUpdate: (t) => {
      setPlaybackTime(t);
      setStickyCursor(t);
    },
  });

  const cursorTime = useMemo(() => {
    if (isPlaying) return playbackTime;
    if (hoverTime != null) return hoverTime;
    return stickyCursor;
  }, [hoverTime, isPlaying, playbackTime, stickyCursor]);

  const valuesAtCursor = useMemo(() => {
    if (!result) return { momentary: null as number | null, shortTerm: null as number | null };
    return interpolateLoudnessAtTime(result.loudnessData, cursorTime) ?? {
      momentary: null,
      shortTerm: null,
    };
  }, [result, cursorTime]);

  const armedForStart = (isChartHovered || isFileHovered) && !isPlaying;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (state !== "done" || !result) return;
      if (isPlaying) {
        e.preventDefault();
        stop();
        return;
      }
      if (isChartHovered || isFileHovered) {
        e.preventDefault();
        // From file strip: always start at t=0.
        // From chart: start at the hovered time (or last sticky cursor as a fallback).
        let start = 0;
        if (isChartHovered) {
          start = hoverTime ?? stickyCursor ?? 0;
        }
        void toggle(start);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, result, isPlaying, isChartHovered, isFileHovered, hoverTime, stickyCursor, toggle, stop]);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setState("processing");
    setError(null);
    setResult(null);
    stop();
    setProgress({ stage: "decoding", progress: 0 });
    try {
      const raw = await decodeFileToBuffer(f);
      const res = await analyzeFilePipeline(raw, setProgress);
      setResult(res);
      setTimeRange({ start: 0, end: res.duration });
      setStickyCursor(0);
      setManualYRange(null);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }, [stop]);

  const reset = useCallback(() => {
    stop();
    setFile(null);
    setResult(null);
    setError(null);
    setState("idle");
    setHoverTime(null);
  }, [stop]);

  const onChartHover = useCallback((t: number | null) => {
    setHoverTime(t);
    if (t != null) setStickyCursor(t);
  }, []);

  return (
    <div className="app-root">
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 3, height: 22, borderRadius: 2, background: "var(--primary)" }} />
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.02em" }}>Loudline</h1>
        </div>
        <p style={{ margin: "6px 0 0", color: "var(--muted-foreground)", fontSize: 14 }}>
          Offline loudness analysis for your masters
        </p>
      </header>

      <main style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {state === "idle" && <DropZone onFile={handleFile} />}
        {state === "processing" && <AnalysisProgressDisplay progress={progress} />}
        {state === "error" && error && <ErrorDisplay message={error} onRetry={reset} />}
        {state === "done" && file && result && (
          <>
            <FileStrip
              name={file.name}
              sizeBytes={file.size}
              onReplace={reset}
              onHoverEnter={() => {
                setIsFileHovered(true);
                setHoverTime(0);
              }}
              onHoverLeave={() => {
                setIsFileHovered(false);
                if (!isChartHoveredRef.current) setHoverTime(null);
              }}
              armed={armedForStart && isFileHovered}
            />
            <div
              onMouseEnter={() => {
                isChartHoveredRef.current = true;
                setIsChartHovered(true);
              }}
              onMouseLeave={() => {
                isChartHoveredRef.current = false;
                setIsChartHovered(false);
                setHoverTime(null);
              }}
            >
              <LoudnessChart
                data={result.loudnessData}
                waveform={result.waveform}
                duration={result.duration}
                integrated={result.integrated}
                cursorTime={cursorTime}
                timeRange={timeRange}
                onTimeRangeChange={(start, end) => setTimeRange({ start, end })}
                fullScaleY={fullScaleY}
                onFullScaleYChange={setFullScaleY}
                manualYRange={manualYRange}
                onManualYRangeChange={setManualYRange}
                onHoverTime={onChartHover}
                isArmed={armedForStart && isChartHovered}
              />
            </div>
            <MeterDisplay
              integrated={result.integrated}
              lra={result.lra}
              truePeakMax={result.truePeakMax}
              duration={result.duration}
              sampleRate={result.sampleRate}
              channels={result.channels}
              cursorTime={cursorTime}
              momentary={valuesAtCursor.momentary}
              shortTerm={valuesAtCursor.shortTerm}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                flexWrap: "wrap",
                fontSize: 12,
                color: "var(--muted-foreground)",
              }}
            >
              <span>Hover chart or file</span>
              <span>·</span>
              <span>
                <kbd className="kbd">Space</kbd> play / stop
              </span>
              <span>·</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {isPlaying ? (
                  <>
                    <span className="transport-dot" />
                    <strong style={{ color: "var(--primary)" }}>Playing</strong>
                  </>
                ) : (
                  <span>Paused</span>
                )}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }}>
              Large files are fully decoded in memory; very long masters may stress low-RAM devices.
            </p>
          </>
        )}
      </main>

      <footer style={{ marginTop: 48, paddingTop: 20, borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--muted-foreground)", textAlign: "center" }}>
        All processing happens locally in your browser. No upload.
      </footer>
    </div>
  );
}
