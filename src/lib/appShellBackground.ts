import { isTauriDesktop } from "./tauriEnv";

/** Matches `--background` in index.css / tauri.conf.json backgroundColor. */
export const APP_BACKGROUND = "#0b0d10";
const APP_BACKGROUND_RGBA: [number, number, number, number] = [11, 13, 16, 255];

/** Paint html/body immediately; on desktop sync native window + webview color. */
export function initAppShellBackground(): void {
  document.documentElement.style.backgroundColor = APP_BACKGROUND;
  document.body.style.backgroundColor = APP_BACKGROUND;

  if (!isTauriDesktop()) return;

  void (async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();

    const applyNative = () => win.setBackgroundColor(APP_BACKGROUND_RGBA);

    try {
      await applyNative();
    } catch (err) {
      console.error("setBackgroundColor failed:", err);
    }

    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => void applyNative());
    };
    window.addEventListener("resize", onResize);
  })();
}
