import React from "react";
import ReactDOM from "react-dom/client";
import { flushActiveDocumentSessions } from "@puppyone/shared-ui";
import { LocalizationProvider } from "@puppyone/localization/react";
import { App } from "./App";
import { ScrollbarActivity } from "./components/ScrollbarActivity";
import { FeatureFlagsProvider } from "./features/flags";
import { TypographyCatalogProvider } from "./features/typography";
import { bootstrapRendererLocalization } from "./localization";
import "./styles/cascade.css";
import "./cloud-globals.css";
import "@puppyone/shared-ui/shared-ui.css";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("PuppyOne renderer root is unavailable.");

let activeCloseRequestId: string | null = null;
let previouslyFocusedElement: HTMLElement | null = null;
const setCloseInteractionBarrier = (locked: boolean) => {
  if (locked) {
    previouslyFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    rootElement.inert = true;
    rootElement.setAttribute("aria-busy", "true");
    return;
  }
  rootElement.inert = false;
  rootElement.removeAttribute("aria-busy");
  const focusTarget = previouslyFocusedElement;
  previouslyFocusedElement = null;
  if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
};

const stopDocumentSessionFlushListener = window.puppyoneDesktop
  ?.onDocumentSessionFlushRequested?.(async ({ requestId }) => {
    activeCloseRequestId = requestId;
    setCloseInteractionBarrier(true);
    try {
      await flushActiveDocumentSessions();
    } catch (error) {
      if (activeCloseRequestId === requestId) {
        activeCloseRequestId = null;
        setCloseInteractionBarrier(false);
      }
      throw error;
    }
  });
const stopDocumentSessionCloseCancelledListener = window.puppyoneDesktop
  ?.onDocumentSessionCloseCancelled?.(({ requestId }) => {
    if (activeCloseRequestId !== requestId) return;
    activeCloseRequestId = null;
    setCloseInteractionBarrier(false);
  });
window.addEventListener("pagehide", () => {
  stopDocumentSessionFlushListener?.();
  stopDocumentSessionCloseCancelledListener?.();
}, { once: true });

const root = ReactDOM.createRoot(rootElement);

async function renderApplication() {
  const localization = await bootstrapRendererLocalization();
  let surface: React.ReactNode;

  if (window.location.hash === "#agent-visual-smoke") {
    const { AgentVisualSmokeHarness } = await import("./features/desktop-agent/visual-smoke");
    surface = <AgentVisualSmokeHarness />;
  } else if (window.location.hash === "#renderer-performance-smoke") {
    const { RendererPerformanceSmokeHarness } = await import("./performance/RendererPerformanceSmokeHarness");
    surface = <RendererPerformanceSmokeHarness />;
  } else {
    surface = (
      <>
        <ScrollbarActivity />
        <TypographyCatalogProvider>
          <FeatureFlagsProvider>
            <App />
          </FeatureFlagsProvider>
        </TypographyCatalogProvider>
      </>
    );
  }

  root.render(
    <React.StrictMode>
      <LocalizationProvider
        initialState={localization.state}
        initialCatalog={localization.catalog}
        fallbackCatalog={localization.fallbackCatalog}
        loadCatalog={localization.loadCatalog}
        client={localization.client}
      >
        {surface}
      </LocalizationProvider>
    </React.StrictMode>,
  );
}

void renderApplication().catch((error) => {
  console.error("PuppyOne renderer localization bootstrap failed:", error);
});
