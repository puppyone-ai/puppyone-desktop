import { FilePlus2, FolderSearch, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentReferenceInputCapabilities } from "../domain/agent-contract";
import { DesktopOverlayLayer } from "../../app-shell/DesktopOverlayPortal";
import { useAnchoredOverlayPosition } from "../../app-shell/useAnchoredOverlayPosition";
import { agentPickerOverlayGeometry } from "./agent-runtime-geometry";

type AgentReferenceMenuProps = {
  capabilities?: AgentReferenceInputCapabilities;
  disabled?: boolean;
  onAddExternalFiles?: (files: File[]) => void;
  onPickWorkspaceReferences?: () => void;
};

/** Stable composer entry point for every supported reference source. */
export function AgentReferenceMenu({
  capabilities,
  disabled = false,
  onAddExternalFiles,
  onPickWorkspaceReferences,
}: AgentReferenceMenuProps) {
  const { t } = useLocalization();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const workspaceAvailable = Boolean(capabilities?.workspaceFiles || capabilities?.workspaceDirectories);
  const externalAvailable = Boolean(
    capabilities && (capabilities.images !== "none" || capabilities.genericFiles !== "none"),
  );
  const available = workspaceAvailable || externalAvailable;
  const { overlayRef, setOverlayRef, overlayPosition } = useAnchoredOverlayPosition({
    open,
    anchorRef: triggerRef,
    boundarySelector: ".desktop-agent-boundary",
    preferredWidth: 280,
    preferredMaxHeight: 180,
  });

  useEffect(() => {
    if (!open) return undefined;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node
        && (rootRef.current?.contains(event.target) || overlayRef.current?.contains(event.target))) return;
      setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("pointerdown", closeOnPointerDown, true);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown, true);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open, overlayRef]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => {
      overlayRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, overlayRef]);

  const show = () => {
    if (disabled || !available) return;
    setOpen(true);
  };
  const chooseExternal = () => {
    setOpen(false);
    inputRef.current?.click();
  };
  const chooseWorkspace = () => {
    setOpen(false);
    onPickWorkspaceReferences?.();
    triggerRef.current?.focus();
  };
  const onFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) onAddExternalFiles?.(files);
    triggerRef.current?.focus();
  };
  const onItemKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(overlayRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    const index = items.indexOf(event.currentTarget);
    items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div ref={rootRef} className="desktop-agent-reference-menu">
      <button
        ref={triggerRef}
        type="button"
        className="desktop-agent-reference-trigger"
        aria-label={t("agent.reference.add")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled || !available}
        onClick={() => open ? setOpen(false) : show()}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          show();
        }}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
      <input
        ref={inputRef}
        className="desktop-agent-visually-hidden"
        type="file"
        multiple
        tabIndex={-1}
        accept={capabilities?.acceptedMimeTypes?.join(",")}
        onChange={onFilesSelected}
      />
      {open && <DesktopOverlayLayer>
        <div
          ref={setOverlayRef}
          id={menuId}
          className="desktop-agent-overlay desktop-agent-reference-menu-popover"
          role="menu"
          aria-label={t("agent.reference.addMenu")}
          style={agentPickerOverlayGeometry(overlayPosition)}
          data-positioned={overlayPosition ? "true" : "false"}
          data-placement={overlayPosition?.placement}
          data-window-no-drag="true"
        >
          <button type="button" role="menuitem" disabled={!externalAvailable} onClick={chooseExternal} onKeyDown={onItemKeyDown}>
            <FilePlus2 size={14} aria-hidden="true" />
            <span><strong>{t("agent.reference.addFromComputer")}</strong><small>{t("agent.reference.addFromComputerHint")}</small></span>
          </button>
          <button type="button" role="menuitem" disabled={!workspaceAvailable} onClick={chooseWorkspace} onKeyDown={onItemKeyDown}>
            <FolderSearch size={14} aria-hidden="true" />
            <span><strong>{t("agent.reference.addFromWorkspace")}</strong><small>{t("agent.reference.addFromWorkspaceHint")}</small></span>
          </button>
        </div>
      </DesktopOverlayLayer>}
    </div>
  );
}
