import { AlertCircle, X } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import { DesktopMenuIconButton } from "../../../components/DesktopMenu";
import type { AuxiliaryWorkbenchCreationFailure } from "../../app-shell/auxiliary-workbench/useAuxiliaryWorkbenchContributions";

export function TerminalWorkbenchCreationFailure({
  failure,
  onDismiss,
}: Readonly<{
  failure: AuxiliaryWorkbenchCreationFailure;
  onDismiss: () => void;
}>) {
  const { t } = useLocalization();
  return (
    <div className="desktop-terminal-workbench-create-failure" role="alert">
      <AlertCircle size={14} strokeWidth={1.8} aria-hidden="true" />
      <span>{t("terminal.workbench.itemLoadFailed", { item: failure.label })}</span>
      <DesktopMenuIconButton
        label={t("terminal.workbench.dismissError")}
        icon={<X size={12} strokeWidth={1.8} aria-hidden="true" />}
        onClick={onDismiss}
      />
    </div>
  );
}
