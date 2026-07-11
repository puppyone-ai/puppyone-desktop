import { useEffect, useRef, useState } from "react";
import type {
  AsyncDiffContributionDefinition,
  DiffErrorRendererProps,
  DiffLoadingRendererProps,
  DiffRendererProps,
  DiffViewerContribution,
} from "./types";

type AsyncLoadState<Model> =
  | { identity: string; kind: "loading" }
  | { identity: string; kind: "ready"; model: Model }
  | { identity: string; kind: "error"; message: string };

export function createAsyncDiffContribution<Model>(
  definition: AsyncDiffContributionDefinition<Model>,
): DiffViewerContribution {
  function AsyncContributionRenderer(props: DiffRendererProps) {
    return <AsyncDiffRenderer definition={definition} props={props} />;
  }
  AsyncContributionRenderer.displayName = `${definition.id}-async-diff`;

  return Object.freeze({
    id: definition.id,
    version: definition.version,
    kind: "async" as const,
    source: definition.source,
    match: definition.match,
    render: AsyncContributionRenderer,
  });
}

function AsyncDiffRenderer<Model>({
  definition,
  props,
}: {
  definition: AsyncDiffContributionDefinition<Model>;
  props: DiffRendererProps;
}) {
  const identity = definition.loadIdentity(props);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const propsRef = useRef(props);
  propsRef.current = props;
  const loadSequenceRef = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AsyncLoadState<Model>>({ identity, kind: "loading" });

  useEffect(() => {
    const expectedIdentity = identity;
    const sequence = ++loadSequenceRef.current;
    const controller = new AbortController();
    const loadProps = propsRef.current;
    setState({ identity: expectedIdentity, kind: "loading" });

    void Promise.resolve()
      .then(() => definition.load(loadProps, controller.signal))
      .then((model) => {
        if (
          !controller.signal.aborted
          && loadSequenceRef.current === sequence
          && identityRef.current === expectedIdentity
        ) {
          setState({ identity: expectedIdentity, kind: "ready", model });
        }
      })
      .catch((error) => {
        if (
          controller.signal.aborted
          || loadSequenceRef.current !== sequence
          || identityRef.current !== expectedIdentity
        ) {
          return;
        }
        setState({
          identity: expectedIdentity,
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => controller.abort();
  }, [attempt, definition, identity]);

  const visibleState: AsyncLoadState<Model> = state.identity === identity
    ? state
    : { identity, kind: "loading" };
  if (visibleState.kind === "loading") {
    const Loading = definition.renderLoading ?? DefaultDiffLoading;
    return <Loading {...props} />;
  }
  if (visibleState.kind === "error") {
    const ErrorView = definition.renderError ?? DefaultDiffError;
    return (
      <ErrorView
        {...props}
        message={visibleState.message}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }
  const ModelView = definition.renderModel;
  return <ModelView {...props} model={visibleState.model} />;
}

function DefaultDiffLoading(_props: DiffLoadingRendererProps) {
  return <div className="desktop-diff-placeholder" role="status">Loading format-aware diff…</div>;
}

function DefaultDiffError({ message, onRetry }: DiffErrorRendererProps) {
  return (
    <div className="desktop-diff-placeholder" role="alert">
      <span>{message}</span>
      <button type="button" className="secondary-action" onClick={onRetry}>Retry</button>
    </div>
  );
}
