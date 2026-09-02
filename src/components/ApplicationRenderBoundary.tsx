import { CircleAlert, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocalization } from "@puppyone/localization/react";

type BoundaryProps = {
  title: string;
  description: string;
  refreshLabel: string;
  children: ReactNode;
};

type BoundaryState = { failed: boolean };

class ApplicationBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("PuppyOne application render failed", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="application-render-fallback" role="alert">
        <CircleAlert size={22} aria-hidden="true" />
        <strong>{this.props.title}</strong>
        <p>{this.props.description}</p>
        <button type="button" onClick={() => window.location.reload()}>
          <RefreshCw size={14} aria-hidden="true" />
          {this.props.refreshLabel}
        </button>
      </main>
    );
  }
}

/** Last-resort shell containment; feature boundaries should handle local faults first. */
export function ApplicationRenderBoundary({ children }: { children: ReactNode }) {
  const { t } = useLocalization();
  return (
    <ApplicationBoundary
      title={t("common.renderFailure.title")}
      description={t("common.renderFailure.description")}
      refreshLabel={t("common.action.refresh")}
    >
      {children}
    </ApplicationBoundary>
  );
}
