import { useEffect, type RefObject } from "react";
import { subscribeTypographyChanges } from "@puppyone/shared-ui";
import type { TerminalRuntimeRegistry } from "./terminalRuntimeRegistry";

export function useTerminalAppearanceSync(
  panelRef: RefObject<HTMLElement | null>,
  runtimeRegistry: TerminalRuntimeRegistry,
) {
  useEffect(() => {
    let disposed = false;
    const applyAppearance = () => {
      if (!disposed) runtimeRegistry.applyAppearance();
    };
    const shell = panelRef.current?.closest(".app-shell");
    applyAppearance();

    const shellObserver = shell ? new MutationObserver(applyAppearance) : null;
    shellObserver?.observe(shell as Element, {
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "data-theme-mode",
        "data-light-theme-preset",
        "data-dark-theme-preset",
        "data-text-size",
        "data-terminal-text-size",
        "data-font-terminal",
      ],
    });
    const styleObserver = new MutationObserver(applyAppearance);
    styleObserver.observe(document.head, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["href", "style"],
    });
    const unsubscribeTypography = subscribeTypographyChanges(document, applyAppearance);
    void document.fonts?.ready.then(applyAppearance);

    return () => {
      disposed = true;
      shellObserver?.disconnect();
      styleObserver.disconnect();
      unsubscribeTypography();
    };
  }, [panelRef, runtimeRegistry]);
}
