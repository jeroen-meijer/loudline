export interface LoudnessPoint {
  time: number;
  momentary: number;
  shortTerm: number;
}

export interface WaveformBucket {
  /** Center time in seconds */
  t: number;
  min: number;
  max: number;
}

export interface AnalysisResult {
  loudnessData: LoudnessPoint[];
  integrated: number;
  lra: number;
  truePeakMax: number;
  duration: number;
  sampleRate: number;
  channels: number;
  /** PCM envelope for backdrop; max(abs) across channels per frame in buckets */
  waveform: WaveformBucket[];
  /** Buffer used for playback + analysis (post 48k normalization when applied) */
  playbackBuffer: AudioBuffer;
}

export type AnalysisStage = "idle" | "decoding" | "analyzing" | "done" | "error";

export interface AnalysisProgress {
  stage: "decoding" | "analyzing";
  progress: number;
}
