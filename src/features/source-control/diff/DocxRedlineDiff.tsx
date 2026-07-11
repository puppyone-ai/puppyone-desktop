import { useEffect, useRef, useState } from "react";
import { FileWarning, LoaderCircle, RefreshCw } from "lucide-react";
import type { DocxRedlinePresentation } from "./docx/docxRedlineTypes";
import type { DiffRendererProps } from "./types";
import { isCurrentDiffLoad } from "./lifecycle";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; model: DocxRedlinePresentation }
  | { kind: "error"; message: string };

export function DocxRedlineDiff({ file }: DiffRendererProps) {
  const pair = file.revisionPair;
  const loadRef = useRef(0);
  const selectionRef = useRef(pair?.selectionIdentity ?? "");
  selectionRef.current = pair?.selectionIdentity ?? "";
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    const loadId = ++loadRef.current;
    const controller = new AbortController();
    if (!pair) {
      setState({ kind: "error", message: "The revision pair is unavailable for this Word document." });
      return () => controller.abort();
    }

    setState({ kind: "loading" });
    void import("./docx/docxRedlineProvider")
      .then(({ loadDocxRedline }) => loadDocxRedline(pair, controller.signal))
      .then((model) => {
        if (isCurrentDiffLoad(
          loadRef.current,
          loadId,
          controller.signal,
          selectionRef.current,
          pair.selectionIdentity,
        )) {
          setState({ kind: "ready", model });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || loadRef.current !== loadId) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => controller.abort();
  }, [pair, reload]);

  if (state.kind === "loading") {
    return (
      <div className="desktop-docx-diff-state" role="status">
        <LoaderCircle className="spin" size={16} aria-hidden="true" />
        Building semantic Word diff…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="desktop-docx-diff-state error" role="alert">
        <FileWarning size={16} aria-hidden="true" />
        <div>
          <strong>Word diff unavailable</strong>
          <span>{state.message}</span>
        </div>
        <button type="button" className="secondary-action" onClick={() => setReload((value) => value + 1)}>
          <RefreshCw size={13} aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }
  return <DocxRedlinePresentationView model={state.model} />;
}

function DocxRedlinePresentationView({ model }: { model: DocxRedlinePresentation }) {
  if (model.changes.length === 0) {
    return (
      <div className="desktop-docx-diff-state">
        <div>
          <strong>{documentStateLabel(model.state)}</strong>
          <span>No paragraph or table text changes were detected.</span>
          <span>{model.fidelityNote}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="desktop-docx-redline">
      {model.state !== "ready" && (
        <div className={`desktop-docx-redline-document-state ${model.state}`}>
          {documentStateLabel(model.state)}
        </div>
      )}
      <div className="desktop-docx-redline-summary">
        <span className="added">+{model.stats.wordsAdded} words</span>
        <span className="deleted">−{model.stats.wordsDeleted} words</span>
        <span>{model.stats.blocksChanged} changed blocks</span>
      </div>
      <div className="desktop-docx-redline-changes">
        {model.changes.map((change) => (
          <article className={`desktop-docx-redline-block ${change.kind}`} key={change.id}>
            <div className="desktop-docx-redline-location">
              <span>{blockKindLabel(change.blockKind)}</span>
              <code>{formatLocation(change.beforeIndex, change.afterIndex)}</code>
            </div>
            <p>
              {change.segments.map((segment, index) => (
                <span className={segment.kind} key={`${index}:${segment.text}`}>{segment.text}</span>
              ))}
            </p>
          </article>
        ))}
      </div>
      {model.truncated && <div className="desktop-docx-redline-limit">Additional changes were omitted by the safety budget.</div>}
      <div className="desktop-docx-redline-fidelity">{model.fidelityNote}</div>
    </div>
  );
}

function documentStateLabel(state: DocxRedlinePresentation["state"]) {
  if (state === "added") return "Added Word document";
  if (state === "deleted") return "Deleted Word document";
  if (state === "empty") return "No semantic text changes";
  return "Word content changes";
}

function blockKindLabel(kind: DocxRedlinePresentation["changes"][number]["blockKind"]) {
  if (kind === "table-row") return "Table row";
  if (kind === "list-item") return "List item";
  if (kind === "heading") return "Heading";
  return "Paragraph";
}

function formatLocation(beforeIndex: number | null, afterIndex: number | null) {
  if (beforeIndex != null && afterIndex != null) return `P${beforeIndex + 1} → P${afterIndex + 1}`;
  if (beforeIndex != null) return `P${beforeIndex + 1}`;
  if (afterIndex != null) return `P${afterIndex + 1}`;
  return "Document";
}
