import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, ChevronDown, Folder } from "lucide-react";
import { useLocalization } from "@puppyone/localization";

type DesktopShellLocationBarProps = {
  onNavigate: (path: string) => void | Promise<void>;
  path: string;
};

type ResolveDesktopShellLocationPathInput = {
  activePath: string | null;
  activePathIsFolder: boolean;
  dataViewActive: boolean;
  workspacePath: string;
};

export function DesktopShellLocationBar({ onNavigate, path }: DesktopShellLocationBarProps) {
  const { t } = useLocalization();
  const label = t("shell.locationBar.address");
  const goLabel = t("shell.locationBar.go");
  const [value, setValue] = useState(path);

  useEffect(() => setValue(path), [path]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextPath = value.trim();
    if (nextPath) void onNavigate(nextPath);
  };

  return (
    <form
      className="desktop-shell-location-bar"
      data-window-no-drag="true"
      onSubmit={handleSubmit}
    >
      <span className="desktop-shell-location-bar-label">{label}</span>
      <span className="desktop-shell-location-bar-field">
        <i className="desktop-shell-location-bar-icon" aria-hidden="true">
          <Folder size={15} strokeWidth={1.8} />
        </i>
        <input
          className="desktop-shell-location-bar-value"
          type="text"
          value={value}
          aria-label={label}
          spellCheck={false}
          title={value}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
        <span className="desktop-shell-location-bar-dropdown" aria-hidden="true">
          <ChevronDown size={10} strokeWidth={2} />
        </span>
      </span>
      <button className="desktop-shell-location-bar-go" type="submit" aria-label={goLabel}>
        <i className="desktop-shell-location-bar-go-icon" aria-hidden="true">
          <ArrowRight size={11} strokeWidth={2.4} />
        </i>
        <span>{goLabel}</span>
      </button>
    </form>
  );
}

export function resolveDesktopShellLocationPath({
  activePath,
  activePathIsFolder,
  dataViewActive,
  workspacePath,
}: ResolveDesktopShellLocationPathInput) {
  const workspaceRoot = trimTrailingPathSeparators(workspacePath);
  if (!dataViewActive || !activePath) return workspaceRoot;

  const selectedLocation = activePathIsFolder
    ? trimTrailingPathSeparators(activePath)
    : getParentPath(activePath);
  if (!selectedLocation) return workspaceRoot;
  if (isPathInsideWorkspace(selectedLocation, workspaceRoot)) return selectedLocation;
  if (isWorkspaceRelativePath(selectedLocation)) {
    return `${workspaceRoot}${getPreferredPathSeparator(workspaceRoot)}${selectedLocation}`;
  }
  return workspaceRoot;
}

export function resolveDesktopShellWorkspaceEntryPath(path: string, workspacePath: string) {
  const normalizedPath = normalizePathSeparators(trimTrailingPathSeparators(path.trim()));
  const normalizedRoot = normalizePathSeparators(trimTrailingPathSeparators(workspacePath));
  if (!normalizedPath || normalizedPath === normalizedRoot) return null;
  if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }
  return isWorkspaceRelativePath(normalizedPath) ? normalizedPath : undefined;
}

function trimTrailingPathSeparators(path: string) {
  const trimmed = path.replace(/[\\/]+$/, "");
  return trimmed || path;
}

function getParentPath(path: string) {
  const normalized = trimTrailingPathSeparators(path);
  const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (separatorIndex < 0) return "";
  if (separatorIndex === 0) return normalized.slice(0, 1);
  return normalized.slice(0, separatorIndex);
}

function isPathInsideWorkspace(path: string, workspaceRoot: string) {
  const normalizedPath = path.toLocaleLowerCase();
  const normalizedRoot = workspaceRoot.toLocaleLowerCase();
  return normalizedPath === normalizedRoot
    || normalizedPath.startsWith(`${normalizedRoot}/`)
    || normalizedPath.startsWith(`${normalizedRoot}\\`);
}

function normalizePathSeparators(path: string) {
  return path.replace(/\\/g, "/");
}

function isWorkspaceRelativePath(path: string) {
  const normalized = normalizePathSeparators(path);
  return Boolean(normalized)
    && !normalized.startsWith("/")
    && !/^[a-z]:\//i.test(normalized)
    && !normalized.split("/").some((segment) => segment === "..");
}

function getPreferredPathSeparator(path: string) {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}
