export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);
  return `${m}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function formatLufs(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(1);
}

export function formatDbtp(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}`;
}
