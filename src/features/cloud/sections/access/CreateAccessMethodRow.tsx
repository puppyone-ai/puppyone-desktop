import { DesktopCloudProviderIcon } from "./accessProviders";
import { getAccessProviderLabel } from "./createAccessModel";

export function CreateAccessMethodRow({
  provider,
  description,
  locked = false,
  disabled = false,
  checked = false,
  onCheckedChange,
}: {
  provider: string;
  description: string;
  locked?: boolean;
  disabled?: boolean;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  const inactive = disabled && !locked;
  const enabled = locked || checked;

  return (
    <div className={`desktop-cloud-create-access-method-row ${enabled ? "enabled" : ""} ${inactive ? "inactive" : ""}`}>
      <span className="desktop-cloud-create-access-method-icon" aria-hidden="true">
        <DesktopCloudProviderIcon provider={provider} size={16} />
      </span>
      <div className="desktop-cloud-create-access-method-copy">
        <div>
          <span>{getAccessProviderLabel(provider)}</span>
          {inactive ? <em>Soon</em> : null}
        </div>
        <p>{description}</p>
      </div>
      <CreateAccessSwitch
        checked={enabled}
        disabled={disabled}
        title={locked ? "Already enabled" : disabled ? "Coming soon" : undefined}
        ariaLabel={`${getAccessProviderLabel(provider)} ${enabled ? "on" : "off"}`}
        onChange={locked || disabled ? undefined : onCheckedChange}
      />
    </div>
  );
}

function CreateAccessSwitch({
  checked,
  disabled,
  title,
  ariaLabel,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  title?: string;
  ariaLabel: string;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <button
      className={`desktop-cloud-create-access-switch ${checked ? "checked" : ""}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
    >
      <span />
    </button>
  );
}
