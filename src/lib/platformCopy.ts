import { isTauriDesktop } from "./tauriEnv";

/** Pick web vs desktop (Tauri) copy key suffix. */
export function platformKey(webKey: string, desktopKey: string): string {
  return isTauriDesktop() ? desktopKey : webKey;
}
