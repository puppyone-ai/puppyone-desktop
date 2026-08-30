import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import {
  DesktopMenuIconButton,
  DesktopMenuItem,
  DesktopMenuSection,
  DesktopMenuSurface,
} from "../../../components/DesktopMenu";
import { DesktopOverlayLayer } from "../../app-shell/DesktopOverlayPortal";
import { useAnchoredOverlayPosition } from "../../app-shell/useAnchoredOverlayPosition";
import type { TerminalWorkbenchCreateOption } from "./TerminalWorkbenchHeader.types";
import { WorkbenchLauncherIcon } from "../ui/WorkbenchLauncherIcon";

export function TerminalWorkbenchCreateMenu({
  options,
}: {
  options: readonly TerminalWorkbenchCreateOption[];
}) {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const label = t("terminal.new");
  const { overlayRef, setOverlayRef, overlayPosition } = useAnchoredOverlayPosition({
    open,
    anchorRef: triggerRef,
    boundarySelector: ".desktop-terminal-panel",
    preferredWidth: 216,
    preferredMaxHeight: 360,
    gap: 4,
    margin: 8,
  });

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && (triggerRef.current?.contains(target) || overlayRef.current?.contains(target))) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", handleKeyDown, true);
    const frame = requestAnimationFrame(() => {
      overlayRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, overlayRef]);

  const menuStyle: CSSProperties = {
    position: "fixed",
    zIndex: "var(--po-overlay-z-menu, 80)",
    boxSizing: "border-box",
    overflowX: "hidden",
    overflowY: "auto",
    ...(overlayPosition
      ? {
          left: overlayPosition.left,
          top: overlayPosition.top,
          width: overlayPosition.width,
          maxHeight: overlayPosition.maxHeight,
        }
      : {
          left: 0,
          top: 0,
          width: 216,
          maxHeight: 360,
          visibility: "hidden",
          pointerEvents: "none",
        }),
  };

  return (
    <>
      <div ref={triggerRef}>
        <DesktopMenuIconButton
          className="desktop-terminal-new-button"
          label={label}
          icon={<Plus size={14} strokeWidth={1.9} aria-hidden="true" />}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        />
      </div>
      {open && (
        <DesktopOverlayLayer>
          <DesktopMenuSurface
            ref={setOverlayRef}
            ariaLabel={label}
            className="desktop-terminal-create-menu"
            style={menuStyle}
          >
            {groupCreateOptions(options).map((group) => (
              <DesktopMenuSection key={group.id} label={group.label}>
                {group.options.map((option) => (
                  <DesktopMenuItem
                    key={option.id}
                    detail={option.detail}
                    icon={option.launcherId || option.iconKey !== undefined
                      ? (
                          <WorkbenchLauncherIcon
                            compact
                            iconKey={option.iconKey}
                            launcherId={option.launcherId}
                          />
                        )
                      : undefined}
                    label={option.label}
                    role="menuitem"
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return;
                      setOpen(false);
                      option.onCreate();
                    }}
                  />
                ))}
              </DesktopMenuSection>
            ))}
          </DesktopMenuSurface>
        </DesktopOverlayLayer>
      )}
    </>
  );
}

function groupCreateOptions(options: readonly TerminalWorkbenchCreateOption[]) {
  const groups = new Map<TerminalWorkbenchCreateOption["group"], {
    id: TerminalWorkbenchCreateOption["group"];
    label: string;
    options: TerminalWorkbenchCreateOption[];
  }>();
  for (const option of options) {
    let group = groups.get(option.group);
    if (!group) {
      group = { id: option.group, label: option.groupLabel, options: [] };
      groups.set(option.group, group);
    }
    group.options.push(option);
  }
  return Array.from(groups.values());
}
