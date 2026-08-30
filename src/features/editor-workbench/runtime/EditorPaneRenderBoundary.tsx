import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";

type EditorPaneRenderBoundaryProps = Readonly<{
  children: ReactNode;
  failureTitle: string;
  resetKey: string | null;
}>;

type EditorPaneRenderBoundaryState = Readonly<{
  error: string | null;
}>;

/**
 * Fault containment for one Workbench pane. Domain predicates should still be
 * total; this boundary is the final safety net that prevents one malformed
 * document/viewer update from unmounting the complete application shell.
 */
export class EditorPaneRenderBoundary extends Component<
  EditorPaneRenderBoundaryProps,
  EditorPaneRenderBoundaryState
> {
  state: EditorPaneRenderBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): EditorPaneRenderBoundaryState {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Editor pane render failed:", error, info.componentStack);
  }

  componentDidUpdate(previous: EditorPaneRenderBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="editor-crash-state" role="alert">
          <strong>{this.props.failureTitle}</strong>
          <span dir="ltr">{this.state.error}</span>
        </div>
      );
    }
    return this.props.children;
  }
}
