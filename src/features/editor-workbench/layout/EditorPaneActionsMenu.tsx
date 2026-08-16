import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type RefObject,
} from "react";
import { useLocalization } from "@puppyone/localization";
import {
  Check,
  ExternalLink,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Search,
  X,
} from "lucide-react";
import type {
  EditorFindCommand,
  EditorPaneMenuContribution,
  EditorPaneSplitOptions,
  EditorSplitDirection,
} from "@puppyone/shared-ui";
import {
  DesktopMenuIconButton,
  DesktopMenuItem,
  DesktopMenuSection,
  DesktopMenuSurface,
} from "../../../components/DesktopMenu";
import { DesktopOverlayLayer } from "../../app-shell/DesktopOverlayPortal";
import { useAnchoredOverlayPosition } from "../../app-shell/useAnchoredOverlayPosition";

const PANE_ACTIONS_MENU_WIDTH = 196;
const PANE_ACTIONS_MENU_MAX_HEIGHT = 360;

export type EditorPaneActionsMenuProps = Readonly<{
  anchorRef: RefObject<HTMLElement | null>;
  editorLabel: string | null;
  externalOpenAppName: string | null;
  findCommand: EditorFindCommand | null;
  menuContribution: EditorPaneMenuContribution | null;
  open: boolean;
  onCloseMenu: () => void;
  onClosePane: () => void;
  onOpenExternal: (() => void | Promise<void>) | null;
  onSplit: (
    direction: EditorSplitDirection,
    placement: NonNullable<EditorPaneSplitOptions["placement"]>,
  ) => void;
}>;

/** Portal-owned menu: it cannot be clipped or hit-tested by an editor pane. */
export function EditorPaneActionsMenu({
  anchorRef,
  editorLabel,
  externalOpenAppName,
  findCommand,
  menuContribution,
  open,
  onCloseMenu,
  onClosePane,
  onOpenExternal,
  onSplit,
}: EditorPaneActionsMenuProps) {
  const { t } = useLocalization();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { setOverlayRef, overlayPosition } = useAnchoredOverlayPosition({
    open,
    anchorRef,
    boundarySelector: ".desktop-editor-split-view",
    preferredWidth: PANE_ACTIONS_MENU_WIDTH,
    preferredMaxHeight: PANE_ACTIONS_MENU_MAX_HEIGHT,
    gap: 4,
    margin: 8,
    alignment: "center",
    placementPreference: "below",
  });

  const setMenuRef = useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node;
    setOverlayRef(node);
    if (!node) return;
    requestAnimationFrame(() => {
      node.querySelector<HTMLButtonElement>('[role^="menuitem"]')
        ?.focus({ preventScroll: true });
    });
  }, [setOverlayRef]);

  useEffect(() => {
    if (!open) return undefined;
    const isInside = (target: EventTarget | null) => target instanceof Node && Boolean(
      anchorRef.current?.contains(target) || menuRef.current?.contains(target),
    );
    const dismiss = (event: globalThis.PointerEvent) => {
      if (!isInside(event.target)) onCloseMenu();
    };
    const dismissOnFocusExit = (event: FocusEvent) => {
      if (!isInside(event.target)) onCloseMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseMenu();
        anchorRef.current?.focus({ preventScroll: true });
        return;
      }
      const menu = menuRef.current;
      if (!menu?.contains(event.target as Node)) return;
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = Array.from(
        menu.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)'),
      );
      if (items.length === 0) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowUp"
            ? (currentIndex - 1 + items.length) % items.length
            : (currentIndex + 1) % items.length;
      items[nextIndex]?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("focusin", dismissOnFocusExit, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("focusin", dismissOnFocusExit, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [anchorRef, onCloseMenu, open]);

  if (!open) return null;

  const runAndClose = (action: () => void | Promise<void>) => {
    onCloseMenu();
    void action();
  };
  const viewItems = menuContribution?.viewItems ?? [];
  const hasSecondaryActions = Boolean(findCommand || viewItems.length > 0);
  const openExternalLabel = externalOpenAppName
    ? t("editor.panes.openInApp", { app: externalOpenAppName })
    : t("editor.openDefaultApp");
  const menuStyle = overlayPosition
    ? {
        left: overlayPosition.left,
        top: overlayPosition.top,
        width: overlayPosition.width,
        maxHeight: overlayPosition.maxHeight,
      }
    : {
        left: 0,
        top: 0,
        width: PANE_ACTIONS_MENU_WIDTH,
        maxHeight: PANE_ACTIONS_MENU_MAX_HEIGHT,
        visibility: "hidden",
        pointerEvents: "none",
      } satisfies CSSProperties;

  return (
    <DesktopOverlayLayer>
      <DesktopMenuSurface
        ref={setMenuRef}
        className="desktop-editor-pane-menu"
        ariaLabel={editorLabel
          ? t("editor.panes.actionsFor", { name: editorLabel })
          : t("editor.panes.actions")}
        style={menuStyle}
      >
        <div className="desktop-editor-pane-menu-primary-actions">
          <DesktopMenuIconButton
            className="desktop-editor-pane-menu-primary-action"
            icon={<PanelLeft size={15} strokeWidth={1.8} />}
            label={t("editor.panes.splitLeft")}
            role="menuitem"
            onClick={() => runAndClose(() => onSplit("horizontal", "first"))}
          />
          <DesktopMenuIconButton
            className="desktop-editor-pane-menu-primary-action"
            icon={<PanelRight size={15} strokeWidth={1.8} />}
            label={t("editor.panes.splitRight")}
            role="menuitem"
            onClick={() => runAndClose(() => onSplit("horizontal", "second"))}
          />
          <DesktopMenuIconButton
            className="desktop-editor-pane-menu-primary-action"
            icon={<PanelTop size={15} strokeWidth={1.8} />}
            label={t("editor.panes.splitUp")}
            role="menuitem"
            onClick={() => runAndClose(() => onSplit("vertical", "first"))}
          />
          <DesktopMenuIconButton
            className="desktop-editor-pane-menu-primary-action"
            icon={<PanelBottom size={15} strokeWidth={1.8} />}
            label={t("editor.panes.splitDown")}
            role="menuitem"
            onClick={() => runAndClose(() => onSplit("vertical", "second"))}
          />
          <div className="desktop-editor-pane-menu-end-actions">
            {onOpenExternal && (
              <span className="desktop-editor-pane-menu-action-divider" aria-hidden="true" />
            )}
            {onOpenExternal && (
              <DesktopMenuIconButton
                className="desktop-editor-pane-menu-primary-action desktop-editor-pane-menu-external-action"
                icon={<ExternalLink size={15} strokeWidth={1.8} />}
                label={openExternalLabel}
                role="menuitem"
                onClick={() => runAndClose(onOpenExternal)}
              />
            )}
            <DesktopMenuIconButton
              className="desktop-editor-pane-menu-primary-action desktop-editor-pane-menu-close-action"
              icon={<X size={15} strokeWidth={1.8} />}
              label={t("editor.panes.closePane")}
              role="menuitem"
              onClick={() => runAndClose(onClosePane)}
            />
          </div>
        </div>
        {hasSecondaryActions && (
          <DesktopMenuSection className="desktop-editor-pane-menu-secondary-actions">
            {findCommand && (
              <DesktopMenuItem
                icon={<Search size={14} strokeWidth={1.9} />}
                label={t("editor.find.label")}
                trailing="⌘F"
                onClick={() => runAndClose(findCommand.open)}
              />
            )}
            {viewItems.map((item) => item.kind === "toggle" ? (
              <DesktopMenuItem
                key={item.id}
                icon={item.checked ? <Check size={14} strokeWidth={2} /> : <span />}
                label={item.label}
                role="menuitemcheckbox"
                aria-checked={item.checked}
                onClick={() => item.setChecked(!item.checked)}
              />
            ) : (
              <DesktopMenuItem
                key={item.id}
                disabled={item.disabled}
                label={item.label}
                onClick={() => runAndClose(item.run)}
              />
            ))}
          </DesktopMenuSection>
        )}
      </DesktopMenuSurface>
    </DesktopOverlayLayer>
  );
}
