# Loudline

Offline EBU R128 loudness metering web app: drag an audio file, see momentary / short-term LUFS over time plus program integrated / LRA / max true peak, with waveform backdrop and Space-to-preview playback. Fully client-side; no upload.

## Tech Stack

- React 19 + TypeScript + Vite
- [`loudness-worklet`](https://www.npmjs.com/package/loudness-worklet) for ITU-R BS.1770-5 / EBU R128 analysis
- Web Audio API (`OfflineAudioContext` for analysis + 48 kHz normalization, `AudioContext` for preview playback)
- Recharts for the loudness graph; custom `RangeBar` overlays for zoom/pan
- Bun for installs, scripts, and CI
- GitHub Pages deployment via GitHub Actions (peaceiris → `pages` branch)

## Key Paths

- `src/App.tsx` — top-level state machine (idle → processing → done/error), keyboard/transport, hover/playhead wiring
- `src/components/LoudnessChart.tsx` — Recharts subtree + custom DOM overlays (playhead, hover line, tooltip) + wheel/pinch zoom/pan
- `src/components/RangeBar.tsx` — reusable horizontal/vertical range slider (replaces Recharts `Brush`)
- `src/components/MeterDisplay.tsx` — Program vs At-Playhead readouts
- `src/components/WaveformBackdrop.tsx` — downsampled SVG amplitude silhouette
- `src/hooks/usePreviewPlayback.ts` — `AudioBufferSourceNode` playback with rAF time sync
- `src/lib/analyzeOffline.ts` — `loudness-worklet` pipeline + summary stats
- `src/lib/normalizeTo48k.ts` — `OfflineAudioContext` resample to 48 kHz
- `src/lib/loudnessMath.ts` — interpolation, percentile-based Y domain, tick generation
- `src/lib/decodeAudio.ts` — `File` → `AudioBuffer` (handles `ArrayBuffer.slice(0)` gotcha)
- `.github/workflows/deploy-pages.yml` — Pages pipeline (`main` → `pages`)

## Common Commands

```bash
bun install
bun run dev          # http://localhost:5173
bun run lint
bun run build        # tsc -b && vite build
bun run preview      # production bundle at http://localhost:4173

# Local production build matching the GitHub Pages subpath:
VITE_BASE_PATH=/loudline/ bun run build && bun run preview
```

## Workflow Rules

- Run `bun run lint` and `bun run build` before pushing.
- After non-trivial UI changes, smoke-test in the browser (drag a real file in, pan/zoom, hit Space).
- Production behaviour can differ noticeably from dev for chart performance — prefer `bun run preview` over `bun run dev` when investigating lag.

## Git Conventions

Conventional commits, optional scope:

- `feat: ...` / `feat(chart): ...`
- `fix: ...`
- `perf: ...`
- `refactor: ...`
- `docs: ...`
- `style: ...`
- `chore: ...`
- `ci: ...`

Branches: `feat/<description>`, `fix/<description>`. Initial / large bootstrap commits may use a sentence-style summary instead of conventional commits.

## Project-Specific Guardrails

- IMPORTANT: All audio decoding/analysis is client-side. Do not introduce any network upload of user audio.
- IMPORTANT: `decodeAudioData` detaches the input `ArrayBuffer`. Always `.slice(0)` before passing in (see `src/lib/decodeAudio.ts`).
- IMPORTANT: Sample rate is normalized to 48 kHz before analysis so `loudness-worklet` operates on a consistent rate (`src/lib/normalizeTo48k.ts`). Don't pass raw decoded buffers to the analyzer.
- IMPORTANT: `loudness-worklet` provides momentary / short-term / integrated / LRA / cumulative true peak only. Do NOT graph "true peak over time" — the worklet exposes a running max, not a per-frame value.
- The chart is performance-sensitive at wheel / pan rates. Keep:
  - `data` passed to `<ChartCore>` sliced to the visible window (binary search in `LoudnessChart.tsx`).
  - Wheel handlers rAF-coalesced via the `liveTimeRangeRef` / `liveManualYRef` pattern.
  - The Recharts subtree memoed; hover state lives in the parent overlay layer.
- `cursorTime` is the single source of truth for the playhead: playback time while playing, hover time when hovered, otherwise `stickyCursor`. Don't add parallel state.
- Natural-scrolling note: macOS inverts `deltaY` at the OS level, so two-fingers-down should shift the LUFS window *up* (subtract `dy`). See `handleWheel` in `LoudnessChart.tsx`.

## Deployment Notes

- GitHub Actions builds with Bun and pushes `dist/` to the `pages` branch via `peaceiris/actions-gh-pages@v4` (force-orphaned).
- Vite base path is driven by `VITE_BASE_PATH` in CI, derived from the repo name.
- Live site: `https://jeroen-meijer.github.io/loudline/`.

## What Not To Add Here

- No secrets, API keys, or telemetry endpoints — the app is intentionally offline-only.
- Avoid duplicating implementation detail; link to source files or the workflow instead.
- Keep this file concise and operational.
