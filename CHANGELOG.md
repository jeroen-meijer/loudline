## Upcoming

- docs: add app screenshot at the top of the README
- feat: add tagline ("Instantly analyze the loudness of your audio files before you hit play. Drop a track and get a full LUFS graph.") to README
- feat: add social metadata (`description`, Open Graph, Twitter) for rich link previews

## 0.1.0

- feat: initial Loudline app — drag-and-drop offline loudness metering with `loudness-worklet` (momentary, short-term, integrated, LRA, max true peak)
- feat: 48 kHz `OfflineAudioContext` normalization before analysis for consistent measurements across sample rates
- feat(chart): Recharts loudness graph with momentary area, short-term line, integrated reference line, and waveform backdrop
- feat(chart): custom `RangeBar` for horizontal time zoom and vertical LUFS zoom (replaces Recharts `Brush`)
- feat(chart): trackpad pinch and mouse wheel zoom the time axis; two-finger pan moves both axes (natural-scrolling-aware)
- feat(chart): custom DOM overlay for playhead, hover line, and hover readout — stays in sync with playback and pointer
- feat(chart): percentile-based "fit content" Y axis with full-scale (−70…0) toggle and reset-to-auto control
- feat(playback): preview playback via `AudioBufferSourceNode`; Space starts at the hovered time on the chart or at `t=0` from the file strip
- feat(ui): "Program" vs "At playhead" cards, monospaced tabular timestamps, transport state pill, file drop / replace flow, error and progress states
- perf(chart): slice data to the visible window, memo the Recharts subtree, rAF-coalesce wheel/hover, downsample waveform to ~plot width, switch curves to linear interpolation
- ci: GitHub Pages deploy via `peaceiris/actions-gh-pages` to a `pages` branch; `VITE_BASE_PATH` derived from the repo name
- docs: project-specific README, `CLAUDE.md` operating guide, and this changelog
