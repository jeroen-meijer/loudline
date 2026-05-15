import i18n from "../i18n";

const AUDIO_EXTENSIONS = ["wav", "mp3", "flac", "ogg", "aac", "m4a", "webm", "aiff", "aif"];

/** True when running inside the Tauri desktop shell (not the browser site). */
export function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? "audio";
}

function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    wav: "audio/wav",
    mp3: "audio/mpeg",
    flac: "audio/flac",
    ogg: "audio/ogg",
    aac: "audio/aac",
    m4a: "audio/mp4",
    webm: "audio/webm",
    aiff: "audio/aiff",
    aif: "audio/aiff",
  };
  return map[ext] ?? "application/octet-stream";
}

/** Native open dialog → `File` for the existing decode pipeline. */
export async function openAudioFileViaDialog(): Promise<File | null> {
  if (!isTauriDesktop()) return null;

  const { open } = await import("@tauri-apps/plugin-dialog");
  const { convertFileSrc } = await import("@tauri-apps/api/core");

  const selected = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: i18n.t("dialog.audioFilter"),
        extensions: AUDIO_EXTENSIONS,
      },
    ],
  });
  if (!selected || Array.isArray(selected)) return null;

  const url = convertFileSrc(selected);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read file (${res.status})`);
  const blob = await res.blob();
  const name = fileNameFromPath(selected);
  const type = blob.type && blob.type !== "application/octet-stream" ? blob.type : mimeFromName(name);
  return new File([blob], name, { type });
}
