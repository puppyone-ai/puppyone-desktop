import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { DataNode, FileContent } from "@puppyone/shared-ui";
import {
  Copy,
  Folder,
  GripVertical,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import {
  compilePuppyFlowRun,
  createDefaultPuppyFlowDocument,
  createPuppyFlowStep,
  getPuppyFlowAgent,
  parsePuppyFlowDocument,
  PUPPYFLOW_AGENT_OPTIONS,
  serializePuppyFlowDocument,
  type PuppyFlowAgentId,
  type PuppyFlowDocument,
  type PuppyFlowStep,
} from "./puppyflowModel";

type PuppyFlowEditorProps = {
  node: DataNode;
  fileContent: FileContent | null;
  workspacePath?: string | null;
  loading?: boolean;
  error?: string | null;
  onSaveContent?: (content: string) => Promise<void>;
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
type StepDropPosition = "before" | "after";
type StepDropTarget = { stepId: string; position: StepDropPosition } | null;

const SAVE_DEBOUNCE_MS = 450;
const STEP_DRAG_MIME_TYPE = "application/x-puppyflow-step-id";

export function PuppyFlowEditor({
  node,
  fileContent,
  workspacePath,
  loading = false,
  error = null,
  onSaveContent,
}: PuppyFlowEditorProps) {
  const fallbackTitle = getTitleFromFilename(node.name);
  const parsed = useMemo(
    () => parsePuppyFlowDocument(fileContent?.content ?? "", fallbackTitle),
    [fallbackTitle, fileContent?.content],
  );
  const [document, setDocument] = useState<PuppyFlowDocument>(parsed.document);
  const [parseError, setParseError] = useState<string | null>(parsed.ok ? null : parsed.error);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<StepDropTarget>(null);
  const workdirLabel = useMemo(() => formatWorkspacePath(workspacePath), [workspacePath]);
  const saveTimerRef = useRef<number | null>(null);
  const latestDocumentRef = useRef<PuppyFlowDocument>(parsed.document);
  const draggedStepIdRef = useRef<string | null>(null);

  useEffect(() => {
    setDocument(parsed.document);
    latestDocumentRef.current = parsed.document;
    setParseError(parsed.ok ? null : parsed.error);
    setSaveState("idle");
    setSaveError(null);
    setRunMessage(null);
  }, [node.path, parsed]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const persistDocument = useCallback(async (nextDocument: PuppyFlowDocument) => {
    if (!onSaveContent) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      await onSaveContent(serializePuppyFlowDocument(nextDocument));
      setSaveState("saved");
    } catch (saveFailure) {
      setSaveState("error");
      setSaveError(saveFailure instanceof Error ? saveFailure.message : String(saveFailure));
    }
  }, [onSaveContent]);

  const scheduleSave = useCallback((nextDocument: PuppyFlowDocument) => {
    latestDocumentRef.current = nextDocument;
    setDocument(nextDocument);
    setParseError(null);
    setRunMessage(null);
    if (!onSaveContent) return;

    setSaveState("dirty");
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistDocument(latestDocumentRef.current);
    }, SAVE_DEBOUNCE_MS);
  }, [onSaveContent, persistDocument]);

  const updateDocument = useCallback((updater: (current: PuppyFlowDocument) => PuppyFlowDocument) => {
    scheduleSave(updater(latestDocumentRef.current));
  }, [scheduleSave]);

  const updateStep = useCallback((stepId: string, patch: Partial<PuppyFlowStep>) => {
    updateDocument((current) => ({
      ...current,
      steps: current.steps.map((step) => (
        step.id === stepId ? { ...step, ...patch } : step
      )),
    }));
  }, [updateDocument]);

  const addStep = useCallback(() => {
    updateDocument((current) => ({
      ...current,
      steps: [...current.steps, createPuppyFlowStep(current.steps[current.steps.length - 1]?.agent ?? "codex")],
    }));
  }, [updateDocument]);

  const duplicateStep = useCallback((step: PuppyFlowStep) => {
    updateDocument((current) => {
      const index = current.steps.findIndex((candidate) => candidate.id === step.id);
      const duplicate = {
        ...step,
        id: createPuppyFlowStep(step.agent).id,
      };
      const steps = [...current.steps];
      steps.splice(index + 1, 0, duplicate);
      return { ...current, steps };
    });
  }, [updateDocument]);

  const removeStep = useCallback((stepId: string) => {
    updateDocument((current) => ({
      ...current,
      steps: current.steps.length <= 1
        ? current.steps
        : current.steps.filter((step) => step.id !== stepId),
    }));
  }, [updateDocument]);

  const moveStep = useCallback((draggedId: string, targetId: string, position: StepDropPosition) => {
    if (draggedId === targetId) return;
    updateDocument((current) => {
      const steps = moveStepRelativeToTarget(current.steps, draggedId, targetId, position);
      if (steps === current.steps) return current;
      return { ...current, steps };
    });
  }, [updateDocument]);

  const moveStepByOffset = useCallback((stepId: string, offset: -1 | 1) => {
    updateDocument((current) => {
      const steps = moveStepByOffsetInList(current.steps, stepId, offset);
      if (steps === current.steps) return current;
      return { ...current, steps };
    });
  }, [updateDocument]);

  const clearDragState = useCallback(() => {
    draggedStepIdRef.current = null;
    setDraggedStepId(null);
    setDropTarget(null);
  }, []);

  const updateDropTarget = useCallback((stepId: string, position: StepDropPosition) => {
    if (draggedStepIdRef.current === stepId) {
      setDropTarget(null);
      return;
    }
    setDropTarget((current) => (
      current?.stepId === stepId && current.position === position
        ? current
        : { stepId, position }
    ));
  }, []);

  const handleRun = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      void persistDocument(latestDocumentRef.current);
    }

    const compiled = compilePuppyFlowRun(latestDocumentRef.current);
    if (compiled.enabledSteps === 0) {
      setRunMessage("Add at least one enabled prompt before running.");
      return;
    }

    setRunMessage(null);
  }, [persistDocument]);

  const resetInvalidFile = useCallback(() => {
    const nextDocument = createDefaultPuppyFlowDocument(fallbackTitle);
    scheduleSave(nextDocument);
  }, [fallbackTitle, scheduleSave]);

  if (loading && !fileContent) {
    return (
      <div className="puppyflow-editor-state">
        Loading PuppyFlow...
      </div>
    );
  }

  if (error) {
    return (
      <div className="puppyflow-editor-state error">
        {error}
      </div>
    );
  }

  return (
    <section className="puppyflow-editor-shell" aria-label="PuppyFlow editor">
      <button className="puppyflow-run-button" type="button" onClick={handleRun}>
        <Play size={14} fill="currentColor" />
        <span>Run</span>
      </button>

      <div className="puppyflow-document">
        {(saveState === "error" && saveError) || runMessage ? (
          <div className="puppyflow-toolbar-status" role="status">
            {saveState === "error" && saveError ? saveError : runMessage}
          </div>
        ) : null}

        {parseError && (
          <div className="puppyflow-parse-error" role="alert">
            <span>Unable to parse this PuppyFlow file: {parseError}</span>
            <button type="button" onClick={resetInvalidFile}>Reset template</button>
          </div>
        )}

        <div className="puppyflow-step-list">
          {document.steps.map((step, index) => (
            <PuppyFlowStepRow
              key={step.id}
              step={step}
              index={index}
              dragging={draggedStepId === step.id}
              dropPosition={dropTarget?.stepId === step.id ? dropTarget.position : null}
              onDragStart={(event) => {
                draggedStepIdRef.current = step.id;
                setDraggedStepId(step.id);
                setDropTarget(null);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(STEP_DRAG_MIME_TYPE, step.id);
                event.dataTransfer.setData("text/plain", step.id);
                event.dataTransfer.setDragImage(event.currentTarget, 12, 12);
              }}
              onDragOver={(event, position) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                updateDropTarget(step.id, position);
              }}
              onDragLeave={(event) => {
                if (didLeaveElement(event)) {
                  setDropTarget((current) => (current?.stepId === step.id ? null : current));
                }
              }}
              onDrop={(event, position) => {
                event.preventDefault();
                const droppedStepId = event.dataTransfer.getData(STEP_DRAG_MIME_TYPE)
                  || event.dataTransfer.getData("text/plain")
                  || draggedStepIdRef.current;
                clearDragState();
                if (droppedStepId) moveStep(droppedStepId, step.id, position);
              }}
              onDragEnd={clearDragState}
              onMoveByKeyboard={(offset) => moveStepByOffset(step.id, offset)}
              onAgentChange={(agent) => updateStep(step.id, { agent })}
              onPromptChange={(prompt) => updateStep(step.id, { prompt })}
              onToggleEnabled={() => updateStep(step.id, { enabled: !step.enabled })}
              onDuplicate={() => duplicateStep(step)}
              onRemove={() => removeStep(step.id)}
              workdirLabel={workdirLabel}
            />
          ))}
          <div className="puppyflow-add-row">
            <span className="puppyflow-add-connector" aria-hidden="true" />
            <button className="puppyflow-add-button" type="button" aria-label="Add prompt step" title="Add prompt step" onClick={addStep}>
              <span className="puppyflow-add-icon" aria-hidden="true">
                <Plus size={15} />
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PuppyFlowStepRow({
  step,
  index,
  dragging,
  dropPosition,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onMoveByKeyboard,
  onAgentChange,
  onPromptChange,
  onToggleEnabled,
  onDuplicate,
  onRemove,
  workdirLabel,
}: {
  step: PuppyFlowStep;
  index: number;
  dragging: boolean;
  dropPosition: StepDropPosition | null;
  onDragStart: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onDragOver: (event: ReactDragEvent<HTMLElement>, position: StepDropPosition) => void;
  onDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop: (event: ReactDragEvent<HTMLElement>, position: StepDropPosition) => void;
  onDragEnd: () => void;
  onMoveByKeyboard: (offset: -1 | 1) => void;
  onAgentChange: (agent: PuppyFlowAgentId) => void;
  onPromptChange: (prompt: string) => void;
  onToggleEnabled: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  workdirLabel: string;
}) {
  const agent = getPuppyFlowAgent(step.agent);

  return (
    <article
      className="puppyflow-step-row"
      data-dragging={dragging}
      data-drop-position={dropPosition ?? undefined}
      data-disabled={!step.enabled}
      onDragOver={(event) => onDragOver(event, getStepDropPosition(event))}
      onDragEnter={(event) => onDragOver(event, getStepDropPosition(event))}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        onDrop(event, getStepDropPosition(event));
      }}
    >
      <button
        className="puppyflow-step-grip"
        type="button"
        draggable
        aria-label={`Reorder step ${index + 1}`}
        title="Drag to reorder. Use Up or Down while focused."
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onKeyDown={(event) => {
          handleStepGripKeyDown(event, onMoveByKeyboard);
        }}
      >
        <GripVertical size={16} />
      </button>
      <span className="puppyflow-step-index">{index + 1}</span>
      <div className="puppyflow-step-card">
        <div className="puppyflow-prompt-cell">
          <textarea
            value={step.prompt}
            rows={1}
            placeholder="Write a prompt..."
            aria-label={`Prompt for step ${index + 1}`}
            onChange={(event) => onPromptChange(event.target.value)}
          />
        </div>
        <div className="puppyflow-step-footer">
          <label className={`puppyflow-agent-select tone-${agent.tone}`}>
            <span className="puppyflow-agent-logo" aria-hidden="true">
              <PuppyFlowAgentLogo agentId={agent.id} />
            </span>
            <select
              value={step.agent}
              aria-label={`Agent for step ${index + 1}`}
              onChange={(event) => onAgentChange(event.target.value as PuppyFlowAgentId)}
            >
              {PUPPYFLOW_AGENT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <span className="puppyflow-step-meta">{agent.provider} · {agent.modelLabel}</span>
          <span className="puppyflow-step-meta workdir" title={workspacePathTitle(workdirLabel)}>
            <Folder size={13} />
            <span>{workdirLabel}</span>
          </span>
        </div>
        <div className="puppyflow-step-actions">
          <button type="button" aria-label={`Duplicate step ${index + 1}`} onClick={onDuplicate}>
            <Copy size={15} />
          </button>
          <button
            className="puppyflow-toggle"
            type="button"
            data-enabled={step.enabled}
            aria-label={step.enabled ? `Disable step ${index + 1}` : `Enable step ${index + 1}`}
            onClick={onToggleEnabled}
          >
            <span />
          </button>
          <button type="button" aria-label={`Delete step ${index + 1}`} onClick={onRemove}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}

function PuppyFlowAgentLogo({ agentId }: { agentId: PuppyFlowAgentId }) {
  if (agentId === "codex") {
    return <img src="/icons/ChatGPT_logo.png" alt="" draggable={false} />;
  }

  if (agentId === "claude-code") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3.25 13.86 9.1 19.7 7.25 15.7 12l4 4.75-5.84-1.85L12 20.75l-1.86-5.85-5.84 1.85 4-4.75-4-4.75L10.14 9.1 12 3.25Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (agentId === "cursor-cli") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5.25 3.8 19.25 10.25 13.65 12.05 11.85 17.75 5.25 3.8Z" fill="currentColor" />
        <path d="M12.2 12.25 17.6 17.65" stroke="var(--po-panel)" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.2 7.6 3.75 12l2.45 4.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.8 7.6 20.25 12l-2.45 4.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.7 18.4 14.3 5.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function getTitleFromFilename(name: string): string {
  const withoutExtension = name
    .replace(/\.puppyflow\.json$/i, "")
    .replace(/\.puppyflow$/i, "");
  const words = withoutExtension
    .replace(/[-_]+/g, " ")
    .trim();
  return words ? words.replace(/\b\w/g, (char) => char.toUpperCase()) : "Untitled Flow";
}

function formatWorkspacePath(workspacePath?: string | null): string {
  if (!workspacePath) return "Workspace sandbox";
  return workspacePath.replace(/^\/Users\/[^/]+/, "~");
}

function workspacePathTitle(workdirLabel: string): string {
  return workdirLabel === "Workspace sandbox" ? "Workspace sandbox" : `Workdir: ${workdirLabel}`;
}

function getStepDropPosition(event: ReactDragEvent<HTMLElement>): StepDropPosition {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function didLeaveElement(event: ReactDragEvent<HTMLElement>): boolean {
  const nextTarget = event.relatedTarget;
  return !(nextTarget instanceof Node && event.currentTarget.contains(nextTarget));
}

function handleStepGripKeyDown(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  onMoveByKeyboard: (offset: -1 | 1) => void,
) {
  if (event.key === "ArrowUp") {
    event.preventDefault();
    onMoveByKeyboard(-1);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    onMoveByKeyboard(1);
  }
}

function moveStepRelativeToTarget(
  steps: PuppyFlowStep[],
  draggedId: string,
  targetId: string,
  position: StepDropPosition,
): PuppyFlowStep[] {
  const fromIndex = steps.findIndex((step) => step.id === draggedId);
  const targetIndex = steps.findIndex((step) => step.id === targetId);
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return steps;

  const nextSteps = [...steps];
  const [draggedStep] = nextSteps.splice(fromIndex, 1);
  let insertIndex = targetIndex;
  if (fromIndex < targetIndex) insertIndex -= 1;
  if (position === "after") insertIndex += 1;
  nextSteps.splice(clampIndex(insertIndex, nextSteps.length), 0, draggedStep);
  return nextSteps;
}

function moveStepByOffsetInList(steps: PuppyFlowStep[], stepId: string, offset: -1 | 1): PuppyFlowStep[] {
  const fromIndex = steps.findIndex((step) => step.id === stepId);
  if (fromIndex < 0) return steps;

  const toIndex = clampIndex(fromIndex + offset, steps.length - 1);
  if (fromIndex === toIndex) return steps;

  const nextSteps = [...steps];
  const [step] = nextSteps.splice(fromIndex, 1);
  nextSteps.splice(toIndex, 0, step);
  return nextSteps;
}

function clampIndex(index: number, maxIndex: number): number {
  return Math.min(Math.max(index, 0), maxIndex);
}
