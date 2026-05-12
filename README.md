# Loudline

Offline loudness metering in the browser: drag an audio file, see momentary / short-term LUFS over time (via [loudness-worklet](https://www.npmjs.com/package/loudness-worklet)), program integrated / LRA / true peak, waveform backdrop, and Space-to-preview playback.

## Develop

```bash
bun install
bun run dev
```

## Build

```bash
bun run build
```

Preview production build:

```bash
bun run preview
```

## GitHub Pages

Set `VITE_BASE` to your repo path with slashes, e.g. `VITE_BASE=/loudline/` when building for `https://<user>.github.io/loudline/`. For root user pages (`username.github.io`), use `VITE_BASE=/`.

```bash
VITE_BASE=/loudline/ bun run build
```

## CSP / worklet loading

`loudness-worklet` loads its processor via a `blob:` URL by default. If your host uses strict `Content-Security-Policy` that blocks `blob:` for worklets, vendor [`loudness.worklet.js` from upstream releases](https://github.com/lcweden/loudness-worklet/releases) into `public/` and adapt loading to `audioContext.audioWorklet.addModule('/loudness.worklet.js')` (see upstream README).
