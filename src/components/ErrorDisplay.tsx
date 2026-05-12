export function ErrorDisplay({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="card" style={{ padding: 24, borderColor: "var(--destructive)" }}>
      <p style={{ margin: 0, fontWeight: 600, color: "var(--destructive)" }}>Could not analyze file</p>
      <p style={{ margin: "12px 0", color: "var(--muted-foreground)", fontSize: 14 }}>{message}</p>
      <button type="button" className="btn" onClick={onRetry}>
        Try another file
      </button>
    </div>
  );
}
