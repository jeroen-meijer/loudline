import { useTranslation } from "react-i18next";

export function ErrorDisplay({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="card" style={{ padding: 24, borderColor: "var(--destructive)" }}>
      <p style={{ margin: 0, fontWeight: 600, color: "var(--destructive)" }}>{t("error.title")}</p>
      <p style={{ margin: "12px 0", color: "var(--muted-foreground)", fontSize: 14 }}>{message}</p>
      <button type="button" className="btn" onClick={onRetry}>
        {t("error.retry")}
      </button>
    </div>
  );
}
