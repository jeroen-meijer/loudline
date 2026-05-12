import { useCallback, useEffect, useRef, useState } from "react";

export interface UsePreviewPlaybackOptions {
  buffer: AudioBuffer | null;
  onTimeUpdate?: (t: number) => void;
}

export function usePreviewPlayback({ buffer, onTimeUpdate }: UsePreviewPlaybackOptions) {
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startCtxTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const playingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopInternal = useCallback(() => {
    stopRaf();
    try {
      sourceRef.current?.stop();
    } catch {
      /* ignore */
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    playingRef.current = false;
    setIsPlaying(false);
  }, [stopRaf]);

  const playFrom = useCallback(
    async (offsetSec: number) => {
      if (!buffer) return;
      stopInternal();
      let ctx = ctxRef.current;
      if (!ctx) {
        ctx = new AudioContext();
        ctxRef.current = ctx;
      }
      await ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      const when = ctx.currentTime;
      const off = Math.max(0, Math.min(offsetSec, buffer.duration - 1e-6));
      startCtxTimeRef.current = when;
      startOffsetRef.current = off;
      src.start(when, off);
      sourceRef.current = src;
      playingRef.current = true;
      setIsPlaying(true);
      onTimeUpdate?.(off);

      const tick = () => {
        const c = ctxRef.current;
        const b = buffer;
        if (!playingRef.current || !c || !b) return;
        const elapsed = c.currentTime - startCtxTimeRef.current;
        const t = Math.min(startOffsetRef.current + elapsed, b.duration);
        onTimeUpdate?.(t);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      src.onended = () => {
        stopInternal();
        onTimeUpdate?.(buffer.duration);
      };
    },
    [buffer, onTimeUpdate, stopInternal],
  );

  const stop = useCallback(() => {
    stopInternal();
  }, [stopInternal]);

  const toggle = useCallback(
    async (startTime?: number) => {
      if (playingRef.current) {
        stop();
      } else {
        await playFrom(startTime ?? 0);
      }
    },
    [playFrom, stop],
  );

  useEffect(() => {
    return () => {
      stopInternal();
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, [stopInternal]);

  return { isPlaying, playFrom, stop, toggle };
}
