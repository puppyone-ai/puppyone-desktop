import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { TestLocalizationProvider } from "@puppyone/localization/testing";
import englishCatalog from "../../src/localization/catalog-loaders/en";
import { DocumentSurfaceHost, DocumentSurfaceReadinessBoundary } from "../../packages/shared-ui/src/editor/DocumentSurfaceHost";
import { PdfResourceViewer } from "../../packages/shared-ui/src/editor/viewers/PdfViewer";
import "../../packages/shared-ui/src/styles/shared-ui.css";

declare global {
  interface Window {
    __pdfPreviewSmoke?: {
      switchToPdf: () => void;
      setSidebarWidth: (width: number) => void;
    };
  }
}

function PdfPreviewSmokeHarness() {
  const [selected, setSelected] = useState<"text" | "pdf">("text");
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const fileUrl = new URLSearchParams(window.location.search).get("pdf") ?? "/fixture.pdf";
  const surfaceKey = selected === "pdf" ? "report.pdf" : "notes.md";
  const preparation = selected === "pdf" ? "requires-visible" : "hidden-safe";
  const renderSurface = useCallback(({ onSurfaceReady }: { onSurfaceReady: () => void }) => (
    <DocumentSurfaceReadinessBoundary readinessKey={surfaceKey} onReady={onSurfaceReady}>
      {selected === "pdf" ? (
        <PdfResourceViewer
          document={{ path: "report.pdf", name: "report.pdf", type: "pdf" }}
          fileUrl={fileUrl}
          fileUrlLoading={false}
          fileUrlError={null}
          fileIconTheme="default"
        />
      ) : (
        <div data-testid="text-document">Text document</div>
      )}
    </DocumentSurfaceReadinessBoundary>
  ), [fileUrl, selected, surfaceKey]);

  useEffect(() => {
    window.__pdfPreviewSmoke = {
      switchToPdf: () => setSelected("pdf"),
      setSidebarWidth,
    };
    return () => {
      delete window.__pdfPreviewSmoke;
    };
  }, []);

  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)`,
        width: "100%",
        height: "100%",
      }}
    >
      <aside style={{ borderRight: "1px solid #444" }} />
      <section style={{ display: "flex", minWidth: 0, minHeight: 0 }}>
        <DocumentSurfaceHost
          surfaceKey={surfaceKey}
          surfacePreparation={preparation}
        >
          {renderSurface}
        </DocumentSurfaceHost>
      </section>
    </main>
  );
}

document.documentElement.style.width = "100%";
document.documentElement.style.height = "100%";
document.body.style.width = "100%";
document.body.style.height = "100%";
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.getElementById("root")!.style.height = "100%";

createRoot(document.getElementById("root")!).render(
  <TestLocalizationProvider messages={englishCatalog}>
    <PdfPreviewSmokeHarness />
  </TestLocalizationProvider>,
);
