import { CircleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocalization } from "@puppyone/localization/react";

type BoundaryProps = {
  activityId: string;
  resetKey: string;
  fallbackLabel: string;
  children: ReactNode;
};

type BoundaryState = { failed: boolean };

class ActivityBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Desktop Agent activity renderer failed", {
      activityId: this.props.activityId,
      error,
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(previous: BoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="desktop-agent-activity-render-fallback" role="alert">
        <CircleAlert size={13} aria-hidden="true" />
        <span>{this.props.fallbackLabel}</span>
      </div>
    );
  }
}

export function AgentActivityRenderBoundary({ activityId, resetKey, children }: Omit<BoundaryProps, "fallbackLabel">) {
  const { t } = useLocalization();
  return (
    <ActivityBoundary activityId={activityId} resetKey={resetKey} fallbackLabel={t("agent.activity.renderFailed")}>
      {children}
    </ActivityBoundary>
  );
}
