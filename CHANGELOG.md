## Upcoming

## 0.5.5

- ci: sign and notarize macOS release builds in publish workflow (Developer ID + App Store Connect API)

## 0.5.4

- fix(ci): use POSIX sh in verify_release_publish.sh (dash rejects `${sha:0:7}`)

## 0.5.3

- ci: publish on squash-merge of release PR (label `release`); tag version after successful release
- ci: checkout tag in publish release job so `gh release create --generate-notes` has a git repo

## 0.5.2

- ci: cache Bun deps and TypeScript build info; tune rust-cache per OS for faster release builds
- ci: require prepended ## Upcoming changelog entries on pull requests

## 0.5.1

- fix(ci): Windows Tauri release build — use cross-platform `beforeBuildCommand` (rely on `TAURI_ENV_PLATFORM` for Vite base)

## 0.5.0

- chore: single source of truth for app version (`package.json` + `tool/sync-version.ts`); version shown in footer
- feat(i18n): `react-i18next` with bundled English (`src/locales/en/`); desktop vs web copy via `platformKey()` (footer privacy, drop hint)
- fix(desktop): dark window background on fast resize (`index.html`, `tauri.conf.json` `backgroundColor`, app root min-height)
- fix(desktop): single drop/browse control in `DropZone` (native dialog on Tauri, hidden file input on web)
- chore: `tool/build-tauri.ts` sync version, lint, and production desktop bundle

## 0.4.0

- feat(desktop): Tauri 2 app for Windows, macOS, and Linux — same UI as the web build, smaller binary than Electron
- feat(desktop): native **Open file…** dialog, **⌘/Ctrl+O**, and window drag-and-drop

## 0.3.0

- fix(chart): restore desktop hover scrub (playhead follows mouse without holding a button) after native pointer refactor
- fix(ui): file-strip hover no longer snaps "At playhead" to t=0 / −70 LUFS; Space-from-file still starts at 0
- fix(ui): remove Space-armed hover ring on file strip and chart (transport hints remain)
- feat(chart): desktop drag-select time range — frosted readout (curve stats + debounced BS.1770 slice), marching dashed border, fade clear on outside click or time zoom

## 0.2.0

- feat(mobile): responsive chart — under 640px, full-width plot with horizontal LUFS window below, taller plot height (`clamp` + `svh`), tighter `#root` padding
- feat(mobile): fixed bottom `MobileTransportDock` with Play/Pause and timecode (safe-area insets, blur strip); `main` bottom padding so scroll content clears the dock
- feat(chart): two-finger pinch on the plot via Pointer Events — predominantly horizontal finger line zooms time; predominantly vertical line zooms the LUFS window (turns off full-scale Y when needed)
- refactor(chart): native pointer listeners on the plot for unified scrub + pinch (replaces React-only pointer move/leave on the chart surface)
- feat(ui): meter cards stack to one column on narrow screens; transport hints switch between desktop (hover + Space) and mobile copy
- fix(dev): `preview.allowedHosts` and `server.allowedHosts` in Vite config so `vite preview --host 0.0.0.0` works behind ngrok and other tunnel hostnames
- docs: README tagline, centered hero screenshot, and Open Graph / Twitter Card metadata for link previews

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
