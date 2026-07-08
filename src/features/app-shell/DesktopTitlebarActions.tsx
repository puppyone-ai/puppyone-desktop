import { Fragment, useEffect, useRef, useState } from "react";
import {
  DesktopUpdateTitlebarButton,
  type useDesktopUpdates,
} from "../../components/DesktopUpdateControls";
import { getOrderedHeaderElementDefinitions, type HeaderElementRenderContext } from "./headerElements";
import type { TitlebarActionsSettings } from "../../preferences";
import type { WorkspaceExternalOpenTarget } from "../../types/electron";

type DesktopUpdatesController = ReturnType<typeof useDesktopUpdates>;

type DesktopTitlebarActionsProps = {
  desktopUpdates: DesktopUpdatesController;
  activeFileExternalOpenTitle?: string;
  activeFileExternalOpenAppName?: string | null;
  activeFileExternalOpenIconDataUrl?: string | null;
  activeFileExternalOpenLoading?: boolean;
  externalOpenTargets: WorkspaceExternalOpenTarget[];
  canOpenActiveFileExternal: boolean;
  titlebarActionsSettings: TitlebarActionsSettings;
  terminalSidebarOpen: boolean;
  terminalToolEnabled: boolean;
  onClearTerminal: () => void;
  onOpenActiveFileExternal: () => void;
  onOpenActiveFileWithApp: (appPath: string | null) => void;
  onCustomizeExternalAppForActiveFile: () => void;
  onResetTerminal: () => void;
  onToggleTerminal: () => void;
  onUpdateNow: () => void;
};

export function DesktopTitlebarActions({
  desktopUpdates,
  activeFileExternalOpenTitle,
  activeFileExternalOpenAppName,
  activeFileExternalOpenIconDataUrl,
  activeFileExternalOpenLoading = false,
  externalOpenTargets,
  canOpenActiveFileExternal,
  titlebarActionsSettings,
  terminalSidebarOpen,
  terminalToolEnabled,
  onClearTerminal,
  onOpenActiveFileExternal,
  onOpenActiveFileWithApp,
  onCustomizeExternalAppForActiveFile,
  onResetTerminal,
  onToggleTerminal,
  onUpdateNow,
}: DesktopTitlebarActionsProps) {
  const externalOpenRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [externalOpenMenuOpen, setExternalOpenMenuOpen] = useState(false);
  const [terminalMenuOpen, setTerminalMenuOpen] = useState(false);
  const defaultTarget = externalOpenTargets[0] ?? null;
  const menuTargets = externalOpenTargets.length > 0 ? externalOpenTargets : [defaultTarget].filter(Boolean);

  useEffect(() => {
    if (!externalOpenMenuOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && externalOpenRef.current?.contains(target)) return;
      setExternalOpenMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExternalOpenMenuOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [externalOpenMenuOpen]);

  useEffect(() => {
    if (!terminalMenuOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && terminalRef.current?.contains(target)) return;
      setTerminalMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTerminalMenuOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [terminalMenuOpen]);

  useEffect(() => {
    if (!canOpenActiveFileExternal) setExternalOpenMenuOpen(false);
  }, [canOpenActiveFileExternal]);

  useEffect(() => {
    if (!terminalToolEnabled) setTerminalMenuOpen(false);
  }, [terminalToolEnabled]);

  useEffect(() => {
    if (!terminalSidebarOpen) setTerminalMenuOpen(false);
  }, [terminalSidebarOpen]);

  const headerElementContext: HeaderElementRenderContext = {
    externalOpen: {
      appName: activeFileExternalOpenAppName,
      canOpen: canOpenActiveFileExternal,
      iconDataUrl: activeFileExternalOpenIconDataUrl,
      loading: activeFileExternalOpenLoading,
      menuOpen: externalOpenMenuOpen,
      menuTargets,
      onCustomize: onCustomizeExternalAppForActiveFile,
      onOpen: onOpenActiveFileExternal,
      onOpenWithApp: onOpenActiveFileWithApp,
      ref: externalOpenRef,
      setMenuOpen: (value) => {
        setTerminalMenuOpen(false);
        setExternalOpenMenuOpen(value);
      },
      title: activeFileExternalOpenTitle,
    },
    terminal: {
      enabled: terminalToolEnabled,
      menuOpen: terminalMenuOpen,
      onClear: onClearTerminal,
      onCloseMenu: () => setTerminalMenuOpen(false),
      onReset: onResetTerminal,
      onToggle: () => {
        setTerminalMenuOpen(false);
        onToggleTerminal();
      },
      onToggleMenu: () => {
        setExternalOpenMenuOpen(false);
        setTerminalMenuOpen((open) => !open);
      },
      ref: terminalRef,
      sidebarOpen: terminalSidebarOpen,
    },
  };

  return (
    <>
      <DesktopUpdateTitlebarButton
        state={desktopUpdates.state}
        onUpdateNow={onUpdateNow}
      />
      {getOrderedHeaderElementDefinitions(titlebarActionsSettings.order).map((definition) => {
        if (!titlebarActionsSettings.enabled[definition.id]) return null;
        if (!definition.isAvailable(headerElementContext)) return null;
        return (
          <Fragment key={definition.id}>
            {definition.render(headerElementContext)}
          </Fragment>
        );
      })}
    </>
  );
}
