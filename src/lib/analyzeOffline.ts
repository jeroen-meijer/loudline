import { LoudnessWorkletNode } from "loudness-worklet";
import type { AnalysisProgress, AnalysisResult, LoudnessPoint } from "../types";
import { buildWaveformEnvelope } from "./waveformEnvelope";

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Runs loudness-worklet across the full buffer offline and collects snapshots.
 */
export async function analyzeOffline(
  buffer: AudioBuffer,
  onProgress?: (p: AnalysisProgress) => void,
  snapshotInterval = 0.1,
): Promise<Omit<AnalysisResult, "playbackBuffer" | "waveform">> {
  onProgress?.({ stage: "analyzing", progress: 0 });

  const { numberOfChannels, length, sampleRate, duration } = buffer;
  const offline = new OfflineAudioContext(numberOfChannels, length, sampleRate);

  await LoudnessWorkletNode.loadModule(offline);

  const source = offline.createBufferSource();
  source.buffer = buffer;

  const worklet = new LoudnessWorkletNode(offline, {
    processorOptions: {
      interval: snapshotInterval,
      capacity: Math.max(duration, 1),
    },
  });

  const points: LoudnessPoint[] = [];
  const summary = {
    integrated: -70,
    lra: 0,
    truePeakMax: -70,
  };

  worklet.port.onmessage = (ev: MessageEvent) => {
    const snap = ev.data as import("loudness-worklet").LoudnessSnapshot;
    const m = snap.currentMeasurements?.[0];
    if (!m) return;
    summary.integrated = finiteOr(m.integratedLoudness, -70);
    summary.lra = finiteOr(m.loudnessRange, 0);
    summary.truePeakMax = finiteOr(m.maximumTruePeakLevel, -70);
    points.push({
      time: finiteOr(snap.currentTime, 0),
      momentary: finiteOr(m.momentaryLoudness, -70),
      shortTerm: finiteOr(m.shortTermLoudness, -70),
    });
  };

  source.connect(worklet).connect(offline.destination);
  source.start(0);

  await offline.startRendering();

  onProgress?.({ stage: "analyzing", progress: 1 });

  const integrated = summary.integrated;
  const lra = summary.lra;
  const truePeakMax = summary.truePeakMax;

  return {
    loudnessData: points.length ? points : [{ time: 0, momentary: integrated, shortTerm: integrated }],
    integrated,
    lra,
    truePeakMax,
    duration,
    sampleRate,
    channels: numberOfChannels,
  };
}

export async function analyzeFilePipeline(
  buffer: AudioBuffer,
  onProgress?: (p: AnalysisProgress) => void,
): Promise<AnalysisResult> {
  onProgress?.({ stage: "decoding", progress: 0.5 });
  const { normalizeTo48kHz } = await import("./normalizeTo48k");
  const normalized = await normalizeTo48kHz(buffer);
  onProgress?.({ stage: "decoding", progress: 1 });

  const partial = await analyzeOffline(normalized, onProgress, 0.1);
  const waveform = buildWaveformEnvelope(normalized);

  return {
    ...partial,
    playbackBuffer: normalized,
    waveform,
  };
}
