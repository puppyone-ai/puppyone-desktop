import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ScrollbarActivity } from "./components/ScrollbarActivity";
import { FeatureFlagsProvider } from "./features/flags";
import "./cloud-globals.css";
import "../vendor/shared-ui/src/styles/shared-ui.css";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

if (window.location.hash === "#agent-visual-smoke") {
  void import("./features/desktop-agent/visual-smoke").then(({ AgentVisualSmokeHarness }) => {
    root.render(<AgentVisualSmokeHarness />);
  });
} else if (window.location.hash === "#renderer-performance-smoke") {
  void import("./performance/RendererPerformanceSmokeHarness").then(({ RendererPerformanceSmokeHarness }) => {
    root.render(<RendererPerformanceSmokeHarness />);
  });
} else {
  root.render(
    <React.StrictMode>
      <ScrollbarActivity />
      <FeatureFlagsProvider>
        <App />
      </FeatureFlagsProvider>
    </React.StrictMode>,
  );
}
