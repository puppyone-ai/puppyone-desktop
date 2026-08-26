import { useLocalization } from "@puppyone/localization/react";
import { formatBytes } from "../../utils";

export function CloudOverviewStorageMeter({
  bytes,
  limitBytes,
  percent,
  isLowerBound,
  loading,
}: {
  bytes: number | null;
  limitBytes: number | null;
  percent: number | null;
  isLowerBound: boolean;
  loading: boolean;
}) {
  const localization = useLocalization();
  const { t } = localization;
  const used = bytes === null
    ? loading ? t("cloud.common.loading") : "—"
    : `${formatBytes(bytes, localization)}${isLowerBound ? "+" : ""}`;
  const detail = limitBytes === null
    ? used
    : `${used} ${t("cloud.billing.storageLimit", {
      limit: formatBytes(limitBytes, localization),
    })}`;

  return (
    <div className="desktop-cloud-overview-storage-meter" aria-live="polite">
      <span className="desktop-cloud-overview-storage-meter-copy">
        <strong>{t("cloud.overview.storageUsed")}</strong>
        <small>{detail}</small>
      </span>
      <span
        className={`desktop-cloud-overview-storage-meter-track ${percent === null ? "is-unmetered" : ""}`}
        role={percent === null ? undefined : "progressbar"}
        aria-label={percent === null ? undefined : t("cloud.overview.storageUsed")}
        aria-valuemin={percent === null ? undefined : 0}
        aria-valuemax={percent === null ? undefined : 100}
        aria-valuenow={percent === null ? undefined : Math.round(percent)}
      >
        {percent === null ? null : <span style={{ width: `${percent}%` }} />}
      </span>
    </div>
  );
}
