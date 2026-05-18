# Loudline

Offline EBU R128 loudness metering web app: drag an audio file, see momentary / short-term LUFS over time plus program integrated / LRA / max true peak, with waveform backdrop and Space-to-preview playback. Fully client-side; no upload.

## Tech Stack

- React 19 + TypeScript + Vite
- [`loudness-worklet`](https://www.npmjs.com/package/loudness-worklet) for ITU-R BS.1770-5 / EBU R128 analysis
- Web Audio API (`OfflineAudioContext` for analysis + 48 kHz normalization, `AudioContext` for preview playback)
- Recharts for the loudness graph; custom `RangeBar` overlays for zoom/pan
- Bun for installs, scripts, and CI
- Tauri 2 for desktop (Windows / macOS / Linux) — same web UI in the system WebView
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
- `src/i18n/index.ts` — i18next init (bundled locales)
- `src/locales/<lang>/translation.json` — UI strings
- `src/lib/platformCopy.ts` — `platformKey(webKey, desktopKey)` for Tauri vs browser wording
- `src/lib/tauriEnv.ts` — desktop detection, native open dialog, `convertFileSrc`
- `tool/build-tauri.ts` — version sync + lint + `tauri build`
- `tool/prepare_release.sh` — open a release PR (changelog + version bump + `gh pr create`)
- `tool/rewrite_changelog_for_release.sh` — rewrite `CHANGELOG.md` headings for a release
- `.github/workflows/ci.yml` — lint + build on PRs and `main`
- `.github/workflows/publish.yml` — merged release PR → GitHub Pages + GitHub release + version tag
- `tool/verify_release_publish.sh` — sanity checks before publish (label, branch, version, changelog)
- `.github/actions/setup-bun-deps` — Bun install + `actions/cache` for `node_modules` / Bun store
- `.github/actions/setup-rust-tauri` — Rust toolchain + `swatinem/rust-cache` per desktop OS

## Common Commands

```bash
bun install
bun run dev          # http://localhost:5173
bun run lint
bun run build        # tsc -b && vite build
bun run preview      # production bundle at http://localhost:4173

# Local production build matching the GitHub Pages subpath:
VITE_BASE_PATH=/loudline/ bun run build && bun run preview

# Desktop (requires Rust + Tauri prerequisites):
bun run tauri:dev
bun run tauri:build   # → bun tool/build-tauri.ts (installers under src-tauri/target/release/bundle/)
```

## Internationalization

- **Library:** `i18next` + `react-i18next` (initialized in `src/main.tsx` via `import "./i18n"`).
- **Strings:** add keys under `src/locales/en/translation.json`; use `useTranslation()` and `t("key")` in components.
- **Desktop vs web:** do not branch on `isTauriDesktop()` for copy in every component — add paired keys (e.g. `footer.privacyWeb` / `footer.privacyApp`) and use `platformKey()` from `src/lib/platformCopy.ts`.
- **New languages:** add `src/locales/<code>/translation.json` and register in `src/i18n/index.ts`.

## Workflow Rules

- **`main` is protected:** no direct pushes (including admins); changes land via **squash-merge PR** only. Required PR checks: **Lint**, **Build**, **Changelog updated**, **Validate PR Title**. CI runs on pull requests only, not on pushes to `main`.
- Run `bun run lint` and `bun run build` before pushing.
- After non-trivial UI changes, smoke-test in the browser (drag a real file in, pan/zoom, hit Space).
- Production behaviour can differ noticeably from dev for chart performance — prefer `bun run preview` over `bun run dev` when investigating lag.

## Versioning

- **Canonical version:** `package.json` → `"version"`.
- **Web UI:** Vite injects `VITE_APP_VERSION` from `package.json` at build time (`vite.config.ts` → `src/lib/version.ts` → footer).
- **Desktop (Tauri):** `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` must match; synced by `tool/sync-version.ts`.
- **Ad-hoc bump:** `bun run version:set 0.6.0` (updates `package.json` + Tauri).

## Release workflow

1. Add bullets under `## Upcoming` in `CHANGELOG.md` (newest at top).
2. Run `./tool/prepare_release.sh X.Y.Z` → release PR on `chore/release-X.Y.Z` with the **`release`** label.
3. Squash-merge the PR to `main` after CI passes → **Publish Release** runs automatically (Pages, macOS/Windows installers, GitHub release, then git tag `X.Y.Z` on the merge commit).
4. If publish fails after merge, use Actions → **Publish Release** → **Run workflow** with the same version, or **Re-run failed jobs** on the failed run.

macOS `.dmg` signing and notarization for CI: [docs/macos-signing.md](docs/macos-signing.md).

## Changelog Workflow

- All user-visible changes go in `CHANGELOG.md` under `## Upcoming`.
- New entries are added to the **top** of the `## Upcoming` list (prepended above existing bullets). CI enforces this (`tool/check_changelog_pr.sh` / `.github/workflows/changelog.yml`). Release branches `chore/release-*` are exempt.
- On release, `tool/rewrite_changelog_for_release.sh` inserts `## X.Y.Z` under `## Upcoming` and leaves a fresh empty `## Upcoming` (same convention as `in_phase`).
- Before committing:
  - Run `bun run lint` and `bun run build`.
  - Fix any errors and rerun until clean.

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

- **Production web deploy** runs when a **`release`-labeled** release PR is merged to `main` (`.github/workflows/publish.yml`), not on every push to `main`.
- CI builds with Bun, sets `VITE_BASE_PATH=/<repo-name>/`, and pushes `dist/` to the `pages` branch via `peaceiris/actions-gh-pages@v4` (force-orphaned).
- Live site: `https://jeroen-meijer.github.io/loudline/`.

## What Not To Add Here

- No secrets, API keys, or telemetry endpoints — the app is intentionally offline-only.
- Avoid duplicating implementation detail; link to source files or the workflow instead.
- Keep this file concise and operational.
