import { useLocalization } from "@puppyone/localization/react";
import { formatStatusLabel } from "../../utils";
import type { AccessPointStatus as AccessPointStatusModel } from "../model";

export function AccessPointStatus({ status }: { status: AccessPointStatusModel }) {
  const { t } = useLocalization();
  const tone = status.kind === "ready"
    ? "success"
    : status.kind === "error"
      ? "danger"
      : "muted";
  return (
    <span className={`desktop-cloud-access-point-status ${tone}`}>
      <span aria-hidden="true" />
      {formatStatusLabel(status.code, t)}
    </span>
  );
}
